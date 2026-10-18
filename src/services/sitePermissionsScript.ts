/**
 * Script can thiệp và kiểm soát các quyền truy cập của trang web (Site Permissions)
 * Bắt buộc hỏi quyền trước khi cấp phép: Vị trí, Máy ảnh, Micrô, Thông báo, Cửa sổ bật lên.
 */

export const SITE_PERMISSIONS_INJECT_SCRIPT = `(function() {
  if (window.__kite_permissions_initialized) return;
  window.__kite_permissions_initialized = true;

  var currentHost = window.location.hostname || '';
  if (!currentHost) return;

  var pendingRequests = {};
  var requestIdCounter = 0;

  var sendPermRequest = function(permType, details, onResult) {
    var reqId = 'kite_perm_' + (++requestIdCounter) + '_' + Date.now();
    pendingRequests[reqId] = onResult;
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'KITE_SITE_PERMISSION_REQUEST',
          permissionType: permType,
          domain: currentHost,
          origin: window.location.origin,
          requestId: reqId,
          details: details || {}
        }));
      } else {
        onResult(false);
      }
    } catch(e) {
      onResult(false);
    }
  };

  window.__kite_resolve_permission = function(reqId, granted) {
    if (pendingRequests[reqId]) {
      try {
        pendingRequests[reqId](Boolean(granted));
      } catch(e) {}
      delete pendingRequests[reqId];
    }
  };

  // 1. CAN THIỆP ĐỊNH VỊ VỊ TRÍ (GEOLOCATION)
  try {
    if (navigator.geolocation) {
      var origGetCurrentPosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      var origWatchPosition = navigator.geolocation.watchPosition.bind(navigator.geolocation);

      navigator.geolocation.getCurrentPosition = function(success, error, options) {
        sendPermRequest('location', { action: 'getCurrentPosition' }, function(granted) {
          if (granted) {
            origGetCurrentPosition(success, error, options);
          } else {
            if (typeof error === 'function') {
              error({
                code: 1, // PERMISSION_DENIED
                message: 'User denied Geolocation',
                PERMISSION_DENIED: 1,
                POSITION_UNAVAILABLE: 2,
                TIMEOUT: 3
              });
            }
          }
        });
      };

      navigator.geolocation.watchPosition = function(success, error, options) {
        sendPermRequest('location', { action: 'watchPosition' }, function(granted) {
          if (granted) {
            return origWatchPosition(success, error, options);
          } else {
            if (typeof error === 'function') {
              error({
                code: 1, // PERMISSION_DENIED
                message: 'User denied Geolocation',
                PERMISSION_DENIED: 1,
                POSITION_UNAVAILABLE: 2,
                TIMEOUT: 3
              });
            }
            return 0;
          }
        });
      };
    }
  } catch(e) {}

  // 2. CAN THIỆP MÁY ẢNH & MICRÔ (MEDIA DEVICES / GETUSERMEDIA)
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      var origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

      navigator.mediaDevices.getUserMedia = function(constraints) {
        return new Promise(function(resolve, reject) {
          var needVideo = Boolean(constraints && (constraints.video === true || typeof constraints.video === 'object'));
          var needAudio = Boolean(constraints && (constraints.audio === true || typeof constraints.audio === 'object'));
          var permType = (needVideo && needAudio) ? 'camera_and_mic' : (needVideo ? 'camera' : 'microphone');

          sendPermRequest(permType, { constraints: constraints }, function(granted) {
            if (granted) {
              origGetUserMedia(constraints).then(resolve).catch(reject);
            } else {
              var err = new Error('Permission denied by user');
              err.name = 'NotAllowedError';
              reject(err);
            }
          });
        });
      };
    }
  } catch(e) {}

  // 3. CAN THIỆP THÔNG BÁO (NOTIFICATIONS)
  try {
    if (window.Notification) {
      window.Notification.requestPermission = function(callback) {
        return new Promise(function(resolve) {
          sendPermRequest('notifications', {}, function(granted) {
            var result = granted ? 'granted' : 'denied';
            try {
              Object.defineProperty(window.Notification, 'permission', {
                value: result,
                configurable: true,
                writable: true
              });
            } catch(e) {}
            if (typeof callback === 'function') {
              callback(result);
            }
            resolve(result);
          });
        });
      };
    }
  } catch(e) {}

})(); true;`;
