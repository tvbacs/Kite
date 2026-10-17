import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_REGION_KEY = '@kite_region_settings';

export interface RegionNode {
  id: string;
  name: string;
  city: string;
  countryCode: string;
  flag: string;
  pingMs: number;
  lat: number;
  lon: number;
  timezone: string;
  locale: string;
}

export interface RegionSettings {
  enabled: boolean;
  activeRegionId: string;
  spoofGps: boolean;
  blockWebRtc: boolean;
  useProxyGateway: boolean;
  customProxyUrl?: string;
}

export const AVAILABLE_REGIONS: RegionNode[] = [
  {
    id: 'us',
    name: 'Hoa Kỳ',
    city: 'Los Angeles / New York',
    countryCode: 'US',
    flag: '🇺🇸',
    pingMs: 142,
    lat: 34.0522,
    lon: -118.2437,
    timezone: 'America/Los_Angeles',
    locale: 'en-US',
  },
  {
    id: 'sg',
    name: 'Singapore',
    city: 'Singapore Central',
    countryCode: 'SG',
    flag: '🇸🇬',
    pingMs: 38,
    lat: 1.3521,
    lon: 103.8198,
    timezone: 'Asia/Singapore',
    locale: 'en-SG',
  },
  {
    id: 'jp',
    name: 'Nhật Bản',
    city: 'Tokyo',
    countryCode: 'JP',
    flag: '🇯🇵',
    pingMs: 65,
    lat: 35.6762,
    lon: 139.6503,
    timezone: 'Asia/Tokyo',
    locale: 'ja-JP',
  },
  {
    id: 'vn',
    name: 'Mặc định',
    city: 'Mạng trực tiếp Việt Nam',
    countryCode: 'VN',
    flag: '🇻🇳',
    pingMs: 12,
    lat: 21.0285,
    lon: 105.8542,
    timezone: 'Asia/Ho_Chi_Minh',
    locale: 'vi-VN',
  },
  {
    id: 'de',
    name: 'Đức',
    city: 'Frankfurt am Main',
    countryCode: 'DE',
    flag: '🇩🇪',
    pingMs: 165,
    lat: 50.1109,
    lon: 8.6821,
    timezone: 'Europe/Berlin',
    locale: 'de-DE',
  },
  {
    id: 'uk',
    name: 'Vương quốc Anh',
    city: 'London',
    countryCode: 'GB',
    flag: '🇬🇧',
    pingMs: 158,
    lat: 51.5074,
    lon: -0.1278,
    timezone: 'Europe/London',
    locale: 'en-GB',
  },
];

export const DEFAULT_REGION_SETTINGS: RegionSettings = {
  enabled: false,
  activeRegionId: 'us',
  spoofGps: true,
  blockWebRtc: true,
  useProxyGateway: true,
  customProxyUrl: '',
};

/**
 * Tải cấu hình chuyển vùng đã lưu từ bộ nhớ máy
 */
export const loadRegionSettings = async (): Promise<RegionSettings> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_REGION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_REGION_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.warn('Lỗi khi tải cấu hình chuyển vùng:', e);
  }
  return DEFAULT_REGION_SETTINGS;
};

/**
 * Lưu cấu hình chuyển vùng vào bộ nhớ máy
 */
export const saveRegionSettings = async (settings: RegionSettings): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_REGION_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Lỗi khi lưu cấu hình chuyển vùng:', e);
  }
};

/**
 * Lấy thông tin chi tiết của Quốc gia hiện tại đang được chọn
 */
export const getActiveRegionNode = (regionId: string): RegionNode => {
  return AVAILABLE_REGIONS.find((r) => r.id === regionId) || AVAILABLE_REGIONS[0];
};

/**
 * Tạo mã JavaScript tiêm vào trang web trước khi tải (document_start):
 * 1. Chống rò rỉ IP thực qua WebRTC (WebRTC IP Leak Protection)
 * 2. Giả lập tọa độ GPS theo đúng vị trí quốc gia được chọn
 * 3. Đồng bộ Múi giờ (Intl DateTimeFormat) và Ngôn ngữ (navigator.language)
 */
export const getRegionInjectedScript = (
  settings: RegionSettings
): string => {
  if (!settings.enabled) return '';

  const node = getActiveRegionNode(settings.activeRegionId);

  return `
(function() {
  if (window.__kite_region_shield_applied) return;
  window.__kite_region_shield_applied = true;

  ${
    settings.blockWebRtc
      ? `
  // 1. Chống rò rỉ IP thật qua giao thức WebRTC STUN
  try {
    const blockRtcMsg = function() {
      console.log('[Kite Shield] Ngăn chặn WebRTC rò rỉ địa chỉ IP thật');
    };
    if (window.RTCPeerConnection) {
      const origCreateOffer = window.RTCPeerConnection.prototype.createOffer;
      window.RTCPeerConnection.prototype.createOffer = function() {
        blockRtcMsg();
        return Promise.reject(new Error('WebRTC disabled by Kite Region Shield'));
      };
      if (window.RTCPeerConnection.prototype.setLocalDescription) {
        window.RTCPeerConnection.prototype.setLocalDescription = function() {
          return Promise.reject(new Error('WebRTC disabled by Kite Region Shield'));
        };
      }
    }
    if (window.webkitRTCPeerConnection) {
      window.webkitRTCPeerConnection = window.RTCPeerConnection;
    }
    if (window.mozRTCPeerConnection) {
      window.mozRTCPeerConnection = window.RTCPeerConnection;
    }
  } catch (err) {}
  `
      : ''
  }

  ${
    settings.spoofGps
      ? `
  // 2. Giả lập GPS tọa độ theo quốc gia ${node.name} (${node.city})
  try {
    const spoofCoords = {
      latitude: ${node.lat},
      longitude: ${node.lon},
      accuracy: 25,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition = function(success, error, options) {
        if (typeof success === 'function') {
          setTimeout(function() {
            success({
              coords: spoofCoords,
              timestamp: Date.now()
            });
          }, 50);
        }
      };

      navigator.geolocation.watchPosition = function(success, error, options) {
        if (typeof success === 'function') {
          setTimeout(function() {
            success({
              coords: spoofCoords,
              timestamp: Date.now()
            });
          }, 50);
        }
        return 1;
      };

      navigator.geolocation.clearWatch = function() {};
    }
  } catch (err) {}

  // 3. Giả lập Múi giờ và Ngôn ngữ (${node.timezone} / ${node.locale})
  try {
    const targetTz = '${node.timezone}';
    const targetLocale = '${node.locale}';

    // Override Intl.DateTimeFormat
    const OriginalDTF = Intl.DateTimeFormat;
    Intl.DateTimeFormat = function(locales, options) {
      const opts = Object.assign({}, options);
      if (!opts.timeZone) {
        opts.timeZone = targetTz;
      }
      return new OriginalDTF(locales || targetLocale, opts);
    };
    Intl.DateTimeFormat.prototype = OriginalDTF.prototype;
    Intl.DateTimeFormat.supportedLocalesOf = OriginalDTF.supportedLocalesOf;

    // Override navigator.language
    try {
      Object.defineProperty(navigator, 'language', {
        get: function() { return targetLocale; },
        configurable: true
      });
      Object.defineProperty(navigator, 'languages', {
        get: function() { return [targetLocale, 'en']; },
        configurable: true
      });
    } catch (e) {}
  } catch (err) {}
  `
      : ''
  }
})();
`;
};

/**
 * Định tuyến URL qua Cổng Web Proxy Gateway khi chế độ chuyển vùng được bật
 */
export const wrapUrlWithProxyGateway = (
  originalUrl: string,
  settings: RegionSettings
): string => {
  if (!settings.enabled || !settings.useProxyGateway) {
    return originalUrl;
  }

  const cleanUrl = originalUrl.trim();
  if (
    !cleanUrl ||
    cleanUrl.startsWith('about:') ||
    cleanUrl.startsWith('kite://') ||
    cleanUrl.startsWith('data:')
  ) {
    return originalUrl;
  }

  // Tránh bọc lặp nếu URL đã qua proxy gateway
  if (
    cleanUrl.includes('proxyium.com') ||
    cleanUrl.includes('croxyproxy.com') ||
    cleanUrl.includes('blockaway.net')
  ) {
    return cleanUrl;
  }

  const node = getActiveRegionNode(settings.activeRegionId);
  const encoded = encodeURIComponent(cleanUrl);

  // Định tuyến qua cổng Proxy Gateway tương ứng theo quốc gia
  return `https://proxyium.com/proxy?url=${encoded}&country=${node.countryCode.toLowerCase()}`;
};
