/**
 * Script phát hiện sự kiện nhấn giữ hình ảnh (Long-Press / Context Menu) trên trang web
 * Hỗ trợ nhận diện URL ảnh công khai, WebP, SVG, base64 (data:image) và kích thước
 */
export const IMAGE_CONTEXT_SCRIPT = `
(function() {
  if (window.__kite_image_context_loaded) return;
  window.__kite_image_context_loaded = true;

  try {
    var longPressTimer = null;
    var startX = 0;
    var startY = 0;
    var currentImg = null;

    function extractImageInfo(el) {
      if (!el) return null;
      var img = el.tagName === 'IMG' ? el : (el.closest ? el.closest('img') : null);

      var src = '';
      var alt = '';
      var w = 0;
      var h = 0;

      if (img) {
        src = img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-original') || '';
        alt = (img.alt || img.title || '').trim();
        w = img.naturalWidth || img.offsetWidth || 0;
        h = img.naturalHeight || img.offsetHeight || 0;
      } else {
        // Kiểm tra phần tử có CSS background-image
        var style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        var bg = style ? style.backgroundImage : '';
        if (bg && bg.startsWith('url(')) {
          var match = bg.match(/url\\(["']?(.*?)["']?\\)/);
          if (match && match[1]) {
            src = match[1];
            alt = (el.getAttribute('aria-label') || el.title || '').trim();
            w = el.offsetWidth || 0;
            h = el.offsetHeight || 0;
          }
        }
      }

      if (!src || src.startsWith('about:') || src.startsWith('javascript:') || src.length < 5) {
        return null;
      }

      return {
        src: src,
        alt: alt,
        width: w,
        height: h
      };
    }

    function triggerImageAction(info) {
      if (!info || !info.src) return;
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'IMAGE_LONG_PRESS',
            src: info.src,
            alt: info.alt || '',
            width: info.width || 0,
            height: info.height || 0
          }));
        }
      } catch (err) {}
    }

    // 1. Desktop & Android chuột phải / long click chuẩn contextmenu
    document.addEventListener('contextmenu', function(e) {
      var info = extractImageInfo(e.target);
      if (info) {
        e.preventDefault();
        triggerImageAction(info);
      }
    }, true);

    // 2. Mobile Touch Long-press chuẩn iOS & Android (giữ ngón tay 500ms không cuộn)
    document.addEventListener('touchstart', function(e) {
      var touch = e.touches && e.touches[0];
      if (!touch) return;

      var info = extractImageInfo(e.target);
      if (!info) return;

      currentImg = info;
      startX = touch.clientX;
      startY = touch.clientY;

      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = setTimeout(function() {
        if (currentImg) {
          triggerImageAction(currentImg);
          currentImg = null;
        }
      }, 500);
    }, { passive: true });

    document.addEventListener('touchmove', function(e) {
      if (!longPressTimer) return;
      var touch = e.touches && e.touches[0];
      if (touch) {
        var dx = Math.abs(touch.clientX - startX);
        var dy = Math.abs(touch.clientY - startY);
        // Nếu ngón tay di chuyển quá 12px (người dùng đang cuộn trang), huỷ timer
        if (dx > 12 || dy > 12) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
          currentImg = null;
        }
      }
    }, { passive: true });

    document.addEventListener('touchend', function() {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      currentImg = null;
    }, { passive: true });

    document.addEventListener('touchcancel', function() {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      currentImg = null;
    }, { passive: true });

  } catch(e) {}
})();
true;
`;
