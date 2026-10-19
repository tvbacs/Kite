// Danh sách các mạng quảng cáo pop-under, lừa đảo và tracker phổ biến (so khớp theo hostname/suffix)
export const BLOCKED_DOMAINS = [
  'adsterra.com',
  'propellerads.com',
  'popads.net',
  'popcash.net',
  'exoclick.com',
  'trafficjunky.com',
  'onclickalgo.com',
  'syndication.exoclick.com',
  'yllix.com',
  'hilltopads.net',
  'monetag.com',
  'clickadu.com',
  'realsrv.com',
  'ad-maven.com',
  'bidvertiser.com',
  'infolinks.com',
  'mgid.com',
  'taboola.com',
  'outbrain.com',
  'zeroredirect',
  'mcloud2.to',
  'faststream',
  'adcash.com',
  'trafficfactory.biz',
  'richaudience.com',
  'adtima.vn',
  'adpia.vn',
  'adflex.vn',
  'adflycode.com',
  'bidgear-syndication.com',
  'blueseeddigital.com',
  'feedmob.com',
  'mobisummer.com',
  'appier.net',
  'doublepimp.com',
  'adtrue.com',
  'clksite.com',
  'trvdp.com',
  'playhydrax.com',
  'cleverpush',
  'pushbullet',
  'notix.io',
  'clicksor',
  'juicyads',
  'ero-advertising',
  'llvpn.com',
  'acscdn.com',
  'telegram.im',
  'alwingulla.com',
  'deloplen.com',
  'highrevenuenetwork.com',
  'whomeeno.net',
  'effectivecpmgate.com',
  'onclickperformance.com',
  'poawooptuging.com',
  'woofg.com',
  'oardurso.com',
  'thudoupt.net',
  'soawaupg.net',
  'whougrou.net',
  'wougheex.net',
  'poulsoar.net',
  'bougthoo.com',
  'tighoast.com',
  'shorte.st',
  'linkvertise.com',
  'droplink.co',
  'shrinkme.io',
  'tinylink.net',
  'direct-link.net',
  'adshort.co',
  'ouo.io',
  'exe.io',
  'adshrink.it',
  'cuty.io',
  'fc.lc',
  'clictune.com',
  'trafficstars.com',
  'admaven.com',
  'evadav.com',
  'pushground.com',
  'richpush.co',
  'rollerads.com',
  'activepush.net',
  'propeller-tracking.com',
  'monetag-cdn.com',
  'mngbtt.com',
  'ptads.net',
  'delivery.trafficjunky.net',
];

// Danh sách từ khóa nhà cái cá cược cụ thể (so khớp theo domain label, không dùng chuỗi con chung chung)
export const BLOCKED_GAMBLING_KEYWORDS = [
  'hi88',
  'jun88',
  'new88',
  '789bet',
  'okvip',
  'mb66',
  'shbet',
  'f8bet',
  'kubet',
  'thabet',
  'sunwin',
  'go88',
  'b52',
  'rikvip',
  'hitclub',
  'sv88',
  'bet88',
  'v9bet',
  'm88',
  '188bet',
  'fb88',
  'k8',
  'ole777',
  'dola88',
  'loto188',
  'sin88',
  'red88',
  'five88',
  'debet',
  'may88',
  'oxbet',
  'zbet',
  'mu9',
  'lucky88',
  'dafabet',
  '11bet',
  'sky88',
  'fa88',
  'ku789',
  'ku999',
  'ku11',
  '1xbet',
  'bet365',
  '20bet',
  'bk8',
  'w88',
  'fun88',
  'vavada',
];

// Danh sách các trang thương mại điện tử / tiếp thị liên kết (chỉ chặn khi trang web tự ý cướp tab chuyển hướng)
export const COMMERCE_REDIRECT_DOMAINS = [
  'shopee.vn',
  'lazada.vn',
  'tiki.vn',
  'accesstrade.vn',
  'shorten.asia',
];

// Danh sách các schema liên kết ngoài lén lút mở App Store hoặc Telegram
export const BLOCKED_SCHEMES = [
  'itms-services://',
  'itms-apps://',
  'market://',
  'intent://',
  'tg://resolve',
  'tg://',
  'viber://',
];

// CSS Selector chuyên biệt cho các vị trí quảng cáo chính xác (không dùng selector chung gây ẩn nhầm UI)
export const AD_SELECTORS = [
  // Khối quảng cáo chuẩn Google & banner chính thức
  'ins.adsbygoogle',
  '.adsbygoogle',
  '[data-ad-client]',
  '[data-ad-slot]',
  '.google-auto-placed',
  '.ad-banner-slot',
  '.popunder-container',
  '#ad-popup-wrapper',
  '.floating-ad-banner',

  // Iframe quảng cáo từ các mạng popunder
  'iframe[src*="doubleclick.net"]',
  'iframe[src*="googlesyndication.com"]',
  'iframe[src*="adsterra"]',
  'iframe[src*="exoclick"]',
  'iframe[src*="popads"]',
  'iframe[src*="popcash"]',
  'iframe[src*="monetag"]',
  'iframe[src*="hilltopads"]',
  'iframe[src*="clickadu"]',
  'iframe[src*="trafficjunky"]',
  'iframe[src*="realsrv"]',
  'iframe[src*="adpia"]',
  'iframe[src*="adtima"]',

  // Bộ chọn cụ thể cho các lớp phủ quảng cáo & catfish trên web phim
  '#_AM_POPUP_FRAME',
  '#ads-preload',
  '#mobileCatfish',
  '#catfish',
  '#catfish-ad',
  '.mobile-catfish-top',
  '.mobile-catfixx',
  '.pc-catfixx',
  '.aanetwork-ads-box',
  '.float-ck',
  '.under_player',
  '.underplayer_btn',
  '#transparentLayer',
  '.playover',
  '.video-ad-layer',
  '.popunder-link',
  '#footer_fixed_ads',
  '#_preload-ads-1',
  '#invideo_wrapper',
  '#avs-banner-overlay',
  '#avs-pause-ad',
  '#mobile-ads',
  '.samBannerUnit',
  '.tpm-unit',
  '[class^="adHTML"]',
  '[id^="bn_bottom_fixed_"]',
  '.quangcao',
  '.banner-ads',
  '#box-ads',
  '#ads-player',
  '#ad-overlay',
  '.ad-overlay',
  '.qc-container',
  '.qc-banner',
  '#qc-floating',
  '.ad_wrapper',
  '.player-ads',
  '#player-ads',

  // Bộ chọn triệt tiêu quảng cáo trên DonghuaWorld và các trang anime/donghua
  '.dhw-ad-notice',
  '[class*="dhw-ad"]',
  '.telegramim_button',
  '.telegramim_shadow',
  '.telegramim_pulse',
  '[id*="aclib"]',
  '[class*="aclib"]',
  '.inpage-ad',
  '.inpage_ad_container',
  '.mobile-catfish',
  '.catfish-ad-banner',
  '.floating-close-ad',
];

/**
 * Danh sách và mẫu nhận diện toàn diện các dịch vụ xác thực, đăng nhập và thanh toán chính thức
 * Tuyệt đối không bao giờ chặn, không xóa tham số và không ngắt quãng luồng đăng nhập của người dùng.
 */
export function isLegitimateAuthUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const lower = urlStr.toLowerCase();

  // 1. Google OAuth & Identity Services
  if (
    lower.includes('accounts.google.') ||
    lower.includes('myaccount.google.') ||
    lower.includes('oauth2.googleapis.com') ||
    lower.includes('identity.google.com') ||
    lower.includes('apis.google.com/js') ||
    lower.includes('ssl.gstatic.com/accounts')
  ) {
    return true;
  }

  // 2. Apple Sign In & ID
  if (lower.includes('appleid.apple.com') || lower.includes('idmsa.apple.com')) {
    return true;
  }

  // 3. Facebook / Meta Auth
  if (
    (lower.includes('facebook.com') || lower.includes('m.facebook.com')) &&
    (lower.includes('/oauth') || lower.includes('/dialog/oauth') || lower.includes('/login') || (lower.includes('/v') && lower.includes('/dialog')))
  ) {
    return true;
  }

  // 4. Microsoft / Azure / Live Login
  if (
    lower.includes('login.microsoftonline.com') ||
    lower.includes('login.live.com') ||
    lower.includes('account.live.com') ||
    lower.includes('msft.sts.microsoft.com')
  ) {
    return true;
  }

  // 5. GitHub / Twitter / Discord / LinkedIn Auth
  if (
    lower.includes('github.com/login') ||
    lower.includes('api.twitter.com/oauth') ||
    lower.includes('twitter.com/i/oauth2') ||
    lower.includes('discord.com/oauth2') ||
    lower.includes('discord.com/api/oauth2') ||
    lower.includes('linkedin.com/oauth')
  ) {
    return true;
  }

  // 6. Supabase, Firebase, Auth0, Okta, AWS Cognito
  if (
    lower.includes('supabase.co/auth') ||
    lower.includes('firebaseapp.com/__/auth') ||
    lower.includes('.auth0.com') ||
    lower.includes('.okta.com') ||
    lower.includes('amazoncognito.com')
  ) {
    return true;
  }

  // 7. Zalo & Cổng thanh toán Việt Nam (ZaloPay, MoMo, VNPay, Napas)
  if (
    lower.includes('oauth.zaloapp.com') ||
    lower.includes('id.zalo.me') ||
    lower.includes('vnpay.vn') ||
    lower.includes('momo.vn') ||
    lower.includes('napas.com.vn')
  ) {
    return true;
  }

  // 8. Các endpoint đăng nhập / SSO chuẩn quốc tế
  if (
    lower.includes('/oauth2/v') ||
    lower.includes('/oauth/authorize') ||
    lower.includes('/oauth/callback') ||
    lower.includes('/auth/callback') ||
    lower.includes('/api/auth/callback') ||
    lower.includes('/saml/sso') ||
    lower.includes('/sso/saml')
  ) {
    return true;
  }

  return false;
}

/**
 * Kiểm tra xem một URL có phải là liên kết quảng cáo nhảy trang, cờ bạc, hoặc popunder khả nghi không
 */
export function isSuspiciousAdUrl(targetUrl: string, currentHost?: string): boolean {
  if (!targetUrl) return false;

  // TUYỆT ĐỐI KHÔNG CHẶN CÁC TRANG AUTH / ĐĂNG NHẬP / THANH TOÁN CHÍNH THỨC
  if (isLegitimateAuthUrl(targetUrl)) {
    return false;
  }

  const lower = targetUrl.toLowerCase();

  // Cho phép các scheme an toàn hoặc domain hiện tại
  if (lower.startsWith('about:') || lower.startsWith('data:') || lower.startsWith('javascript:')) {
    return false;
  }

  // Lấy hostname
  let host = '';
  try {
    const match = lower.match(/^https?:\/\/([^\/?#]+)/);
    host = match ? match[1] : '';
  } catch (e) {}
  if (!host) return false;

  // Nếu cùng host với trang đang xem -> không coi là quảng cáo cross-origin
  if (currentHost) {
    const cHost = currentHost.toLowerCase();
    if (host === cHost || host.endsWith('.' + cHost) || cHost.endsWith('.' + host)) {
      return false;
    }
  }

  // 1. Kiểm tra trong danh sách BLOCKED_DOMAINS
  for (let i = 0; i < BLOCKED_DOMAINS.length; i++) {
    const d = BLOCKED_DOMAINS[i];
    if (host === d || host.endsWith('.' + d) || host.includes('.' + d)) {
      return true;
    }
  }

  // 2. Kiểm tra từ khóa cá cược / cờ bạc
  for (let j = 0; j < BLOCKED_GAMBLING_KEYWORDS.length; j++) {
    const kw = BLOCKED_GAMBLING_KEYWORDS[j];
    if (host.includes(kw)) {
      return true;
    }
  }

  // 3. Kiểm tra các TLD chuyên dùng cho link rác/quảng cáo nhảy trang
  const adTlds = ['.top', '.bid', '.click', '.buzz', '.cfd', '.rest', '.stream', '.live', '.xyz', '.link'];
  const hasAdTld = adTlds.some((tld) => host.endsWith(tld));
  if (hasAdTld) {
    if (
      lower.includes('token=') ||
      lower.includes('zoneid=') ||
      lower.includes('ad_id=') ||
      lower.includes('cpm=') ||
      lower.includes('traffic=') ||
      lower.includes('click') ||
      lower.includes('pop') ||
      lower.includes('redirect')
    ) {
      return true;
    }
  }

  // 4. Các đường dẫn nhảy trang popunder đặc trưng
  if (
    lower.includes('/click') ||
    lower.includes('/redirect') ||
    lower.includes('/jump') ||
    lower.includes('popunder') ||
    lower.includes('direct-link') ||
    lower.includes('landing_page')
  ) {
    if (lower.includes('affiliate') || lower.includes('traffic') || lower.includes('ad_') || lower.includes('zoneid')) {
      return true;
    }
  }

  return false;
}

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_eid',
  'ttclid',
  'yclid',
  '_ga',
  '_gl',
]);

/**
 * Xóa các tham số theo dõi (UTM, Facebook/Google Click ID...) giúp URL sạch sẽ và bảo vệ quyền riêng tư
 */
export function stripTrackingParameters(url: string): string {
  if (!url || !url.includes('?')) return url;
  // TUYỆT ĐỐI KHÔNG XÓA THAM SỐ CỦA TRANG AUTH / OAUTH / SSO (tránh hỏng state, code, redirect_uri)
  if (isLegitimateAuthUrl(url)) return url;
  try {
    const [base, queryString] = url.split('?');
    if (!queryString) return url;
    const [query, hash] = queryString.split('#');
    const params = query.split('&');
    const filtered = params.filter((p) => {
      const key = p.split('=')[0].toLowerCase();
      return !TRACKING_PARAMS.has(key);
    });
    const newQuery = filtered.join('&');
    return newQuery ? `${base}?${newQuery}${hash ? '#' + hash : ''}` : `${base}${hash ? '#' + hash : ''}`;
  } catch {
    return url;
  }
}
