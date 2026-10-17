import {
  BLOCKED_DOMAINS,
  BLOCKED_GAMBLING_KEYWORDS,
  COMMERCE_REDIRECT_DOMAINS,
  AD_SELECTORS,
} from '../constants/blocklist';

const serializedSelectors = JSON.stringify(AD_SELECTORS);
const serializedBlockedDomains = JSON.stringify(BLOCKED_DOMAINS);
const serializedGamblingKeywords = JSON.stringify(BLOCKED_GAMBLING_KEYWORDS);
const serializedCommerceDomains = JSON.stringify(COMMERCE_REDIRECT_DOMAINS);

/**
 * Script chặn trước khi tải nội dung (BeforeContentLoaded)
 * Khóa các API bật tab ngầm, bẻ gãy clickjacking & lớp phủ ma (overlay traps),
 * stub các SDK quảng cáo nổi tiếng (aclib, monetag),
 * tự động chuyển tiếp click đến phần tử thật sự bên dưới (nút Play/Cài đặt chất lượng),
 * và theo dõi cử chỉ vuốt kéo reload
 */
export const INJECTED_BEFORE_CONTENT = `
(function() {
  window.__kite_blocked_popups = 0;
  window.__kite_blocked_overlays = 0;
  window.__kite_blocked_redirects = 0;

  var AD_SELECTORS = ${serializedSelectors};
  var BLOCKED_DOMAINS = ${serializedBlockedDomains};
  var BLOCKED_GAMBLING_KEYWORDS = ${serializedGamblingKeywords};
  var COMMERCE_DOMAINS = ${serializedCommerceDomains};

  // 1. Tiêm bộ CSS chặn quảng cáo gom nhóm 1 lần duy nhất để tối ưu tối đa tốc độ phân giải DOM
  try {
    var styleEl = document.createElement('style');
    styleEl.type = 'text/css';
    styleEl.id = 'kite-shield-ad-block-css';
    styleEl.textContent = AD_SELECTORS.join(', ') + ' { display: none !important; opacity: 0 !important; pointer-events: none !important; visibility: hidden !important; height: 0 !important; width: 0 !important; max-height: 0 !important; overflow: hidden !important; }';
    (document.head || document.documentElement).appendChild(styleEl);
  } catch(e) {}

  // 1b. Tối ưu tốc độ tải trang: DNS prefetch và preconnect cho CDN
  try {
    var prefetchHosts = ['//fonts.googleapis.com', '//fonts.gstatic.com', '//cdnjs.cloudflare.com'];
    prefetchHosts.forEach(function(h) {
      var l = document.createElement('link');
      l.rel = 'dns-prefetch';
      l.href = h;
      (document.head || document.documentElement).appendChild(l);
    });
  } catch(e) {}

  // 2. Khóa hoàn toàn window.open với đầy đủ thuộc tính giả lập (tránh lỗi script video player bị crash)
  var fakeWin = {
    closed: true,
    focus: function(){},
    blur: function(){},
    close: function(){},
    postMessage: function(){},
    addEventListener: function(){},
    removeEventListener: function(){},
    document: {
      write: function(){},
      writeln: function(){},
      close: function(){},
      open: function(){ return fakeWin.document; },
      body: {},
      head: {}
    },
    location: {
      href: '',
      replace: function(){},
      assign: function(){},
      reload: function(){}
    }
  };

  try {
    window.open = function(url, target, features) {
      window.__kite_blocked_popups++;
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'BLOCKED_POPUP',
          url: url || ''
        }));
      } catch(e) {}
      return fakeWin;
    };
  } catch(e) {}

  // 3. Khóa stub window.aclib (Adcash / InPagePush / PopCash) để không tạo in-page push quảng cáo VPN/người lớn
  var fakeAclib = {
    runPop: function(){},
    runInPagePush: function(){},
    runBanner: function(){},
    runNative: function(){},
    runVideo: function(){},
    runInter: function(){}
  };
  try {
    window.aclib = fakeAclib;
    Object.defineProperty(window, 'aclib', {
      get: function() { return fakeAclib; },
      set: function() {},
      configurable: false
    });
  } catch(e) {}

  // 4. Xử lý alert an toàn: không nuốt alert hợp lệ, chỉ chặn alert lừa đảo VPN/virus
  var _origAlert = window.alert;
  window.alert = function(msg) {
    if (/vpn|virus|infected/i.test(String(msg || ''))) {
      return;
    }
    if (_origAlert) {
      return _origAlert.apply(window, arguments);
    }
  };

  // 5. Kiểm tra URL đích có phải là mạng quảng cáo hoặc nhà cái cá cược không
  function isKnownAdOrGambling(urlStr) {
    if (!urlStr) return false;
    try {
      var u = new URL(urlStr, window.location.href);
      var h = u.hostname.toLowerCase();
      var currentHost = window.location.hostname.toLowerCase();

      // Nếu cùng domain hoặc subdomain với trang hiện tại thì không phải liên kết ngoài quảng cáo
      function getBaseDomain(hostname) {
        var parts = hostname.split('.');
        if (parts.length >= 2) {
          return parts.slice(-2).join('.');
        }
        return hostname;
      }
      var baseCurrent = getBaseDomain(currentHost);
      var baseTarget = getBaseDomain(h);
      if (baseTarget && baseTarget === baseCurrent) {
        return false;
      }

      // So khớp chính xác hostname với danh sách mạng quảng cáo
      for (var i = 0; i < BLOCKED_DOMAINS.length; i++) {
        var d = BLOCKED_DOMAINS[i];
        if (h === d || h.endsWith('.' + d) || (d.length > 3 && h.includes(d))) return true;
      }

      // So khớp tên miền con với danh sách từ khóa nhà cái
      for (var j = 0; j < BLOCKED_GAMBLING_KEYWORDS.length; j++) {
        var g = BLOCKED_GAMBLING_KEYWORDS[j];
        if (h.includes(g)) return true;
      }

      // Kiểm tra chuyển hướng ép mở trang mua sắm
      for (var k = 0; k < COMMERCE_DOMAINS.length; k++) {
        var c = COMMERCE_DOMAINS[k];
        if (h === c || h.endsWith('.' + c)) return true;
      }
    } catch(e) {}
    return false;
  }

  // 5b. Chặn mã độc/quảng cáo tự ý đổi location (location.replace, location.assign) làm trắng màn hình
  try {
    var _origAssign = window.location.assign;
    window.location.assign = function(url) {
      if (isKnownAdOrGambling(url)) {
        window.__kite_blocked_redirects++;
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'BLOCKED_REDIRECT',
            url: url || ''
          }));
        } catch(e) {}
        return;
      }
      if (_origAssign) return _origAssign.apply(window.location, arguments);
    };

    var _origReplace = window.location.replace;
    window.location.replace = function(url) {
      if (isKnownAdOrGambling(url)) {
        window.__kite_blocked_redirects++;
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'BLOCKED_REDIRECT',
            url: url || ''
          }));
        } catch(e) {}
        return;
      }
      if (_origReplace) return _origReplace.apply(window.location, arguments);
    };
  } catch(e) {}

  // 6. Chặn khởi tạo script/iframe tải từ các domain quảng cáo độc hại (cả qua setAttribute và gán property src)
  try {
    var _origCreateElement = document.createElement;
    document.createElement = function(tagName, options) {
      var el = _origCreateElement.call(document, tagName, options);
      if (tagName && (tagName.toLowerCase() === 'script' || tagName.toLowerCase() === 'iframe')) {
        var _origSetAttribute = el.setAttribute;
        el.setAttribute = function(name, val) {
          if (name && name.toLowerCase() === 'src' && typeof val === 'string') {
            if (isKnownAdOrGambling(val)) {
              return;
            }
          }
          return _origSetAttribute.apply(el, arguments);
        };
      }
      return el;
    };
  } catch(e) {}

  // Chặn gán s.src = 'https://llvpn.com/tag.min.js' trên prototype của HTMLScriptElement
  try {
    var scriptProto = HTMLScriptElement.prototype;
    var origSrcDesc = Object.getOwnPropertyDescriptor(scriptProto, 'src') || Object.getOwnPropertyDescriptor(Element.prototype, 'src');
    if (origSrcDesc && origSrcDesc.set) {
      Object.defineProperty(scriptProto, 'src', {
        get: origSrcDesc.get,
        set: function(val) {
          if (typeof val === 'string' && isKnownAdOrGambling(val)) {
            return;
          }
          return origSrcDesc.set.call(this, val);
        },
        configurable: true
      });
    }
  } catch(e) {}

  // Chặn appendChild script quảng cáo vào DOM
  try {
    var origAppend = Node.prototype.appendChild;
    Node.prototype.appendChild = function(child) {
      if (child && child.tagName && child.tagName.toLowerCase() === 'script') {
        var s = child.src || (child.getAttribute && child.getAttribute('src')) || '';
        if (s && isKnownAdOrGambling(s)) {
          return child;
        }
      }
      return origAppend.apply(this, arguments);
    };
  } catch(e) {}

  // Chặn fetch và XMLHttpRequest đến các domain quảng cáo
  try {
    var _origFetch = window.fetch;
    window.fetch = function(input, init) {
      var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      if (url && isKnownAdOrGambling(url)) {
        return Promise.reject(new Error('Blocked by Kite Shield'));
      }
      return _origFetch.apply(this, arguments);
    };
  } catch(e) {}

  try {
    var _origXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      if (url && typeof url === 'string' && isKnownAdOrGambling(url)) {
        this.abort();
        return;
      }
      return _origXhrOpen.apply(this, arguments);
    };
  } catch(e) {}

  // 7. Bẻ gãy bẫy clickjacking / lớp phủ ma và chuyển tiếp click tức thì đến nút thật (Play, Quality...)
  document.addEventListener('click', function(e) {
    var target = e.target;
    if (!target) return;

    var anchor = target.closest ? target.closest('a') : null;

    // A. Kiểm tra thẻ <a> dẫn sang web cá cược hoặc mạng quảng cáo
    if (anchor && anchor.href) {
      if (isKnownAdOrGambling(anchor.href)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        window.__kite_blocked_redirects++;

        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'BLOCKED_REDIRECT',
            url: anchor.href
          }));
        } catch(err) {}
        return false;
      }
    }

    // B. Kiểm tra lớp phủ ma / tấm chắn trong suốt (invisible transparent overlay) phủ lên video player
    var isOverlayTrap = false;
    var trapElement = null;

    if (target !== document.body && target !== document.documentElement) {
      try {
        var isModalOrForm = target.closest && target.closest('dialog, [role="dialog"], [role="alertdialog"], .modal, .modal-backdrop, .swal2-container, .popup-container, form, nav, header, footer');
        if (!isModalOrForm) {
          var tag = target.tagName.toLowerCase();
          var isControl = tag === 'video' || tag === 'audio' || tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button' || tag === 'canvas';

          if (!isControl) {
            var style = window.getComputedStyle(target);
            var pos = style.position;
            if (pos === 'fixed' || pos === 'absolute') {
              var z = parseInt(style.zIndex, 10) || 0;
              var styleAttr = target.getAttribute('style') || '';
              var isInsaneZIndex = z >= 100000 || styleAttr.includes('2147483647') || styleAttr.includes('999999');
              var isKnownAdClass = target.matches && target.matches('#transparentLayer, .playover, .video-ad-layer, .popunder-link, .float-ck, .aanetwork-ads-box, .dhw-ad-notice');

              if ((isInsaneZIndex || isKnownAdClass) && !target.querySelector('video, form, nav, header, input, button')) {
                var text = (target.innerText || '').trim();
                if (text.length < 20) {
                  isOverlayTrap = true;
                  trapElement = target;
                }
              }
            }
          }
        }
      } catch(err) {}
    }

    // C. Khi phát hiện lớp phủ ma: triệt tiêu lớp phủ và kích hoạt nút thật bên dưới
    if (isOverlayTrap && trapElement) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      window.__kite_blocked_redirects++;

      trapElement.style.setProperty('display', 'none', 'important');
      trapElement.style.setProperty('pointer-events', 'none', 'important');
      trapElement.style.setProperty('visibility', 'hidden', 'important');
      trapElement.style.setProperty('opacity', '0', 'important');

      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'BLOCKED_REDIRECT',
          url: 'Lớp phủ ma'
        }));
      } catch(err) {}

      // CHUYỂN TIẾP CLICK TỨC THÌ ĐẾN NÚT THẬT (Play, Cài đặt 720p/1080p, Fullscreen...)
      try {
        var realTarget = document.elementFromPoint(e.clientX, e.clientY);
        if (realTarget && realTarget !== trapElement && !trapElement.contains(realTarget)) {
          if (!realTarget.__kite_forwarding) {
            realTarget.__kite_forwarding = true;
            setTimeout(function() { realTarget.__kite_forwarding = false; }, 300);
            realTarget.click();
          }
        }
      } catch(err) {}

      return false;
    }
  }, true);

  // 8. Chặn trigger mở popup trên touchstart với link quảng cáo
  document.addEventListener('touchstart', function(e) {
    if (!e.touches || e.touches.length !== 1) return;
    var target = e.target;
    if (!target) return;
    var anchor = target.closest ? target.closest('a') : null;
    if (anchor && anchor.href && isKnownAdOrGambling(anchor.href)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, { capture: true, passive: false });

  // 9. Theo dõi cử chỉ vuốt kéo xuống trên trang web (Kite Pull Down Bar)
  var pullTouchStartY = 0;
  var pullTouchStartX = 0;
  var isPullTracking = false;

  window.addEventListener('touchstart', function(e) {
    if (e.touches && e.touches.length === 1) {
      var scrollY = window.pageYOffset || window.scrollY || (document.documentElement && document.documentElement.scrollTop) || (document.body && document.body.scrollTop) || 0;
      if (scrollY <= 8) {
        pullTouchStartY = e.touches[0].clientY;
        pullTouchStartX = e.touches[0].clientX;
        isPullTracking = true;
      }
    }
  }, { passive: true });

  window.addEventListener('touchmove', function(e) {
    if (!isPullTracking) return;
    var currentY = e.touches[0].clientY;
    var currentX = e.touches[0].clientX;
    var dy = currentY - pullTouchStartY;
    var dx = currentX - pullTouchStartX;
    var scrollY = window.pageYOffset || window.scrollY || (document.documentElement && document.documentElement.scrollTop) || (document.body && document.body.scrollTop) || 0;

    if (dy > 6 && dy > Math.abs(dx) * 0.7 && scrollY <= 15) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'KITE_PULL_MOVE',
          dy: dy,
          dx: dx
        }));
      }
    } else if (dy < -12) {
      if (isPullTracking) {
        isPullTracking = false;
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'KITE_PULL_CANCEL'
          }));
        }
      }
    }
  }, { passive: true });

  window.addEventListener('touchend', function(e) {
    if (isPullTracking) {
      isPullTracking = false;
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'KITE_PULL_END'
        }));
      }
    }
  }, { passive: true });

  window.addEventListener('touchcancel', function(e) {
    if (isPullTracking) {
      isPullTracking = false;
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'KITE_PULL_CANCEL'
        }));
      }
    }
  }, { passive: true });
})();
true;
`;

/**
 * Script tối ưu hiển thị, bảo đảm CSS ẩn quảng cáo và nhận diện tài khoản Google an toàn
 */
export const INJECTED_AFTER_CONTENT = `
(function() {
  var AD_SELECTORS = ${serializedSelectors};

  // 1. Đảm bảo CSS ẩn quảng cáo luôn hiện diện bằng sheet.insertRule từng selector
  try {
    if (!document.getElementById('kite-shield-ad-block-css')) {
      var s = document.createElement('style');
      s.id = 'kite-shield-ad-block-css';
      s.type = 'text/css';
      (document.head || document.documentElement).appendChild(s);
      var sheet = s.sheet;
      if (sheet) {
        for (var i = 0; i < AD_SELECTORS.length; i++) {
          try {
            sheet.insertRule(
              AD_SELECTORS[i] + ' { display: none !important; opacity: 0 !important; pointer-events: none !important; visibility: hidden !important; height: 0 !important; width: 0 !important; max-height: 0 !important; overflow: hidden !important; }',
              sheet.cssRules.length
            );
          } catch(err) {}
        }
      }
    }
  } catch(e) {}

  // 2. Tự động quét và triệt tiêu lớp phủ ma, catfish ads trên các trang web xem phim với Debounce
  try {
    var adQuery = [
      '#mobileCatfish', '#catfish', '#catfish-ad', '.mobile-catfish-top', '.mobile-catfixx',
      '.aanetwork-ads-box', '.float-ck', '.under_player', '#_AM_POPUP_FRAME',
      '#transparentLayer', '.playover', '.video-ad-layer', '.popunder-link',
      '#footer_fixed_ads', '#_preload-ads-1', '#invideo_wrapper', '#avs-banner-overlay', '#avs-pause-ad',
      '.dhw-ad-notice', '[class*="dhw-ad"]', '[id*="aclib"]', '[class*="aclib"]'
    ].join(', ');

    var neutralizeElement = function(el) {
      if (!el || el.nodeType !== 1) return;
      var tag = el.tagName ? el.tagName.toLowerCase() : '';
      if (tag === 'video' || tag === 'nav' || tag === 'header' || tag === 'form' || tag === 'main' || tag === 'article') return;
      if (el.querySelector && el.querySelector('video, form, nav, header, main, article')) return;

      // Bảo vệ các hộp thoại xác nhận 18+, cookie, cảnh báo độ tuổi để người dùng có thể bấm vào xem trang
      var text = (el.innerText || '').toLowerCase();
      if (
        text.includes('18+') ||
        text.includes('18 tuổi') ||
        text.includes('agree') ||
        text.includes('enter') ||
        text.includes('cookie') ||
        text.includes('xác nhận') ||
        text.includes('độ tuổi') ||
        text.includes('tuổi') ||
        text.includes('adult')
      ) {
        return;
      }

      // Không ẩn các phần tử có nhiều nội dung hoặc có nhiều link/ảnh
      if (el.querySelectorAll && (el.querySelectorAll('p, a, img').length > 4 || text.length > 200)) {
        return;
      }

      var matches = false;
      try {
        if (el.matches && el.matches(adQuery)) matches = true;
      } catch(e) {}

      if (matches) {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('opacity', '0', 'important');
      }
    };

    var pendingNodes = [];
    var scheduledTimer = null;

    var processPendingNodes = function() {
      var nodes = pendingNodes.slice();
      pendingNodes = [];
      scheduledTimer = null;
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        neutralizeElement(node);
        if (node.querySelectorAll) {
          try {
            var children = node.querySelectorAll(adQuery);
            for (var c = 0; c < children.length; c++) {
              neutralizeElement(children[c]);
            }
          } catch(e) {}
        }
      }
    };

    // Quét triệt tiêu các huy hiệu giả mạo VPN và nút đóng quảng cáo nổi
    var scanVpnBadges = function() {
      try {
        var allDivs = document.querySelectorAll('div, a, section, span');
        for (var bIdx = 0; bIdx < allDivs.length; bIdx++) {
          var el = allDivs[bIdx];
          if (!el || el.children.length > 5) continue;
          var txt = (el.innerText || '').toLowerCase();
          if (
            txt.includes('vpn recommended') ||
            txt.includes('tap to install and continue watching') ||
            txt.includes('install chatmate') ||
            (txt.includes('close ad') && txt.length < 25)
          ) {
            var st = window.getComputedStyle(el);
            if (st.position === 'fixed' || st.position === 'absolute' || parseInt(st.zIndex, 10) > 100) {
              el.style.setProperty('display', 'none', 'important');
              el.style.setProperty('pointer-events', 'none', 'important');
              el.style.setProperty('visibility', 'hidden', 'important');
              el.style.setProperty('opacity', '0', 'important');
            }
          }
        }
      } catch(e) {}
    };

    // Tự động phát hiện và khôi phục nội dung nếu trang web bị script chống AdBlock ép trắng màn hình
    var unblankBody = function() {
      try {
        if (document.body) {
          var bStyle = window.getComputedStyle(document.body);
          if (bStyle.display === 'none' || bStyle.visibility === 'hidden' || parseFloat(bStyle.opacity) === 0) {
            document.body.style.setProperty('display', 'block', 'important');
            document.body.style.setProperty('visibility', 'visible', 'important');
            document.body.style.setProperty('opacity', '1', 'important');
          }
        }
        if (document.documentElement) {
          var dStyle = window.getComputedStyle(document.documentElement);
          if (dStyle.display === 'none' || dStyle.visibility === 'hidden' || parseFloat(dStyle.opacity) === 0) {
            document.documentElement.style.setProperty('display', 'block', 'important');
            document.documentElement.style.setProperty('visibility', 'visible', 'important');
            document.documentElement.style.setProperty('opacity', '1', 'important');
          }
        }
      } catch(e) {}
    };

    // Quét toàn bộ DOM ban đầu
    processPendingNodes();
    scanVpnBadges();
    unblankBody();
    setTimeout(function() { processPendingNodes(); scanVpnBadges(); unblankBody(); }, 400);
    setTimeout(function() { processPendingNodes(); scanVpnBadges(); unblankBody(); }, 1200);
    setTimeout(function() { processPendingNodes(); scanVpnBadges(); unblankBody(); }, 2500);

    // Lắng nghe MutationObserver có debounce
    var observer = new MutationObserver(function(mutations) {
      for (var mIdx = 0; mIdx < mutations.length; mIdx++) {
        var mut = mutations[mIdx];
        if (mut.addedNodes) {
          for (var nIdx = 0; nIdx < mut.addedNodes.length; nIdx++) {
            var n = mut.addedNodes[nIdx];
            if (n.nodeType === 1) {
              pendingNodes.push(n);
            }
          }
        }
      }
      if (pendingNodes.length > 0 && !scheduledTimer) {
        scheduledTimer = setTimeout(function() {
          processPendingNodes();
          scanVpnBadges();
        }, 100);
      }
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  } catch(e) {}

  // 3. Nhận diện tài khoản Google một cách an toàn
  try {
    var host = (location.hostname || '').toLowerCase();
    var search = (location.search || '').toLowerCase();

    // Bắt sự kiện khi người dùng CHỦ ĐỘNG bấm chọn tài khoản trên accounts.google.com hoặc google.com
    var handleAccountPick = function(e) {
      try {
        var el = e.target;
        if (!el) return;

        var current = el;
        var foundEmail = '';
        var foundName = '';
        var foundAvatar = '';

        while (current && current !== document.body && current !== document.documentElement) {
          var dataEmail = current.getAttribute('data-email') || 
                           current.getAttribute('data-identifier') || 
                           current.getAttribute('data-profileidentifier') || '';
          var text = (current.innerText || '') + ' ' + (current.getAttribute('aria-label') || '');
          var emailMatch = (dataEmail + ' ' + text).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

          if (emailMatch) {
            foundEmail = emailMatch[0];

            var img = current.querySelector('img') || (current.parentElement ? current.parentElement.querySelector('img') : null);
            if (img && img.src && (img.src.includes('googleusercontent.com') || img.src.includes('google.com'))) {
              foundAvatar = img.src.replace(/=s\d+(-[a-z]+)?/i, '=s256-c');
            }

            var clean = text.replace(/tài khoản google:?/i, '')
                            .replace(/google account:?/i, '')
                            .replace(foundEmail, '')
                            .replace(/[()]/g, '');
            var lines = clean.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
            for (var i = 0; i < lines.length; i++) {
              var line = lines[i];
              if (!line.includes('@') && line.length < 40 && !line.toLowerCase().includes('google')) {
                foundName = line;
                break;
              }
            }
            if (!foundName) {
              foundName = foundEmail.split('@')[0];
            }
            break;
          }
          current = current.parentElement;
        }

        if (foundEmail) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'GOOGLE_ACCOUNT_CHOSEN',
            email: foundEmail,
            name: foundName,
            avatarUrl: foundAvatar
          }));
        }
      } catch(err) {}
    };

    document.addEventListener('click', handleAccountPick, true);
    document.addEventListener('touchend', handleAccountPick, true);
    document.addEventListener('pointerdown', handleAccountPick, true);

    if (host.includes('accounts.google.com')) {
      return;
    }

    var isMyAccount = host.includes('myaccount.google.com');
    var isGoogleSearchOrHome = host.includes('google.') && !host.includes('gemini.') && !host.includes('myaccount.');
    var isGoogleCompletedLogin = isMyAccount;

    if (isMyAccount || isGoogleSearchOrHome) {
      var lastReportedKey = '';
      var findGoogleProfile = function() {
        var userEmail = '';
        var userName = '';
        var userAvatar = '';

        // 1. Kiểm tra nút tài khoản / avatar trên thanh công cụ
        var activeBtn = document.querySelector(
          'a[href*="SignOutOptions"], a[aria-label*="Tài khoản Google"], button[aria-label*="Tài khoản Google"], a[aria-label*="Google Account"], button[aria-label*="Google Account"], [aria-label*="@"], .gb_A, [data-ogsr-up]'
        );

        if (activeBtn) {
          var label = activeBtn.getAttribute('aria-label') || activeBtn.getAttribute('title') || activeBtn.innerText || '';
          var emailMatch = label.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
          if (emailMatch) {
            userEmail = emailMatch[0];
            var cleaned = label.replace(/tài khoản google:?/i, '')
                               .replace(/google account:?/i, '')
                               .replace(userEmail, '')
                               .replace(/[()]/g, '')
                               .trim();
            if (cleaned) userName = cleaned;

            var img = activeBtn.querySelector('img') || activeBtn;
            if (img && img.src) {
              var s = img.src;
              if (s.includes('googleusercontent.com/a/') || s.includes('googleusercontent.com/a-/') || s.includes('googleusercontent.com/ogw/')) {
                userAvatar = s.replace(/=s\d+(-[a-z]+)?/i, '=s256-c');
              }
              if (!userName && img.alt) userName = img.alt;
            }
          }
        }

        // 2. Trên trang myaccount.google.com: Quét trực tiếp thẻ thông tin tài khoản
        if (isMyAccount) {
          try {
            var allDivs = document.querySelectorAll('div, span, p, a, h1, h2, h3');
            for (var i = 0; i < allDivs.length; i++) {
              var el = allDivs[i];
              if (el.children.length <= 1) {
                var txt = (el.innerText || el.textContent || '').trim();
                var em = txt.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                if (em) {
                  if (!userEmail) userEmail = em[0];
                  var parent = el.parentElement;
                  for (var depth = 0; depth < 3 && parent; depth++) {
                    var siblings = parent.querySelectorAll('div, span, h1, h2, h3, p');
                    for (var s = 0; s < siblings.length; s++) {
                      var sTxt = (siblings[s].innerText || siblings[s].textContent || '').trim();
                      if (
                        sTxt &&
                        sTxt !== userEmail &&
                        !sTxt.includes('@') &&
                        sTxt.length >= 2 &&
                        sTxt.length <= 50
                      ) {
                        var sLow = sTxt.toLowerCase();
                        if (
                          !sLow.includes('google') &&
                          !sLow.includes('tài khoản') &&
                          !sLow.includes('quản lý') &&
                          !sLow.includes('bảo mật') &&
                          !sLow.includes('wallet') &&
                          !sLow.includes('thông tin')
                        ) {
                          if (!userName) userName = sTxt;
                          break;
                        }
                      }
                    }
                    if (userName) break;
                    parent = parent.parentElement;
                  }
                  if (userEmail && userName) break;
                }
              }
            }
          } catch(err) {}

          // Quét ảnh đại diện nếu có ảnh tùy chỉnh
          if (!userAvatar) {
            var imgs = document.querySelectorAll('img[src*="googleusercontent.com"], img[src*="ggpht.com"]');
            for (var imgIdx = 0; imgIdx < imgs.length; imgIdx++) {
              var src = imgs[imgIdx].src || '';
              if (src.includes('/a/') || src.includes('/a-/') || src.includes('/ogw/')) {
                userAvatar = src.replace(/=s\d+(-[a-z]+)?/i, '=s256-c');
                break;
              }
            }
          }
        }

        // 3. Fallback tìm email từ toàn bộ trang
        if (!userEmail && isMyAccount) {
          var allText = (document.body ? document.body.innerText : '') + ' ' + (document.body ? document.body.innerHTML : '');
          var m = allText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
          if (m) {
            userEmail = m[0];
          }
        }

        if (userEmail) {
          var badWords = ['app store', 'google play', 'gemini', 'google', 'logo', 'banner', 'icon', 'tài khoản'];
          if (badWords.some(function(b) { return userName.toLowerCase().includes(b); })) {
            userName = '';
          }
          if (!userName) {
            userName = userEmail.split('@')[0];
          }

          var reportKey = userEmail + '|' + userName + '|' + userAvatar;
          if (reportKey !== lastReportedKey) {
            lastReportedKey = reportKey;
            try {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: isGoogleCompletedLogin ? 'GOOGLE_LOGIN_COMPLETED' : 'GOOGLE_USER_PROFILE',
                avatarUrl: userAvatar || '',
                name: userName,
                email: userEmail
              }));
            } catch(e) {}
          }
        }
      };

      findGoogleProfile();
      setTimeout(findGoogleProfile, 400);
      setTimeout(findGoogleProfile, 1000);
      setTimeout(findGoogleProfile, 2000);
      setTimeout(findGoogleProfile, 4000);

      try {
        if (typeof MutationObserver !== 'undefined' && document.body) {
          var obs = new MutationObserver(function() {
            findGoogleProfile();
          });
          obs.observe(document.body, { childList: true, subtree: true });
        }
      } catch(e) {}
    }
  } catch(e) {}

  // 4. Hỗ trợ toàn màn hình, PiP & Giữ màn hình sáng cho Trình phát Video
  try {
    var setupVideoPlayer = function(v) {
      if (!v || v.__kite_ready) return;
      v.__kite_ready = true;
      v.setAttribute('playsinline', 'true');
      v.setAttribute('webkit-playsinline', 'true');

      v.addEventListener('webkitbeginfullscreen', function() {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'VIDEO_FULLSCREEN_ENTER' }));
        } catch(e) {}
      });

      v.addEventListener('webkitendfullscreen', function() {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'VIDEO_FULLSCREEN_EXIT' }));
        } catch(e) {}
      });

      v.addEventListener('play', function() {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'VIDEO_PLAYING' }));
        } catch(e) {}
      });

      v.addEventListener('pause', function() {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'VIDEO_PAUSED' }));
        } catch(e) {}
      });
    };

    document.querySelectorAll('video').forEach(setupVideoPlayer);
    var videoObs = new MutationObserver(function(muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.addedNodes) {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var node = m.addedNodes[j];
            if (node.tagName === 'VIDEO') setupVideoPlayer(node);
            else if (node.querySelectorAll) node.querySelectorAll('video').forEach(setupVideoPlayer);
          }
        }
      }
    });
    if (document.body) {
      videoObs.observe(document.body, { childList: true, subtree: true });
    }
  } catch(e) {}
})();
true;
`;

/**
 * Tạm dừng toàn bộ video & âm thanh khi tab bị ẩn sang nền để tiết kiệm pin tối đa
 */
export const PAUSE_BACKGROUND_MEDIA_SCRIPT = `
(function() {
  try {
    document.querySelectorAll('video, audio').forEach(function(media) {
      if (!media.paused) {
        media.pause();
      }
    });
  } catch(e) {}
})();
true;
`;

/**
 * Chế độ tiết kiệm dữ liệu (Data Saver):
 * - 'block_images': Can thiệp vào toàn bộ thẻ <img>, chặn tải ảnh (100% tiết kiệm data di động 4G/5G).
 *   Thay bằng placeholder SVG siêu nhẹ, hỗ trợ chạm vào ảnh để tải riêng ảnh đó (Click-to-load).
 * - 'compress_images': Nén và tối ưu hóa ảnh, gỡ bỏ srcset 2x/3x retina, bật lazy-loading và async decoding.
 * - 'off': Tắt tiết kiệm dữ liệu, khôi phục lại ảnh nguyên bản.
 */
export const getDataSaverScript = (mode: 'block_images' | 'compress_images' | 'off' = 'block_images') => `
(function() {
  try {
    var mode = ${JSON.stringify(mode)};
    var styleId = '__kite_data_saver_style';
    var existingStyle = document.getElementById(styleId);

    if (mode === 'off') {
      if (existingStyle && existingStyle.parentNode) {
        existingStyle.parentNode.removeChild(existingStyle);
      }
      // Phục hồi lại các ảnh đã bị chặn nếu có
      document.querySelectorAll('img[data-kite-original-src]').forEach(function(img) {
        if (img.dataset.kiteOriginalSrc) {
          img.src = img.dataset.kiteOriginalSrc;
          if (img.dataset.kiteOriginalSrcset) {
            img.srcset = img.dataset.kiteOriginalSrcset;
          }
          delete img.dataset.kiteBlocked;
          delete img.dataset.kiteOriginalSrc;
          delete img.dataset.kiteOriginalSrcset;
          img.style.border = '';
          img.style.minHeight = '';
        }
      });
      return;
    }

    if (!existingStyle) {
      existingStyle = document.createElement('style');
      existingStyle.id = styleId;
      (document.head || document.documentElement).appendChild(existingStyle);
    }

    var placeholderSvg = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='80' viewBox='0 0 140 80'%3E%3Crect width='100%25' height='100%25' fill='%23f1f5f9' rx='8'/%3E%3Ctext x='50%25' y='44%25' dominant-baseline='middle' text-anchor='middle' font-family='-apple-system,sans-serif' font-size='12' fill='%2364748b' font-weight='600'%3E%F0%9F%96%BC%EF%B8%8F T%E1%BA%AFt t%E1%BA%A3i %E1%BA%A3nh%3C/text%3E%3Ctext x='50%25' y='66%25' dominant-baseline='middle' text-anchor='middle' font-family='-apple-system,sans-serif' font-size='9' fill='%230284c7'%3E(Ch%E1%BA%A1m %C4%91%E1%BB%83 t%E1%BA%A3i)%3C/text%3E%3C/svg%3E";

    if (mode === 'block_images') {
      existingStyle.textContent = [
        'img[data-kite-blocked="true"] { border: 1.5px dashed #94a3b8 !important; cursor: pointer !important; object-fit: contain !important; background: #f8fafc !important; }',
        'picture source { display: none !important; }',
        '[style*="background-image"] { background-image: none !important; }'
      ].join('\\n');

      function blockImg(img) {
        if (!img || img.dataset.kiteBlocked === 'true' || img.dataset.kiteLoaded === 'true') return;

        var src = img.getAttribute('src') || img.src || '';
        var srcset = img.getAttribute('srcset') || img.srcset || '';

        // Không can thiệp icon nhỏ như favicon hoặc chính placeholder
        if (src.startsWith('data:image/svg+xml') || src.includes('favicon')) {
          return;
        }

        if (src) img.dataset.kiteOriginalSrc = src;
        if (srcset) img.dataset.kiteOriginalSrcset = srcset;
        img.dataset.kiteBlocked = 'true';

        // Gỡ bỏ srcset và đổi src sang placeholder SVG để dừng tải ảnh qua mạng
        img.removeAttribute('srcset');
        img.src = placeholderSvg;
        img.title = 'Tiết kiệm dữ liệu: Chạm vào để tải ảnh này';

        // Chạm vào ảnh để tải riêng ảnh đó (Click-to-load)
        if (!img.__kiteClickAttached) {
          img.__kiteClickAttached = true;
          img.addEventListener('click', function(e) {
            if (this.dataset.kiteOriginalSrc && this.dataset.kiteBlocked === 'true') {
              e.preventDefault();
              e.stopPropagation();
              this.src = this.dataset.kiteOriginalSrc;
              if (this.dataset.kiteOriginalSrcset) {
                this.srcset = this.dataset.kiteOriginalSrcset;
              }
              this.dataset.kiteBlocked = 'false';
              this.dataset.kiteLoaded = 'true';
              this.style.border = 'none';
            }
          }, true);
        }
      }

      document.querySelectorAll('img').forEach(blockImg);

      // Quan sát DOM để can thiệp ngay lập tức vào bất kỳ thẻ <img> nào chèn động
      var obs = new MutationObserver(function(mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          if (m.addedNodes) {
            for (var j = 0; j < m.addedNodes.length; j++) {
              var n = m.addedNodes[j];
              if (n.tagName === 'IMG') blockImg(n);
              else if (n.querySelectorAll) n.querySelectorAll('img').forEach(blockImg);
            }
          }
        }
      });
      obs.observe(document.documentElement || document.body, { childList: true, subtree: true });

    } else if (mode === 'compress_images') {
      existingStyle.textContent = [
        'img { max-height: 320px !important; object-fit: contain !important; }',
        '[style*="background-image"] { background-size: contain !important; }'
      ].join('\\n');

      function compressImg(img) {
        if (!img || img.dataset.kiteCompressed) return;
        img.dataset.kiteCompressed = 'true';
        img.loading = 'lazy';
        img.decoding = 'async';
        // Gỡ bỏ các ảnh retina mật độ cao (2x, 3x, 4x) để tiết kiệm 60-70% dữ liệu di động
        if (img.getAttribute('srcset')) {
          img.removeAttribute('srcset');
        }
      }

      document.querySelectorAll('img').forEach(compressImg);

      var compObs = new MutationObserver(function(mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          if (m.addedNodes) {
            for (var j = 0; j < m.addedNodes.length; j++) {
              var n = m.addedNodes[j];
              if (n.tagName === 'IMG') compressImg(n);
              else if (n.querySelectorAll) n.querySelectorAll('img').forEach(compressImg);
            }
          }
        }
      });
      compObs.observe(document.documentElement || document.body, { childList: true, subtree: true });
    }
  } catch(e) {}
})();
true;
`;

export const DATA_SAVER_SCRIPT = getDataSaverScript('block_images');

/**
 * Lệnh can thiệp bằng tay khi người dùng bấm nút "Zap Overlay" trên thanh điều hướng
 */
export const FORCE_ZAP_SCRIPT = `
(function() {
  var count = 0;
  var adQuery = [
    '#mobileCatfish', '#catfish', '#catfish-ad', '.mobile-catfish-top', '.mobile-catfixx',
    '.aanetwork-ads-box', '.float-ck', '.under_player', '#_AM_POPUP_FRAME',
    '#transparentLayer', '.playover', '.video-ad-layer', '.popunder-link',
    '#footer_fixed_ads', '#_preload-ads-1', '#invideo_wrapper', '#avs-banner-overlay', '#avs-pause-ad',
    '.dhw-ad-notice', '[class*="dhw-ad"]', '[id*="aclib"]', '[class*="aclib"]'
  ].join(', ');

  try {
    var targeted = document.querySelectorAll(adQuery);
    for (var i = 0; i < targeted.length; i++) {
      var el = targeted[i];
      if (!el.querySelector('video, nav, header, footer, form')) {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
        count++;
      }
    }
  } catch(e) {}

  try {
    var allFixed = document.querySelectorAll('div[style*="position: fixed"], div[style*="position: absolute"]');
    for (var j = 0; j < allFixed.length; j++) {
      var item = allFixed[j];
      if (item.querySelector('video, nav, header, footer, form, input, button')) continue;
      var style = window.getComputedStyle(item);
      var z = parseInt(style.zIndex, 10) || 0;
      if (z >= 100000) {
        item.style.setProperty('display', 'none', 'important');
        item.style.setProperty('pointer-events', 'none', 'important');
        count++;
      }
    }
  } catch(e) {}

  try {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'MANUAL_ZAP_SUCCESS',
      count: count
    }));
  } catch(err) {}
})();
true;
`;

/**
 * Trích xuất vị trí cuộn trang và các giá trị input form trước khi đóng băng (Sleep/Freeze) tab
 */
export const getCaptureTabStateScript = (tabId: string) => `
(function() {
  try {
    var scrollX = window.scrollX || window.pageXOffset || 0;
    var scrollY = window.scrollY || window.pageYOffset || 0;
    var formInputs = {};

    var inputs = document.querySelectorAll('input:not([type="password"]):not([type="hidden"]), textarea, select');
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      var key = el.name || el.id || ('__inp_' + i);
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked) formInputs[key] = '__CHECKED__';
      } else if (el.value) {
        formInputs[key] = el.value.substring(0, 3000);
      }
    }

    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'TAB_STATE_CAPTURED',
      tabId: ${JSON.stringify(tabId)},
      state: {
        scrollX: Math.round(scrollX),
        scrollY: Math.round(scrollY),
        formInputs: formInputs,
        capturedAt: Date.now()
      }
    }));
  } catch(e) {}
})();
true;
`;

/**
 * Phục hồi chính xác vị trí cuộn trang và giá trị biểu mẫu khi đánh thức (Thaw/Wake up) tab
 */
export const getRestoreTabStateScript = (state: { scrollX: number; scrollY: number; formInputs?: Record<string, string> }) => `
(function() {
  var state = ${JSON.stringify(state)};
  if (!state) return;
  try {
    // 1. Phục hồi dữ liệu input form
    if (state.formInputs) {
      for (var key in state.formInputs) {
        var val = state.formInputs[key];
        var el = document.querySelector('[name="' + key + '"], #' + key);
        if (el) {
          if (val === '__CHECKED__') {
            el.checked = true;
          } else {
            el.value = val;
          }
          try {
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } catch(e) {}
        }
      }
    }
    // 2. Phục hồi vị trí cuộn trang (đa bước để không bị lỗi layout shift khi tải font / ảnh chậm)
    if (state.scrollY > 0 || state.scrollX > 0) {
      window.scrollTo(state.scrollX, state.scrollY);
      setTimeout(function() {
        window.scrollTo(state.scrollX, state.scrollY);
      }, 300);
      setTimeout(function() {
        window.scrollTo(state.scrollX, state.scrollY);
      }, 700);
      setTimeout(function() {
        window.scrollTo(state.scrollX, state.scrollY);
      }, 1400);
    }
  } catch(e) {}
})();
true;
`;

/**
 * Chế độ đọc báo (Reader Mode):
 * Inject một parser thông minh bóc tách nội dung chính của bài báo, ẩn hết banner/quảng cáo,
 * hiển thị dạng văn bản sạch chuẩn typography tạp chí giúp cuộn cực nhẹ và tiết kiệm pin OLED.
 */
export const READER_MODE_SCRIPT = `
(function() {
  if (window.__kite_reader_active) {
    if (window.__kite_original_body) {
      document.body.innerHTML = window.__kite_original_body;
      window.__kite_reader_active = false;
      var style = document.getElementById('__kite_reader_styles');
      if (style) style.remove();
      if (window.__kite_original_scroll) {
        window.scrollTo(0, window.__kite_original_scroll);
      }
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'READER_MODE_STATE', active: false }));
      } catch(e) {}
    }
    return;
  }

  // 1. Lưu lại trạng thái trang ban đầu để phục hồi
  window.__kite_original_body = document.body.innerHTML;
  window.__kite_original_scroll = window.scrollY || window.pageYOffset || 0;

  // 2. Tìm kiếm tiêu đề bài viết
  var title = '';
  var h1 = document.querySelector('h1, .article-title, .title-detail, .post-title, .entry-title');
  if (h1) {
    title = h1.innerText.trim();
  }
  if (!title) {
    var ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) title = ogTitle.getAttribute('content') || '';
  }
  if (!title) title = document.title || 'Bài báo';

  // 3. Tác giả & Ngày đăng
  var byline = '';
  var authorEl = document.querySelector('.author, .byline, [rel="author"], .author-name, .article-author, .date, .time, time');
  if (authorEl) {
    byline = authorEl.innerText.trim();
  }

  // 4. Tìm kiếm nội dung bài viết chính (Article Candidate)
  var contentSelectors = [
    'article', '[role="article"]',
    '.fck_detail',
    '.detail-content',
    '.content-detail',
    '.article-content', '.post-content', '.entry-content',
    '.article-body', '.story-body', '.main-content', 'main'
  ];

  var candidate = null;
  for (var i = 0; i < contentSelectors.length; i++) {
    var el = document.querySelector(contentSelectors[i]);
    if (el && el.innerText.trim().length > 200) {
      candidate = el;
      break;
    }
  }

  if (!candidate) {
    var divs = document.querySelectorAll('div, section, main');
    var bestScore = 0;
    for (var j = 0; j < divs.length; j++) {
      var d = divs[j];
      var text = d.innerText || '';
      if (text.length < 200) continue;
      var className = (d.className || '') + ' ' + (d.id || '');
      if (/header|footer|nav|sidebar|comment|menu|social|related|recommend/i.test(className)) continue;

      var pCount = d.querySelectorAll('p').length;
      var score = pCount * 100 + text.length;
      if (score > bestScore) {
        bestScore = score;
        candidate = d;
      }
    }
  }

  if (!candidate) candidate = document.body;

  // 5. Bóc tách nội dung chính, loại bỏ toàn bộ quảng cáo, banner, video nhúng rác, khung bình luận
  var clone = candidate.cloneNode(true);
  var junkSelectors = [
    'script', 'style', 'iframe', 'form', 'button', 'input', 'nav', 'header', 'footer', 'aside',
    '.advertisement', '.ad-box', '.ads', '[class*="ad-"]', '[id*="ad-"]',
    '.social-share', '.share-box', '.comment', '.comments', '.box-comment',
    '.related-news', '.tin-lien-quan', '.banner', '.sticky-banner', '#mobileCatfish', '#catfish'
  ];
  clone.querySelectorAll(junkSelectors.join(', ')).forEach(function(j) { j.remove(); });

  var cleanHtml = '';
  var validElements = clone.querySelectorAll('p, h2, h3, h4, blockquote, figure, ul, ol');
  if (validElements.length > 0) {
    validElements.forEach(function(elem) {
      var txt = elem.innerText.trim();
      if (elem.tagName === 'P' && txt.length < 5 && !elem.querySelector('img')) return;
      cleanHtml += elem.outerHTML;
    });
  } else {
    cleanHtml = clone.innerHTML;
  }

  // 6. Tính thời gian đọc ước tính
  var wordCount = (cleanHtml.replace(/<[^>]+>/g, ' ').match(/\\S+/g) || []).length;
  var readTimeMinutes = Math.max(1, Math.round(wordCount / 200));

  // 7. Inject style Reader Mode chuẩn typographic tối ưu pin OLED
  var readerCss = [
    'body { margin: 0 !important; padding: 0 !important; background: #000000 !important; -webkit-text-size-adjust: 100% !important; }',
    '#kite-reader-root { min-height: 100vh; padding: 24px 20px 80px 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Charter", Georgia, serif; line-height: 1.75; font-size: 18px; max-width: 680px; margin: 0 auto; box-sizing: border-box; }',
    '#kite-reader-root.theme-dark { background: #000000; color: #e4e4e7; }',
    '#kite-reader-root.theme-sepia { background: #fbf0d9; color: #5f4b32; }',
    '#kite-reader-root.theme-light { background: #ffffff; color: #18181b; }',
    '.kite-reader-topbar { display: flex; justify-content: space-between; align-items: center; padding-bottom: 20px; margin-bottom: 24px; border-bottom: 1px solid rgba(150, 150, 150, 0.2); }',
    '.kite-reader-exit-btn { background: rgba(120, 120, 128, 0.2); border: none; padding: 8px 14px; border-radius: 18px; font-size: 13px; font-weight: 600; color: inherit; cursor: pointer; }',
    '.kite-reader-tools { display: flex; gap: 8px; align-items: center; }',
    '.kite-reader-tool-btn { background: rgba(120, 120, 128, 0.2); border: none; width: 34px; height: 34px; border-radius: 17px; font-size: 14px; font-weight: 700; color: inherit; display: flex; align-items: center; justify-content: center; cursor: pointer; }',
    '.kite-reader-theme-dot { width: 22px; height: 22px; border-radius: 11px; border: 1.5px solid rgba(150, 150, 150, 0.4); cursor: pointer; }',
    '.kite-reader-h1 { font-size: 26px; font-weight: 800; line-height: 1.35; margin: 0 0 14px 0; letter-spacing: -0.3px; }',
    '.kite-reader-meta { font-size: 13px; opacity: 0.65; margin-bottom: 28px; line-height: 1.4; }',
    '.kite-reader-content p { margin: 0 0 20px 0; text-align: justify; }',
    '.kite-reader-content h2, .kite-reader-content h3 { font-size: 20px; font-weight: 700; margin: 28px 0 14px 0; }',
    '.kite-reader-content blockquote { border-left: 3.5px solid #007aff; margin: 20px 0; padding: 6px 0 6px 16px; font-style: italic; opacity: 0.85; }',
    '.kite-reader-content img { max-width: 100% !important; height: auto !important; border-radius: 10px; margin: 16px 0; display: block; }',
    '.kite-reader-content figure { margin: 16px 0; }',
    '.kite-reader-content figcaption { font-size: 12px; opacity: 0.7; text-align: center; margin-top: 6px; }'
  ].join('\\n');

  var styleEl = document.getElementById('__kite_reader_styles');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = '__kite_reader_styles';
    (document.head || document.documentElement).appendChild(styleEl);
  }
  styleEl.textContent = readerCss;

  // 8. Dựng template Reader Mode
  var domain = window.location.hostname.replace(/^www\\./, '');
  var template = [
    '<div id="kite-reader-root" class="theme-dark">',
      '<div class="kite-reader-topbar">',
        '<button class="kite-reader-exit-btn" id="__kite_exit_btn">✕ Đóng chế độ đọc</button>',
        '<div class="kite-reader-tools">',
          '<button class="kite-reader-tool-btn" id="__kite_font_dec">A-</button>',
          '<button class="kite-reader-tool-btn" id="__kite_font_inc">A+</button>',
          '<div class="kite-reader-theme-dot" style="background:#000000;" id="__kite_theme_dark" title="Tối (OLED)"></div>',
          '<div class="kite-reader-theme-dot" style="background:#fbf0d9;" id="__kite_theme_sepia" title="Vàng dịu"></div>',
          '<div class="kite-reader-theme-dot" style="background:#ffffff;" id="__kite_theme_light" title="Sáng"></div>',
        '</div>',
      '</div>',
      '<header>',
        '<h1 class="kite-reader-h1">' + title + '</h1>',
        '<div class="kite-reader-meta">' + (byline ? byline + ' • ' : '') + domain + ' • Khoảng ' + readTimeMinutes + ' phút đọc (' + wordCount + ' từ)</div>',
      '</header>',
      '<article class="kite-reader-content">',
        cleanHtml,
      '</article>',
    '</div>'
  ].join('');

  document.body.innerHTML = template;
  window.__kite_reader_active = true;
  window.scrollTo(0, 0);

  // Gán sự kiện điều khiển
  document.getElementById('__kite_exit_btn').onclick = function() {
    document.body.innerHTML = window.__kite_original_body;
    window.__kite_reader_active = false;
    if (styleEl) styleEl.remove();
    if (window.__kite_original_scroll) window.scrollTo(0, window.__kite_original_scroll);
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'READER_MODE_STATE', active: false }));
    } catch(e) {}
  };

  var curFontSize = 18;
  var rootEl = document.getElementById('kite-reader-root');
  document.getElementById('__kite_font_dec').onclick = function() {
    curFontSize = Math.max(14, curFontSize - 2);
    rootEl.style.fontSize = curFontSize + 'px';
  };
  document.getElementById('__kite_font_inc').onclick = function() {
    curFontSize = Math.min(26, curFontSize + 2);
    rootEl.style.fontSize = curFontSize + 'px';
  };

  document.getElementById('__kite_theme_dark').onclick = function() {
    rootEl.className = 'theme-dark';
    document.body.style.background = '#000000';
  };
  document.getElementById('__kite_theme_sepia').onclick = function() {
    rootEl.className = 'theme-sepia';
    document.body.style.background = '#fbf0d9';
  };
  document.getElementById('__kite_theme_light').onclick = function() {
    rootEl.className = 'theme-light';
    document.body.style.background = '#ffffff';
  };

  try {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'READER_MODE_STATE',
      active: true,
      title: title
    }));
  } catch(e) {}
})();
true;
`;

export const EXIT_READER_MODE_SCRIPT = `
(function() {
  if (window.__kite_reader_active && window.__kite_original_body) {
    document.body.innerHTML = window.__kite_original_body;
    window.__kite_reader_active = false;
    var style = document.getElementById('__kite_reader_styles');
    if (style) style.remove();
    if (window.__kite_original_scroll) window.scrollTo(0, window.__kite_original_scroll);
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'READER_MODE_STATE', active: false }));
    } catch(e) {}
  }
})();
true;
`;
