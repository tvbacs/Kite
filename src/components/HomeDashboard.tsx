import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ImageBackground,
  Modal,
  TextInput,
  Alert,
  Animated,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
  Switch,
  useWindowDimensions,
  StatusBar,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Svg, { Path } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bookmark, UserProfile } from '../types/browser';
import { SEARCH_ENGINES } from '../constants/searchEngines';
import { theme } from '../constants/theme';
import { VoiceSearchModal } from './VoiceSearchModal';
import { GoogleAccountSheet } from './GoogleAccountSheet';
import { getGoogleOAuthUrl, saveCloudSettings, syncUserCloudData } from '../services/supabase';
import { preconnectTarget } from '../services/networkPreconnectService';

const GoogleGIcon = ({ size = 20 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <Path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <Path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      fill="#FBBC05"
    />
    <Path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      fill="#EA4335"
    />
  </Svg>
);

interface HomeDashboardProps {
  activeTabId?: string;
  onSelectUrl: (url: string) => void;
  onFocusSearch?: () => void;
  currentEngineId: string;
  onChangeEngine: (engineId: 'google' | 'bing' | 'duckduckgo' | 'yahoo') => void;
  isIncognito: boolean;
  onToggleIncognito: () => void;
  onSearchByImage: () => void;
  onScanQr?: () => void;
  onOpenBookmarks?: () => void;
  onOpenHistory?: () => void;
  onOpenDownloads?: () => void;
  onOpenPasswordManager?: () => void;
  onOpenExtensions?: () => void;
  onOpenTabs?: () => void;
  onOpenStorageManager?: () => void;
  userProfile?: UserProfile;
  onUpdateProfile?: (profile: UserProfile) => void;
  onSwitchAccount?: (newProfile: UserProfile, previousProfile: UserProfile) => void;
  syncAllAccounts?: boolean;
  onToggleSyncAccounts?: (val: boolean) => void;
  onShowToast?: (msg: string) => void;
  incognitoPin?: string | null;
  onOpenPinSettings?: () => void;
  onPullMove?: (dy: number, dx: number) => void;
  onPullEnd?: () => void;
  onPullCancel?: () => void;
  pullDistance?: number;
  refreshTrigger?: number;
}

const cachedShortcutsMap = new Map<string, Bookmark[]>();

const DEFAULT_BOOKMARKS: Bookmark[] = [
  {
    id: 'google',
    title: 'Google',
    url: 'https://www.google.com',
  },
  {
    id: 'youtube',
    title: 'YouTube',
    url: 'https://m.youtube.com',
  },
  {
    id: 'facebook',
    title: 'Facebook',
    url: 'https://m.facebook.com',
  },
  {
    id: 'vnexpress',
    title: 'VnExpress',
    url: 'https://vnexpress.net',
  },
  {
    id: 'dantri',
    title: 'Dân Trí',
    url: 'https://dantri.com.vn',
  },
  {
    id: 'chatgpt',
    title: 'ChatGPT',
    url: 'https://chatgpt.com',
  },
  {
    id: 'tiktok',
    title: 'TikTok',
    url: 'https://www.tiktok.com',
  },
  {
    id: 'shopee',
    title: 'Shopee',
    url: 'https://shopee.vn',
  },
];

const getFaviconSources = (rawUrl: string, customIcon?: string): string[] => {
  const sources: string[] = [];
  if (customIcon) {
    sources.push(customIcon);
  }
  let cleanUrl = (rawUrl || '').trim();
  if (!cleanUrl) return sources;
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = 'https://' + cleanUrl;
  }

  // 1. Google High-Res Favicon V2 (sz=128) - Rất nét trên màn hình Retina, tự động trả về logo/favicon chính thức từ website
  sources.push(`https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(cleanUrl)}&size=128`);
  sources.push(`https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(cleanUrl)}`);

  // 2. DuckDuckGo Icon Service & Website origin favicon
  const match = cleanUrl.match(/^https?:\/\/([^\/\?#]+)/i);
  if (match) {
    const host = match[1];
    sources.push(`https://icons.duckduckgo.com/ip3/${host}.ico`);
    const origin = cleanUrl.match(/^(https?:\/\/[^\/\?#]+)/i)?.[1];
    if (origin) {
      sources.push(`${origin}/favicon.ico`);
      sources.push(`${origin}/apple-touch-icon.png`);
    }
  }

  return sources;
};

interface ShortcutFaviconImageProps {
  url: string;
  title: string;
  icon?: string;
}

const ShortcutFaviconImage: React.FC<ShortcutFaviconImageProps> = ({ url, title, icon }) => {
  const sources = useMemo(() => getFaviconSources(url, icon), [url, icon]);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [url, icon]);

  const handleError = () => {
    setSourceIndex((prev) => prev + 1);
  };

  // Nếu tất cả các nguồn ảnh chính chủ đều lỗi (ví dụ khi hoàn toàn mất mạng)
  if (sourceIndex >= sources.length) {
    const letter = (title || url.replace(/^https?:\/\/(www\.)?/, '')).charAt(0).toUpperCase();
    return (
      <View style={styles.shortcutLetterFallback}>
        <Text style={styles.shortcutLetterText}>{letter}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: sources[sourceIndex] }}
      style={styles.circleShortcutFavicon}
      resizeMode="contain"
      onError={handleError}
    />
  );
};

const renderShortcutIcon = (item: Bookmark) => {
  const urlLower = item.url.toLowerCase();
  // Với Google search chính chủ, dùng vector SVG 4 màu sắc nét 0ms
  if (urlLower.includes('google.com') && !urlLower.includes('play.google') && !urlLower.includes('drive.google')) {
    return <GoogleGIcon size={24} />;
  }
  // Mọi trang web khác (ChatGPT, TikTok, YouTube, Facebook, Shopee, VnExpress, Dân Trí...)
  // đều tự động lấy trực tiếp icon/favicon chính chủ từ chính website đó, không dùng icon giả tự tạo!
  return <ShortcutFaviconImage url={item.url} title={item.title} icon={item.icon} />;
};

interface DiscoverArticle {
  id: string;
  title: string;
  source: string;
  timeAgo: string;
  imageUrl: string;
  url: string;
  layout: 'hero' | 'compact';
}

const DISCOVER_ARTICLES: DiscoverArticle[] = [
  {
    id: 'art-1',
    title: 'Kính viễn vọng James Webb phát hiện 3 thiên hà cổ đại thách thức thuyết vũ trụ học',
    source: 'VnExpress • Khoa học',
    timeAgo: '2 giờ trước',
    imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&q=80',
    url: 'https://vnexpress.net/khoa-hoc',
    layout: 'hero',
  },
  {
    id: 'art-2',
    title: 'Kỷ nguyên AI trên thiết bị: Chip xử lý thế hệ mới tăng tốc phản hồi tức thì không cần mạng',
    source: 'GenK • Công nghệ',
    timeAgo: '3 giờ trước',
    imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&q=80',
    url: 'https://genk.vn',
    layout: 'compact',
  },
  {
    id: 'art-3',
    title: 'Xu hướng kiến trúc xanh 2026: Nhà phố hòa quyện thiên nhiên và tiết kiệm năng lượng tối ưu',
    source: 'Dân Trí • Đời sống',
    timeAgo: '5 giờ trước',
    imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=500&q=80',
    url: 'https://dantri.com.vn',
    layout: 'compact',
  },
  {
    id: 'art-4',
    title: 'Đột phá pin thể rắn giúp xe điện sạc đầy trong 10 phút, tầm hoạt động vượt 1.000 km',
    source: 'Tuổi Trẻ • Xe & Công nghệ',
    timeAgo: '7 giờ trước',
    imageUrl: 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800&q=80',
    url: 'https://tuoitre.vn',
    layout: 'hero',
  },
  {
    id: 'art-5',
    title: 'Văn hóa cà phê phin vỉa hè: Nét mộc mạc lắng đọng hồn phố Việt qua năm tháng',
    source: 'Znews • Văn hóa',
    timeAgo: '10 giờ trước',
    imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500&q=80',
    url: 'https://znews.vn',
    layout: 'compact',
  },
];

const STORAGE_SHORTCUTS_KEY = '@kite_shortcuts';
const STORAGE_BG_KEY = '@kite_bg_image';
const STORAGE_USER_KEY = '@kite_user_profile';
const STORAGE_SAVED_ACCOUNTS_KEY = '@kite_saved_accounts';
const STORAGE_THEME_KEY = '@kite_theme_palette';
export const STORAGE_SYNC_ACCOUNTS_KEY = '@kite_sync_all_accounts';
const STORAGE_DISCOVER_CACHE_KEY = '@kite_discover_articles_cache';

// BỘ BÓC TÁCH RSS ĐA NGUỒN (VNEXPRESS, DÂN TRÍ, THANH NIÊN, TUỔI TRẺ)
const parseRssFeed = (
  xml: string,
  defaultSource: string = 'Tin tức',
  offset: number = 0,
  maxItems: number = 10
): DiscoverArticle[] => {
  const items: DiscoverArticle[] = [];
  const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  if (itemMatches.length === 0) return [];

  const startIndex = offset % Math.max(1, itemMatches.length - maxItems);
  const selected = itemMatches.slice(startIndex, startIndex + maxItems);

  selected.forEach((itemXml, idx) => {
    // 1. Tiêu đề bài viết
    const titleMatch =
      itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) ||
      itemXml.match(/<title>([\s\S]*?)<\/title>/i);
    let title = titleMatch ? titleMatch[1].trim() : '';
    title = title
      .replace(/^<!\[CDATA\[/, '')
      .replace(/\]\]>$/, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .trim();

    // Bỏ qua tiêu đề kênh RSS cấp cao
    if (!title || title.toLowerCase().includes('rss') || title.toLowerCase().includes('kênh thông tin')) {
      return;
    }

    // 2. Link bài viết
    const linkMatch =
      itemXml.match(/<link><!\[CDATA\[([\s\S]*?)\]\]><\/link>/i) ||
      itemXml.match(/<link>([\s\S]*?)<\/link>/i) ||
      itemXml.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
    let url = linkMatch ? linkMatch[1].trim() : '';
    url = url.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();

    // 3. Ảnh bài viết chất lượng cao (Hỗ trợ enclosure, img tag, media:content)
    let imageUrl = '';
    const enclosureMatch = itemXml.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
    const mediaMatch = itemXml.match(/<media:content[^>]+url=["']([^"']+)["']/i);
    const imgMatch =
      itemXml.match(/<img[^>]+src=["']([^"']+)["']/i) ||
      itemXml.match(/src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i);

    if (enclosureMatch && enclosureMatch[1]) {
      imageUrl = enclosureMatch[1];
    } else if (mediaMatch && mediaMatch[1]) {
      imageUrl = mediaMatch[1];
    } else if (imgMatch && imgMatch[1]) {
      imageUrl = imgMatch[1];
    }
    imageUrl = imageUrl.replace(/&amp;/g, '&').trim();

    // 4. Thời gian đăng
    const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    let timeAgo = 'Vừa xong';
    if (pubDateMatch) {
      try {
        const pubTime = new Date(pubDateMatch[1]).getTime();
        if (!isNaN(pubTime)) {
          const diffMins = Math.floor((Date.now() - pubTime) / 60000);
          if (diffMins < 1) {
            timeAgo = 'Vừa xong';
          } else if (diffMins < 60) {
            timeAgo = `${diffMins} phút trước`;
          } else {
            const diffHours = Math.floor(diffMins / 60);
            if (diffHours < 24) {
              timeAgo = `${diffHours} giờ trước`;
            } else {
              const diffDays = Math.floor(diffHours / 24);
              timeAgo = `${diffDays} ngày trước`;
            }
          }
        }
      } catch (e) {}
    }

    // 5. Xác định nguồn và phân loại
    let sourceName = defaultSource;
    if (url.includes('vnexpress.net')) sourceName = 'VnExpress';
    else if (url.includes('dantri.com.vn')) sourceName = 'Dân Trí';
    else if (url.includes('thanhnien.vn')) sourceName = 'Thanh Niên';
    else if (url.includes('tuoitre.vn')) sourceName = 'Tuổi Trẻ';

    let category = 'Tin mới';
    if (url.includes('/khoa-hoc') || url.includes('/cong-nghe') || url.includes('/so-hoa') || url.includes('/suc-manh-so')) {
      category = 'Công nghệ';
    } else if (url.includes('/kinh-doanh') || url.includes('/kinh-te')) {
      category = 'Kinh doanh';
    } else if (url.includes('/the-thao')) {
      category = 'Thể thao';
    } else if (url.includes('/giai-tri')) {
      category = 'Giải trí';
    } else if (url.includes('/the-gioi')) {
      category = 'Thế giới';
    } else if (url.includes('/thoi-su') || url.includes('/xa-hoi')) {
      category = 'Thời sự';
    } else if (url.includes('/doi-song') || url.includes('/gia-dinh')) {
      category = 'Đời sống';
    }

    // Ảnh fallback chất lượng cao nếu bài báo không có thumbnail
    const fallbackImages = [
      'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&q=80',
      'https://images.unsplash.com/photo-1495020689067-958852a7765e?w=800&q=80',
      'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800&q=80',
      'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80',
    ];

    if (title && url) {
      items.push({
        id: `news-${idx}-${Date.now()}`,
        title,
        source: `${sourceName} • ${category}`,
        timeAgo,
        imageUrl: imageUrl || fallbackImages[idx % fallbackImages.length],
        url,
        layout: idx === 0 || idx === 3 ? 'hero' : 'compact',
      });
    }
  });

  return items;
};

export interface ThemePalette {
  id: string;
  name: string;
  tag: string;
  previewBg: string;
  previewCard: string;
  accent: string;
  bg: string;
  card: string;
  cardGlass: string;
  textColor: string;
  subColor: string;
}

export const THEME_PALETTES: Record<string, ThemePalette> = {
  light: {
    id: 'light',
    name: 'Trắng sứ tối giản',
    tag: 'Mặc định',
    previewBg: '#f8fafc',
    previewCard: '#f1f5f9',
    accent: '#007aff',
    bg: '#f8fafc',
    card: '#f1f5f9',
    cardGlass: 'rgba(248, 250, 252, 0.88)',
    textColor: '#09090b',
    subColor: '#64748b',
  },
  sand: {
    id: 'sand',
    name: 'Vàng cát ấm',
    tag: 'Cát ấm',
    previewBg: '#f7f3ec',
    previewCard: '#ede5da',
    accent: '#d97706',
    bg: '#f7f3ec',
    card: '#ede5da',
    cardGlass: 'rgba(247, 240, 230, 0.88)',
    textColor: '#1f2024',
    subColor: '#5f6368',
  },
  mint: {
    id: 'mint',
    name: 'Xanh búp non',
    tag: 'Xanh lợt',
    previewBg: '#eef6f0',
    previewCard: '#dcebde',
    accent: '#16a34a',
    bg: '#eef6f0',
    card: '#dcebde',
    cardGlass: 'rgba(238, 246, 240, 0.88)',
    textColor: '#15241b',
    subColor: '#4d6656',
  },
  sky: {
    id: 'sky',
    name: 'Xanh dương nhạt',
    tag: 'Dịu êm',
    previewBg: '#edf4fb',
    previewCard: '#d9e7f5',
    accent: '#0284c7',
    bg: '#edf4fb',
    card: '#d9e7f5',
    cardGlass: 'rgba(237, 244, 251, 0.88)',
    textColor: '#0f172a',
    subColor: '#475569',
  },
  peach: {
    id: 'peach',
    name: 'Cam đào nhạt',
    tag: 'Ấm áp',
    previewBg: '#fbf2eb',
    previewCard: '#f5e2d5',
    accent: '#ea580c',
    bg: '#fbf2eb',
    card: '#f5e2d5',
    cardGlass: 'rgba(251, 242, 235, 0.88)',
    textColor: '#271c16',
    subColor: '#6e5a4f',
  },
  dark: {
    id: 'dark',
    name: 'Tối cổ điển',
    tag: 'Đêm',
    previewBg: '#202124',
    previewCard: '#2d2f31',
    accent: '#93c5fd',
    bg: '#202124',
    card: '#2d2f31',
    cardGlass: 'rgba(45, 47, 49, 0.88)',
    textColor: '#e8eaed',
    subColor: '#9aa0a6',
  },
};

export const DEFAULT_SAVED_ACCOUNTS: UserProfile[] = [];

// ẢNH MINH HỌA THỜI TIẾT DO NGƯỜI DÙNG CUNG CẤP TRONG THƯ MỤC ASSETS
const WEATHER_ILLUSTRATIONS = {
  sunshine: require('../../assets/sunshine.png'),
  sun: require('../../assets/sun.png'),
  night: require('../../assets/night.png'),
  rain: require('../../assets/rain.png'),
  snow: require('../../assets/snow.png'),
};

interface HourlyForecast {
  timeLabel: string;
  temp: number;
  weatherCode: number;
  isNight: boolean;
}

interface WeatherInfo {
  temp: number;
  apparentTemp: number;
  conditionText: string;
  weatherCode: number;
  location: string;
  hourly: HourlyForecast[];
}

const formatClockTime = (date: Date) => {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

const formatVietnameseDate = (date: Date) => {
  const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const dayName = days[date.getDay()];
  const d = date.getDate();
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  return `${dayName}, ${d} Tháng ${m}, ${y}`;
};

const getWeatherDetails = (code: number, temp: number, currentHour: number) => {
  const isNight = currentHour >= 18 || currentHour < 5;
  const isDawn = currentHour >= 5 && currentHour < 7;
  const isRain = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code);
  const isSnow = [71, 73, 75, 77, 85, 86].includes(code) || temp <= 12;

  let illustration = WEATHER_ILLUSTRATIONS.sun;
  let conditionText = 'Trời nắng quang đãng';
  let iconName: 'sun' | 'moon' | 'cloud-rain' | 'cloud-snow' | 'sunrise' | 'cloud' = 'sun';
  let mcIconName: keyof typeof MaterialCommunityIcons.glyphMap = 'weather-sunny';
  let iconColor = '#f59e0b';

  if (isRain) {
    illustration = WEATHER_ILLUSTRATIONS.rain;
    conditionText = code >= 95 ? 'Dông bão, có sấm sét' : 'Trời có mưa, ẩm ướt';
    iconName = 'cloud-rain';
    mcIconName = code >= 95 ? 'weather-lightning-rainy' : 'weather-pouring';
    iconColor = '#38bdf8';
  } else if (isSnow) {
    illustration = WEATHER_ILLUSTRATIONS.snow;
    conditionText = 'Trời rét lạnh, có tuyết/sương';
    iconName = 'cloud-snow';
    mcIconName = 'weather-snowy';
    iconColor = '#93c5fd';
  } else if (isDawn) {
    illustration = WEATHER_ILLUSTRATIONS.sunshine;
    conditionText = 'Bình minh, trời dịu mát';
    iconName = 'sunrise';
    mcIconName = 'weather-sunset-up';
    iconColor = '#f97316';
  } else if (isNight) {
    illustration = WEATHER_ILLUSTRATIONS.night;
    conditionText =
      code === 1 || code === 2 || code === 0
        ? 'Trời trong, thỉnh thoảng có mây'
        : 'Đêm nhiều mây, mát mẻ';
    iconName = 'moon';
    mcIconName = 'weather-night';
    iconColor = '#60a5fa';
  } else {
    // Ban ngày
    if (code === 0) {
      conditionText = 'Trời nắng, quang đãng';
      iconName = 'sun';
      mcIconName = 'weather-sunny';
      iconColor = '#f59e0b';
    } else if (code <= 3) {
      conditionText = 'Trời nắng, có mây rải rác';
      iconName = 'sun';
      mcIconName = 'weather-partly-cloudy';
      iconColor = '#f59e0b';
    } else {
      conditionText = 'Trời nhiều mây, râm mát';
      iconName = 'cloud';
      mcIconName = 'weather-cloudy';
      iconColor = '#94a3b8';
    }
  }

  return { illustration, conditionText, iconName, mcIconName, iconColor, isNight };
};

const DEFAULT_WEATHER_INFO: WeatherInfo = {
  temp: 26,
  apparentTemp: 28,
  conditionText: 'Trời trong, thỉnh thoảng có mây',
  weatherCode: 1,
  location: 'Ngũ Hành Sơn',
  hourly: [
    { timeLabel: 'Hiện tại', temp: 26, weatherCode: 1, isNight: true },
    { timeLabel: '2:00', temp: 26, weatherCode: 1, isNight: true },
    { timeLabel: '3:00', temp: 25, weatherCode: 1, isNight: true },
    { timeLabel: '4:00', temp: 24, weatherCode: 1, isNight: true },
    { timeLabel: '5:00', temp: 24, weatherCode: 1, isNight: true },
    { timeLabel: '6:00', temp: 24, weatherCode: 1, isNight: false },
  ],
};

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  activeTabId,
  onSelectUrl,
  onFocusSearch,
  currentEngineId,
  onChangeEngine,
  isIncognito,
  onToggleIncognito,
  onSearchByImage,
  onScanQr,
  onOpenBookmarks,
  onOpenHistory,
  onOpenDownloads,
  onOpenPasswordManager,
  onOpenExtensions,
  onOpenTabs,
  onOpenStorageManager,
  userProfile: propUserProfile,
  onUpdateProfile,
  onSwitchAccount,
  syncAllAccounts: propSyncAllAccounts,
  onToggleSyncAccounts,
  onShowToast,
  incognitoPin,
  onOpenPinSettings,
  onPullMove,
  onPullEnd,
  onPullCancel,
  pullDistance = 0,
  refreshTrigger,
}) => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 47 : 24);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 34 : 16);

  const { width: windowWidth } = useWindowDimensions();
  // Tính toán chiều rộng cột đồng nhất cho Lối tắt và Tiện ích (Dấu trang, Nhật ký...)
  // 36 = padding 18*2 của dashboard content, 28 = padding 14*2 của chromeCardContainer
  const cardInnerWidth = Math.max(windowWidth - 64, 280);
  const slotWidth = Math.floor(cardInnerWidth / 4);
  const iconInset = Math.max(Math.floor((slotWidth - 52) / 2), 4);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  const [shortcuts, setShortcuts] = useState<Bookmark[]>(() => {
    const email = propUserProfile?.email?.toLowerCase();
    return (email && cachedShortcutsMap.get(email)) || cachedShortcutsMap.get('__shared__') || DEFAULT_BOOKMARKS;
  });
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile>(
    propUserProfile || {
      isLoggedIn: false,
      name: '',
      email: '',
      avatarUrl: '',
    }
  );
  const [savedAccounts, setSavedAccounts] = useState<UserProfile[]>([]);

  const [syncAllAccounts, setSyncAllAccounts] = useState<boolean>(propSyncAllAccounts ?? false);
  const [accountMenuVisible, setAccountMenuVisible] = useState<boolean>(false);
  const [isDeleteMode, setIsDeleteMode] = useState<boolean>(false);

  useEffect(() => {
    if (propSyncAllAccounts !== undefined) {
      setSyncAllAccounts(propSyncAllAccounts);
    }
  }, [propSyncAllAccounts]);

  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [addModalVisible, setAddModalVisible] = useState<boolean>(false);
  const [engineModalVisible, setEngineModalVisible] = useState<boolean>(false);
  const [userModalVisible, setUserModalVisible] = useState<boolean>(false);
  const [googleAccountSheetVisible, setGoogleAccountSheetVisible] = useState<boolean>(false);
  const [voiceModalVisible, setVoiceModalVisible] = useState<boolean>(false);
  const [currentThemeId, setCurrentThemeId] = useState<string>('light');

  // Đảm bảo thanh trạng thái (giờ, pin, sóng) có màu đen rõ nét trên theme trắng (chuẩn Chrome)
  useEffect(() => {
    if (isIncognito || bgImage) {
      StatusBar.setBarStyle('light-content', true);
    } else {
      StatusBar.setBarStyle('dark-content', true);
    }
  }, [isIncognito, bgImage, currentThemeId]);

  const [newTitle, setNewTitle] = useState<string>('');
  const [newUrl, setNewUrl] = useState<string>('');
  const [inputUserName, setInputUserName] = useState<string>('');

  const [discoverArticles, setDiscoverArticles] = useState<DiscoverArticle[]>(DISCOVER_ARTICLES);
  const [isRefreshingDiscover, setIsRefreshingDiscover] = useState<boolean>(false);
  const discoverSpinAnim = useRef(new Animated.Value(0)).current;
  const discoverRssOffsetRef = useRef<number>(0);
  const rssSourceIndexRef = useRef<number>(0);

  const RSS_SOURCES = [
    { name: 'VnExpress', url: 'https://vnexpress.net/rss/tin-moi-nhat.rss' },
    { name: 'Dân Trí', url: 'https://dantri.com.vn/rss/tin-moi-nhat.rss' },
    { name: 'Thanh Niên', url: 'https://thanhnien.vn/rss/home.rss' },
    { name: 'VnExpress Thời sự', url: 'https://vnexpress.net/rss/thoi-su.rss' },
    { name: 'Dân Trí Xã hội', url: 'https://dantri.com.vn/rss/xa-hoi.rss' },
    { name: 'Dân Trí Thể thao', url: 'https://dantri.com.vn/rss/the-thao.rss' },
  ];

  const fetchDiscoverFeed = async (isManualRefresh?: boolean) => {
    if (isManualRefresh) {
      setIsRefreshingDiscover(true);
      discoverSpinAnim.setValue(0);
      Animated.loop(
        Animated.timing(discoverSpinAnim, {
          toValue: 1,
          duration: 750,
          useNativeDriver: true,
        })
      ).start();
    }

    if (isManualRefresh) {
      rssSourceIndexRef.current = (rssSourceIndexRef.current + 1) % RSS_SOURCES.length;
      discoverRssOffsetRef.current = (discoverRssOffsetRef.current + 6) % 24;
    }

    let success = false;
    // Thử fetch nguồn hiện tại, nếu lỗi tự động fallback qua nguồn kế tiếp
    const trySources = [
      RSS_SOURCES[rssSourceIndexRef.current],
      RSS_SOURCES[(rssSourceIndexRef.current + 1) % RSS_SOURCES.length],
      RSS_SOURCES[(rssSourceIndexRef.current + 2) % RSS_SOURCES.length],
    ];

    for (const source of trySources) {
      if (success) break;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);

        const res = await fetch(source.url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15',
            Accept: 'application/rss+xml, application/xml, text/xml, */*',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const xml = await res.text();
          const parsed = parseRssFeed(xml, source.name, discoverRssOffsetRef.current, 10);
          if (parsed.length > 0) {
            setDiscoverArticles(parsed);
            await AsyncStorage.setItem(STORAGE_DISCOVER_CACHE_KEY, JSON.stringify(parsed));
            success = true;
            if (isManualRefresh && onShowToast) {
              onShowToast(`Đã cập nhật bài viết mới từ ${source.name}`);
            }
            break;
          }
        }
      } catch (e) {
        // Nguồn này lỗi, vòng lặp tự thử nguồn tiếp theo
      }
    }

    if (isManualRefresh) {
      setTimeout(() => {
        discoverSpinAnim.stopAnimation();
        discoverSpinAnim.setValue(0);
        setIsRefreshingDiscover(false);
      }, 350);
    }

    if (!success && isManualRefresh && onShowToast) {
      onShowToast('Không có kết nối mạng để tải bài viết mới');
    }
  };

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_DISCOVER_CACHE_KEY).then((cache) => {
      if (cache) {
        try {
          const parsed = JSON.parse(cache);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setDiscoverArticles(parsed);
          }
        } catch (e) {}
      }
    });
    fetchDiscoverFeed(false);
  }, []);

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      fetchDiscoverFeed(true);
    }
  }, [refreshTrigger]);



  // Trạng thái Thời tiết & Vị trí Ngũ Hành Sơn (Đà Nẵng)
  const [weather, setWeather] = useState<WeatherInfo>(DEFAULT_WEATHER_INFO);

  // Thời gian thực cho đồng hồ số to và ngày tháng năm
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchWeather = async () => {
      try {
        const res = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=16.0025&longitude=108.2519&current=temperature_2m,apparent_temperature,weather_code&hourly=temperature_2m,weather_code&timezone=Asia%2FBangkok&forecast_hours=12'
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted || !data?.current) return;

        const currentHour = new Date().getHours();
        const currentTemp = Math.round(data.current.temperature_2m ?? 26);
        const currentApparent = Math.round(data.current.apparent_temperature ?? currentTemp + 2);
        const currentCode = data.current.weather_code ?? 1;

        const details = getWeatherDetails(currentCode, currentTemp, currentHour);

        const hourlyTimes: string[] = data.hourly?.time || [];
        const hourlyTemps: number[] = data.hourly?.temperature_2m || [];
        const hourlyCodes: number[] = data.hourly?.weather_code || [];

        const forecastList: HourlyForecast[] = [];
        const nowIndex = hourlyTimes.findIndex((t) => {
          const h = new Date(t).getHours();
          return h === currentHour;
        });

        const startIndex = nowIndex >= 0 ? nowIndex : 0;
        for (let i = startIndex; i < Math.min(startIndex + 6, hourlyTimes.length); i++) {
          const d = new Date(hourlyTimes[i]);
          const h = d.getHours();
          const isFirst = i === startIndex;
          forecastList.push({
            timeLabel: isFirst ? 'Hiện tại' : `${h}:00`,
            temp: Math.round(hourlyTemps[i] ?? currentTemp),
            weatherCode: hourlyCodes[i] ?? currentCode,
            isNight: h >= 18 || h < 5,
          });
        }

        setWeather({
          temp: currentTemp,
          apparentTemp: currentApparent,
          conditionText: details.conditionText,
          weatherCode: currentCode,
          location: 'Ngũ Hành Sơn',
          hourly: forecastList.length >= 4 ? forecastList : DEFAULT_WEATHER_INFO.hourly,
        });
      } catch (e) {
        // Giữ mặc định Ngũ Hành Sơn
      }
    };

    fetchWeather();
    return () => {
      isMounted = false;
    };
  }, []);

  const weatherDetails = getWeatherDetails(weather.weatherCode, weather.temp, new Date().getHours());



  const currentEngine = SEARCH_ENGINES[currentEngineId] || SEARCH_ENGINES.google;

  // Hiệu ứng lò xo nhảy lên mượt mà mỗi khi tạo tab mới
  useEffect(() => {
    slideAnim.setValue(16);
    scaleAnim.setValue(0.97);
    opacityAnim.setValue(1);

    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 65,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 65,
        useNativeDriver: true,
      }),
    ]).start();
  }, [activeTabId]);

  useEffect(() => {
    loadSavedData();
    const engineHost =
      currentEngineId === 'bing'
        ? 'www.bing.com'
        : currentEngineId === 'duckduckgo'
        ? 'duckduckgo.com'
        : currentEngineId === 'yahoo'
        ? 'search.yahoo.com'
        : 'www.google.com';
    preconnectTarget(engineHost);
  }, [currentEngineId]);

  useEffect(() => {
    if (propUserProfile) {
      setUserProfile(propUserProfile);
    }
    loadSavedData();
  }, [propUserProfile?.email, syncAllAccounts]);

  useEffect(() => {
    if (userModalVisible) {
      loadSavedData();
    }
  }, [userModalVisible]);

  // Tổng hợp tất cả các tài khoản đã đăng nhập tích luỹ
  const allAccounts: UserProfile[] = React.useMemo(() => {
    const list = [...savedAccounts];
    if (userProfile.isLoggedIn && userProfile.email) {
      const idx = list.findIndex(
        (a) => a.email?.toLowerCase() === userProfile.email?.toLowerCase()
      );
      if (idx === -1) {
        list.unshift(userProfile);
      } else {
        list[idx] = { ...list[idx], ...userProfile };
      }
    }
    return list;
  }, [savedAccounts, userProfile]);

  // Các tài khoản khác trên máy (ngoại trừ nick chính đang kích hoạt hiển thị ở trên)
  const otherAccounts: UserProfile[] = React.useMemo(() => {
    if (!userProfile.isLoggedIn || !userProfile.email) {
      return allAccounts;
    }
    return allAccounts.filter(
      (acc) => acc.email?.toLowerCase() !== userProfile.email?.toLowerCase()
    );
  }, [allAccounts, userProfile]);

  const isRealGooglePhoto = (url?: string) => {
    if (!url) return false;
    return (
      url.includes('googleusercontent.com/a/') ||
      url.includes('googleusercontent.com/a-/') ||
      url.includes('googleusercontent.com/ogw/')
    );
  };

  const getAvatarLetter = () => {
    if (userProfile.email?.toLowerCase().includes('vietbac')) return 'V';
    if (userProfile.name) {
      const trimmed = userProfile.name.trim();
      if (trimmed.toLowerCase().includes('việt bắc')) return 'V';
      const words = trimmed.split(/\s+/);
      const mainWord = words[words.length - 1] || words[0];
      if (mainWord) return mainWord.charAt(0).toUpperCase();
    }
    if (userProfile.email) {
      return userProfile.email.charAt(0).toUpperCase();
    }
    return 'V';
  };

  const getAvatarBgColor = (email?: string, name?: string) => {
    if (email?.toLowerCase().includes('vietbac')) return '#8e24aa';
    const GOOGLE_PALETTE = [
      '#8e24aa', // Purple
      '#1a73e8', // Blue
      '#137333', // Green
      '#c5221f', // Red
      '#e37400', // Orange
      '#00838f', // Cyan
      '#b80672', // Pink
      '#3949ab', // Indigo
      '#00796b', // Teal
      '#5e35b1', // Deep Purple
    ];
    const key = (email || name || 'user').toLowerCase();
    let hash = 0;
    return GOOGLE_PALETTE[Math.abs(hash) % GOOGLE_PALETTE.length];
  };

  const getLetterForUser = (email?: string, name?: string) => {
    if (email?.toLowerCase().includes('vietbac')) return 'V';
    if (name) {
      const trimmed = name.trim();
      if (trimmed.toLowerCase().includes('việt bắc')) return 'V';
      if (trimmed.toLowerCase().includes('bắc')) return 'B';
      const words = trimmed.split(/\s+/);
      const lastWord = words[words.length - 1];
      if (lastWord) return lastWord.charAt(0).toUpperCase();
      return words[0].charAt(0).toUpperCase();
    }
    if (email) {
      return email.charAt(0).toUpperCase();
    }
    return 'G';
  };

  const getShortcutsKey = (email?: string) => {
    return syncAllAccounts || !email
      ? STORAGE_SHORTCUTS_KEY
      : `${STORAGE_SHORTCUTS_KEY}_${email.toLowerCase()}`;
  };
  const getBgKey = (email?: string) => {
    return syncAllAccounts || !email
      ? STORAGE_BG_KEY
      : `${STORAGE_BG_KEY}_${email.toLowerCase()}`;
  };
  const getThemeKey = (email?: string) => {
    return syncAllAccounts || !email
      ? STORAGE_THEME_KEY
      : `${STORAGE_THEME_KEY}_${email.toLowerCase()}`;
  };

  const handleOpenGoogleAccount = () => {
    setUserModalVisible(false);
    setAccountMenuVisible(false);
    // Mở trang quản lý tài khoản Google dạng sheet chuẩn (hình 1)
    setTimeout(() => {
      setGoogleAccountSheetVisible(true);
    }, 150);
  };

  const confirmDeleteAccount = (targetAccount: UserProfile) => {
    Alert.alert(
      'Xóa tài khoản khỏi thiết bị?',
      `Bạn có chắc chắn muốn xóa tài khoản "${targetAccount.email}" khỏi thiết bị này không?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa tài khoản',
          style: 'destructive',
          onPress: () => executeDeleteAccount(targetAccount),
        },
      ]
    );
  };

  const executeDeleteAccount = async (targetAccount: UserProfile) => {
    try {
      const emailToDelete = targetAccount.email?.toLowerCase();
      const isDeletingActive = emailToDelete === userProfile.email?.toLowerCase();

      // Cập nhật danh sách tài khoản lưu trên thiết bị
      const updatedAccounts = savedAccounts.filter(
        (a) => a.email?.toLowerCase() !== emailToDelete
      );
      setSavedAccounts(updatedAccounts);
      await AsyncStorage.setItem(STORAGE_SAVED_ACCOUNTS_KEY, JSON.stringify(updatedAccounts));

      // Dọn dẹp dữ liệu riêng của tài khoản bị xóa
      if (emailToDelete) {
        await Promise.all([
          AsyncStorage.removeItem(`${STORAGE_SHORTCUTS_KEY}_${emailToDelete}`),
          AsyncStorage.removeItem(`${STORAGE_BG_KEY}_${emailToDelete}`),
          AsyncStorage.removeItem(`${STORAGE_THEME_KEY}_${emailToDelete}`),
          AsyncStorage.removeItem(`@kite_persisted_tabs_state_${emailToDelete}`),
          AsyncStorage.removeItem(`@kite_active_tab_id_${emailToDelete}`),
          AsyncStorage.removeItem(`@kite_browsing_history_${emailToDelete}`),
          AsyncStorage.removeItem(`@kite_user_bookmarks_${emailToDelete}`),
        ]);
      }

      if (isDeletingActive) {
        if (updatedAccounts.length > 0) {
          const nextAcc = updatedAccounts[0];
          const nextUser: UserProfile = {
            isLoggedIn: true,
            name: nextAcc.name,
            email: nextAcc.email,
            avatarUrl: nextAcc.avatarUrl || '',
          };
          setUserProfile(nextUser);
          await AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(nextUser));
          if (onSwitchAccount) {
            onSwitchAccount(nextUser, userProfile);
          } else if (onUpdateProfile) {
            onUpdateProfile(nextUser);
          }
          if (onShowToast) onShowToast(`Đã chuyển sang: ${nextAcc.name || nextAcc.email}`);
        } else {
          const loggedOutUser: UserProfile = {
            isLoggedIn: false,
            name: '',
            email: '',
            avatarUrl: '',
          };
          setUserProfile(loggedOutUser);
          await AsyncStorage.removeItem(STORAGE_USER_KEY);
          if (onSwitchAccount) {
            onSwitchAccount(loggedOutUser, userProfile);
          } else if (onUpdateProfile) {
            onUpdateProfile(loggedOutUser);
          }
          setUserModalVisible(false);
          setIsDeleteMode(false);
          if (onShowToast) onShowToast('Đã xóa tài khoản và đăng xuất');
        }
      } else {
        if (onShowToast) onShowToast(`Đã xóa tài khoản: ${targetAccount.name || targetAccount.email}`);
      }
    } catch (e) {
      if (onShowToast) onShowToast('Lỗi khi xóa tài khoản');
    }
  };

  const handleToggleSync = async (val: boolean) => {
    setSyncAllAccounts(val);
    await AsyncStorage.setItem(STORAGE_SYNC_ACCOUNTS_KEY, JSON.stringify(val));
    if (onToggleSyncAccounts) {
      onToggleSyncAccounts(val);
    }
    if (onShowToast) {
      onShowToast(
        val
          ? 'Đã bật: Các tài khoản sẽ dùng chung dữ liệu tab & lối tắt'
          : 'Đã tắt: Mỗi tài khoản sẽ có dữ liệu tab & lối tắt riêng biệt'
      );
    }
    // Tải lại dữ liệu ngay lập tức theo chế độ vừa chuyển
    setTimeout(() => {
      loadSavedData();
    }, 50);
  };

  const handleSelectAccount = async (acc: UserProfile) => {
    if (acc.email?.toLowerCase() === userProfile.email?.toLowerCase()) {
      setUserModalVisible(false);
      setIsDeleteMode(false);
      return;
    }

    const prevEmail = userProfile.email?.toLowerCase();
    const newEmail = acc.email?.toLowerCase();

    // 1. Nếu không bật đồng bộ toàn bộ tài khoản: Lưu lại trạng thái của tài khoản cũ
    if (!syncAllAccounts && prevEmail) {
      await Promise.all([
        AsyncStorage.setItem(`${STORAGE_SHORTCUTS_KEY}_${prevEmail}`, JSON.stringify(shortcuts)),
        bgImage
          ? AsyncStorage.setItem(`${STORAGE_BG_KEY}_${prevEmail}`, bgImage)
          : AsyncStorage.removeItem(`${STORAGE_BG_KEY}_${prevEmail}`),
        currentThemeId
          ? AsyncStorage.setItem(`${STORAGE_THEME_KEY}_${prevEmail}`, currentThemeId)
          : AsyncStorage.removeItem(`${STORAGE_THEME_KEY}_${prevEmail}`),
      ]);
    }

    // 2. Tải lối tắt & hình nền của tài khoản mới
    if (!syncAllAccounts && newEmail) {
      const [accShortcuts, accBg, accTheme] = await Promise.all([
        AsyncStorage.getItem(`${STORAGE_SHORTCUTS_KEY}_${newEmail}`),
        AsyncStorage.getItem(`${STORAGE_BG_KEY}_${newEmail}`),
        AsyncStorage.getItem(`${STORAGE_THEME_KEY}_${newEmail}`),
      ]);

      if (accShortcuts) {
        try {
          const parsed = JSON.parse(accShortcuts);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setShortcuts(parsed);
            cachedShortcutsMap.set(newEmail, parsed);
          } else {
            setShortcuts(DEFAULT_BOOKMARKS);
            cachedShortcutsMap.set(newEmail, DEFAULT_BOOKMARKS);
          }
        } catch {
          setShortcuts(DEFAULT_BOOKMARKS);
          cachedShortcutsMap.set(newEmail, DEFAULT_BOOKMARKS);
        }
      } else {
        // Tài khoản mới chưa có lối tắt riêng -> Khởi tạo danh sách mặc định sạch sẽ (DEFAULT_BOOKMARKS)
        // Tuyệt đối KHÔNG sao chép hay kế thừa từ tài khoản cũ!
        setShortcuts(DEFAULT_BOOKMARKS);
        cachedShortcutsMap.set(newEmail, DEFAULT_BOOKMARKS);
        AsyncStorage.setItem(`${STORAGE_SHORTCUTS_KEY}_${newEmail}`, JSON.stringify(DEFAULT_BOOKMARKS)).catch(() => {});
      }

      setBgImage(accBg || null);
      if (accTheme && THEME_PALETTES[accTheme]) {
        setCurrentThemeId(accTheme);
      } else {
        setCurrentThemeId('light');
      }
    } else if (syncAllAccounts) {
      // Khi bật đồng bộ: Dùng chung dữ liệu
      const [sharedShortcuts, sharedBg, sharedTheme] = await Promise.all([
        AsyncStorage.getItem(STORAGE_SHORTCUTS_KEY),
        AsyncStorage.getItem(STORAGE_BG_KEY),
        AsyncStorage.getItem(STORAGE_THEME_KEY),
      ]);

      if (sharedShortcuts) {
        try {
          const parsed = JSON.parse(sharedShortcuts);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setShortcuts(parsed);
            cachedShortcutsMap.set('__shared__', parsed);
          }
        } catch {}
      }
      setBgImage(sharedBg || null);
      if (sharedTheme && THEME_PALETTES[sharedTheme]) {
        setCurrentThemeId(sharedTheme);
      } else {
        setCurrentThemeId('light');
      }
    }

    const updated: UserProfile = {
      isLoggedIn: true,
      name: acc.name,
      email: acc.email,
      avatarUrl: acc.avatarUrl || '',
    };
    setUserProfile(updated);
    await AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(updated));

    if (onSwitchAccount) {
      onSwitchAccount(updated, userProfile);
    } else if (onUpdateProfile) {
      onUpdateProfile(updated);
    }

    setUserModalVisible(false);
    setIsDeleteMode(false);
    if (onShowToast) {
      onShowToast(`Đã chuyển sang: ${acc.name || acc.email}`);
    }
  };

  const loadSavedData = async () => {
    try {
      const [savedSyncStr] = await Promise.all([
        AsyncStorage.getItem(STORAGE_SYNC_ACCOUNTS_KEY),
      ]);
      const isSyncOn = savedSyncStr !== null ? JSON.parse(savedSyncStr) : (propSyncAllAccounts ?? false);
      setSyncAllAccounts(isSyncOn);

      const activeEmail = (propUserProfile?.email || userProfile.email)?.toLowerCase();
      const shortcutsKey = isSyncOn || !activeEmail ? STORAGE_SHORTCUTS_KEY : `${STORAGE_SHORTCUTS_KEY}_${activeEmail}`;
      const bgKey = isSyncOn || !activeEmail ? STORAGE_BG_KEY : `${STORAGE_BG_KEY}_${activeEmail}`;
      const themeKey = isSyncOn || !activeEmail ? STORAGE_THEME_KEY : `${STORAGE_THEME_KEY}_${activeEmail}`;

      const [savedShortcuts, savedBg, savedTheme, savedAccountsStr, savedUser] =
        await Promise.all([
          AsyncStorage.getItem(shortcutsKey),
          AsyncStorage.getItem(bgKey),
          AsyncStorage.getItem(themeKey),
          AsyncStorage.getItem(STORAGE_SAVED_ACCOUNTS_KEY),
          AsyncStorage.getItem(STORAGE_USER_KEY),
        ]);

      let loadedShortcuts: Bookmark[] | null = null;
      if (savedShortcuts) {
        try {
          const parsed = JSON.parse(savedShortcuts);
          if (Array.isArray(parsed) && parsed.length > 0) {
            loadedShortcuts = parsed;
          }
        } catch {}
      }

      // NẾU BẬT ĐỒNG BỘ TOÀN BỘ (isSyncOn === true):
      // Nếu chưa có lối tắt ở key hiện tại, mới tìm fallback ở key dùng chung STORAGE_SHORTCUTS_KEY
      if (isSyncOn && (!loadedShortcuts || loadedShortcuts.length === 0)) {
        try {
          const fallback = await AsyncStorage.getItem(STORAGE_SHORTCUTS_KEY);
          if (fallback) {
            const parsed = JSON.parse(fallback);
            if (Array.isArray(parsed) && parsed.length > 0) {
              loadedShortcuts = parsed;
            }
          }
        } catch {}
      }

      // Áp dụng lối tắt:
      // Nếu không bật đồng bộ và tài khoản chưa có lối tắt riêng -> DEFAULT_BOOKMARKS độc lập, không mượn tài khoản khác
      if (loadedShortcuts && loadedShortcuts.length > 0) {
        setShortcuts(loadedShortcuts);
        cachedShortcutsMap.set(activeEmail || '__shared__', loadedShortcuts);
      } else {
        setShortcuts(DEFAULT_BOOKMARKS);
        cachedShortcutsMap.set(activeEmail || '__shared__', DEFAULT_BOOKMARKS);
        AsyncStorage.setItem(shortcutsKey, JSON.stringify(DEFAULT_BOOKMARKS)).catch(() => {});
        if (isSyncOn) {
          AsyncStorage.setItem(STORAGE_SHORTCUTS_KEY, JSON.stringify(DEFAULT_BOOKMARKS)).catch(() => {});
        }
      }

      // Hình nền: Phải reset về null nếu tài khoản này không cài hình nền riêng
      setBgImage(savedBg || null);

      // Chủ đề: Phải reset về 'light' nếu tài khoản này không cài chủ đề riêng
      if (savedTheme && THEME_PALETTES[savedTheme]) {
        setCurrentThemeId(savedTheme);
      } else {
        setCurrentThemeId('light');
      }

      // Tải danh sách tài khoản đã lưu (chỉ tài khoản người dùng thực sự đăng nhập trên máy)
      if (savedAccountsStr) {
        try {
          const parsed = JSON.parse(savedAccountsStr);
          // Xóa triệt để danh sách mẫu 12 tài khoản cũ nếu có dính
          const isMockList =
            Array.isArray(parsed) &&
            parsed.some((a) => a.email === 'bactrv.52@gmail.com' && !a.avatarUrl);
          if (isMockList) {
            setSavedAccounts([]);
            await AsyncStorage.removeItem(STORAGE_SAVED_ACCOUNTS_KEY);
            await AsyncStorage.removeItem(STORAGE_USER_KEY);
            const resetUser = { isLoggedIn: false, name: '', email: '', avatarUrl: '' };
            setUserProfile(resetUser);
            if (onUpdateProfile) onUpdateProfile(resetUser);
          } else if (Array.isArray(parsed)) {
            setSavedAccounts(parsed);
          } else {
            setSavedAccounts([]);
          }
        } catch (e) {
          setSavedAccounts([]);
        }
      } else {
        setSavedAccounts([]);
      }
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          if (parsed && parsed.email && parsed.isLoggedIn) {
            if (parsed.email === 'bactrv.52@gmail.com' && !parsed.avatarUrl) {
              await AsyncStorage.removeItem(STORAGE_USER_KEY);
              const resetUser = { isLoggedIn: false, name: '', email: '', avatarUrl: '' };
              setUserProfile(resetUser);
              if (onUpdateProfile) onUpdateProfile(resetUser);
            } else {
              const cleanUser: UserProfile = {
                isLoggedIn: true,
                name:
                  parsed.name && !parsed.name.toLowerCase().includes('app store')
                    ? parsed.name
                    : parsed.email.split('@')[0],
                email: parsed.email,
                avatarUrl: isRealGooglePhoto(parsed.avatarUrl) ? parsed.avatarUrl : '',
              };
              setUserProfile(cleanUser);
              setSavedAccounts((prev) => {
                if (cleanUser.email && !prev.some((a) => a.email?.toLowerCase() === cleanUser.email?.toLowerCase())) {
                  const updatedList = [cleanUser, ...prev];
                  AsyncStorage.setItem(STORAGE_SAVED_ACCOUNTS_KEY, JSON.stringify(updatedList)).catch(() => {});
                  return updatedList;
                }
                return prev;
              });
            }
          } else {
            setUserProfile({ isLoggedIn: false, name: '', email: '', avatarUrl: '' });
          }
        } catch (err) {
          setUserProfile({ isLoggedIn: false, name: '', email: '', avatarUrl: '' });
        }
      } else {
        setUserProfile({ isLoggedIn: false, name: '', email: '', avatarUrl: '' });
      }
    } catch (e) {
      console.log('Error loading saved home data:', e);
    }
  };

  const saveShortcuts = async (newList: Bookmark[]) => {
    const activeEmail = (userProfile.email || propUserProfile?.email)?.toLowerCase();
    cachedShortcutsMap.set(activeEmail || '__shared__', newList);
    setShortcuts(newList);
    try {
      const key = syncAllAccounts || !activeEmail ? STORAGE_SHORTCUTS_KEY : `${STORAGE_SHORTCUTS_KEY}_${activeEmail}`;
      await AsyncStorage.setItem(key, JSON.stringify(newList));
      if (syncAllAccounts) {
        await AsyncStorage.setItem(STORAGE_SHORTCUTS_KEY, JSON.stringify(newList));
      }
    } catch (e) {
      console.log('Error saving shortcuts:', e);
    }
  };

  const handleResetShortcuts = () => {
    Alert.alert(
      'Đặt lại lối tắt?',
      'Khôi phục danh sách lối tắt mặc định ban đầu cho tài khoản này?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đặt lại',
          style: 'destructive',
          onPress: () => {
            saveShortcuts(DEFAULT_BOOKMARKS);
            if (onShowToast) onShowToast('Đã khôi phục lối tắt mặc định');
          },
        },
      ]
    );
  };

  // Chọn hình nền từ thư viện ảnh và lưu dạng Base64 vĩnh viễn (không bao giờ bị mất khi reload app)
  const handlePickBgImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Quyền truy cập', 'Vui lòng cấp quyền truy cập ảnh để chọn hình nền.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const persistentUri = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        setBgImage(persistentUri);
        const email = userProfile.email?.toLowerCase();
        const key = syncAllAccounts || !email ? STORAGE_BG_KEY : `${STORAGE_BG_KEY}_${email}`;
        await AsyncStorage.setItem(key, persistentUri);
      }
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể chọn ảnh làm hình nền.');
    }
  };

  const handleResetBg = async () => {
    setBgImage(null);
    const email = userProfile.email?.toLowerCase();
    const key = syncAllAccounts || !email ? STORAGE_BG_KEY : `${STORAGE_BG_KEY}_${email}`;
    await AsyncStorage.removeItem(key);
  };

  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const isPullingRef = useRef(false);
  const scrollYRef = useRef(0);

  const handleTouchStart = (e: any) => {
    touchStartY.current = e.nativeEvent.pageY;
    touchStartX.current = e.nativeEvent.pageX;
    isPullingRef.current = false;
  };

  const handleTouchMove = (e: any) => {
    const currentY = e.nativeEvent.pageY;
    const currentX = e.nativeEvent.pageX;
    const dy = currentY - touchStartY.current;
    const dx = currentX - touchStartX.current;

    if (isPullingRef.current) {
      if (dy > 0) {
        if (onPullMove) onPullMove(dy, dx);
      } else {
        isPullingRef.current = false;
        if (onPullCancel) onPullCancel();
      }
    } else if (scrollYRef.current <= 5 && dy > 12) {
      if (dy > Math.abs(dx) * 0.7) {
        isPullingRef.current = true;
        if (onPullMove) onPullMove(dy, dx);
      }
    }
  };

  const handleTouchEnd = () => {
    if (isPullingRef.current) {
      isPullingRef.current = false;
      if (onPullEnd) onPullEnd();
    }
  };

  const handleAddShortcut = async () => {
    if (!newTitle.trim() || !newUrl.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tên và địa chỉ web.');
      return;
    }
    if (shortcuts.length >= 10) {
      Alert.alert('Đã đạt giới hạn', 'Bạn chỉ có thể thêm tối đa 10 lối tắt.');
      return;
    }
    let url = newUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    const newBookmark: Bookmark = {
      id: Date.now().toString(),
      title: newTitle.trim(),
      url: url,
    };
    const updated = [...shortcuts, newBookmark];
    await saveShortcuts(updated);
    setNewTitle('');
    setNewUrl('');
    setAddModalVisible(false);
  };

  const handleDeleteShortcut = async (id: string) => {
    const updated = shortcuts.filter((item) => item.id !== id);
    await saveShortcuts(updated);
  };

  const handleSaveUser = async () => {
    const updated: UserProfile = {
      isLoggedIn: true,
      name: inputUserName.trim() || 'Người dùng',
      email: userProfile.email || '',
      avatarUrl: userProfile.avatarUrl || '',
    };
    setUserProfile(updated);
    await AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(updated));
    if (onUpdateProfile) onUpdateProfile(updated);
    setUserModalVisible(false);
  };

  const handlePickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const persistentUri = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        const updated: UserProfile = {
          ...userProfile,
          isLoggedIn: true,
          avatarUrl: persistentUri,
        };
        setUserProfile(updated);
        await AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(updated));
        if (onUpdateProfile) onUpdateProfile(updated);
      }
    } catch (e) {}
  };

  const handleLogout = async () => {
    // Xóa tài khoản hiện tại khỏi danh sách tài khoản đã lưu
    const remaining = savedAccounts.filter(
      (a) => a.email?.toLowerCase() !== userProfile.email?.toLowerCase()
    );
    setSavedAccounts(remaining);
    await AsyncStorage.setItem(STORAGE_SAVED_ACCOUNTS_KEY, JSON.stringify(remaining));

    if (remaining.length > 0) {
      // Chuyển sang tài khoản kế tiếp trong danh sách
      const nextAcc = remaining[0];
      const nextUser: UserProfile = {
        isLoggedIn: true,
        name: nextAcc.name,
        email: nextAcc.email,
        avatarUrl: nextAcc.avatarUrl || '',
      };
      setUserProfile(nextUser);
      await AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(nextUser));
      if (onUpdateProfile) onUpdateProfile(nextUser);
      if (onShowToast) {
        onShowToast(`Đã chuyển sang: ${nextAcc.name || nextAcc.email}`);
      }
    } else {
      const reset: UserProfile = { isLoggedIn: false, name: '', email: '', avatarUrl: '' };
      setUserProfile(reset);
      await AsyncStorage.removeItem(STORAGE_USER_KEY);
      if (onUpdateProfile) onUpdateProfile(reset);
      if (onShowToast) {
        onShowToast('Đã đăng xuất tài khoản');
      }
      onSelectUrl('https://accounts.google.com/Logout');
    }
    setUserModalVisible(false);
  };

  const getFaviconUrl = (url: string) => {
    return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url)}`;
  };

  const handleSelectTheme = async (themeId: string) => {
    setCurrentThemeId(themeId);
    const email = userProfile.email?.toLowerCase();
    const key = syncAllAccounts || !email ? STORAGE_THEME_KEY : `${STORAGE_THEME_KEY}_${email}`;
    await AsyncStorage.setItem(key, themeId);
    if (userProfile.isLoggedIn && (userProfile.id || email)) {
      saveCloudSettings(
        userProfile.id || email!,
        { themeId },
        email
      ).catch(() => {});
    }
    if (onShowToast) {
      onShowToast(`Đã áp dụng chủ đề: ${THEME_PALETTES[themeId]?.name || themeId}`);
    }
  };

  const activeTheme = THEME_PALETTES[currentThemeId] || THEME_PALETTES.light;
  const themeBg = isIncognito ? '#202124' : activeTheme.bg;
  const themeCard = isIncognito ? '#2d2f31' : activeTheme.card;
  const themeCardGlass = isIncognito ? 'rgba(45, 47, 49, 0.88)' : activeTheme.cardGlass;
  const themeText = isIncognito ? '#e8eaed' : activeTheme.textColor;
  const themeSub = isIncognito ? '#9aa0a6' : activeTheme.subColor;
  const themeAccent = isIncognito ? '#93c5fd' : activeTheme.accent;

  const renderNormalContent = () => (
    <ScrollView
      style={[
        styles.scroll,
        { backgroundColor: 'transparent' },
      ]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: topInset + 8,
          transform: [{ translateY: Math.min((pullDistance || 0) * 0.45, 50) }],
        },
      ]}
      showsVerticalScrollIndicator={false}
      canCancelContentTouches={true}
      keyboardShouldPersistTaps="handled"
      onScroll={(e) => {
        scrollYRef.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => {
        if (isPullingRef.current) {
          isPullingRef.current = false;
          if (onPullCancel) onPullCancel();
        }
      }}
    >
      <Animated.View
        style={{
          flex: 1,
          opacity: opacityAnim,
          transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
        }}
      >
      {/* THANH TRÊN CÙNG: NÚT 3 CHẤM BÊN TRÁI, USER BÊN PHẢI */}
      <View style={styles.topBar}>
        {/* Nút 3 chấm bên trái mở Tùy chỉnh (Đổi theme màu, công cụ tìm kiếm, hình nền) */}
        <TouchableOpacity
          style={[styles.menuBtn, bgImage ? styles.menuBtnGlass : null]}
          onPress={() => setEngineModalVisible(true)}
          activeOpacity={0.7}
        >
          {bgImage ? (
            <BlurView
              intensity={Platform.OS === 'ios' ? 60 : 85}
              tint="light"
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          <Feather name="more-horizontal" size={20} color="#09090b" />
        </TouchableOpacity>

        {/* User profile bên phải */}
        <View style={styles.topRightArea}>
          {onScanQr && (
            <TouchableOpacity
              style={[styles.menuBtn, bgImage ? styles.menuBtnGlass : null, { marginRight: 10 }]}
              onPress={onScanQr}
              activeOpacity={0.7}
            >
              {bgImage ? (
                <BlurView
                  intensity={Platform.OS === 'ios' ? 60 : 85}
                  tint="light"
                  style={StyleSheet.absoluteFill}
                />
              ) : null}
              <Feather name="maximize" size={17} color="#09090b" />
            </TouchableOpacity>
          )}

          {userProfile.isLoggedIn ? (
            <TouchableOpacity
              style={[styles.userAvatarBtn, bgImage ? styles.userAvatarBtnGlass : null]}
              onPress={() => setUserModalVisible(true)}
              activeOpacity={0.8}
            >
              {userProfile.avatarUrl && isRealGooglePhoto(userProfile.avatarUrl) ? (
                <Image source={{ uri: userProfile.avatarUrl }} style={styles.avatarImg} />
              ) : (
                <View
                  style={[
                    styles.avatarFallback,
                    { backgroundColor: getAvatarBgColor(userProfile.email, userProfile.name) },
                  ]}
                >
                  <Text style={styles.avatarLetter}>
                    {getAvatarLetter()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.userAvatarBtn, bgImage ? styles.userAvatarBtnGlass : null]}
              onPress={() => setUserModalVisible(true)}
              activeOpacity={0.8}
            >
              <View style={[styles.avatarFallback, { backgroundColor: '#ffffff' }]}>
                <Feather name="user" size={17} color="#09090b" />
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>



      {/* KHỐI ĐỒNG HỒ SỐ TO, NGÀY THÁNG & THỜI TIẾT TẠI NGŨ HÀNH SƠN (ĐƠN GIẢN, TINH TẾ NHƯ ẢNH MẪU) */}
      <View style={styles.simpleHeaderWidget}>
        {/* Hàng trên cùng: Thời tiết góc trái */}
        <View style={styles.simpleWeatherRowContainer}>
          <TouchableOpacity
            style={styles.simpleWeatherBlock}
            onPress={() => onSelectUrl(`${currentEngine.searchUrl}${encodeURIComponent('thời tiết ' + weather.location)}`)}
            activeOpacity={0.75}
            delayPressIn={0}
          >
            <View style={styles.simpleWeatherRow}>
              <MaterialCommunityIcons
                name={weatherDetails.mcIconName}
                size={24}
                color={weatherDetails.iconColor}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.simpleWeatherTemp, { color: bgImage ? '#ffffff' : themeText }]}>
                {Math.round(weather.temp)}°C
              </Text>
            </View>
            <Text style={[styles.simpleWeatherLocation, { color: bgImage ? 'rgba(255, 255, 255, 0.8)' : themeSub }]}>
              {weather.location}
            </Text>
          </TouchableOpacity>
        </View>


        {/* Giờ số to và Ngày tháng năm tiếng Việt căn giữa màn hình (có khoảng cách margin thoáng đãng với thời tiết) */}
        <View style={styles.simpleClockBlock}>
          <Text style={[styles.simpleClockText, { color: bgImage ? '#ffffff' : themeText }]}>
            {formatClockTime(currentTime)}
          </Text>
          <Text style={[styles.simpleDateText, { color: bgImage ? 'rgba(255, 255, 255, 0.85)' : themeSub }]}>
            {formatVietnameseDate(currentTime)}
          </Text>
        </View>
      </View>

      {/* THANH TÌM KIẾM BÊN DƯỚI THỜI TIẾT - BLUR ĐẬM CHUẨN CHROME */}
      <TouchableOpacity
        style={[
          styles.homeSearchPill,
          {
            backgroundColor: bgImage
              ? 'rgba(255, 255, 255, 0.78)'
              : isIncognito
              ? '#2d2f31'
              : '#ffffff',
            borderColor: bgImage
              ? 'rgba(255, 255, 255, 0.65)'
              : isIncognito
              ? '#3c4043'
              : 'rgba(0, 0, 0, 0.08)',
          },
        ]}
        onPress={onFocusSearch}
        activeOpacity={0.85}
        delayPressIn={0}
      >
        {bgImage && (
          <BlurView
            intensity={Platform.OS === 'ios' ? 70 : 90}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
        )}
        {/* Icon công cụ tìm kiếm bên trái */}
        <TouchableOpacity
          onPress={() => setEngineModalVisible(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ marginRight: 12 }}
          activeOpacity={0.7}
        >
          {currentEngineId === 'google' ? (
            <GoogleGIcon size={24} />
          ) : (
            <Image
              source={{ uri: currentEngine.logoUrl }}
              style={{ width: 24, height: 24 }}
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>

        {/* Text gợi ý tìm kiếm ở giữa */}
        <Text
          style={[
            styles.homeSearchPlaceholder,
            { color: isIncognito ? '#9aa0a6' : '#5f6368' },
          ]}
          numberOfLines={1}
        >
          Tìm kiếm hoặc nhập URL
        </Text>

        {/* Cụm icon bên phải: Tìm kiếm bằng giọng nói (Mic) & Quét ảnh Google Lens (Lens) */}
        <View style={styles.homeSearchRightGroup}>
          <TouchableOpacity
            onPress={() => setVoiceModalVisible(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Feather name="mic" size={20} color={isIncognito ? '#9aa0a6' : '#5f6368'} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onSearchByImage}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ marginLeft: 14 }}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="google-lens" size={21} color={isIncognito ? '#9aa0a6' : '#5f6368'} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* CARD 1: LỐI TẮT HÌNH TRÒN TRÊN 1 ROW CUỘN NGANG (CHUẨN CHROME IOS) */}
      <View
        style={[
          styles.chromeCardContainer,
          {
            backgroundColor: bgImage ? themeCardGlass : themeCard,
          },
        ]}
      >
        {bgImage && (
          <BlurView
            intensity={Platform.OS === 'ios' ? 70 : 90}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
        )}
        <View style={[styles.chromeCardHeaderRow, { paddingHorizontal: iconInset }]}>
          <Text style={[styles.chromeCardTitle, { color: themeText }]}>Lối tắt</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {isEditMode && (
              <TouchableOpacity
                onPress={handleResetShortcuts}
                hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
              >
                <Text style={[styles.editToggleText, { color: '#ff3b30' }]}>Khôi phục</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setIsEditMode(!isEditMode)}
              hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
            >
              <Text style={[styles.editToggleText, { color: isEditMode ? '#007aff' : themeSub }]}>
                {isEditMode ? 'Xong' : 'Sửa'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          canCancelContentTouches={true}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.circleShortcutsScrollContent, { paddingHorizontal: 0, gap: 0 }]}
        >
          {shortcuts.map((item) => (
            <View key={item.id} style={[styles.circleShortcutCol, { width: slotWidth }]}>
              <TouchableOpacity
                style={styles.circleShortcutIconBox}
                onPress={() => onSelectUrl(item.url)}
                onPressIn={() => preconnectTarget(item.url)}
                activeOpacity={0.7}
                delayPressIn={0}
              >
                {renderShortcutIcon(item)}
                {isEditMode && (
                  <TouchableOpacity
                    style={styles.circleDeleteBadge}
                    onPress={() => handleDeleteShortcut(item.id)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    delayPressIn={0}
                  >
                    <Feather name="x" size={10} color="#ffffff" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
              <Text
                style={[styles.circleShortcutTitle, { color: themeText }]}
                numberOfLines={1}
              >
                {item.title}
              </Text>
            </View>
          ))}

          {/* Nút Thêm lối tắt hình tròn */}
          <View style={[styles.circleShortcutCol, { width: slotWidth }]}>
            <TouchableOpacity
              style={styles.circleAddIconBox}
              onPress={() => setAddModalVisible(true)}
              activeOpacity={0.7}
              delayPressIn={0}
            >
              <Feather name="plus" size={24} color="#007aff" />
            </TouchableOpacity>
            <Text style={[styles.circleShortcutTitle, { color: themeText }]}>
              Thêm
            </Text>
          </View>
        </ScrollView>
      </View>

      {/* CARD 2: TIỆN ÍCH LỐI TẮT HỆ THỐNG (DẤU TRANG, NHẬT KÝ, THẺ, HÌNH NỀN) */}
      <View
        style={[
          styles.chromeCardContainer,
          {
            backgroundColor: bgImage ? themeCardGlass : themeCard,
          },
        ]}
      >
        {bgImage && (
          <BlurView
            intensity={Platform.OS === 'ios' ? 70 : 90}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
        )}
        <View style={[styles.toolsRow, { paddingHorizontal: 0, justifyContent: 'flex-start' }]}>
          <TouchableOpacity
            style={[styles.toolCol, { width: slotWidth, flex: 0 }]}
            onPress={onOpenBookmarks}
            activeOpacity={0.7}
            delayPressIn={0}
          >
            <View style={styles.toolIconBox}>
              <Feather name="bookmark" size={22} color="#1f2024" />
            </View>
            <Text style={[styles.toolLabel, { color: themeText }]} numberOfLines={1}>
              Dấu trang
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toolCol, { width: slotWidth, flex: 0 }]}
            onPress={onOpenHistory}
            activeOpacity={0.7}
            delayPressIn={0}
          >
            <View style={styles.toolIconBox}>
              <Feather name="clock" size={22} color="#1f2024" />
            </View>
            <Text style={[styles.toolLabel, { color: themeText }]} numberOfLines={1}>
              Nhật ký
            </Text>
          </TouchableOpacity>

          {onOpenTabs && (
            <TouchableOpacity
              style={[styles.toolCol, { width: slotWidth, flex: 0 }]}
              onPress={onOpenTabs}
              activeOpacity={0.7}
              delayPressIn={0}
            >
              <View style={styles.toolIconBox}>
                <Feather name="layers" size={22} color="#1f2024" />
              </View>
              <Text style={[styles.toolLabel, { color: themeText }]} numberOfLines={1}>
                Thẻ duyệt
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.toolCol, { width: slotWidth, flex: 0 }]}
            onPress={handlePickBgImage}
            activeOpacity={0.7}
            delayPressIn={0}
          >
            <View style={styles.toolIconBox}>
              <Feather name="image" size={22} color="#1f2024" />
            </View>
            <Text style={[styles.toolLabel, { color: themeText }]} numberOfLines={1}>
              Hình nền
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* CARD 3: KHÁM PHÁ (TIÊU ĐỀ & ICON RELOAD TRONG CÙNG 1 CONTAINER BLUR ĐẬM VỚI BÀI BÁO) */}
      <View
        style={[
          styles.chromeCardContainer,
          styles.discoverCardContainer,
          {
            backgroundColor: bgImage ? themeCardGlass : themeCard,
          },
        ]}
      >
        {bgImage && (
          <BlurView
            intensity={Platform.OS === 'ios' ? 70 : 90}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
        )}
        {/* Tiêu đề Khám phá & Nút làm mới nằm TRONG container */}
        <View style={[styles.chromeCardHeaderRow, { paddingHorizontal: iconInset }]}>
          <Text style={[styles.chromeCardTitle, { color: themeText }]}>Khám phá</Text>
          <TouchableOpacity
            style={styles.discoverCardRefreshBtn}
            onPress={() => fetchDiscoverFeed(true)}
            disabled={isRefreshingDiscover}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.65}
          >
            <Animated.View
              style={{
                transform: [
                  {
                    rotate: discoverSpinAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '360deg'],
                    }),
                  },
                ],
              }}
            >
              <Feather name="rotate-cw" size={15} color={themeSub} />
            </Animated.View>
          </TouchableOpacity>
        </View>

        {/* Danh sách bài báo tạp chí cao cấp: xen kẽ Hero Image lớn & Compact Cards */}
        <View style={styles.discoverArticlesWrapper}>
          {discoverArticles.map((article, idx) => {
            const isLast = idx === discoverArticles.length - 1;

            if (article.layout === 'hero') {
              return (
                <TouchableOpacity
                  key={article.id}
                  style={[
                    styles.discoverHeroCard,
                    !isLast && styles.discoverArticleDivider,
                  ]}
                  onPress={() => onSelectUrl(article.url)}
                  activeOpacity={0.82}
                  delayPressIn={0}
                >
                  <Image
                    source={{ uri: article.imageUrl }}
                    style={styles.discoverHeroImage}
                    resizeMode="cover"
                  />
                  <Text
                    style={[styles.discoverHeroTitle, { color: themeText }]}
                    numberOfLines={3}
                  >
                    {article.title}
                  </Text>
                  <View style={styles.discoverMetaRow}>
                    <Text style={[styles.discoverArticleMeta, { color: themeSub }]}>
                      {article.source} • {article.timeAgo}
                    </Text>
                    <Feather name="more-horizontal" size={16} color={themeSub} />
                  </View>
                </TouchableOpacity>
              );
            }

            return (
              <TouchableOpacity
                key={article.id}
                style={[
                  styles.discoverArticleRow,
                  !isLast && styles.discoverArticleDivider,
                ]}
                onPress={() => onSelectUrl(article.url)}
                activeOpacity={0.75}
                delayPressIn={0}
              >
                <View style={styles.discoverArticleLeft}>
                  <Text
                    style={[styles.discoverArticleTitle, { color: themeText }]}
                    numberOfLines={3}
                  >
                    {article.title}
                  </Text>
                  <View style={styles.discoverMetaRow}>
                    <Text
                      style={[styles.discoverArticleMeta, { color: themeSub }]}
                      numberOfLines={1}
                    >
                      {article.source} • {article.timeAgo}
                    </Text>
                  </View>
                </View>
                <Image
                  source={{ uri: article.imageUrl }}
                  style={styles.discoverArticleThumb}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      </Animated.View>
    </ScrollView>
  );

  const renderIncognitoContent = () => (
    <ScrollView
      style={[
        styles.scroll,
        { backgroundColor: '#202124' },
      ]}
      contentContainerStyle={[
        styles.incognitoScrollContent,
        {
          paddingTop: topInset + 6,
          paddingBottom: bottomInset + 30,
          transform: [{ translateY: Math.min((pullDistance || 0) * 0.45, 50) }],
        },
      ]}
      showsVerticalScrollIndicator={false}
      canCancelContentTouches={true}
      keyboardShouldPersistTaps="handled"
      onScroll={(e) => {
        scrollYRef.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => {
        if (isPullingRef.current) {
          isPullingRef.current = false;
          if (onPullCancel) onPullCancel();
        }
      }}
    >
      <Animated.View
        style={{
          flex: 1,
          opacity: opacityAnim,
          transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
        }}
      >
        {/* Top Header Row: 3 gạch & QR scanner & PIN Status */}
        <View style={styles.incognitoTopBar}>
          <TouchableOpacity
            style={styles.incognitoMenuBtn}
            onPress={() => setEngineModalVisible(true)}
            activeOpacity={0.7}
          >
            <Feather name="more-horizontal" size={20} color="#e8eaed" />
          </TouchableOpacity>

          <View style={styles.topRightArea}>
            {onScanQr && (
              <TouchableOpacity
                style={[styles.incognitoMenuBtn, { marginRight: 8 }]}
                onPress={onScanQr}
                activeOpacity={0.7}
              >
                <Feather name="maximize" size={17} color="#e8eaed" />
              </TouchableOpacity>
            )}

            {incognitoPin ? (
              <TouchableOpacity
                style={styles.incognitoMenuBtn}
                onPress={onOpenPinSettings}
                activeOpacity={0.7}
              >
                <Feather name="lock" size={17} color="#22c55e" />
              </TouchableOpacity>
            ) : onOpenPinSettings ? (
              <TouchableOpacity
                style={styles.incognitoMenuBtn}
                onPress={onOpenPinSettings}
                activeOpacity={0.7}
              >
                <Feather name="shield" size={17} color="#9aa0a6" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Thanh tìm kiếm trên cùng của trang ẩn danh */}
        <TouchableOpacity
          style={styles.incognitoSearchPill}
          onPress={onFocusSearch}
          activeOpacity={0.8}
          delayPressIn={0}
        >
          {currentEngineId === 'google' ? (
            <GoogleGIcon size={20} />
          ) : (
            <Image
              source={{ uri: currentEngine.logoUrl }}
              style={styles.incognitoEngineLogo}
              resizeMode="contain"
            />
          )}
          <Text style={styles.incognitoSearchPlaceholder} numberOfLines={1}>
            Tìm trên {currentEngine.name} hoặc nhập URL
          </Text>
          <View style={styles.homeSearchRightGroup}>
            <TouchableOpacity
              onPress={() => setVoiceModalVisible(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
            >
              <Feather name="mic" size={19} color="#9aa0a6" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSearchByImage}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ marginLeft: 14 }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="google-lens" size={20} color="#9aa0a6" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {/* Khung nội dung chính của Chế độ Ẩn danh Kite */}
        <View style={styles.incognitoMainCard}>
          {/* Biểu tượng riêng tư Kite: bg trắng, icon đen */}
          <View style={styles.incognitoAvatarCircle}>
            <Feather name="eye-off" size={38} color="#09090b" />
          </View>

          {/* Tiêu đề chính */}
          <Text style={styles.incognitoTitle}>Duyệt web riêng tư</Text>

          {/* Đoạn văn giới thiệu ngắn gọn */}
          <Text style={styles.incognitoParagraph}>
            Kite bảo vệ quyền riêng tư của bạn bằng cách không lưu lại nhật ký duyệt web, cookie hay dữ liệu biểu mẫu. Mọi dấu vết sẽ tự động xóa khi bạn đóng tab.
          </Text>

          {/* Khối tính năng bảo mật nổi bật của Kite */}
          <View style={styles.incognitoFeatureCard}>
            <View style={styles.incognitoFeatureRow}>
              <View style={styles.incognitoFeatureIconBox}>
                <Feather name="trash-2" size={19} color="#9aa0a6" />
              </View>
              <View style={styles.incognitoFeatureTextBox}>
                <Text style={styles.incognitoFeatureTitle}>Tự động dọn sạch</Text>
                <Text style={styles.incognitoFeatureSub}>
                  Lịch sử và cookie được xóa hoàn toàn khi đóng tab
                </Text>
              </View>
            </View>

            <View style={styles.incognitoFeatureDivider} />

            <View style={styles.incognitoFeatureRow}>
              <View style={styles.incognitoFeatureIconBox}>
                <Feather name="shield" size={19} color="#9aa0a6" />
              </View>
              <View style={styles.incognitoFeatureTextBox}>
                <Text style={styles.incognitoFeatureTitle}>Chặn trình theo dõi</Text>
                <Text style={styles.incognitoFeatureSub}>
                  Ngăn các mạng quảng cáo theo dõi liên trang
                </Text>
              </View>
            </View>

            <View style={styles.incognitoFeatureDivider} />

            <View style={styles.incognitoFeatureRow}>
              <View style={styles.incognitoFeatureIconBox}>
                <Feather name="lock" size={19} color="#9aa0a6" />
              </View>
              <View style={styles.incognitoFeatureTextBox}>
                <Text style={styles.incognitoFeatureTitle}>Bảo vệ bằng mã PIN</Text>
                <Text style={styles.incognitoFeatureSub}>
                  Khóa an toàn các tab riêng tư trước người lạ
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.incognitoFootnote}>
            Lưu ý: Trang web bạn truy cập hoặc nhà mạng vẫn có thể nhận diện kết nối của thiết bị.
          </Text>
        </View>
      </Animated.View>
    </ScrollView>
  );

  const renderContent = () => {
    if (isIncognito) {
      return renderIncognitoContent();
    }
    return renderNormalContent();
  };

  return (
    <View style={[styles.container, { backgroundColor: themeBg }]}>
      {bgImage && !isIncognito && (
        <ImageBackground
          source={{ uri: bgImage }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      )}
      {renderContent()}

      {/* MODAL TÌM KIẾM BẰNG GIỌNG NÓI TIẾNG VIỆT */}
      <VoiceSearchModal
        visible={voiceModalVisible}
        onClose={() => setVoiceModalVisible(false)}
        onSearch={(query) => {
          const searchUrl = `${currentEngine.searchUrl}${encodeURIComponent(query)}`;
          onSelectUrl(searchUrl);
        }}
        currentEngineName={currentEngine.name}
      />

      {/* 1. BOTTOM SHEET CHỌN CÔNG CỤ TÌM KIẾM */}
      <Modal
        visible={engineModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEngineModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setEngineModalVisible(false)}
        >
          <TouchableOpacity
            style={[styles.bottomSheetContainer, { paddingBottom: Math.max(bottomInset, 28) }]}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetDragHandle} />

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: Dimensions.get('window').height * 0.72 }}>
              {/* MỤC 1: CHỦ ĐỀ & MÀU SẮC (THEME) - ẨN KHI Ở ẨN DANH */}
              {!isIncognito && (
                <>
                  <Text style={styles.sheetSubHeader}>Chủ đề & Màu sắc</Text>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.themeScrollContainer}
                  >
                    {Object.values(THEME_PALETTES).map((pal) => {
                      const isSelected = pal.id === currentThemeId;
                      return (
                        <TouchableOpacity
                          key={pal.id}
                          style={[
                            styles.themeCardItem,
                            isSelected && [styles.themeCardItemSelected, { borderColor: pal.accent }],
                          ]}
                          onPress={() => handleSelectTheme(pal.id)}
                          activeOpacity={0.75}
                        >
                          {/* Hộp xem trước màu sắc */}
                          <View style={[styles.themePreviewBox, { backgroundColor: pal.previewBg }]}>
                            <View
                              style={[
                                styles.themePreviewInnerCard,
                                { backgroundColor: pal.previewCard },
                              ]}
                            >
                              {isSelected && (
                                <Feather name="check" size={14} color={pal.accent} />
                              )}
                            </View>
                          </View>
                          <Text
                            style={[
                              styles.themeItemName,
                              isSelected && { color: pal.accent, fontWeight: '700' },
                            ]}
                            numberOfLines={1}
                          >
                            {pal.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              )}

              {/* MỤC 2: CÔNG CỤ TÌM KIẾM (GRID 2x2 TIẾT KIỆM KHÔNG GIAN) */}
              <Text style={[styles.sheetSubHeader, !isIncognito && { marginTop: 14 }]}>Công cụ tìm kiếm</Text>
              <View style={styles.engineGridContainer}>
                {Object.values(SEARCH_ENGINES).map((eng) => {
                  const isSelected = eng.id === currentEngineId;
                  return (
                    <TouchableOpacity
                      key={eng.id}
                      style={[styles.engineGridItem, isSelected && styles.engineGridItemSelected]}
                      onPress={() => {
                        onChangeEngine(eng.id as any);
                        setEngineModalVisible(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Image
                        source={{ uri: eng.logoUrl }}
                        style={styles.engineGridLogo}
                        resizeMode="contain"
                      />
                      <Text
                        style={[styles.engineGridName, isSelected && styles.engineGridNameSelected]}
                        numberOfLines={1}
                      >
                        {eng.name}
                      </Text>
                      {isSelected && <Feather name="check" size={16} color="#007aff" />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* MỤC 3: HÌNH NỀN & BẢO MẬT (ĐỒNG BỘ THEO PHONG CÁCH BROWSER MENU SHEET) */}
              <Text style={[styles.sheetSubHeader, { marginTop: 14 }]}>
                {isIncognito ? 'Bảo mật & Tiện ích' : 'Tùy chọn & Bảo mật'}
              </Text>
              <View style={styles.groupedOptionContainer}>
                {/* 1. Hình nền trang chủ - ẨN KHI Ở ẨN DANH */}
                {!isIncognito && (
                  <>
                    <TouchableOpacity
                      style={styles.groupedOptionRow}
                      onPress={() => {
                        handlePickBgImage();
                        setEngineModalVisible(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.bgOptionTitle}>Hình nền trang chủ</Text>
                      <Feather name="image" size={20} color={theme.colors.grayDark} />
                    </TouchableOpacity>

                    {bgImage && (
                      <>
                        <View style={styles.horizontalDivider} />
                        <TouchableOpacity
                          style={styles.groupedOptionRow}
                          onPress={() => {
                            handleResetBg();
                            setEngineModalVisible(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.bgOptionTitle}>Xóa hình nền hiện tại</Text>
                          <Feather name="trash-2" size={20} color={theme.colors.grayDark} />
                        </TouchableOpacity>
                      </>
                    )}

                    <View style={styles.horizontalDivider} />
                  </>
                )}

                {/* 2. Mã PIN bảo mật thẻ ẩn danh */}
                <TouchableOpacity
                  style={styles.groupedOptionRow}
                  onPress={() => {
                    setEngineModalVisible(false);
                    if (onOpenPinSettings) onOpenPinSettings();
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.bgOptionTitle}>Mã PIN cho ẩn danh</Text>
                  <Feather
                    name={incognitoPin ? 'lock' : 'shield'}
                    size={20}
                    color={theme.colors.grayDark}
                  />
                </TouchableOpacity>

                {/* 3. Tệp đã tải xuống */}
                {onOpenDownloads && (
                  <>
                    <View style={styles.horizontalDivider} />
                    <TouchableOpacity
                      style={styles.groupedOptionRow}
                      onPress={() => {
                        setEngineModalVisible(false);
                        onOpenDownloads();
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.bgOptionTitle}>Tệp đã tải xuống</Text>
                      <Feather name="download" size={20} color={theme.colors.grayDark} />
                    </TouchableOpacity>
                  </>
                )}

                {/* 4. Trình quản lý mật khẩu */}
                {onOpenPasswordManager && (
                  <>
                    <View style={styles.horizontalDivider} />
                    <TouchableOpacity
                      style={styles.groupedOptionRow}
                      onPress={() => {
                        setEngineModalVisible(false);
                        onOpenPasswordManager();
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.bgOptionTitle}>Trình quản lý mật khẩu</Text>
                      <Feather name="key" size={20} color={theme.colors.grayDark} />
                    </TouchableOpacity>
                  </>
                )}

                {/* 5. Tiện ích mở rộng (Extensions) */}
                {onOpenExtensions && (
                  <>
                    <View style={styles.horizontalDivider} />
                    <TouchableOpacity
                      style={styles.groupedOptionRow}
                      onPress={() => {
                        setEngineModalVisible(false);
                        onOpenExtensions();
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.bgOptionTitle}>Tiện ích mở rộng</Text>
                      <Feather name="box" size={20} color={theme.colors.grayDark} />
                    </TouchableOpacity>
                  </>
                )}

                {/* 6. Dấu trang */}
                {onOpenBookmarks && (
                  <>
                    <View style={styles.horizontalDivider} />
                    <TouchableOpacity
                      style={styles.groupedOptionRow}
                      onPress={() => {
                        setEngineModalVisible(false);
                        onOpenBookmarks();
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.bgOptionTitle}>Dấu trang</Text>
                      <Feather name="bookmark" size={20} color={theme.colors.grayDark} />
                    </TouchableOpacity>
                  </>
                )}

                {/* 7. Lịch sử duyệt web - ẨN KHI Ở ẨN DANH */}
                {!isIncognito && onOpenHistory && (
                  <>
                    <View style={styles.horizontalDivider} />
                    <TouchableOpacity
                      style={styles.groupedOptionRow}
                      onPress={() => {
                        setEngineModalVisible(false);
                        onOpenHistory();
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.bgOptionTitle}>Lịch sử duyệt web</Text>
                      <Feather name="clock" size={20} color={theme.colors.grayDark} />
                    </TouchableOpacity>
                  </>
                )}

                {/* 8. Bộ nhớ & Bộ nhớ đệm */}
                {onOpenStorageManager && (
                  <>
                    <View style={styles.horizontalDivider} />
                    <TouchableOpacity
                      style={styles.groupedOptionRow}
                      onPress={() => {
                        setEngineModalVisible(false);
                        onOpenStorageManager();
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.bgOptionTitle}>Bộ nhớ & Bộ nhớ đệm</Text>
                      <Feather name="pie-chart" size={20} color={theme.colors.grayDark} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* 2. BOTTOM SHEET QUẢN LÝ TÀI KHOẢN GOOGLE */}
      <Modal
        visible={userModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setUserModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setUserModalVisible(false)}
        >
          <TouchableOpacity
            style={[styles.accountSheetContainer, { paddingBottom: Math.max(bottomInset, 20) }]}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Top Bar: Button ... bên trái và Button X bên phải chuẩn phong cách Chrome */}
            <View style={styles.accountSheetTopBar}>
              {isDeleteMode ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Feather name="trash-2" size={16} color="#ef4444" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#ef4444' }}>
                      Chế độ xóa tài khoản
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.doneDeleteBtn}
                    onPress={() => setIsDeleteMode(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.doneDeleteText}>Xong</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.sheetCircleBtn}
                    activeOpacity={0.7}
                    onPress={() => setAccountMenuVisible(true)}
                  >
                    <Feather name="more-horizontal" size={18} color="#000000" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.sheetCircleBtn}
                    onPress={() => {
                      setUserModalVisible(false);
                      setIsDeleteMode(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Feather name="x" size={18} color="#000000" />
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* Tài khoản đang kích hoạt ở trên cùng */}
            <View style={styles.activeAccountHeader}>
              <TouchableOpacity
                onPress={handlePickAvatar}
                style={styles.activeBigAvatarBox}
                activeOpacity={0.8}
                disabled={!userProfile.isLoggedIn}
              >
                {userProfile.isLoggedIn && userProfile.avatarUrl && isRealGooglePhoto(userProfile.avatarUrl) ? (
                  <Image
                    source={{ uri: userProfile.avatarUrl }}
                    style={styles.activeBigAvatarImg}
                    resizeMode="cover"
                  />
                ) : userProfile.isLoggedIn && userProfile.email ? (
                  <View
                    style={[
                      styles.activeBigAvatarFallback,
                      { backgroundColor: getAvatarBgColor(userProfile.email, userProfile.name) },
                    ]}
                  >
                    <Text style={styles.activeBigAvatarLetter}>
                      {getAvatarLetter()}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.activeBigAvatarFallback, { backgroundColor: '#71717a' }]}>
                    <Feather name="user" size={30} color="#ffffff" />
                  </View>
                )}
              </TouchableOpacity>

              <Text style={styles.activeAccountName} numberOfLines={1}>
                {userProfile.isLoggedIn && userProfile.name
                  ? userProfile.name
                  : 'Tài khoản Google'}
              </Text>
              <Text style={styles.activeAccountEmail} numberOfLines={1}>
                {userProfile.isLoggedIn && userProfile.email
                  ? userProfile.email
                  : 'Đăng nhập để đồng bộ lịch sử duyệt web và lối tắt'}
              </Text>

              {/* Nút bấm Quản lý Tài khoản Google dạng pill chuẩn Chrome iOS */}
              {userProfile.isLoggedIn && !isDeleteMode && (
                <TouchableOpacity
                  style={styles.manageGooglePillBtn}
                  onPress={handleOpenGoogleAccount}
                  activeOpacity={0.7}
                >
                  <Text style={styles.manageGooglePillText}>Quản lý Tài khoản Google của bạn</Text>
                </TouchableOpacity>
              )}

              {/* Nút xóa tài khoản chính khi đang ở chế độ xóa */}
              {isDeleteMode && userProfile.isLoggedIn && (
                <TouchableOpacity
                  style={styles.deleteMainAccountRow}
                  onPress={() => confirmDeleteAccount(userProfile)}
                  activeOpacity={0.7}
                >
                  <Feather name="trash-2" size={14} color="#ef4444" style={{ marginRight: 6 }} />
                  <Text style={styles.deleteMainAccountText}>Xóa tài khoản chính này khỏi máy</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Khung màu trắng bo tròn chứa danh sách tài khoản khác & nút thêm tài khoản */}
            <View style={styles.accountListCard}>
              {otherAccounts.length > 0 && (
                <ScrollView
                  style={{ maxHeight: 240 }}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  {otherAccounts.map((acc, index, arr) => {
                    const isEdu =
                      acc.email?.includes('.edu.') ||
                      acc.email?.includes('@vku.udn.vn');

                    return (
                      <View key={acc.email || `acc-${index}`}>
                        <TouchableOpacity
                          style={styles.accountRowItem}
                          onPress={() => {
                            if (isDeleteMode) {
                              confirmDeleteAccount(acc);
                            } else {
                              handleSelectAccount(acc);
                            }
                          }}
                          activeOpacity={0.65}
                        >
                          <View style={styles.accountRowAvatarBox}>
                            {acc.avatarUrl && isRealGooglePhoto(acc.avatarUrl) ? (
                              <Image
                                source={{ uri: acc.avatarUrl }}
                                style={styles.accountRowAvatarImg}
                                resizeMode="cover"
                              />
                            ) : (
                              <View
                                style={[
                                  styles.accountRowAvatarFallback,
                                  { backgroundColor: getAvatarBgColor(acc.email, acc.name) },
                                ]}
                              >
                                <Text style={styles.accountRowAvatarLetter}>
                                  {getLetterForUser(acc.email, acc.name)}
                                </Text>
                              </View>
                            )}
                          </View>

                          <View style={styles.accountRowInfo}>
                            <Text style={styles.accountRowName} numberOfLines={1}>
                              {acc.name || acc.email?.split('@')[0]}
                            </Text>
                            <Text style={styles.accountRowEmail} numberOfLines={1}>
                              {acc.email}
                            </Text>
                          </View>

                          {isDeleteMode ? (
                            <TouchableOpacity
                              style={styles.deleteRowBtn}
                              onPress={() => confirmDeleteAccount(acc)}
                              activeOpacity={0.6}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <View style={styles.deleteIconCircle}>
                                <Feather name="trash-2" size={15} color="#ef4444" />
                              </View>
                            </TouchableOpacity>
                          ) : (
                            isEdu && (
                              <Feather
                                name="briefcase"
                                size={16}
                                color="#8e8e93"
                                style={{ marginLeft: 8 }}
                              />
                            )
                          )}
                        </TouchableOpacity>

                        {index < arr.length - 1 && (
                          <View style={styles.accountCardFullDivider} />
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              )}

              {otherAccounts.length > 0 && <View style={styles.accountCardFullDivider} />}

              {/* Nút Đăng nhập hoặc Thêm tài khoản */}
              <TouchableOpacity
                style={styles.addAccountRow}
                onPress={async () => {
                  setUserModalVisible(false);
                  setIsDeleteMode(false);
                  try {
                    const oauthUrl = await getGoogleOAuthUrl();
                    if (oauthUrl) {
                      onSelectUrl(oauthUrl);
                      return;
                    }
                  } catch (e) {}
                  onSelectUrl(
                    'https://ivwnjrugslrvsxssufco.supabase.co/auth/v1/authorize?provider=google&redirect_to=kite%3A%2F%2Fauth-callback&prompt=select_account'
                  );
                }}
                activeOpacity={0.6}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="user-plus" size={17} color="#007aff" style={{ marginRight: 10 }} />
                  <Text style={styles.addAccountText}>
                    {userProfile.isLoggedIn ? 'Thêm tài khoản khác...' : 'Đăng nhập với Google'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* THẺ TÙY CHỌN ĐỒNG BỘ DỮ LIỆU TÀI KHOẢN */}
            <View style={styles.syncOptionCard}>
              <View style={styles.syncOptionLeft}>
                <View
                  style={[
                    styles.syncIconBox,
                    syncAllAccounts && { backgroundColor: '#e8f0fe' },
                  ]}
                >
                  <Feather
                    name={syncAllAccounts ? 'refresh-cw' : 'hard-drive'}
                    size={17}
                    color={syncAllAccounts ? '#007aff' : '#71717a'}
                  />
                </View>
                <View style={styles.syncTextCol}>
                  <Text style={styles.syncOptionTitle}>Đồng bộ toàn bộ tài khoản</Text>
                  <Text style={styles.syncOptionSub}>
                    {syncAllAccounts
                      ? 'Bật: Dùng chung thẻ duyệt web, lối tắt & lịch sử giữa các tài khoản'
                      : 'Tắt: Mỗi tài khoản có bộ thẻ duyệt web, lối tắt & dữ liệu riêng biệt'}
                  </Text>
                </View>
              </View>
              <Switch
                value={syncAllAccounts}
                onValueChange={handleToggleSync}
                trackColor={{ false: '#e4e4e7', true: '#007aff' }}
                ios_backgroundColor="#e4e4e7"
                thumbColor="#ffffff"
              />
            </View>

            {/* Nút Đăng xuất ở thẻ riêng bên dưới nếu đã đăng nhập */}
            {userProfile.isLoggedIn && (
              <TouchableOpacity
                style={styles.logoutCardBtn}
                onPress={handleLogout}
                activeOpacity={0.7}
              >
                <Text style={styles.logoutCardText}>
                  {allAccounts.length > 1 ? 'Đăng xuất tài khoản này' : 'Đăng xuất'}
                </Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          {/* OVERLAY TÙY CHỌN 3 CHẤM TRỰC TIẾP TRONG SHEET (KHÔNG DÙNG MODAL THỨ 2 LÀM ĐƠ APP) */}
          {accountMenuVisible && (
            <TouchableOpacity
              style={styles.actionMenuBackdrop}
              activeOpacity={1}
              onPress={() => setAccountMenuVisible(false)}
            >
              <TouchableOpacity
                style={[styles.actionMenuCard, { paddingBottom: Math.max(bottomInset, 16) }]}
                activeOpacity={1}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={styles.actionMenuHeader}>
                  <Text style={styles.actionMenuTitle}>Tùy chọn tài khoản</Text>
                  <Text style={styles.actionMenuSubTitle} numberOfLines={1}>
                    {userProfile.email || 'Quản lý tài khoản Google'}
                  </Text>
                </View>

                {/* Option 1: Quản lý Tài khoản Google */}
                <TouchableOpacity
                  style={styles.actionMenuItem}
                  onPress={handleOpenGoogleAccount}
                  activeOpacity={0.65}
                >
                  <View style={[styles.actionMenuIconWrap, { backgroundColor: '#e8f0fe' }]}>
                    <Feather name="external-link" size={17} color="#007aff" />
                  </View>
                  <View style={styles.actionMenuTextCol}>
                    <Text style={styles.actionMenuItemTitle}>Quản lý Tài khoản Google của bạn</Text>
                    <Text style={styles.actionMenuItemSub}>
                      Mở myaccount.google.com để chỉnh sửa thông tin bảo mật
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={17} color="#c7c7cc" />
                </TouchableOpacity>

                <View style={styles.actionMenuDivider} />

                {/* Option 2: Quản lý & xóa tài khoản trên thiết bị */}
                <TouchableOpacity
                  style={styles.actionMenuItem}
                  onPress={() => {
                    setAccountMenuVisible(false);
                    setIsDeleteMode(true);
                  }}
                  activeOpacity={0.65}
                >
                  <View style={[styles.actionMenuIconWrap, { backgroundColor: '#fee2e2' }]}>
                    <Feather name="trash-2" size={17} color="#ef4444" />
                  </View>
                  <View style={styles.actionMenuTextCol}>
                    <Text style={[styles.actionMenuItemTitle, { color: '#ef4444' }]}>
                      Quản lý & xóa các tài khoản trên thiết bị
                    </Text>
                    <Text style={styles.actionMenuItemSub}>
                      Chọn bất kỳ tài khoản nào để gỡ bỏ khỏi Kite
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={17} color="#c7c7cc" />
                </TouchableOpacity>

                <View style={styles.actionMenuDivider} />

                {/* Nút Đóng */}
                <TouchableOpacity
                  style={styles.actionMenuCancelBtn}
                  onPress={() => setAccountMenuVisible(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.actionMenuCancelText}>Đóng</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </Modal>

      {/* BOTTOM SHEET QUẢN LÝ TÀI KHOẢN GOOGLE CỦA BẠN (CHUẨN HÌNH 1) */}
      <GoogleAccountSheet
        visible={googleAccountSheetVisible}
        onClose={() => setGoogleAccountSheetVisible(false)}
        userProfile={userProfile}
        allAccounts={allAccounts}
        onSelectAccount={handleSelectAccount}
        onOpenUrl={onSelectUrl}
        onPickAvatar={handlePickAvatar}
      />

      {/* 3. BOTTOM SHEET THÊM LỐI TẮT */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setAddModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.sheetAvoidView}
          >
            <TouchableOpacity
              style={[styles.bottomSheetContainer, { paddingBottom: Math.max(bottomInset, 28) }]}
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.sheetDragHandle} />
              <View style={styles.sheetHeaderRow}>
                <Text style={styles.sheetTitle}>Thêm lối tắt</Text>
                <TouchableOpacity
                  style={styles.sheetCloseBtn}
                  onPress={() => setAddModalVisible(false)}
                >
                  <Feather name="x" size={16} color="#71717a" />
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.sheetInput}
                placeholder="Tên trang web (VD: Phim Mới)"
                placeholderTextColor="#71717a"
                value={newTitle}
                onChangeText={setNewTitle}
                autoFocus
              />

              <TextInput
                style={styles.sheetInput}
                placeholder="Địa chỉ URL (VD: https://...)"
                placeholderTextColor="#71717a"
                value={newUrl}
                onChangeText={setNewUrl}
                autoCapitalize="none"
                keyboardType="url"
              />

              <View style={styles.sheetBtnRow}>
                <TouchableOpacity
                  style={styles.sheetCancelBtn}
                  onPress={() => setAddModalVisible(false)}
                >
                  <Text style={styles.sheetCancelText}>Hủy</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetConfirmBtn}
                  onPress={handleAddShortcut}
                >
                  <Text style={styles.sheetConfirmText}>Lưu lối tắt</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollOverlay: {
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  content: {
    padding: 18,
    paddingTop: 12,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  topLeftArea: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topRightArea: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.08,
    shadowRadius: 3.5,
    elevation: 2,
    overflow: 'hidden',
  },
  menuBtnGlass: {
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  greetingSection: {
    marginTop: 2,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  greetingTitle: {
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginBottom: 4,
  },
  greetingSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    opacity: 0.85,
  },
  // NÚT ĐĂNG NHẬP NỀN XANH CHỮ TRẮNG (BLUE BG + WHITE TEXT) - ĐỒNG BỘ HEIGHT 36
  loginBtn: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#007aff',
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  loginBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  userAvatarBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.08,
    shadowRadius: 3.5,
    elevation: 2,
    overflow: 'hidden',
  },
  userAvatarBtnGlass: {
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#8e24aa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  logoSection: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    marginBottom: 4,
  },
  searchBarPill: {
    height: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 22,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 14,
  },
  cameraIconBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickActionPillsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 26,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f4f4f5',
    gap: 6,
  },
  actionPillActive: {
    backgroundColor: '#09090b',
  },
  pillIcon: {
    marginRight: 2,
  },
  actionPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#09090b',
  },
  actionPillActiveText: {
    color: '#ffffff',
  },
  section: {
    marginBottom: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#09090b',
  },
  textShadow: {
    fontWeight: '700',
  },
  gridPageContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  paginationDotActive: {
    width: 18,
    borderRadius: 3,
  },
  cardWrapper: {
    width: '48%',
    position: 'relative',
    marginTop: 0,
  },
  card: {
    width: '100%',
    height: 106,
    borderRadius: 14,
    padding: 14,
    justifyContent: 'space-between',
  },
  cardGlass: {
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  favicon: {
    width: 22,
    height: 22,
    borderRadius: 4,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  cardUrl: {
    fontSize: 11,
  },
  deleteBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  addCard: {
    height: 106,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 0,
  },
  addIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  addCardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#09090b',
  },
  quickToolsContainer: {
    marginTop: 20,
    marginBottom: 30,
  },
  quickToolsRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: 12,
  },
  quickToolBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickToolIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  quickToolLabel: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetAvoidView: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  bottomSheetContainer: {
    backgroundColor: theme.colors.sheetBackground,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 10,
    paddingHorizontal: 20,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
  },
  sheetDragHandle: {
    width: 38,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#d4d4d8',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17.5,
    fontWeight: '600',
    color: '#09090b',
  },
  sheetCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f4f4f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  engineGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
    marginBottom: 6,
  },
  engineGridItem: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e4e4e7',
  },
  engineGridItemSelected: {
    backgroundColor: '#ffffff',
    borderColor: '#007aff',
    borderWidth: 1.5,
  },
  engineGridLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  engineGridName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textPrimary,
  },
  engineGridNameSelected: {
    color: theme.colors.accentBlue,
    fontWeight: '600',
  },
  sheetSubHeader: {
    fontSize: 15,
    fontWeight: '500',
    color: '#71717a',
    marginBottom: 8,
    marginTop: 12,
    marginLeft: 4,
    letterSpacing: 0.2,
  },
  groupedOptionContainer: {
    backgroundColor: theme.colors.sheetCard,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 10,
  },
  groupedOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16.5,
    paddingHorizontal: 18,
  },
  horizontalDivider: {
    height: theme.divider.height,
    backgroundColor: theme.divider.backgroundColor,
    marginHorizontal: 18,
  },
  bgOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: '#f4f4f5',
    marginBottom: 8,
  },
  bgOptionIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 122, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  bgOptionTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '400',
    color: '#09090b',
  },
  sheetSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  activeThemeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  activeThemeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  themeScrollContainer: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    gap: 10,
    flexDirection: 'row',
    marginBottom: 8,
  },
  themeCardItem: {
    width: 90,
    alignItems: 'center',
    padding: 8,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e4e4e7',
  },
  themeCardItemSelected: {
    backgroundColor: '#ffffff',
    borderColor: '#18181b',
    borderWidth: 1.5,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  themePreviewBox: {
    width: 68,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  themePreviewInnerCard: {
    width: 44,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  themeItemName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2024',
    textAlign: 'center',
    paddingBottom: 2,
  },
  themeItemTag: {
    fontSize: 10,
    color: '#71717a',
    textAlign: 'center',
  },
  // CHROME-STYLE GOOGLE ACCOUNT BOTTOM SHEET
  accountSheetContainer: {
    backgroundColor: theme.colors.sheetBackground,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 16,
    paddingHorizontal: 16,
    maxHeight: '92%',
  },
  accountSheetTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sheetCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  activeAccountHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  activeBigAvatarBox: {
    marginBottom: 10,
  },
  activeBigAvatarImg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#e2e8f0',
  },
  activeBigAvatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeBigAvatarLetter: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '700',
  },
  activeAccountName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 3,
    textAlign: 'center',
  },
  activeAccountEmail: {
    fontSize: 13,
    color: '#636366',
    textAlign: 'center',
  },
  manageGooglePillBtn: {
    marginTop: 10,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#ffffff',
    alignSelf: 'center',
  },
  manageGooglePillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3c4043',
  },
  accountListCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    overflow: 'hidden',
  },
  accountRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  accountRowAvatarBox: {
    marginRight: 14,
  },
  accountRowAvatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#e2e8f0',
  },
  accountRowAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountRowAvatarLetter: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  accountRowInfo: {
    flex: 1,
  },
  accountRowName: {
    fontSize: 15.5,
    fontWeight: '400',
    color: '#000000',
    marginBottom: 2,
  },
  accountRowEmail: {
    fontSize: 13,
    color: '#636366',
  },
  activeTagBadge: {
    backgroundColor: 'rgba(0, 122, 255, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    marginLeft: 6,
  },
  activeTagBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#007aff',
  },
  accountRowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e5ea',
    marginLeft: 68,
  },
  accountCardFullDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e5ea',
  },
  addAccountRow: {
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  addAccountText: {
    fontSize: 15.5,
    fontWeight: '500',
    color: '#007aff',
  },
  logoutCardBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutCardText: {
    fontSize: 15.5,
    fontWeight: '500',
    color: '#007aff',
  },
  doneDeleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#fee2e2',
  },
  doneDeleteText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
  },
  deleteMainAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#fee2e2',
  },
  deleteMainAccountText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#ef4444',
  },
  deleteRowBtn: {
    padding: 4,
  },
  deleteIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  syncOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  syncIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f4f4f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  syncTextCol: {
    flex: 1,
  },
  syncOptionTitle: {
    fontSize: 15.5,
    fontWeight: '400',
    color: '#09090b',
    marginBottom: 2,
  },
  syncOptionSub: {
    fontSize: 11.5,
    color: '#71717a',
    lineHeight: 15,
  },
  actionMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
    padding: 16,
    zIndex: 9999,
    elevation: 20,
  },
  actionMenuCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  actionMenuHeader: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  actionMenuTitle: {
    fontSize: 16.5,
    fontWeight: '600',
    color: '#18181b',
    marginBottom: 2,
  },
  actionMenuSubTitle: {
    fontSize: 12.5,
    color: '#71717a',
  },
  actionMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  actionMenuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionMenuTextCol: {
    flex: 1,
    marginRight: 8,
  },
  actionMenuItemTitle: {
    fontSize: 15.5,
    fontWeight: '400',
    color: '#18181b',
    marginBottom: 2,
  },
  actionMenuItemSub: {
    fontSize: 11.5,
    color: '#71717a',
    lineHeight: 15,
  },
  actionMenuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#f4f4f5',
    marginVertical: 4,
  },
  actionMenuCancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionMenuCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#71717a',
  },

  // LOGIN SHEET STYLES
  loginSheetSub: {
    fontSize: 13,
    color: '#71717a',
    lineHeight: 18,
    marginBottom: 16,
  },
  googleBigLoginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 48,
    backgroundColor: '#007aff',
    borderRadius: 14,
    marginBottom: 14,
  },
  googleBigLoginText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e4e4e7',
  },
  orText: {
    fontSize: 12,
    color: '#a1a1aa',
    marginHorizontal: 12,
  },
  sheetInput: {
    height: 46,
    backgroundColor: '#f4f4f5',
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 14,
    color: '#09090b',
    marginBottom: 12,
  },
  sheetBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  sheetCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#f4f4f5',
    alignItems: 'center',
  },
  sheetCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#71717a',
  },
  sheetConfirmBtn: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: '#007aff',
    alignItems: 'center',
  },
  sheetConfirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  // STYLES CHO MÀN HÌNH ẨN DANH RIÊNG BIỆT (INCOGNITO DASHBOARD)
  incognitoScrollContent: {
    padding: 18,
    paddingTop: 10,
  },
  incognitoTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  incognitoMenuBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#2d2f31',
    justifyContent: 'center',
    alignItems: 'center',
  },
  incognitoPinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#2d2f31',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 19,
  },
  incognitoPinBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#22c55e',
  },
  incognitoSearchPill: {
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2d2f31',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  incognitoEngineLogo: {
    width: 22,
    height: 22,
  },
  incognitoSearchPlaceholder: {
    marginLeft: 12,
    fontSize: 15,
    color: '#9aa0a6',
    flex: 1,
  },
  googleIconBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleIconText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#4285F4',
  },
  incognitoMainCard: {
    paddingHorizontal: 8,
  },
  incognitoAvatarCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 6,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  incognitoTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  incognitoParagraph: {
    fontSize: 13.5,
    color: '#9aa0a6',
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  incognitoFeatureCard: {
    backgroundColor: '#282a2d',
    borderRadius: 18,
    paddingVertical: 4,
    marginBottom: 16,
  },
  incognitoFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  incognitoFeatureIconBox: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  incognitoFeatureTextBox: {
    flex: 1,
  },
  incognitoFeatureTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e8eaed',
    marginBottom: 2,
  },
  incognitoFeatureSub: {
    fontSize: 12,
    color: '#9aa0a6',
    lineHeight: 16,
  },
  incognitoFeatureDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#3c4043',
    marginLeft: 58,
    marginRight: 16,
  },
  incognitoFootnote: {
    fontSize: 12,
    color: '#5f6368',
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 17,
    marginTop: 4,
  },
  simpleHeaderWidget: {
    width: '100%',
    marginTop: 4,
    marginBottom: 16,
  },
  simpleWeatherRowContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 26,
    paddingHorizontal: 2,
  },
  simpleWeatherBlock: {
    alignItems: 'flex-start',
  },
  simpleWeatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  simpleWeatherTemp: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  simpleWeatherLocation: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
    marginLeft: 2,
  },
  simpleClockBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    marginTop: 2,
  },
  simpleClockText: {
    fontSize: 54,
    fontWeight: '300',
    letterSpacing: -1.5,
    lineHeight: 62,
  },
  simpleDateText: {
    fontSize: 13.5,
    fontWeight: '500',
    marginTop: 3,
    letterSpacing: -0.2,
  },
  homeSearchPill: {
    width: '100%',
    height: 62,
    borderRadius: 31,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    marginBottom: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  homeSearchPillGlass: {
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderColor: 'rgba(255, 255, 255, 0.65)',
  },
  homeSearchPlaceholder: {
    fontSize: 15,
    flex: 1,
    fontWeight: '400',
  },
  homeSearchRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chromeCardContainer: {
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1.5,
  },
  chromeCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  chromeCardTitle: {
    fontSize: 13.5,
    fontWeight: '500',
    letterSpacing: -0.1,
    opacity: 0.78,
  },
  circleShortcutsScrollContent: {
    paddingHorizontal: 0,
    paddingVertical: 4,
    alignItems: 'center',
  },
  circleShortcutCol: {
    alignItems: 'center',
  },
  circleShortcutIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    position: 'relative',
  },
  circleShortcutFavicon: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  shortcutLetterFallback: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutLetterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  circleShortcutTitle: {
    fontSize: 11.5,
    fontWeight: '500',
    textAlign: 'center',
  },
  circleDeleteBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#ef4444',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  circleAddIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  toolsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingVertical: 4,
  },
  toolCol: {
    alignItems: 'center',
  },
  toolIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  toolLabel: {
    fontSize: 11.5,
    fontWeight: '500',
    textAlign: 'center',
  },
  discoverCardContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    marginBottom: 32,
  },
  discoverHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  discoverCardRefreshBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
  discoverArticlesWrapper: {
    width: '100%',
  },
  discoverHeroCard: {
    paddingVertical: 10,
  },
  discoverHeroImage: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    marginBottom: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  discoverHeroTitle: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  discoverMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  discoverArticleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  discoverArticleDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
    paddingBottom: 12,
  },
  discoverArticleLeft: {
    flex: 1,
    marginRight: 14,
    justifyContent: 'space-between',
    minHeight: 74,
  },
  discoverArticleTitle: {
    fontSize: 14.5,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 6,
    letterSpacing: -0.1,
  },
  discoverArticleMeta: {
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.85,
  },
  discoverArticleThumb: {
    width: 86,
    height: 74,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
});
