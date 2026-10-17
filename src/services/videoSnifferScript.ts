/**
 * Video & Media Sniffer Script cho Trình duyệt Kite
 * Tự động bắt mọi luồng phát media (MP4, M3U8, WEBM, MOV, Audio, Video Playback)
 * trên mọi trang web (Phim online, Donghua, YouTube, TikTok, Facebook, Dailymotion, tin tức...)
 * Hỗ trợ chạy trong cả Main Frame lẫn Subframes (iFrames).
 */
export const VIDEO_SNIFFER_SCRIPT = `
(function() {
  if (window.__kite_sniffer_installed) return;
  window.__kite_sniffer_installed = true;

  var seenUrls = {};
  var resolvedDailymotionIds = {};

  var MEDIA_EXT_REGEX = /\\.(mp4|m3u8|webm|mov|m4v|3gp|flv|mp3|m4a|aac|wav|ogg)(\\?|$|#)/i;
  var STREAM_PATTERN_REGEX = /(videoplayback|mime=video|mime=audio|\\/manifest\\.m3u8|\\/playlist\\.m3u8|\\/hls\\/|\\/video-stream|cdn\\/manifest\\/video|cf\\.dmcdn\\.net)/i;

  var getFormat = function(url) {
    var lower = url.toLowerCase();
    if (lower.includes('.m3u8') || lower.includes('playlist.m3u8') || lower.includes('manifest.m3u8') || lower.includes('hls')) return 'm3u8';
    if (lower.includes('.webm')) return 'webm';
    if (lower.includes('.mov')) return 'mov';
    if (lower.includes('.m4v')) return 'm4v';
    if (lower.includes('.mp3') || lower.includes('.m4a') || lower.includes('.aac') || lower.includes('.wav')) return 'audio';
    return 'mp4';
  };

  // Hàm gửi tin nhắn tin cậy lên React Native từ bất kỳ Frame nào
  var sendPostMessage = function(payload) {
    var str = typeof payload === 'string' ? payload : JSON.stringify(payload);
    var sent = false;
    try {
      if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
        window.ReactNativeWebView.postMessage(str);
        sent = true;
      }
    } catch(e) {}
    try {
      if (!sent && window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ReactNativeWebView && typeof window.webkit.messageHandlers.ReactNativeWebView.postMessage === 'function') {
        window.webkit.messageHandlers.ReactNativeWebView.postMessage(str);
        sent = true;
      }
    } catch(e) {}
    // Nếu đang nằm trong iframe, bắn tin nhắn lên parent window để parent forward
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ __kite_media_payload: payload }, '*');
      }
    } catch(e) {}
  };

  // Top frame lắng nghe tin nhắn forward từ các iframe con
  if (window.parent === window) {
    window.addEventListener('message', function(evt) {
      try {
        if (evt.data && evt.data.__kite_media_payload) {
          sendPostMessage(evt.data.__kite_media_payload);
        }
      } catch(e) {}
    });
  }

  var toAbsoluteUrl = function(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    var trimmed = rawUrl.trim();
    if (trimmed.startsWith('blob:') || trimmed.startsWith('data:') || trimmed.startsWith('javascript:')) return '';
    try {
      return new URL(trimmed, window.location.href).href;
    } catch(e) {
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
      return '';
    }
  };

  var getBestPageTitle = function() {
    try {
      var og = document.querySelector('meta[property="og:title"]');
      if (og && og.content) return og.content;
      var tw = document.querySelector('meta[name="twitter:title"]');
      if (tw && tw.content) return tw.content;
      if (document.title) return document.title;
    } catch(e) {}
    return 'Video';
  };

  var reportMedia = function(rawUrl, explicitTitle) {
    var url = toAbsoluteUrl(rawUrl);
    if (!url) return;

    // Lọc bỏ quảng cáo, pixel theo dõi hoặc analytics
    var lower = url.toLowerCase();
    if (lower.includes('analytics') || lower.includes('telemetry') || lower.includes('doubleclick') || lower.includes('google-analytics') || lower.includes('/beacon')) return;

    if (seenUrls[url]) return;
    seenUrls[url] = true;

    var format = getFormat(url);
    var pageTitle = explicitTitle || getBestPageTitle();
    pageTitle = pageTitle.replace(/\\s+/g, ' ').trim();

    sendPostMessage({
      type: 'MEDIA_DETECTED',
      media: {
        url: url,
        title: pageTitle,
        format: format,
        detectedAt: Date.now()
      }
    });
  };

  var inspectUrl = function(url, title) {
    if (!url || typeof url !== 'string') return;
    var abs = toAbsoluteUrl(url);
    if (!abs) return;

    if (MEDIA_EXT_REGEX.test(abs) || STREAM_PATTERN_REGEX.test(abs)) {
      reportMedia(abs, title);
    }
  };

  // Trích xuất và giải mã luồng video Dailymotion từ iframe hoặc URL
  var checkDailymotionUrl = function(url, title) {
    if (!url || typeof url !== 'string') return;
    var match = url.match(/[?&]video=([a-zA-Z0-9]+)/i) ||
                url.match(/dailymotion\\.com\\/(?:embed\\/video|video)\\/([a-zA-Z0-9]+)/i);
    if (match && match[1]) {
      var videoId = match[1];
      if (resolvedDailymotionIds[videoId]) return;
      resolvedDailymotionIds[videoId] = true;

      try {
        var metaUrl = 'https://www.dailymotion.com/player/metadata/video/' + videoId;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', metaUrl, true);
        xhr.onreadystatechange = function() {
          if (xhr.readyState === 4 && xhr.status === 200) {
            try {
              var data = JSON.parse(xhr.responseText);
              var streamUrl = data.qualities && data.qualities.auto && data.qualities.auto[0] && data.qualities.auto[0].url;
              var vTitle = data.title || title || getBestPageTitle();
              if (streamUrl) {
                reportMedia(streamUrl, vTitle);
              }
            } catch(e) {}
          }
        };
        xhr.send();
      } catch(e) {}
    }
  };

  // Trích xuất và giải mã luồng video Vimeo từ iframe hoặc URL
  var checkVimeoUrl = function(url, title) {
    if (!url || typeof url !== 'string') return;
    var match = url.match(/player\\.vimeo\\.com\\/video\\/([0-9]+)/i);
    if (match && match[1]) {
      var vimeoId = match[1];
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'https://player.vimeo.com/video/' + vimeoId + '/config', true);
        xhr.onreadystatechange = function() {
          if (xhr.readyState === 4 && xhr.status === 200) {
            try {
              var data = JSON.parse(xhr.responseText);
              var hls = data.request && data.request.files && data.request.files.hls;
              var streamUrl = hls && hls.cdns && Object.values(hls.cdns)[0] && Object.values(hls.cdns)[0].url;
              var vTitle = (data.video && data.video.title) || title || getBestPageTitle();
              if (streamUrl) {
                reportMedia(streamUrl, vTitle);
              }
            } catch(e) {}
          }
        };
        xhr.send();
      } catch(e) {}
    }
  };

  // 1. Quét phần tử DOM (Thẻ video, audio, source, iframe)
  var scanDomElements = function() {
    try {
      // Quét thẻ video và audio
      var mediaEls = document.querySelectorAll('video, audio');
      for (var i = 0; i < mediaEls.length; i++) {
        var el = mediaEls[i];
        var src = el.currentSrc || el.src || el.getAttribute('src');
        var title = el.getAttribute('title') || el.getAttribute('alt') || getBestPageTitle();
        if (src) inspectUrl(src, title);

        var sources = el.querySelectorAll('source');
        for (var j = 0; j < sources.length; j++) {
          var sSrc = sources[j].src || sources[j].getAttribute('src');
          if (sSrc) inspectUrl(sSrc, title);
        }
      }

      // Quét thẻ iframe (Rất quan trọng đối với các trang phim / anime embed player như Dailymotion, JWPlayer)
      var iframes = document.querySelectorAll('iframe');
      for (var k = 0; k < iframes.length; k++) {
        var iframe = iframes[k];
        var ifSrc = iframe.src || iframe.getAttribute('src') || iframe.getAttribute('data-src');
        var ifTitle = iframe.getAttribute('title') || iframe.getAttribute('data-title') || getBestPageTitle();

        if (ifSrc) {
          checkDailymotionUrl(ifSrc, ifTitle);
          checkVimeoUrl(ifSrc, ifTitle);
          inspectUrl(ifSrc, ifTitle);
        }
      }
    } catch(e) {}
  };

  // 2. Hook HTMLMediaElement (Thẻ <video> và <audio>)
  try {
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

    ['play', 'loadedmetadata', 'canplay', 'playing'].forEach(function(evt) {
      document.addEventListener(evt, function(e) {
        if (e.target && (e.target.tagName === 'VIDEO' || e.target.tagName === 'AUDIO')) {
          var el = e.target;
          var src = el.currentSrc || el.src || el.getAttribute('src');
          if (src) inspectUrl(src, el.getAttribute('title'));
        }
      }, true);
    });
  } catch(e) {}

  // 3. Hook Fetch API để bắt mọi luồng stream mạng của player
  try {
    var origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      window.fetch = function(input, init) {
        try {
          var fUrl = typeof input === 'string' ? input : (input && input.url ? input.url : '');
          if (fUrl) {
            inspectUrl(fUrl);
            checkDailymotionUrl(fUrl);
          }
        } catch(e) {}
        return origFetch.apply(this, arguments);
      };
    }
  } catch(e) {}

  // 4. Hook XMLHttpRequest để bắt các request tải manifest/chunk của player
  try {
    var origXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      try {
        if (url) {
          inspectUrl(url);
          checkDailymotionUrl(url);
        }
      } catch(e) {}
      return origXhrOpen.apply(this, arguments);
    };
  } catch(e) {}

  // 5. Quét định kỳ mỗi 1.2s để phát hiện player chèn động sau khi bấm xem phim
  scanDomElements();
  setInterval(scanDomElements, 1200);
})();
true;
`;
