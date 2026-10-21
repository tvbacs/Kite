/**
 * Script theo dõi cử chỉ Kéo xuống (Pull down: Tải lại / Thẻ mới / Đóng thẻ)
 * Hoạt động độc lập 100%, được inject ngay từ document_start để bắt đầu nhận cử chỉ lập tức 0ms.
 */
export const PULL_GESTURE_SCRIPT = `
(function() {
  if (window.__kite_pull_injected) return;
  window.__kite_pull_injected = true;

  var pullTouchStartY = 0;
  var pullTouchStartX = 0;
  var isPullTracking = false;
  var pullActive = false;
  var swipeStartX = 0;
  var swipeStartY = 0;
  var isSwipeTracking = false;

  function getScrollTop() {
    return window.pageYOffset || window.scrollY || (document.documentElement && document.documentElement.scrollTop) || (document.body && document.body.scrollTop) || 0;
  }

  function send(type, extra) {
    var w = window.ReactNativeWebView;
    if (w && w.postMessage) {
      w.postMessage(extra ? '{"type":"' + type + '",' + extra + '}' : '{"type":"' + type + '"}');
    }
  }

  window.addEventListener('touchstart', function(e) {
    if (e.touches && e.touches.length === 1) {
      var clientX = e.touches[0].clientX;
      var clientY = e.touches[0].clientY;
      swipeStartX = clientX;
      swipeStartY = clientY;
      isSwipeTracking = true;

      // Chỉ kích hoạt kéo khi trang đang ở đỉnh trên cùng (scrollY <= 1)
      var scrollY = getScrollTop();
      if (scrollY <= 1) {
        pullTouchStartY = clientY;
        pullTouchStartX = clientX;
        isPullTracking = true;
        pullActive = false;
      } else {
        isPullTracking = false;
        pullActive = false;
      }
    }
  }, { passive: true });

  var rafId = 0, pendingDy = 0, pendingDx = 0;
  var lastSentDy = 0, lastSentDx = 0;

  function flushPull() {
    rafId = 0;
    if (!isPullTracking && !pullActive) return;
    if (Math.abs(pendingDy - lastSentDy) < 3 && Math.abs(pendingDx - lastSentDx) < 3) return;
    lastSentDy = pendingDy;
    lastSentDx = pendingDx;
    send('KITE_PULL_MOVE', '"dy":' + (pendingDy | 0) + ',"dx":' + (pendingDx | 0));
  }

  window.addEventListener('touchmove', function(e) {
    if (!isPullTracking || !e.touches || e.touches.length !== 1) return;
    var dy = e.touches[0].clientY - pullTouchStartY;
    var dx = e.touches[0].clientX - pullTouchStartX;

    // Nếu vuốt ngược lên trên: Hủy cử chỉ kéo
    if (dy < -5) {
      isPullTracking = false;
      if (pullActive) {
        pullActive = false;
        send('KITE_PULL_CANCEL');
      }
      return;
    }

    // Nếu trang bị cuộn xuống (scrollY > 1), người dùng đang cuộn nội dung web -> Hủy cử chỉ kéo
    var currentScrollY = getScrollTop();
    if (currentScrollY > 1) {
      isPullTracking = false;
      if (pullActive) {
        pullActive = false;
        send('KITE_PULL_CANCEL');
      }
      return;
    }

    // Nếu chưa vào trạng thái kéo và chuyển động thuần ngang (như vuốt carousel/slider) thì bỏ qua
    if (!pullActive) {
      if (Math.abs(dx) > 30 && Math.abs(dx) > dy * 1.2) {
        isPullTracking = false;
        return;
      }
      // Cần kéo xuống tối thiểu 18px để bắt đầu kích hoạt giao diện kéo
      if (dy < 18) return;

      pullActive = true;
    }

    pendingDy = dy;
    pendingDx = dx;
    if (!rafId) {
      rafId = requestAnimationFrame(flushPull);
    }
  }, { passive: true });

  window.addEventListener('touchend', function(e) {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (isPullTracking || pullActive) {
      isPullTracking = false;
      if (pullActive) {
        pullActive = false;
        send('KITE_PULL_END');
      }
    }

    // Xử lý vuốt rìa mép trái màn hình để Back (Android Edge Swipe Back)
    var isAppleDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!isAppleDevice && isSwipeTracking && e.changedTouches && e.changedTouches.length === 1) {
      isSwipeTracking = false;
      var endX = e.changedTouches[0].clientX;
      var endY = e.changedTouches[0].clientY;
      var sDx = endX - swipeStartX;
      var sDy = endY - swipeStartY;

      if (swipeStartX <= 25 && sDx > 45 && sDx > Math.abs(sDy) * 1.5 && !pullActive) {
        send('KITE_SWIPE_BACK');
      }
    }
  }, { passive: true });

  window.addEventListener('touchcancel', function(e) {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    isSwipeTracking = false;
    if (isPullTracking || pullActive) {
      isPullTracking = false;
      if (pullActive) {
        pullActive = false;
        send('KITE_PULL_CANCEL');
      }
    }
  }, { passive: true });
})();
true;
`;
