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

  // 0a. Vô hiệu hóa Passkey / WebAuthn trên accounts.google.com
  // Trên iOS WKWebView, Apple chặn WebAuthn truy cập iCloud Keychain trực tiếp.
  // Google tự động suy đoán cần kết nối Bluetooth với thiết bị phụ và báo lỗi "Đảm bảo rằng bạn đã bật Bluetooth và các thiết bị ở gần nhau".
  // Khi tắt PublicKeyCredential trên accounts.google.com, Google nhận diện WebView không hỗ trợ Passkey và tự động chuyển thẳng sang màn hình Nhập Mật Khẩu và 2FA chuẩn!
  try {
    var _curHost = (window.location.hostname || '').toLowerCase();
    if (_curHost.indexOf('accounts.google.com') !== -1) {
      try { delete window.PublicKeyCredential; } catch(eD) {}
      try {
        Object.defineProperty(window, 'PublicKeyCredential', {
          get: function() { return undefined; },
          set: function() {},
          configurable: false
        });
      } catch(eP) {
        window.PublicKeyCredential = undefined;
      }
      if (navigator.credentials) {
        navigator.credentials.get = function() {
          return Promise.reject(new DOMException('Passkeys are not supported in webview', 'NotSupportedError'));
        };
        navigator.credentials.create = function() {
          return Promise.reject(new DOMException('Passkeys are not supported in webview', 'NotSupportedError'));
        };
      }
    }
  } catch(eGoogle) {}

  // 0b. Kiểm tra phần tử UI hợp lệ (menu 3 gạch, hộp thoại hỏi cookie, dialog, modal, nút bấm...)
  // Tuyệt đối KHÔNG chặn hoặc phá vỡ các tính năng chính thức của trang web
  function isLegitimateUIElement(el) {
    if (!el || el === document.body || el === document.documentElement) return true;
    try {
      var cur = el;
      for (var depth = 0; depth < 6 && cur && cur !== document.body && cur !== document.documentElement; depth++) {
        var tag = (cur.tagName || '').toLowerCase();
        var id = (cur.id || '').toLowerCase();
        var cls = (cur.className && typeof cur.className === 'string' ? cur.className : '').toLowerCase();
        var role = (cur.getAttribute('role') || '').toLowerCase();
        var aria = (cur.getAttribute('aria-label') || '').toLowerCase();

        // Bỏ qua nếu có nhãn quảng cáo rõ ràng
        if (id.includes('ad-') || id.includes('qc-') || id.includes('aclib') || id === 'transparentlayer' ||
            cls.includes('ad-') || cls.includes('quangcao') || cls.includes('catfish') || cls.includes('playover') ||
            cls.includes('video-ad') || cls.includes('popunder') || cls.includes('float-ck') || cls.includes('aanetwork')) {
          return false;
        }

        // Thẻ điều khiển nhập liệu hoặc tương tác chuẩn
        if (tag === 'button' || tag === 'input' || tag === 'textarea' || tag === 'select' || 
            tag === 'option' || tag === 'label' || tag === 'form' || tag === 'nav' || 
            tag === 'header' || tag === 'footer' || tag === 'summary' || tag === 'details' ||
            tag === 'svg' || tag === 'path' || tag === 'i' || tag === 'a') {
          return true;
        }

        // Thanh điều hướng, menu 3 gạch (hamburger), drawer, sidebar, dropdown
        if (tag === 'nav' || role === 'navigation' || role === 'menubar' || role === 'menu' || role === 'menuitem' ||
            cls.includes('menu') || id.includes('menu') ||
            cls.includes('nav') || id.includes('nav') ||
            cls.includes('drawer') || id.includes('drawer') ||
            cls.includes('sidebar') || id.includes('sidebar') ||
            cls.includes('offcanvas') || id.includes('offcanvas') ||
            cls.includes('hamburger') || id.includes('hamburger') ||
            cls.includes('dropdown') || id.includes('dropdown') ||
            cls.includes('collapse') || cls.includes('accordion') ||
            aria.includes('menu') || aria.includes('điều hướng') || aria.includes('navigation')) {
          return true;
        }

        // Hộp thoại Cookie, Consent, GDPR, Privacy
        if (cls.includes('cookie') || id.includes('cookie') ||
            cls.includes('consent') || id.includes('consent') ||
            cls.includes('gdpr') || id.includes('gdpr') ||
            cls.includes('onetrust') || id.includes('onetrust') ||
            cls.includes('cookiebot') || id.includes('cookiebot') ||
            cls.includes('klaro') || cls.includes('cc-') || id.includes('cc-') ||
            cls.includes('privacy') || id.includes('privacy') ||
            cls.includes('banner') || id.includes('banner') ||
            cls.includes('notice') || id.includes('notice')) {
          return true;
        }

        // Hộp thoại Modal, Dialog, Sheet, Popover, Lightbox hợp lệ
        if (tag === 'dialog' || role === 'dialog' || role === 'alertdialog' || role === 'tooltip' ||
            cls.includes('modal') || id.includes('modal') ||
            cls.includes('sheet') || id.includes('sheet') ||
            cls.includes('dialog') || id.includes('dialog') ||
            cls.includes('swal') || cls.includes('sweetalert') ||
            cls.includes('fancybox') || cls.includes('lightbox') ||
            cls.includes('popover') || cls.includes('tooltip')) {
          return true;
        }

        cur = cur.parentElement;
      }
    } catch(e) {}
    return false;
  }
  window.__kite_is_legit_ui = isLegitimateUIElement;

  // 0c. Kiểm tra URL đích có phải là mạng quảng cáo hoặc nhà cái cá cược không
  var _adDomainMap = null;
  function getAdDomainMap() {
    if (!_adDomainMap) {
      _adDomainMap = {};
      for (var i = 0; i < BLOCKED_DOMAINS.length; i++) {
        _adDomainMap[BLOCKED_DOMAINS[i]] = true;
      }
      for (var k = 0; k < COMMERCE_DOMAINS.length; k++) {
        _adDomainMap[COMMERCE_DOMAINS[k]] = true;
      }
    }
    return _adDomainMap;
  }

  function isLegitimateAuth(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return false;
    var l = urlStr.toLowerCase();
    if (l.indexOf('accounts.google.') !== -1 || l.indexOf('myaccount.google.') !== -1 ||
        l.indexOf('oauth2.googleapis.com') !== -1 || l.indexOf('identity.google.com') !== -1 ||
        l.indexOf('appleid.apple.com') !== -1 || l.indexOf('facebook.com/dialog') !== -1 ||
        l.indexOf('facebook.com/login') !== -1 || l.indexOf('facebook.com/oauth') !== -1 ||
        l.indexOf('login.microsoftonline.com') !== -1 || l.indexOf('login.live.com') !== -1 ||
        l.indexOf('github.com/login') !== -1 || l.indexOf('twitter.com/oauth') !== -1 ||
        l.indexOf('supabase.co/auth') !== -1 || l.indexOf('.auth0.com') !== -1 ||
        l.indexOf('oauth.zaloapp.com') !== -1 || l.indexOf('id.zalo.me') !== -1 ||
        l.indexOf('vnpay.vn') !== -1 || l.indexOf('momo.vn') !== -1 ||
        l.indexOf('/oauth2/') !== -1 || l.indexOf('/oauth/') !== -1 ||
        l.indexOf('/auth/callback') !== -1 || l.indexOf('/login') !== -1 ||
        l.indexOf('/signin') !== -1) {
      return true;
    }
    return false;
  }

  function isKnownAdOrGambling(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return false;
    if (isLegitimateAuth(urlStr)) return false;
    try {
      var u = new URL(urlStr, window.location.href);
      var h = u.hostname.toLowerCase();
      var currentHost = window.location.hostname.toLowerCase();

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

      var map = getAdDomainMap();
      if (map[h]) return true;
      var dotIdx = h.indexOf('.');
      if (dotIdx !== -1 && map[h.slice(dotIdx + 1)]) return true;
      for (var b = 0; b < BLOCKED_DOMAINS.length; b++) {
        var bd = BLOCKED_DOMAINS[b];
        if (h === bd || h.endsWith('.' + bd) || h.includes(bd)) return true;
      }

      for (var j = 0; j < BLOCKED_GAMBLING_KEYWORDS.length; j++) {
        var g = BLOCKED_GAMBLING_KEYWORDS[j];
        if (h.includes(g)) return true;
      }
    } catch(e) {}
    return false;
  }

  // 1. Tiêm bộ CSS chặn quảng cáo gom nhóm an toàn, không gián đoạn luồng streaming HTML của WebKit
  function injectAdStyle() {
    try {
      if (document.getElementById('kite-shield-ad-block-css')) return;
      var target = document.documentElement || document.head;
      if (!target) return;
      var styleEl = document.createElement('style');
      styleEl.type = 'text/css';
      styleEl.id = 'kite-shield-ad-block-css';
      styleEl.textContent = AD_SELECTORS.join(', ') + ' { display: none !important; opacity: 0 !important; pointer-events: none !important; visibility: hidden !important; height: 0 !important; width: 0 !important; max-height: 0 !important; overflow: hidden !important; }';
      target.appendChild(styleEl);
    } catch(e) {}
  }
  injectAdStyle();
  if (!document.getElementById('kite-shield-ad-block-css')) {
    document.addEventListener('DOMContentLoaded', injectAdStyle, { once: true });
  }

  // 1b. Tối ưu tốc độ tải trang: DNS prefetch và preconnect cho CDN
  function injectPrefetch() {
    try {
      if (!document.head) return;
      var prefetchHosts = ['//fonts.googleapis.com', '//fonts.gstatic.com', '//cdnjs.cloudflare.com'];
      prefetchHosts.forEach(function(h) {
        var l = document.createElement('link');
        l.rel = 'dns-prefetch';
        l.href = h;
        document.head.appendChild(l);
      });
    } catch(e) {}
  }
  // 1c. Theo dõi và quản lý AudioContext & RTCPeerConnection (livestream Stripchat/cams/WebRTC) để ngăn rò rỉ âm thanh tab nền
  try {
    window.__kite_audio_contexts = [];
    var OrigAudioCtx = window.AudioContext || window.webkitAudioContext;
    if (OrigAudioCtx) {
      var WrappedAudioCtx = function(options) {
        var ctx = options !== undefined ? new OrigAudioCtx(options) : new OrigAudioCtx();
        window.__kite_audio_contexts.push(ctx);
        if (window.__kite_tab_is_background && ctx.suspend) {
          try { ctx.suspend(); } catch(e) {}
        }
        return ctx;
      };
      WrappedAudioCtx.prototype = OrigAudioCtx.prototype;
      window.AudioContext = WrappedAudioCtx;
      if (window.webkitAudioContext) window.webkitAudioContext = WrappedAudioCtx;
    }
  } catch(e) {}

  try {
    window.__kite_peer_connections = [];
    var OrigPeerConn = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (OrigPeerConn) {
      var WrappedPeerConn = function(config) {
        var pc = config !== undefined ? new OrigPeerConn(config) : new OrigPeerConn();
        window.__kite_peer_connections.push(pc);
        return pc;
      };
      WrappedPeerConn.prototype = OrigPeerConn.prototype;
      window.RTCPeerConnection = WrappedPeerConn;
      if (window.webkitRTCPeerConnection) window.webkitRTCPeerConnection = WrappedPeerConn;
    }
  } catch(e) {}

  try {
    var origMediaPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function() {
      if (window.__kite_tab_is_background) {
        this.muted = true;
        this.volume = 0;
      }
      return origMediaPlay.apply(this, arguments);
    };
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
      get href() { return window.location.href; },
      set href(newUrl) {
        if (newUrl && (isLegitimateAuth(newUrl) || !isKnownAdOrGambling(newUrl))) {
          try { window.location.href = newUrl; } catch(e) {}
        }
      },
      replace: function(newUrl) {
        if (newUrl && (isLegitimateAuth(newUrl) || !isKnownAdOrGambling(newUrl))) {
          try { window.location.replace(newUrl); } catch(e) {}
        }
      },
      assign: function(newUrl) {
        if (newUrl && (isLegitimateAuth(newUrl) || !isKnownAdOrGambling(newUrl))) {
          try { window.location.assign(newUrl); } catch(e) {}
        }
      },
      reload: function(){ try { window.location.reload(); } catch(e) {} }
    }
  };

  var safeWindowOpen = function(url) {
    if (!url || typeof url !== 'string' || url === '' || url === 'about:blank') {
      return fakeWin;
    }
    // ƯU TIÊN TUYỆT ĐỐI CHO AUTH / ĐĂNG NHẬP / THANH TOÁN (Google, Apple, Facebook, Microsoft, Zalo...)
    if (isLegitimateAuth(url)) {
      try {
        window.location.href = url;
      } catch(e) {}
      return fakeWin;
    }
    // Chặn nếu URL dẫn tới mạng quảng cáo hoặc nhà cái cá cược
    if (isKnownAdOrGambling(url)) {
      window.__kite_blocked_popups = (window.__kite_blocked_popups || 0) + 1;
      return fakeWin;
    }
    // Đối với URL nội dung hợp lệ khác: Cho phép điều hướng trực tiếp trang hiện tại đến URL đích trong WebView di động
    try {
      window.location.href = url;
    } catch(e) {}
    return fakeWin;
  };

  try {
    Object.defineProperty(window, 'open', {
      get: function() { return safeWindowOpen; },
      set: function() {},
      configurable: false
    });
  } catch(e) {
    window.open = safeWindowOpen;
  }

  // 2b. Chặn thủ thuật tạo iframe ngầm để gọi iframe.contentWindow.open
  try {
    var _origAppendChild = Node.prototype.appendChild;
    Node.prototype.appendChild = function(el) {
      var res = _origAppendChild.apply(this, arguments);
      try {
        if (el && el.tagName === 'IFRAME' && el.contentWindow) {
          el.contentWindow.open = safeWindowOpen;
        }
      } catch(e2) {}
      return res;
    };
  } catch(e) {}

  // 2c. Chặn thủ thuật tạo thẻ <a target="_blank"> ngầm và gọi a.click() từ JS (chỉ chặn nếu trỏ đến mạng quảng cáo/cá cược)
  try {
    var _origAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      var href = this.href || this.getAttribute('href') || '';
      if (href && isKnownAdOrGambling(href)) {
        window.__kite_blocked_popups = (window.__kite_blocked_popups || 0) + 1;
        return;
      }
      return _origAnchorClick.apply(this, arguments);
    };
  } catch(e) {}

  // 2d. Chặn lớp phủ quảng cáo video cụ thể (như #transparentLayer trên web phim)
  // TUYỆT ĐỐI KHÔNG can thiệp vào các thành phần UI hợp lệ: thanh menu 3 gạch, hộp thoại hỏi cookie, modal, dropdown
  try {
    document.addEventListener('click', function(e) {
      var target = e.target;
      if (!target || target === document.body || target === document.documentElement) return;

      // Bảo vệ toàn diện các tính năng của website (menu, cookie, dialog...)
      if (isLegitimateUIElement(target)) return;

      // Chỉ can thiệp nếu là các bẫy lớp phủ quảng cáo cụ thể đã biết
      var isKnownTrap = target.matches && target.matches('#transparentLayer, .playover, .video-ad-layer, .popunder-link, .float-ck, .aanetwork-ads-box, .dhw-ad-notice, .ad-overlay, #ad-overlay');
      if (isKnownTrap) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        target.style.setProperty('display', 'none', 'important');
        target.style.setProperty('pointer-events', 'none', 'important');
        window.__kite_blocked_overlays = (window.__kite_blocked_overlays || 0) + 1;
        return false;
      }
    }, true);
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

  // 5. TẦNG MẠNG IN-PAGE (In-Page Network Interceptors):
  // Chặn trực tiếp các yêu cầu fetch, XMLHttpRequest, beacon và dynamic script tới mạng quảng cáo/tracker trước khi trình duyệt tải bytes về máy!
  try {
    var _origFetch = window.fetch;
    if (_origFetch) {
      window.fetch = function(resource, init) {
        var urlStr = '';
        if (typeof resource === 'string') {
          urlStr = resource;
        } else if (resource && resource.url) {
          urlStr = resource.url;
        }
        if (urlStr && isKnownAdOrGambling(urlStr)) {
          window.__kite_blocked_popups = (window.__kite_blocked_popups || 0) + 1;
          return Promise.resolve(new Response('', { status: 204, statusText: 'No Content' }));
        }
        return _origFetch.apply(this, arguments);
      };
    }
  } catch(e) {}

  try {
    var _origXHR = window.XMLHttpRequest;
    if (_origXHR && _origXHR.prototype) {
      var _origOpen = _origXHR.prototype.open;
      _origXHR.prototype.open = function(method, url) {
        this.__kite_is_ad = (typeof url === 'string' && isKnownAdOrGambling(url));
        if (this.__kite_is_ad) {
          window.__kite_blocked_popups = (window.__kite_blocked_popups || 0) + 1;
          return;
        }
        return _origOpen.apply(this, arguments);
      };
      var _origSend = _origXHR.prototype.send;
      _origXHR.prototype.send = function() {
        if (this.__kite_is_ad) {
          try {
            Object.defineProperty(this, 'status', { value: 204, writable: true });
            Object.defineProperty(this, 'readyState', { value: 4, writable: true });
            Object.defineProperty(this, 'responseText', { value: '', writable: true });
            if (typeof this.onreadystatechange === 'function') this.onreadystatechange();
            if (typeof this.onload === 'function') this.onload();
          } catch(eX) {}
          return;
        }
        return _origSend.apply(this, arguments);
      };
    }
  } catch(e) {}

  try {
    if (navigator.sendBeacon) {
      var _origBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function(url, data) {
        if (typeof url === 'string' && isKnownAdOrGambling(url)) {
          return true;
        }
        return _origBeacon(url, data);
      };
    }
  } catch(e) {}

  // Chặn nạp script động từ các domain độc hại / mạng quảng cáo popunder
  try {
    var scriptSrcDesc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
    if (scriptSrcDesc && scriptSrcDesc.set) {
      var _origScriptSet = scriptSrcDesc.set;
      Object.defineProperty(HTMLScriptElement.prototype, 'src', {
        set: function(val) {
          if (typeof val === 'string' && isKnownAdOrGambling(val)) {
            return _origScriptSet.call(this, 'data:text/javascript;base64,');
          }
          return _origScriptSet.call(this, val);
        },
        get: scriptSrcDesc.get,
        configurable: true
      });
    }
  } catch(e) {}

  // 6. STUBS CHỐNG ANTI-ADBLOCK: Giả lập các biến SDK quảng cáo để trang không báo lỗi hoặc chặn xem video
  try {
    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.push = function() { return 0; };
  } catch(e) {}

  // 7. TẦNG BẢO MẬT HỆ THỐNG: Bật Global Privacy Control (GPC) và Do Not Track
  try {
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: false, writable: false });
    Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: false, writable: false });
  } catch(e) {}
})();
true;
`;

/**
 * Script tối ưu hiển thị, bảo đảm CSS ẩn quảng cáo và nhận diện tài khoản Google an toàn
 */
export const INJECTED_AFTER_CONTENT = `
(function() {
  var _q = [], _t = null;
  function report(type, url) {
    _q.push({ type: type, url: url || '' });
    if (_t) return;
    _t = setTimeout(function() {
      var batch = _q; _q = []; _t = null;
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'SHIELD_BATCH',
            count: batch.length,
            items: batch.slice(0, 10)
          }));
        }
      } catch (e) {}
    }, 500);
  }

  var AD_SELECTORS = ${serializedSelectors};
  var BLOCKED_DOMAINS = ${serializedBlockedDomains};
  var BLOCKED_GAMBLING_KEYWORDS = ${serializedGamblingKeywords};
  var COMMERCE_DOMAINS = ${serializedCommerceDomains};
  var isLegitimateUIElement = window.__kite_is_legit_ui || function(el) {
    if (!el || el === document.body || el === document.documentElement) return true;
    try {
      var cur = el;
      for (var d = 0; d < 6 && cur && cur !== document.body && cur !== document.documentElement; d++) {
        var t = (cur.tagName || '').toLowerCase();
        var i = (cur.id || '').toLowerCase();
        var c = (cur.className && typeof cur.className === 'string' ? cur.className : '').toLowerCase();
        var r = (cur.getAttribute('role') || '').toLowerCase();
        var a = (cur.getAttribute('aria-label') || '').toLowerCase();

        if (i.includes('ad-') || i.includes('qc-') || i.includes('aclib') || i === 'transparentlayer' ||
            c.includes('ad-') || c.includes('quangcao') || c.includes('catfish') || c.includes('playover') ||
            c.includes('video-ad') || c.includes('popunder') || c.includes('float-ck') || c.includes('aanetwork')) {
          return false;
        }

        if (t === 'button' || t === 'input' || t === 'textarea' || t === 'select' || 
            t === 'option' || t === 'label' || t === 'form' || t === 'nav' || 
            t === 'header' || t === 'footer' || t === 'summary' || t === 'details' ||
            t === 'svg' || t === 'path' || t === 'i' || t === 'a') return true;

        if (t === 'nav' || r === 'navigation' || r === 'menubar' || r === 'menu' || r === 'menuitem' ||
            c.includes('menu') || i.includes('menu') ||
            c.includes('nav') || i.includes('nav') ||
            c.includes('drawer') || i.includes('drawer') ||
            c.includes('sidebar') || i.includes('sidebar') ||
            c.includes('offcanvas') || i.includes('offcanvas') ||
            c.includes('hamburger') || i.includes('hamburger') ||
            c.includes('dropdown') || i.includes('dropdown') ||
            c.includes('collapse') || c.includes('accordion') ||
            a.includes('menu') || a.includes('điều hướng') || a.includes('navigation')) return true;

        if (c.includes('cookie') || i.includes('cookie') ||
            c.includes('consent') || i.includes('consent') ||
            c.includes('gdpr') || i.includes('gdpr') ||
            c.includes('onetrust') || i.includes('onetrust') ||
            c.includes('cookiebot') || i.includes('cookiebot') ||
            c.includes('klaro') || c.includes('cc-') || i.includes('cc-') ||
            c.includes('privacy') || i.includes('privacy') ||
            c.includes('banner') || i.includes('banner') ||
            c.includes('notice') || i.includes('notice')) return true;

        if (t === 'dialog' || r === 'dialog' || r === 'alertdialog' || r === 'tooltip' ||
            c.includes('modal') || i.includes('modal') ||
            c.includes('sheet') || i.includes('sheet') ||
            c.includes('dialog') || i.includes('dialog') ||
            c.includes('swal') || c.includes('sweetalert') ||
            c.includes('fancybox') || c.includes('lightbox') ||
            c.includes('popover') || c.includes('tooltip')) return true;

        cur = cur.parentElement;
      }
    } catch(e) {}
    return false;
  };

  // 1. Đảm bảo CSS ẩn quảng cáo luôn hiện diện bằng textContent siêu tốc một lần duy nhất
  try {
    if (!document.getElementById('kite-shield-ad-block-css')) {
      var s = document.createElement('style');
      s.id = 'kite-shield-ad-block-css';
      s.type = 'text/css';
      s.textContent = AD_SELECTORS.join(', ') + ' { display: none !important; opacity: 0 !important; pointer-events: none !important; visibility: hidden !important; height: 0 !important; width: 0 !important; max-height: 0 !important; overflow: hidden !important; }';
      (document.head || document.documentElement).appendChild(s);
    }
  } catch(e) {}

  // Kiểm tra URL đích có phải là mạng quảng cáo hoặc nhà cái cá cược không
  var _adDomainMap = null;
  function getAdDomainMap() {
    if (!_adDomainMap) {
      _adDomainMap = {};
      for (var i = 0; i < BLOCKED_DOMAINS.length; i++) {
        _adDomainMap[BLOCKED_DOMAINS[i]] = true;
      }
      for (var k = 0; k < COMMERCE_DOMAINS.length; k++) {
        _adDomainMap[COMMERCE_DOMAINS[k]] = true;
      }
    }
    return _adDomainMap;
  }

  function isKnownAdOrGambling(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return false;
    try {
      var u = new URL(urlStr, window.location.href);
      var h = u.hostname.toLowerCase();
      var currentHost = window.location.hostname.toLowerCase();

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

      var map = getAdDomainMap();
      if (map[h]) return true;
      var dotIdx = h.indexOf('.');
      if (dotIdx !== -1 && map[h.slice(dotIdx + 1)]) return true;
      for (var b = 0; b < BLOCKED_DOMAINS.length; b++) {
        var bd = BLOCKED_DOMAINS[b];
        if (h === bd || h.endsWith('.' + bd) || h.includes(bd)) return true;
      }

      for (var j = 0; j < BLOCKED_GAMBLING_KEYWORDS.length; j++) {
        var g = BLOCKED_GAMBLING_KEYWORDS[j];
        if (h.includes(g)) return true;
      }
    } catch(e) {}
    return false;
  }

  // Chặn mã quảng cáo tự động tạo thẻ <a> ẩn rồi gọi a.click() cướp màn hình
  try {
    var _origAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      var href = this.href || this.getAttribute('href') || '';
      if (href) {
        if (isKnownAdOrGambling(href)) {
          window.__kite_blocked_redirects = (window.__kite_blocked_redirects || 0) + 1;
          report('BLOCKED_REDIRECT', href);
          return;
        }
      }
      return _origAnchorClick.apply(this, arguments);
    };
  } catch(e) {}

  // Chặn mã độc/quảng cáo tự ý đổi location (location.replace, location.assign) làm trắng màn hình
  try {
    var _origAssign = window.location.assign;
    window.location.assign = function(url) {
      if (isKnownAdOrGambling(url)) {
        window.__kite_blocked_redirects = (window.__kite_blocked_redirects || 0) + 1;
        report('BLOCKED_REDIRECT', url || '');
        return;
      }
      if (_origAssign) return _origAssign.apply(window.location, arguments);
    };

    var _origReplace = window.location.replace;
    window.location.replace = function(url) {
      if (isKnownAdOrGambling(url)) {
        window.__kite_blocked_redirects = (window.__kite_blocked_redirects || 0) + 1;
        report('BLOCKED_REDIRECT', url || '');
        return;
      }
      if (_origReplace) return _origReplace.apply(window.location, arguments);
    };
  } catch(e) {}

  // Bẻ gãy bẫy clickjacking / lớp phủ ma và chuyển tiếp click tức thì đến nút thật (Play, Quality...)
  document.addEventListener('click', function(e) {
    var target = e.target;
    if (!target || target === document.body || target === document.documentElement) return;

    // BẢO VỆ TUYỆT ĐỐI CÁC THÀNH PHẦN HỢP LỆ: menu 3 gạch, cookie, modal, form, nút bấm...
    if (typeof isLegitimateUIElement === 'function' && isLegitimateUIElement(target)) {
      return;
    }

    var anchor = target.closest ? target.closest('a') : null;

    if (anchor && anchor.href) {
      if (isKnownAdOrGambling(anchor.href)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        window.__kite_blocked_redirects = (window.__kite_blocked_redirects || 0) + 1;
        report('BLOCKED_REDIRECT', anchor.href);
        return false;
      }

      if (anchor.href.includes('accounts.google.com') || anchor.href.includes('myaccount.google.com')) {
        anchor.target = '_self';
      }
    }

    var isOverlayTrap = false;
    var trapElement = null;

    try {
      // Chỉ nhận diện các lớp phủ bẫy quảng cáo video cụ thể đã biết
      var isKnownAdClass = target.matches && target.matches('#transparentLayer, .playover, .video-ad-layer, .popunder-link, .float-ck, .aanetwork-ads-box, .dhw-ad-notice, .ad-overlay, #ad-overlay, .quangcao, .qc-container, .qc-banner, #qc-floating, [id*="aclib"], [class*="aclib"]');
      if (isKnownAdClass) {
        isOverlayTrap = true;
        trapElement = target;
      }
    } catch(err) {}

    if (isOverlayTrap && trapElement) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      window.__kite_blocked_redirects = (window.__kite_blocked_redirects || 0) + 1;

      trapElement.style.setProperty('display', 'none', 'important');
      trapElement.style.setProperty('pointer-events', 'none', 'important');
      trapElement.style.setProperty('visibility', 'hidden', 'important');
      trapElement.style.setProperty('opacity', '0', 'important');

      report('BLOCKED_REDIRECT', 'Lớp phủ quảng cáo');

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

  // 2. Dọn dẹp các lớp phủ rác khi trang tải xong hoàn tất (tuyệt đối không chạm vào menu/cookie)
  try {
    var zapSelectors = '#transparentLayer, .playover, .video-ad-layer, .popunder-link, .float-ck, .aanetwork-ads-box, .dhw-ad-notice, #mobileCatfish, #catfish, .ad-overlay, #ad-overlay, [class*="catfish"]';
    document.querySelectorAll(zapSelectors).forEach(function(el) {
      if (typeof isLegitimateUIElement === 'function' && isLegitimateUIElement(el)) return;
      if (!el.querySelector('video, form, nav, header, input, button')) {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
      }
    });
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

        // 2. Tren trang myaccount.google.com: Tim the email truc tiep
        if (isMyAccount && !userEmail) {
          try {
            var emEl = document.querySelector('[data-email], [aria-label*="@"]');
            if (emEl) {
              var emVal = emEl.getAttribute('data-email') || emEl.getAttribute('aria-label') || '';
              var mEm = emVal.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
              if (mEm) userEmail = mEm[0];
            }
          } catch(err) {}
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
                type: 'GOOGLE_USER_PROFILE',
                avatarUrl: userAvatar || '',
                name: userName,
                email: userEmail
              }));
            } catch(e) {}
          }
        }
      };

      setTimeout(findGoogleProfile, 1500);
    }
  } catch(e) {}

  // 3b. Đổi màu tím chuẩn (:visited #681da8) cho các trang đã vào trước đó trên kết quả tìm kiếm Google & các công cụ tìm kiếm
  try {
    var _host = (window.location.hostname || '').toLowerCase();
    var _isSearchEngine =
      (_host.includes('google.') && (window.location.pathname.includes('/search') || window.location.search.includes('q='))) ||
      (_host.includes('bing.com') && window.location.pathname.includes('/search')) ||
      (_host.includes('duckduckgo.com') && window.location.search.includes('q=')) ||
      (_host.includes('search.yahoo.com'));

    if (_isSearchEngine) {
      // 1. Tiêm CSS rule :visited
      var styleVisited = document.createElement('style');
      styleVisited.id = '__kite_visited_css';
      styleVisited.textContent = 'a:visited, a:visited h3, a:visited .DKV0Md, a:visited .LC20lb, a:visited [role="heading"], a:visited span, a:visited div { color: #681da8 !important; }';
      (document.head || document.documentElement).appendChild(styleVisited);

      // 2. Hàm tô màu các liên kết đã từng vào dựa trên Lịch sử thật của Kite Browser (chính xác 100% không phụ thuộc cache WebKit)
      window.__kiteHighlightVisitedUrls = function(visitedList) {
        if (!Array.isArray(visitedList) || visitedList.length === 0) return;
        var visitedSet = new Set();
        visitedList.forEach(function(u) {
          if (!u || typeof u !== 'string') return;
          try {
            var norm = u.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '').toLowerCase();
            visitedSet.add(norm);
            var base = norm.split('?')[0].replace(/\/+$/, '');
            if (base) visitedSet.add(base);
          } catch(e) {}
        });

        var applyHighlight = function() {
          var links = document.querySelectorAll('a[href]');
          links.forEach(function(a) {
            try {
              var href = a.href || a.getAttribute('href') || '';
              if (!href || href.startsWith('javascript:') || href.includes('google.com/search') || href.startsWith('#')) return;
              // Xử lý các link chuyển hướng của Google /url?q=... hoặc /url?url=...
              if (href.includes('/url?')) {
                var m = href.match(/[?&](?:url|q)=([^&]+)/);
                if (m) {
                  try { href = decodeURIComponent(m[1]); } catch(e) {}
                }
              }
              var norm = href.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '').toLowerCase();
              var base = norm.split('?')[0].replace(/\/+$/, '');

              if (visitedSet.has(norm) || visitedSet.has(base)) {
                a.style.setProperty('color', '#681da8', 'important');
                a.querySelectorAll('h3, [role="heading"], .DKV0Md, .LC20lb, .BNeawe, span').forEach(function(el) {
                  el.style.setProperty('color', '#681da8', 'important');
                });
              }
            } catch(e) {}
          });
        };

        applyHighlight();
        if (window.MutationObserver) {
          var obs = new MutationObserver(function() {
            applyHighlight();
          });
          obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
        }
      };

      // Yêu cầu app gửi danh sách lịch sử trình duyệt để tô màu
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_VISITED_URLS' }));
      }
      window.addEventListener('pageshow', function() {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'REQUEST_VISITED_URLS' }));
        }
      });
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
 * Tạm dừng và tắt âm thanh toàn bộ video, audio, iframe players, WebRTC livestream (Stripchat...) và WebAudio
 * khi tab chuyển sang chế độ nền (Background)
 */
export const PAUSE_BACKGROUND_MEDIA_SCRIPT = `
(function() {
  try {
    window.__kite_tab_is_background = true;

    function pauseAllInWindow(w) {
      if (!w) return;
      try {
        if (w.document) {
          var mediaEls = w.document.querySelectorAll('video, audio');
          for (var i = 0; i < mediaEls.length; i++) {
            var m = mediaEls[i];
            try {
              if (!m.__kite_saved_state) {
                m.__kite_saved_state = {
                  wasPlaying: !m.paused,
                  origMuted: m.muted,
                  origVolume: m.volume,
                };
              }
              m.muted = true;
              m.volume = 0;
              m.pause();
            } catch(e) {}
          }

          var iframes = w.document.querySelectorAll('iframe');
          for (var j = 0; j < iframes.length; j++) {
            try {
              if (iframes[j].contentWindow) {
                pauseAllInWindow(iframes[j].contentWindow);
              }
            } catch(e) {}
          }
        }
      } catch(e) {}

      try {
        if (w.__kite_audio_contexts && Array.isArray(w.__kite_audio_contexts)) {
          w.__kite_audio_contexts.forEach(function(ctx) {
            try {
              if (ctx && ctx.state === 'running' && ctx.suspend) {
                ctx.suspend();
              }
            } catch(e) {}
          });
        }
      } catch(e) {}

      try {
        if (w.__kite_peer_connections && Array.isArray(w.__kite_peer_connections)) {
          w.__kite_peer_connections.forEach(function(pc) {
            try {
              if (pc && pc.getReceivers) {
                pc.getReceivers().forEach(function(r) {
                  if (r.track && r.track.kind === 'audio') {
                    r.track.enabled = false;
                  }
                });
              }
            } catch(e) {}
          });
        }
      } catch(e) {}
    }

    pauseAllInWindow(window);
  } catch(e) {}
})();
true;
`;

/**
 * Phục hồi âm thanh và phát tiếp phương tiện khi tab được chọn hoạt động trở lại
 */
export const RESUME_ACTIVE_MEDIA_SCRIPT = `
(function() {
  try {
    window.__kite_tab_is_background = false;

    function resumeAllInWindow(w) {
      if (!w) return;
      try {
        if (w.document) {
          var mediaEls = w.document.querySelectorAll('video, audio');
          for (var i = 0; i < mediaEls.length; i++) {
            var m = mediaEls[i];
            try {
              if (m.__kite_saved_state) {
                m.muted = m.__kite_saved_state.origMuted;
                m.volume = m.__kite_saved_state.origVolume;
                if (m.__kite_saved_state.wasPlaying) {
                  m.play().catch(function() {});
                }
                delete m.__kite_saved_state;
              }
            } catch(e) {}
          }

          var iframes = w.document.querySelectorAll('iframe');
          for (var j = 0; j < iframes.length; j++) {
            try {
              if (iframes[j].contentWindow) {
                resumeAllInWindow(iframes[j].contentWindow);
              }
            } catch(e) {}
          }
        }
      } catch(e) {}

      try {
        if (w.__kite_audio_contexts && Array.isArray(w.__kite_audio_contexts)) {
          w.__kite_audio_contexts.forEach(function(ctx) {
            try {
              if (ctx && ctx.state === 'suspended' && ctx.resume) {
                ctx.resume();
              }
            } catch(e) {}
          });
        }
      } catch(e) {}

      try {
        if (w.__kite_peer_connections && Array.isArray(w.__kite_peer_connections)) {
          w.__kite_peer_connections.forEach(function(pc) {
            try {
              if (pc && pc.getReceivers) {
                pc.getReceivers().forEach(function(r) {
                  if (r.track && r.track.kind === 'audio') {
                    r.track.enabled = true;
                  }
                });
              }
            } catch(e) {}
          });
        }
      } catch(e) {}
    }

    resumeAllInWindow(window);
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

  // 6. Nhận diện Đăng nhập & Mật khẩu: Đã được chuyển giao và xử lý bảo mật toàn diện tại passwordScript.ts
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
      var fontStyle = document.getElementById('__kite_font_style');
      if (fontStyle) fontStyle.remove();
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

  // Xóa sạch các thuộc tính inline font-size, line-height, color, background gây xung đột font & dark theme
  clone.querySelectorAll('*').forEach(function(el) {
    try {
      el.style.removeProperty('font-size');
      el.style.removeProperty('line-height');
      el.style.removeProperty('font-family');
      el.style.removeProperty('color');
      el.style.removeProperty('background');
      el.style.removeProperty('background-color');
    } catch(e) {}
  });

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
    '.kite-reader-exit-btn { display: inline-flex; align-items: center; justify-content: center; background: rgba(120, 120, 128, 0.22); border: none; padding: 8px 16px; border-radius: 20px; font-size: 13.5px; font-weight: 600; color: inherit; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; transition: opacity 0.15s, transform 0.15s; }',
    '.kite-reader-exit-btn:active { opacity: 0.65; transform: scale(0.96); }',
    '.kite-reader-exit-x { font-size: 17px; font-weight: 700; line-height: 1; margin-right: 8px; display: inline-flex; align-items: center; justify-content: center; }',
    '.kite-reader-tools { display: flex; gap: 8px; align-items: center; }',
    '.kite-reader-tool-btn { background: rgba(120, 120, 128, 0.22); border: none; width: 38px; height: 38px; border-radius: 19px; font-size: 14.5px; font-weight: 700; color: inherit; display: flex; align-items: center; justify-content: center; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; transition: opacity 0.15s, transform 0.15s; }',
    '.kite-reader-tool-btn:active { opacity: 0.65; transform: scale(0.92); }',
    '.kite-reader-theme-dot { width: 24px; height: 24px; border-radius: 12px; border: 2px solid rgba(150, 150, 150, 0.4); cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; box-sizing: border-box; transition: transform 0.15s; }',
    '.kite-reader-theme-dot:active { transform: scale(0.88); }',
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
        '<button class="kite-reader-exit-btn" id="__kite_exit_btn" type="button"><span class="kite-reader-exit-x">✕</span><span>Đóng chế độ đọc</span></button>',
        '<div class="kite-reader-tools">',
          '<button class="kite-reader-tool-btn" id="__kite_font_dec" type="button">A-</button>',
          '<button class="kite-reader-tool-btn" id="__kite_font_inc" type="button">A+</button>',
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

  // Quản lý cỡ chữ bài báo (áp dụng động qua style tag để override style inline của các báo)
  var curFontSize = 18;
  var rootEl = document.getElementById('kite-reader-root');

  function applyFontSize(size) {
    curFontSize = Math.min(30, Math.max(14, size));
    rootEl.style.fontSize = curFontSize + 'px';
    var fontStyle = document.getElementById('__kite_font_style');
    if (!fontStyle) {
      fontStyle = document.createElement('style');
      fontStyle.id = '__kite_font_style';
      (document.head || document.documentElement).appendChild(fontStyle);
    }
    fontStyle.textContent = [
      '#kite-reader-root, .kite-reader-content, .kite-reader-content p, .kite-reader-content span, .kite-reader-content div, .kite-reader-content li, .kite-reader-content a, .kite-reader-content blockquote { font-size: ' + curFontSize + 'px !important; line-height: 1.75 !important; }',
      '.kite-reader-content h2 { font-size: ' + Math.round(curFontSize * 1.25) + 'px !important; line-height: 1.35 !important; }',
      '.kite-reader-content h3 { font-size: ' + Math.round(curFontSize * 1.15) + 'px !important; line-height: 1.35 !important; }',
      '.kite-reader-content h4 { font-size: ' + curFontSize + 'px !important; line-height: 1.35 !important; }'
    ].join(' ');
  }

  // Áp dụng cỡ chữ chuẩn tức thì
  applyFontSize(curFontSize);

  // Helper bắt sự kiện click/tap tức thì trên mobile (không trễ 300ms, không bị nuốt sự kiện)
  function bindPress(id, fn) {
    var el = document.getElementById(id);
    if (!el) return;
    var firedByTouch = false;
    el.addEventListener('touchend', function(e) {
      firedByTouch = true;
      e.preventDefault();
      e.stopPropagation();
      fn();
      setTimeout(function() { firedByTouch = false; }, 400);
    }, { passive: false });
    el.addEventListener('click', function(e) {
      if (firedByTouch) return;
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
  }

  // Gán sự kiện điều khiển
  bindPress('__kite_exit_btn', function() {
    document.body.innerHTML = window.__kite_original_body;
    window.__kite_reader_active = false;
    var s1 = document.getElementById('__kite_reader_styles');
    if (s1) s1.remove();
    var s2 = document.getElementById('__kite_font_style');
    if (s2) s2.remove();
    if (window.__kite_original_scroll) window.scrollTo(0, window.__kite_original_scroll);
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'READER_MODE_STATE', active: false }));
    } catch(e) {}
  });

  bindPress('__kite_font_dec', function() {
    applyFontSize(curFontSize - 2);
  });
  bindPress('__kite_font_inc', function() {
    applyFontSize(curFontSize + 2);
  });

  bindPress('__kite_theme_dark', function() {
    rootEl.className = 'theme-dark';
    document.body.style.background = '#000000';
  });
  bindPress('__kite_theme_sepia', function() {
    rootEl.className = 'theme-sepia';
    document.body.style.background = '#fbf0d9';
  });
  bindPress('__kite_theme_light', function() {
    rootEl.className = 'theme-light';
    document.body.style.background = '#ffffff';
  });

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
    var fontStyle = document.getElementById('__kite_font_style');
    if (fontStyle) fontStyle.remove();
    if (window.__kite_original_scroll) window.scrollTo(0, window.__kite_original_scroll);
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'READER_MODE_STATE', active: false }));
    } catch(e) {}
  }
})();
true;
`;
