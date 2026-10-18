/**
 * Video & Media Sniffer Script cho Trình duyệt Kite
 * Tự động bắt mọi luồng phát media (MP4, M3U8, WEBM, MOV, Audio, Video Playback)
 * trên mọi trang web (Phim online, Donghua, Filmove, YouTube, TikTok, Facebook, Dailymotion...)
 * Hỗ trợ lọc triệt để các tệp phân đoạn nhỏ (chunks/segments .ts, .m4s),
 * gom nhóm các luồng của cùng 1 tập phim để chỉ hiển thị đúng 1 video duy nhất.
 */
export const VIDEO_SNIFFER_SCRIPT = `
(function() {
  var hooksInstalled = window.__kite_sniffer_hooks_installed;
  window.__kite_sniffer_hooks_installed = true;

  var seenSignatures = window.__kite_seen_signatures || {};
  window.__kite_seen_signatures = seenSignatures;
  var resolvedDailymotionIds = window.__kite_resolved_dm_ids || {};
  window.__kite_resolved_dm_ids = resolvedDailymotionIds;

  // Chỉ bắt các tệp video hoàn chỉnh (.mp4, .webm, .mov, .m4v, .mkv)
  // Tuyệt đối không bắt các luồng stream m3u8 / hls / live stream
  var MEDIA_EXT_REGEX = /\\.(mp4|webm|mov|m4v|mkv)(\\?|$|#|\\/)/i;
  var STREAM_PATTERN_REGEX = /(videoplayback|googlevideo\\.com)/i;

  // Kiểm tra luồng phát hoặc trang web có phải là Live Stream (Trực tiếp) không
  var isLiveStream = function(url) {
    if (!url || typeof url !== 'string') return false;
    var lower = url.toLowerCase();

    // 1. YouTube Live (chứa live=1, livestream hoặc chunk chuỗi sq của live)
    if (lower.includes('live=1') || lower.includes('&live=1') || lower.includes('live_stream') || lower.includes('/livestream')) {
      return true;
    }
    if (lower.includes('videoplayback') && (lower.includes('&sq=') || lower.includes('?sq=') || lower.includes('live-') || lower.includes('-live'))) {
      return true;
    }

    // 2. Nền tảng chuyên live stream (Twitch, TikTok Live, Facebook Live, Stripchat...)
    if (lower.includes('twitch.tv') || lower.includes('ttvnw.net') || lower.includes('doppiocdn') || lower.includes('stripchat')) return true;
    if (lower.includes('/live/') || lower.includes('/live-') || lower.includes('live.m3u8') || lower.includes('live_playlist') || lower.includes('type=live') || lower.includes('&is_live=1')) return true;

    // 3. Kiểm tra trang web hiện tại có đang mở trang live không
    try {
      var loc = window.location.href.toLowerCase();
      if (loc.includes('twitch.tv') || loc.includes('/live') || loc.includes('livestream') || loc.includes('stripchat')) {
        return true;
      }
      if (document.querySelector('.ytp-live, .ytp-live-badge, ytd-watch-flexy[is-live]')) {
        return true;
      }
    } catch(e) {}

    return false;
  };

  // Kiểm tra xem URL có phải là file chunk / segment rời rạc hoặc luồng stream m3u8 không
  var isChunkOrSegment = function(url) {
    if (!url || typeof url !== 'string') return true;
    var lower = url.toLowerCase();

    // 1. LOẠI BỎ HOÀN TOÀN TẤT CẢ các luồng m3u8 / hls / playlist / manifest
    // Người dùng chỉ cần tải các tệp video MP4/WebM/MOV/MKV thực tế
    if (lower.includes('.m3u8') || lower.includes('/hls/') || lower.includes('manifest') || lower.includes('playlist')) {
      return true;
    }

    // 2. Bỏ qua hoàn toàn các luồng Live Stream (Xem stream không cần tải xuống)
    if (isLiveStream(url)) return true;

    // 3. TUYỆT ĐỐI LOẠI BỎ mọi file phân đoạn nhỏ (.ts, .m4s, .m4f, .key, subtitle)
    if (/\\.(ts|m4s|m4f|key|vtt|srt|dfxp|ass|ssa)(\\?|$|#)/i.test(lower)) return true;

    // 4. Loại bỏ các file init, fragment, segment rời rạc
    if (lower.includes('init.mp4') || lower.includes('/init-') || lower.includes('/segment-') || lower.includes('/seg_') || lower.includes('-frag-') || lower.includes('/frag-')) return true;
    if (/\\/(seg|chunk|fragment)[-_0-9]/i.test(lower)) return true;
    if (/[\\?&](segment|chunk|frag|sq)=\\d+/i.test(lower)) return true;

    // 5. Loại bỏ ảnh, font, css, script
    if (/\\.(jpe?g|png|webp|gif|svg|ico|css|js|woff2?|ttf)(\\?|$|#)/i.test(lower)) return true;

    // 6. YouTube videoplayback
    if (lower.includes('videoplayback')) {
      if (lower.includes('&sq=') || lower.includes('?sq=') || lower.includes('live=1')) return true;
      return false;
    }

    return false;
  };

  var getFormat = function(url) {
    var lower = url.toLowerCase();
    if (lower.includes('.webm')) return 'webm';
    if (lower.includes('.mov')) return 'mov';
    if (lower.includes('.m4v')) return 'm4v';
    if (lower.includes('.mkv')) return 'mkv';
    return 'mp4';
  };

  // Gom nhóm các URL biến thể của cùng 1 luồng video
  var getStreamSignature = function(u) {
    try {
      var clean = u.split('?')[0].split('#')[0].toLowerCase();
      // Gom nhóm YouTube videoplayback
      var yt = u.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
      if (yt && u.includes('videoplayback')) return 'yt-' + yt[1];
      if (u.includes('videoplayback') && window.location.href.includes('youtube.com')) {
        return 'yt-' + window.location.pathname;
      }
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

    // Chỉ nhận video MP4, WEBM, MOV, M4V, MKV hoặc videoplayback
    if (!MEDIA_EXT_REGEX.test(url) && !STREAM_PATTERN_REGEX.test(url)) return;

    // Kiểm tra trùng lặp luồng video
    var sig = getStreamSignature(url);
    if (seenSignatures[sig]) {
      return;
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

  // Trích xuất và giải mã luồng video Vimeo từ iframe hoặc URL (ưu tiên MP4 progressive)
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
              var progressive = data.request && data.request.files && data.request.files.progressive;
              var vTitle = (data.video && data.video.title) || title || getBestPageTitle();
              if (progressive && progressive.length > 0) {
                var streamUrl = progressive[0].url;
                if (streamUrl) {
                  reportMedia(streamUrl, vTitle);
                }
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
        // Bỏ qua hoàn toàn Live Stream (duration là Infinity theo chuẩn W3C HTML5 Media)
        if (el.duration === Infinity || (el.duration && !isFinite(el.duration))) {
          continue;
        }

        var src = el.currentSrc || el.src || el.getAttribute('src');
        var title = el.getAttribute('title') || el.getAttribute('alt') || getBestPageTitle();
        if (src) {
          if (!src.startsWith('blob:') && !src.startsWith('data:')) {
            reportMedia(src, title);
          } else {
            inspectUrl(src, title);
          }
        }

        var sources = el.querySelectorAll('source');
        for (var j = 0; j < sources.length; j++) {
          var sSrc = sources[j].src || sources[j].getAttribute('src');
          if (sSrc) {
            if (!sSrc.startsWith('blob:') && !sSrc.startsWith('data:')) {
              reportMedia(sSrc, title);
            } else {
              inspectUrl(sSrc, title);
            }
          }
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

  // Cài đặt các hooks can thiệp luồng phát mạng (Chỉ cài đặt 1 lần duy nhất)
  if (!hooksInstalled) {
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

        var origPlay = proto.play;
        proto.play = function() {
          try {
            // Bỏ qua Live Stream khi gọi play
            if (this.duration === Infinity || (this.duration && !isFinite(this.duration))) {
              return origPlay.apply(this, arguments);
            }
            var vSrc = this.currentSrc || this.src || (this.querySelector && this.querySelector('source') ? this.querySelector('source').src : '');
            if (vSrc && !vSrc.startsWith('blob:') && !vSrc.startsWith('data:')) {
              reportMedia(vSrc, this.getAttribute('title') || getBestPageTitle());
            }
          } catch(e) {}
          return origPlay.apply(this, arguments);
        };
      }

      ['play', 'loadedmetadata', 'canplay', 'playing'].forEach(function(evt) {
        document.addEventListener(evt, function(e) {
          if (e.target && (e.target.tagName === 'VIDEO' || e.target.tagName === 'AUDIO')) {
            var el = e.target;
            // Bỏ qua Live Stream khi phát
            if (el.duration === Infinity || (el.duration && !isFinite(el.duration))) {
              return;
            }
            var src = el.currentSrc || el.src || el.getAttribute('src');
            if (src && !src.startsWith('blob:') && !src.startsWith('data:')) {
              reportMedia(src, el.getAttribute('title') || getBestPageTitle());
            } else if (src) {
              inspectUrl(src, el.getAttribute('title'));
            }
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

    // 5. MutationObserver theo dõi player được mount động vào DOM (có debounce 800ms tiết kiệm CPU)
    try {
      var scanTimeout = null;
      var videoObs = new MutationObserver(function() {
        if (!scanTimeout) {
          scanTimeout = setTimeout(function() {
            scanTimeout = null;
            scanDomElements();
          }, 800);
        }
      });
      if (document.body || document.documentElement) {
        videoObs.observe(document.body || document.documentElement, { childList: true, subtree: true });
      }
    } catch(e) {}
  }

  // 6. Quét định kỳ DOM một cách mượt mà và tiết kiệm CPU (6s/lần)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(scanDomElements, 500);
    }, { once: true });
  } else {
    setTimeout(scanDomElements, 500);
  }
  setInterval(scanDomElements, 6000);
})();
true;
`;
