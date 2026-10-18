/**
 * Script theo dõi cử chỉ Kéo xuống (Pull to Refresh / + Thẻ mới / Đóng thẻ)
 * Hoạt động độc lập 100%, luôn được inject vào mọi trang web để đảm bảo cử chỉ kéo luôn nhạy.
 */
export const PULL_GESTURE_SCRIPT = `
(function() {
  if (window.__kite_pull_injected) return;
  window.__kite_pull_injected = true;

  var pullTouchStartY = 0;
  var pullTouchStartX = 0;
  var isPullTracking = false;
  var swipeStartX = 0;
  var swipeStartY = 0;
  var isSwipeTracking = false;

  window.addEventListener('touchstart', function(e) {
    if (e.touches && e.touches.length === 1) {
      var clientX = e.touches[0].clientX;
      var clientY = e.touches[0].clientY;
      swipeStartX = clientX;
      swipeStartY = clientY;
      isSwipeTracking = true;

      var scrollY = window.pageYOffset || window.scrollY || (document.documentElement && document.documentElement.scrollTop) || (document.body && document.body.scrollTop) || 0;
      if (scrollY <= 15) {
        pullTouchStartY = clientY;
        pullTouchStartX = clientX;
        isPullTracking = true;
      } else {
        isPullTracking = false;
      }
    }
  }, { passive: true });

  var pullActive = false;
  var rafId = 0, pendingDy = 0, pendingDx = 0;
  var lastSentDy = 0, lastSentDx = 0;

  function send(type, extra) {
    var w = window.ReactNativeWebView;
    if (w && w.postMessage) {
      w.postMessage(extra ? '{"type":"' + type + '",' + extra + '}' : '{"type":"' + type + '"}');
    }
  }

  function flushPull() {
    rafId = 0;
    if (!isPullTracking) return;
    if (Math.abs(pendingDy - lastSentDy) < 4 && Math.abs(pendingDx - lastSentDx) < 4) return;
    lastSentDy = pendingDy;
    lastSentDx = pendingDx;
    send('KITE_PULL_MOVE', '"dy":' + (pendingDy | 0) + ',"dx":' + (pendingDx | 0));
  }

  window.addEventListener('touchmove', function(e) {
    if (!isPullTracking || !e.touches || e.touches.length !== 1) return;
    var dy = e.touches[0].clientY - pullTouchStartY;
    var dx = e.touches[0].clientX - pullTouchStartX;

    if (Math.abs(dx) > 15 && Math.abs(dx) > Math.abs(dy)) {
      isPullTracking = false;
      if (pullActive) {
        pullActive = false;
        send('KITE_PULL_CANCEL');
      }
      return;
    }

    if (dy < -10) {
      isPullTracking = false;
      if (pullActive) {
        pullActive = false;
        send('KITE_PULL_CANCEL');
      }
      return;
    }

    if (dy < 12) return;

    var scrollY = window.pageYOffset || window.scrollY || (document.documentElement && document.documentElement.scrollTop) || (document.body && document.body.scrollTop) || 0;
    if (scrollY > 15) {
      isPullTracking = false;
      if (pullActive) {
        pullActive = false;
        send('KITE_PULL_CANCEL');
      }
      return;
    }

    pullActive = true;
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
    if (isPullTracking) {
      isPullTracking = false;
      if (pullActive) {
        pullActive = false;
        send('KITE_PULL_END');
      }
    }

    // Xu ly vuot ria mep trai man hinh de Back (Edge Swipe Back)
    // Tren iOS, WKWebView da bat allowsBackForwardNavigationGestures={true} ho tro vuot native 120fps muot ma tu BFCache.
    // Tuyet doi khong phat KITE_SWIPE_BACK tren iOS de tranh xung dot trung lap lenh goBack() gay chop trang man hinh!
    var isAppleDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!isAppleDevice && isSwipeTracking && e.changedTouches && e.changedTouches.length === 1) {
      isSwipeTracking = false;
      var endX = e.changedTouches[0].clientX;
      var endY = e.changedTouches[0].clientY;
      var sDx = endX - swipeStartX;
      var sDy = endY - swipeStartY;

      if (swipeStartX <= 40 && sDx > 40 && sDx > Math.abs(sDy) * 1.5) {
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
    if (isPullTracking) {
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
