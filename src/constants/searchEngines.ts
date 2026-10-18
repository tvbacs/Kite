import { SearchEngine } from '../types/browser';

export const SEARCH_ENGINES: Record<string, SearchEngine> = {
  google: {
    id: 'google',
    name: 'Google',
    searchUrl: 'https://www.google.com/search?q=',
    logoUrl: 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_160x56dp.png',
    logoWidth: 160,
    logoHeight: 56,
  },
  duckduckgo: {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    searchUrl: 'https://duckduckgo.com/?q=',
    logoUrl: 'https://duckduckgo.com/assets/icons/meta/DDG-icon_256x256.png',
    logoWidth: 70,
    logoHeight: 70,
  },
  bing: {
    id: 'bing',
    name: 'Bing',
    searchUrl: 'https://www.bing.com/search?q=',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Bing_logo_%282016%29.svg/320px-Bing_logo_%282016%29.svg.png',
    logoWidth: 120,
    logoHeight: 46,
  },
  yahoo: {
    id: 'yahoo',
    name: 'Yahoo',
    searchUrl: 'https://search.yahoo.com/search?p=',
    logoUrl: 'https://s.yimg.com/rz/p/yahoo_frontpage_en-US_s_f_p_205x58_frontpage_2x.png',
    logoWidth: 130,
    logoHeight: 40,
  },
};

// Trích xuất từ khóa tìm kiếm từ URL các công cụ tìm kiếm phổ biến (Google, Yahoo, Bing, DuckDuckGo)
export const extractSearchQuery = (url: string): string | null => {
  if (!url || (!url.includes('google.') && !url.includes('yahoo.') && !url.includes('bing.') && !url.includes('duckduckgo.'))) {
    return null;
  }
  const match = url.match(/[?&](?:q|p)=([^&#]+)/i);
  if (match && match[1]) {
    try {
      return decodeURIComponent(match[1].replace(/\+/g, ' '));
    } catch {
      return match[1].replace(/\+/g, ' ');
    }
  }
  return null;
};

export const STORAGE_SEARCH_QUERIES_KEY = '@kite_user_search_history';

/**
 * Kiểm tra xem URL hoặc Tiêu đề có phải là trang rác, trang chuyển hướng (redirect),
 * OAuth handshake, hoặc trang nội bộ không được lưu vào lịch sử.
 */
export const isJunkHistoryItem = (url?: string | null, title?: string | null): boolean => {
  if (!url) return true;
  const cleanUrl = url.trim().toLowerCase();

  // Các giao thức đặc biệt hoặc trang rỗng
  if (
    cleanUrl === '' ||
    cleanUrl === 'about:blank' ||
    cleanUrl.startsWith('about:') ||
    cleanUrl.startsWith('data:') ||
    cleanUrl.startsWith('blob:') ||
    cleanUrl.startsWith('javascript:') ||
    cleanUrl.startsWith('chrome:') ||
    cleanUrl.startsWith('kite:')
  ) {
    return true;
  }

  // Các endpoint chuyển hướng, đăng nhập trung gian, xác thực OAuth
  const junkUrlPatterns = [
    '/setsid',
    '/servicelogin',
    '/checkcookie',
    '/stalehomeaddress',
    '/speedbump',
    '/interstitial',
    '/accounts/signin/v2/challenge',
    'accounts.youtube.com/accounts/',
    'google.com/r/',
    'antigravity.google.com/r/',
    '/auth/v1/',
    '/oauth2/',
    '/saml/',
  ];
  if (junkUrlPatterns.some((pattern) => cleanUrl.includes(pattern))) {
    return true;
  }

  // Kiểm tra tiêu đề báo hiệu đang chuyển hướng hoặc trang hệ thống rác
  if (title) {
    const cleanTitle = title.trim().toLowerCase();
    const junkTitleKeywords = [
      'đang chuyển hướng',
      'chuyển hướng',
      'redirecting',
      'đặt địa chỉ nhà riêng',
      'stalehomeaddress',
      'setsid',
      'servicelogin',
      'please wait',
      'just a moment',
      'vui lòng chờ',
      'loading...',
    ];
    if (junkTitleKeywords.some((keyword) => cleanTitle.includes(keyword))) {
      return true;
    }
  }

  return false;
};

