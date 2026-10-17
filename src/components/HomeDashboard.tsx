import React, { useState, useEffect, useRef } from 'react';
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
import { getGoogleOAuthUrl } from '../services/supabase';

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
  onShowToast?: (msg: string) => void;
  incognitoPin?: string | null;
  onOpenPinSettings?: () => void;
  onPullMove?: (dy: number, dx: number) => void;
  onPullEnd?: () => void;
  onPullCancel?: () => void;
  pullDistance?: number;
}

const DEFAULT_BOOKMARKS: Bookmark[] = [
  {
    id: 'donghua',
    title: 'Donghua World',
    url: 'https://donghuaworld.com',
  },
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
    id: 'bilibili',
    title: 'Bilibili TV',
    url: 'https://www.bilibili.tv',
  },
];

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
  sand: {
    id: 'sand',
    name: 'Vàng cát ấm',
    tag: 'Mặc định',
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
  light: {
    id: 'light',
    name: 'Trắng sứ tối giản',
    tag: 'Sáng',
    previewBg: '#f8fafc',
    previewCard: '#f1f5f9',
    accent: '#2563eb',
    bg: '#f8fafc',
    card: '#f1f5f9',
    cardGlass: 'rgba(248, 250, 252, 0.88)',
    textColor: '#09090b',
    subColor: '#64748b',
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
  onShowToast,
  incognitoPin,
  onOpenPinSettings,
  onPullMove,
  onPullEnd,
  onPullCancel,
  pullDistance = 0,
}) => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 47 : 24);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 34 : 16);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  const [shortcuts, setShortcuts] = useState<Bookmark[]>(DEFAULT_BOOKMARKS);
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

  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [addModalVisible, setAddModalVisible] = useState<boolean>(false);
  const [engineModalVisible, setEngineModalVisible] = useState<boolean>(false);
  const [userModalVisible, setUserModalVisible] = useState<boolean>(false);
  const [voiceModalVisible, setVoiceModalVisible] = useState<boolean>(false);
  const [currentThemeId, setCurrentThemeId] = useState<string>('sand');

  const [newTitle, setNewTitle] = useState<string>('');
  const [newUrl, setNewUrl] = useState<string>('');
  const [inputUserName, setInputUserName] = useState<string>('');



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
  }, [activeTabId]);

  useEffect(() => {
    if (propUserProfile) {
      setUserProfile(propUserProfile);
      loadSavedData();
    }
  }, [propUserProfile]);

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

  const handleSelectAccount = async (acc: UserProfile) => {
    const updated: UserProfile = {
      isLoggedIn: true,
      name: acc.name,
      email: acc.email,
      avatarUrl: acc.avatarUrl || '',
    };
    setUserProfile(updated);
    if (onUpdateProfile) onUpdateProfile(updated);
    await AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(updated));

    setUserModalVisible(false);
    if (onShowToast) {
      onShowToast(`Đã chuyển sang: ${acc.name || acc.email}`);
    }
  };

  const loadSavedData = async () => {
    try {
      const savedShortcuts = await AsyncStorage.getItem(STORAGE_SHORTCUTS_KEY);
      if (savedShortcuts) setShortcuts(JSON.parse(savedShortcuts));

      const savedBg = await AsyncStorage.getItem(STORAGE_BG_KEY);
      if (savedBg) setBgImage(savedBg);

      const savedTheme = await AsyncStorage.getItem(STORAGE_THEME_KEY);
      if (savedTheme && THEME_PALETTES[savedTheme]) {
        setCurrentThemeId(savedTheme);
      }

      // Tải danh sách tài khoản đã lưu (chỉ tài khoản người dùng thực sự đăng nhập trên máy)
      const savedAccountsStr = await AsyncStorage.getItem(STORAGE_SAVED_ACCOUNTS_KEY);
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

      const savedUser = await AsyncStorage.getItem(STORAGE_USER_KEY);
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
    setShortcuts(newList);
    try {
      await AsyncStorage.setItem(STORAGE_SHORTCUTS_KEY, JSON.stringify(newList));
    } catch (e) {
      console.log('Error saving shortcuts:', e);
    }
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
        await AsyncStorage.setItem(STORAGE_BG_KEY, persistentUri);
      }
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể chọn ảnh làm hình nền.');
    }
  };

  const handleResetBg = async () => {
    setBgImage(null);
    await AsyncStorage.removeItem(STORAGE_BG_KEY);
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

    if (scrollYRef.current <= 2 && dy > 28 && dy > Math.abs(dx) * 1.1) {
      isPullingRef.current = true;
      if (onPullMove) onPullMove(dy, dx);
    } else if (dy < 0 && isPullingRef.current) {
      isPullingRef.current = false;
      if (onPullCancel) onPullCancel();
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

  const handleGuestLogin = async () => {
    const guestUser: UserProfile = {
      isLoggedIn: false,
      name: 'Khách',
      email: '',
      avatarUrl: '',
    };
    setUserProfile(guestUser);
    if (onUpdateProfile) onUpdateProfile(guestUser);
    await AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(guestUser));
    setUserModalVisible(false);
    if (onShowToast) {
      onShowToast('Đang duyệt web với tư cách khách');
    }
  };

  const handleLogout = async () => {
    const reset: UserProfile = { isLoggedIn: false, name: '', email: '', avatarUrl: '' };
    setUserProfile(reset);
    setSavedAccounts([]);
    await AsyncStorage.removeItem(STORAGE_USER_KEY);
    await AsyncStorage.removeItem(STORAGE_SAVED_ACCOUNTS_KEY);
    if (onUpdateProfile) onUpdateProfile(reset);
    setUserModalVisible(false);
    if (onShowToast) {
      onShowToast('Đã đăng xuất thành công');
    }
    // Hủy phiên đăng nhập trên trang web Google
    onSelectUrl('https://accounts.google.com/Logout');
  };

  const getFaviconUrl = (url: string) => {
    return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url)}`;
  };

  const handleSelectTheme = async (themeId: string) => {
    setCurrentThemeId(themeId);
    await AsyncStorage.setItem(STORAGE_THEME_KEY, themeId);
    if (onShowToast) {
      onShowToast(`Đã áp dụng chủ đề: ${THEME_PALETTES[themeId]?.name || themeId}`);
    }
  };

  const activeTheme = THEME_PALETTES[currentThemeId] || THEME_PALETTES.sand;
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
      >
        {bgImage && (
          <BlurView
            intensity={Platform.OS === 'ios' ? 70 : 90}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
        )}
        <Feather name="search" size={20} color={isIncognito ? '#9aa0a6' : '#202124'} style={{ marginRight: 12 }} />
        <Text
          style={[
            styles.homeSearchPlaceholder,
            { color: isIncognito ? '#9aa0a6' : '#5f6368' },
          ]}
          numberOfLines={1}
        >
          Tìm kiếm hoặc nhập URL
        </Text>
        <View style={styles.homeSearchRightGroup}>
          <TouchableOpacity
            onPress={() => setEngineModalVisible(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
          <TouchableOpacity
            onPress={() => setVoiceModalVisible(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ marginLeft: 12 }}
            activeOpacity={0.7}
          >
            <Feather name="mic" size={20} color={isIncognito ? '#9aa0a6' : '#202124'} />
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
        <View style={styles.chromeCardHeaderRow}>
          <Text style={[styles.chromeCardTitle, { color: themeText }]}>Lối tắt</Text>
          <TouchableOpacity
            onPress={() => setIsEditMode(!isEditMode)}
            hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
          >
            <Text style={[styles.editToggleText, { color: isEditMode ? '#007aff' : themeSub }]}>
              {isEditMode ? 'Xong' : 'Sửa'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.circleShortcutsScrollContent}
        >
          {shortcuts.map((item) => (
            <View key={item.id} style={styles.circleShortcutCol}>
              <TouchableOpacity
                style={styles.circleShortcutIconBox}
                onPress={() => onSelectUrl(item.url)}
                activeOpacity={0.7}
              >
                <Image
                  source={{ uri: getFaviconUrl(item.url) }}
                  style={styles.circleShortcutFavicon}
                  resizeMode="contain"
                />
                {isEditMode && (
                  <TouchableOpacity
                    style={styles.circleDeleteBadge}
                    onPress={() => handleDeleteShortcut(item.id)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
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
          <View style={styles.circleShortcutCol}>
            <TouchableOpacity
              style={styles.circleAddIconBox}
              onPress={() => setAddModalVisible(true)}
              activeOpacity={0.7}
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
        <View style={styles.toolsRow}>
          <TouchableOpacity
            style={styles.toolCol}
            onPress={onOpenBookmarks}
            activeOpacity={0.7}
          >
            <View style={styles.toolIconBox}>
              <Feather name="bookmark" size={22} color="#1f2024" />
            </View>
            <Text style={[styles.toolLabel, { color: themeText }]} numberOfLines={1}>
              Dấu trang
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toolCol}
            onPress={onOpenHistory}
            activeOpacity={0.7}
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
              style={styles.toolCol}
              onPress={onOpenTabs}
              activeOpacity={0.7}
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
            style={styles.toolCol}
            onPress={handlePickBgImage}
            activeOpacity={0.7}
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
        <View style={styles.chromeCardHeaderRow}>
          <Text style={[styles.chromeCardTitle, { color: themeText }]}>Khám phá</Text>
          <TouchableOpacity
            style={styles.discoverCardRefreshBtn}
            onPress={() => {
              if (onShowToast) onShowToast('Đã làm mới bảng tin Khám phá');
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="rotate-cw" size={15} color={themeSub} />
          </TouchableOpacity>
        </View>

        {/* Danh sách bài báo tạp chí cao cấp: xen kẽ Hero Image lớn & Compact Cards */}
        <View style={styles.discoverArticlesWrapper}>
          {DISCOVER_ARTICLES.map((article, idx) => {
            const isLast = idx === DISCOVER_ARTICLES.length - 1;

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
              {/* MỤC 1: CHỦ ĐỀ & MÀU SẮC (THEME) */}
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
                      <Text style={styles.themeItemTag}>{pal.tag}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* MỤC 2: CÔNG CỤ TÌM KIẾM (GRID 2x2 TIẾT KIỆM KHÔNG GIAN) */}
              <Text style={[styles.sheetSubHeader, { marginTop: 14 }]}>Công cụ tìm kiếm</Text>
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
              <Text style={[styles.sheetSubHeader, { marginTop: 14 }]}>Tùy chọn & Bảo mật</Text>
              <View style={styles.groupedOptionContainer}>
                {/* 1. Hình nền trang chủ */}
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

                {/* 2. Mã PIN bảo mật thẻ ẩn danh */}
                <TouchableOpacity
                  style={styles.groupedOptionRow}
                  onPress={() => {
                    setEngineModalVisible(false);
                    if (onOpenPinSettings) onOpenPinSettings();
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.bgOptionTitle}>Khóa bằng mã PIN</Text>
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

                {/* 7. Lịch sử duyệt web */}
                {onOpenHistory && (
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
              <TouchableOpacity
                style={styles.sheetCircleBtn}
                activeOpacity={0.7}
                onPress={() => {
                  Alert.alert(
                    'Tài khoản Google',
                    userProfile.isLoggedIn
                      ? `Đang đăng nhập: ${userProfile.name || userProfile.email}\nEmail: ${userProfile.email}`
                      : 'Chưa đăng nhập tài khoản Google'
                  );
                }}
              >
                <Feather name="more-horizontal" size={18} color="#000000" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetCircleBtn}
                onPress={() => setUserModalVisible(false)}
                activeOpacity={0.7}
              >
                <Feather name="x" size={18} color="#000000" />
              </TouchableOpacity>
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
                  : userProfile.name === 'Khách'
                  ? 'Người dùng khách'
                  : 'Tài khoản Google'}
              </Text>
              <Text style={styles.activeAccountEmail} numberOfLines={1}>
                {userProfile.isLoggedIn && userProfile.email
                  ? userProfile.email
                  : userProfile.name === 'Khách'
                  ? 'Đang duyệt web với tư cách khách'
                  : 'Đăng nhập để đồng bộ lịch sử duyệt web và lối tắt'}
              </Text>
            </View>

            {/* Khung màu trắng bo tròn chứa danh sách tài khoản hoặc nút đăng nhập */}
            <View style={styles.accountListCard}>
              {savedAccounts.length > 0 && (
                <ScrollView
                  style={{ maxHeight: 260 }}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  {savedAccounts
                    .filter(
                      (acc) =>
                        !userProfile.email ||
                        acc.email?.toLowerCase() !== userProfile.email?.toLowerCase()
                    )
                    .map((acc, index, arr) => {
                      const isEdu =
                        acc.email?.includes('.edu.') ||
                        acc.email?.includes('@vku.udn.vn');
                      return (
                        <View key={acc.email || `acc-${index}`}>
                          <TouchableOpacity
                            style={styles.accountRowItem}
                            onPress={() => handleSelectAccount(acc)}
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

                            {isEdu && (
                              <Feather
                                name="briefcase"
                                size={16}
                                color="#8e8e93"
                                style={{ marginLeft: 8 }}
                              />
                            )}
                          </TouchableOpacity>

                          {index < arr.length - 1 && (
                            <View style={styles.accountRowDivider} />
                          )}
                        </View>
                      );
                    })}
                </ScrollView>
              )}

              {savedAccounts.length > 0 && <View style={styles.accountCardFullDivider} />}

              {/* Nút Đăng nhập hoặc Thêm tài khoản */}
              <TouchableOpacity
                style={styles.addAccountRow}
                onPress={async () => {
                  setUserModalVisible(false);
                  try {
                    const oauthUrl = await getGoogleOAuthUrl();
                    if (oauthUrl) {
                      onSelectUrl(oauthUrl);
                      return;
                    }
                  } catch (e) {}
                  onSelectUrl(
                    'https://ivwnjrugslrvsxssufco.supabase.co/auth/v1/authorize?provider=google&redirect_to=kite%3A%2F%2Fauth-callback'
                  );
                }}
                activeOpacity={0.6}
              >
                <Text style={styles.addAccountText}>
                  {userProfile.isLoggedIn ? 'Thêm tài khoản...' : 'Đăng nhập với Google'}
                </Text>
              </TouchableOpacity>

              <View style={styles.accountCardFullDivider} />

              {/* Nút Đăng nhập bằng tư cách khách */}
              <TouchableOpacity
                style={styles.addAccountRow}
                onPress={handleGuestLogin}
                activeOpacity={0.6}
              >
                <Text style={styles.addAccountText}>
                  Đăng nhập bằng tư cách khách
                </Text>
              </TouchableOpacity>
            </View>

            {/* Nút Đăng xuất ở thẻ riêng bên dưới nếu đã đăng nhập */}
            {userProfile.isLoggedIn && (
              <TouchableOpacity
                style={styles.logoutCardBtn}
                onPress={handleLogout}
                activeOpacity={0.7}
              >
                <Text style={styles.logoutCardText}>Đăng xuất</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

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
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
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
    fontSize: 17,
    fontWeight: '700',
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
    borderRadius: 14,
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
    fontSize: 13.5,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  engineGridNameSelected: {
    color: theme.colors.accentBlue,
    fontWeight: '700',
  },
  sheetSubHeader: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#09090b',
    marginBottom: 8,
    marginTop: 12,
    marginLeft: 4,
    letterSpacing: 0.2,
  },
  groupedOptionContainer: {
    backgroundColor: theme.colors.sheetCard,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    marginBottom: 10,
  },
  groupedOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  horizontalDivider: {
    height: theme.divider.height,
    backgroundColor: theme.divider.backgroundColor,
    marginHorizontal: 16,
  },
  bgOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
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
    fontSize: theme.typography.fontSize.menuTitle,
    fontWeight: '600',
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
    marginBottom: 2,
  },
  themeItemTag: {
    fontSize: 10,
    color: '#71717a',
    textAlign: 'center',
  },
  // CHROME-STYLE GOOGLE ACCOUNT BOTTOM SHEET
  accountSheetContainer: {
    backgroundColor: theme.colors.sheetBackground,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
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
    backgroundColor: '#e5e5ea',
    justifyContent: 'center',
    alignItems: 'center',
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
    fontWeight: '700',
    color: '#000000',
    marginBottom: 3,
    textAlign: 'center',
  },
  activeAccountEmail: {
    fontSize: 13,
    color: '#636366',
    textAlign: 'center',
  },
  accountListCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
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
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 2,
  },
  accountRowEmail: {
    fontSize: 13,
    color: '#636366',
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
    fontSize: 15,
    fontWeight: '500',
    color: '#007aff',
  },
  logoutCardBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutCardText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007aff',
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
    height: 48,
    borderRadius: 24,
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
    height: 56,
    borderRadius: 28,
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
    paddingHorizontal: 2,
    paddingVertical: 4,
    alignItems: 'center',
    gap: 12,
  },
  circleShortcutCol: {
    alignItems: 'center',
    width: 68,
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
    width: 26,
    height: 26,
    borderRadius: 6,
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
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 4,
  },
  toolCol: {
    alignItems: 'center',
    flex: 1,
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
