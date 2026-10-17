/**
 * Video & Media Sniffer Script cho Trình duyệt Kite
 * Tự động bắt mọi luồng phát media (MP4, M3U8, WEBM, MOV, Audio, Video Playback)
 * trên mọi trang web (Phim online, YouTube, TikTok, Facebook, tin tức...)
 */
export const VIDEO_SNIFFER_SCRIPT = `
(function() {
  if (window.__kite_sniffer_installed) return;
  window.__kite_sniffer_installed = true;

  var seenUrls = {};

  var MEDIA_EXT_REGEX = /\\.(mp4|m3u8|webm|mov|m4v|3gp|flv|mp3|m4a|aac|wav|ogg)(\\?|$|#)/i;
  var STREAM_PATTERN_REGEX = /(videoplayback|mime=video|mime=audio|\\/manifest\\.m3u8|\\/playlist\\.m3u8|\\/hls\\/|\\/video-stream)/i;

  var getFormat = function(url) {
    var lower = url.toLowerCase();
    if (lower.includes('.m3u8') || lower.includes('playlist.m3u8') || lower.includes('manifest.m3u8')) return 'm3u8';
    if (lower.includes('.webm')) return 'webm';
    if (lower.includes('.mov')) return 'mov';
    if (lower.includes('.m4v')) return 'm4v';
    if (lower.includes('.mp3') || lower.includes('.m4a') || lower.includes('.aac') || lower.includes('.wav')) return 'audio';
    return 'mp4';
  };

  var reportMedia = function(url, explicitTitle) {
    if (!url || typeof url !== 'string') return;
    var trimmed = url.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return;

    // Lọc bỏ các quảng cáo beacon hoặc tracking pixel nhỏ
    if (trimmed.includes('analytics') || trimmed.includes('telemetry') || trimmed.includes('doubleclick') || trimmed.includes('google-analytics')) return;

    if (seenUrls[trimmed]) return;
    seenUrls[trimmed] = true;

    var format = getFormat(trimmed);
    var pageTitle = explicitTitle || document.title || 'Video';
    pageTitle = pageTitle.replace(/\\s+/g, ' ').trim();

    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'MEDIA_DETECTED',
        media: {
          url: trimmed,
          title: pageTitle,
          format: format,
          detectedAt: Date.now()
        }
      }));
    } catch(e) {}
  };

  var inspectUrl = function(url, title) {
    if (!url || typeof url !== 'string') return;
    if (MEDIA_EXT_REGEX.test(url) || STREAM_PATTERN_REGEX.test(url)) {
      reportMedia(url, title);
    }
  };

  // 1. Hook HTMLMediaElement (Thẻ <video> và <audio>)
  try {
    var checkElement = function(el) {
      if (!el) return;
      var src = el.src || el.currentSrc || el.getAttribute('src');
      if (src) inspectUrl(src, el.getAttribute('title') || el.getAttribute('alt'));

      // Kiểm tra các thẻ <source> con bên trong
      if (el.querySelectorAll) {
        var sources = el.querySelectorAll('source');
        for (var i = 0; i < sources.length; i++) {
          var sSrc = sources[i].src || sources[i].getAttribute('src');
          if (sSrc) inspectUrl(sSrc, el.getAttribute('title'));
        }
      }
    };

    // Theo dõi thuộc tính src khi gán bằng JavaScript
    if (HTMLMediaElement && HTMLMediaElement.prototype) {
      var proto = HTMLMediaElement.prototype;
      var origSrcDesc = Object.getOwnPropertyDescriptor(proto, 'src');
      if (origSrcDesc && origSrcDesc.set) {
        Object.defineProperty(proto, 'src', {
          set: function(val) {
            inspectUrl(val, this.getAttribute ? this.getAttribute('title') : '');
            return origSrcDesc.set.call(this, val);
          },
          get: function() {
            return origSrcDesc.get.call(this);
          }
        });
      }
    }

    // Lắng nghe sự kiện play trên mọi media element
    ['play', 'loadedmetadata', 'canplay', 'playing'].forEach(function(evt) {
      document.addEventListener(evt, function(e) {
        if (e.target && (e.target.tagName === 'VIDEO' || e.target.tagName === 'AUDIO')) {
          checkElement(e.target);
        }
      }, true);
    });

    // Quét toàn bộ thẻ video hiện có
    setTimeout(function() {
      try {
        var vids = document.querySelectorAll('video, audio');
        for (var v = 0; v < vids.length; v++) {
          checkElement(vids[v]);
        }
      } catch(e) {}
    }, 1000);
  } catch(e) {}

  // 2. Hook Fetch API để bắt mọi luồng stream mạng
  try {
    var origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      window.fetch = function(input, init) {
        try {
          var fUrl = typeof input === 'string' ? input : (input && input.url ? input.url : '');
          if (fUrl) inspectUrl(fUrl);
        } catch(e) {}
        return origFetch.apply(this, arguments);
      };
    }
  } catch(e) {}

  // 3. Hook XMLHttpRequest để bắt các request tải chunk/media của player
  try {
    var origXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      try {
        if (url) inspectUrl(url);
      } catch(e) {}
      return origXhrOpen.apply(this, arguments);
    };
  } catch(e) {}
})();
true;
`;
