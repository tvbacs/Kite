/**
 * Video & Media Sniffer Script cho Trình duyệt Kite
 * Tự động bắt mọi luồng phát media (MP4, M3U8, WEBM, MOV, Audio, Video Playback)
 * trên mọi trang web (Phim online, Donghua, Filmove, YouTube, TikTok, Facebook, Dailymotion...)
 * Hỗ trợ lọc triệt để các tệp phân đoạn nhỏ (chunks/segments .ts, .m4s),
 * gom nhóm các luồng của cùng 1 tập phim để chỉ hiển thị đúng 1 video duy nhất.
 */
export const VIDEO_SNIFFER_SCRIPT = `
(function() {
  if (window.__kite_sniffer_installed) return;
  window.__kite_sniffer_installed = true;

  var seenSignatures = {};
  var resolvedDailymotionIds = {};

  var MEDIA_EXT_REGEX = /\\.(mp4|m3u8|webm|mov|m4v)(\\?|$|#)/i;
  var STREAM_PATTERN_REGEX = /(videoplayback\\?|mime=video\\b|\\/manifest\\.m3u8|\\/playlist\\.m3u8|\\/master\\.m3u8|cdn\\/manifest\\/video)/i;

  // Kiểm tra xem URL có phải là file chunk / segment rời rạc không (Tuyệt đối không bắt các file này)
  var isChunkOrSegment = function(url) {
    if (!url || typeof url !== 'string') return true;
    var lower = url.toLowerCase();
    // 1. Loại bỏ các đuôi file phân đoạn HLS / DASH / phụ đề
    if (/\\.(ts|m4s|m4f|key|vtt|srt|dfxp|ass|ssa)(\\?|$|#)/i.test(lower)) return true;
    // 2. Loại bỏ các đường dẫn chunk / segment trong player
    if (/\\/(seg|chunk|fragment|range)[-_\\d]/i.test(lower)) return true;
    if (/[\\?&](range|segment|chunk|frag|byterange)=\\d+/i.test(lower)) return true;
    if (lower.includes('init.mp4') || lower.includes('/init-') || lower.includes('/segment-') || lower.includes('/seg_')) return true;
    // 3. Loại bỏ ảnh, font, css
    if (/\\.(jpe?g|png|webp|gif|svg|ico|css|woff2?|ttf)(\\?|$|#)/i.test(lower)) return true;
    return false;
  };

  var getFormat = function(url) {
    var lower = url.toLowerCase();
    if (lower.includes('.m3u8') || lower.includes('playlist.m3u8') || lower.includes('manifest.m3u8') || lower.includes('hls')) return 'm3u8';
    if (lower.includes('.webm')) return 'webm';
    if (lower.includes('.mov')) return 'mov';
    if (lower.includes('.m4v')) return 'm4v';
    return 'mp4';
  };

  // Gom nhóm các URL biến thể (1080p, 720p, 480p, master) của cùng 1 luồng video
  var getStreamSignature = function(u) {
    try {
      var clean = u.split('?')[0].split('#')[0].toLowerCase();
      // Gom nhóm Dailymotion theo ID video
      var dm = u.match(/video\\/fmp4\\/([a-zA-Z0-9]+)/i) ||
               u.match(/manifest\\/video\\/([a-zA-Z0-9]+)/i) ||
               u.match(/[?&]video=([a-zA-Z0-9]+)/i);
      if (dm) return 'dm-' + dm[1];

      // Gom nhóm YouTube videoplayback
      var yt = u.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
      if (yt && u.includes('videoplayback')) return 'yt-' + yt[1];

      // Gom nhóm các file m3u8 trong cùng 1 thư mục stream
      var baseHls = clean.replace(/\\/(master|playlist|index|1080p|720p|480p|360p|chunklist[^\\/]*|h264[^\\/]*|manifest)\\.m3u8$/i, '');
      if (baseHls !== clean) return 'hls-' + baseHls;

      return clean;
    } catch(e) {
      return u;
    }
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
      var h1 = document.querySelector('h1');
      if (h1 && h1.innerText && h1.innerText.trim().length > 2) {
        return h1.innerText.trim();
      }
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
    if (isChunkOrSegment(url)) return;

    // Kiểm tra trùng lặp luồng video
    var sig = getStreamSignature(url);
    if (seenSignatures[sig]) {
      // Nếu đã có luồng này và URL mới không phải master playlist thì bỏ qua
      if (!url.toLowerCase().includes('master.m3u8')) return;
    }
    seenSignatures[sig] = true;

    // Lọc bỏ quảng cáo, pixel theo dõi hoặc analytics
    var lower = url.toLowerCase();
    if (lower.includes('analytics') || lower.includes('telemetry') || lower.includes('doubleclick') || lower.includes('google-analytics') || lower.includes('/beacon')) return;

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
    // Bỏ qua các API metadata nội bộ của chính trình sniffer
    if (url.includes('/player/metadata/video/') || url.includes('/video/') && url.includes('/config')) return;

    var abs = toAbsoluteUrl(url);
    if (!abs) return;
    if (isChunkOrSegment(abs)) return;

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

      // Quét thẻ iframe (Trang phim / anime embed player)
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

  // 3. Hook Fetch API để bắt luồng stream mạng của player
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

  // 4. Hook XMLHttpRequest để bắt request tải manifest của player
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

  // 5. Quét định kỳ DOM một cách mượt mà và tiết kiệm CPU
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(scanDomElements, 400);
    }, { once: true });
  } else {
    setTimeout(scanDomElements, 400);
  }
  setInterval(scanDomElements, 2500);
})();
true;
`;
