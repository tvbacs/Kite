import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  StatusBar,
  Text,
  Keyboard,
  Platform,
  Linking,
  Share,
  TouchableOpacity,
  Image,
  Animated,
  ActivityIndicator,
} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync().catch(() => {});
import Feather from '@expo/vector-icons/Feather';
import { WebView, WebViewNavigation } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { HeaderBar } from './src/components/HeaderBar';
import { BottomBar } from './src/components/BottomBar';
import { ShieldSheet } from './src/components/ShieldSheet';
import { TabSheet } from './src/components/TabSheet';
import { HomeDashboard } from './src/components/HomeDashboard';
import { SearchOverlay } from './src/components/SearchOverlay';
import { ImageSearchModal } from './src/components/ImageSearchModal';
import { QRScannerModal } from './src/components/QRScannerModal';
import { HistorySheet, STORAGE_HISTORY_KEY, HistoryItem } from './src/components/HistorySheet';
import { BookmarkSheet, STORAGE_BOOKMARKS_KEY, DEFAULT_BOOKMARKS, BookmarkItem } from './src/components/BookmarkSheet';
import { DownloadSheet, STORAGE_DOWNLOADS_KEY, DownloadedItem, ActiveDownloadItem } from './src/components/DownloadSheet';
import { DownloadPromptModal } from './src/components/DownloadPromptModal';
import { PasswordManagerSheet, saveCredentialSecurely } from './src/components/PasswordManagerSheet';
import { PasswordSavePromptModal } from './src/components/PasswordSavePromptModal';
import { BrowserMenuSheet } from './src/components/BrowserMenuSheet';
import { StorageManagerSheet } from './src/components/StorageManagerSheet';
import { RegionSheet } from './src/components/RegionSheet';
import {
  RegionSettings,
  DEFAULT_REGION_SETTINGS,
  loadRegionSettings,
  saveRegionSettings,
  getRegionInjectedScript,
  wrapUrlWithProxyGateway,
  getActiveRegionNode,
} from './src/services/regionService';
import { FindInPageBar } from './src/components/FindInPageBar';
import {
  getFindInPageSearchScript,
  getFindInPageNextScript,
  getFindInPagePrevScript,
  getFindInPageClearScript,
} from './src/services/findInPageScript';
import {
  ExtensionSheet,
  STORAGE_EXTENSIONS_KEY,
  ExtensionItem,
  DEFAULT_EXTENSIONS,
  isUrlMatchingPattern,
} from './src/components/ExtensionSheet';
import {
  BLOCKED_DOMAINS,
  BLOCKED_GAMBLING_KEYWORDS,
  COMMERCE_REDIRECT_DOMAINS,
  BLOCKED_SCHEMES,
} from './src/constants/blocklist';
import { getDomain, getHostname, getDomainWithoutSuffix } from './src/utils/tld';
import { SEARCH_ENGINES } from './src/constants/searchEngines';
import {
  INJECTED_BEFORE_CONTENT,
  INJECTED_AFTER_CONTENT,
  FORCE_ZAP_SCRIPT,
  PAUSE_BACKGROUND_MEDIA_SCRIPT,
  DATA_SAVER_SCRIPT,
  getDataSaverScript,
  getCaptureTabStateScript,
  getRestoreTabStateScript,
  READER_MODE_SCRIPT,
  EXIT_READER_MODE_SCRIPT,
} from './src/services/antiAdScript';
import * as Haptics from 'expo-haptics';
import { captureRef } from 'react-native-view-shot';
import { PullDownBar, PullActionType } from './src/components/PullDownBar';
import { ShieldStats, BrowserTab, UserProfile, TabFrozenState, DataSaverMode, DetectedMedia } from './src/types/browser';
import { PinModal } from './src/components/PinModal';
import { supabase, handleAuthCallbackUrl, upsertCloudProfile } from './src/services/supabase';
import { VideoDownloadSheet } from './src/components/VideoDownloadSheet';
import { VIDEO_SNIFFER_SCRIPT } from './src/services/videoSnifferScript';

const STORAGE_ENGINE_KEY = '@kite_search_engine';
const STORAGE_PIN_KEY = '@kite_incognito_pin';
const STORAGE_PERSISTED_TABS_KEY = '@kite_persisted_tabs_state';
const STORAGE_ACTIVE_TAB_ID_KEY = '@kite_active_tab_id';
const STORAGE_SYNC_ACCOUNTS_KEY = '@kite_sync_all_accounts';
const STORAGE_DATA_SAVER_KEY = '@kite_data_saver_mode';
const STORAGE_KEEP_AWAKE_KEY = '@kite_keep_awake';
const STORAGE_SHIELD_ACTIVE_KEY = '@kite_shield_active';
const STORAGE_SHIELD_AGGRESSIVE_KEY = '@kite_shield_aggressive';
const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const GOOGLE_AUTH_USER_AGENT =
  Platform.OS === 'ios'
    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
    : 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36';
const MAX_ACTIVE_WEBVIEWS = 8; // Giữ tối đa 8 WebView gần nhất trong RAM để không reload khi chuyển tab qua lại

/**
 * Kiểm tra xem một URL có phải là OAuth Callback trả về từ Supabase không
 * Tuyệt đối không bắt nhầm trang khởi tạo đăng nhập (/auth/v1/authorize) hay màn hình chọn tài khoản Google
 */
const isOAuthCallback = (url: string | null | undefined): boolean => {
  if (!url) return false;
  const lower = url.toLowerCase();
  // 1. Cho phép các trang khởi tạo đăng nhập và xác thực của Google & Supabase hoạt động bình thường
  if (
    lower.includes('/auth/v1/authorize') ||
    lower.includes('accounts.google.com') ||
    lower.includes('myaccount.google.com') ||
    lower.includes('oauth2.googleapis.com') ||
    lower.includes('supabase.co/auth/v1/callback')
  ) {
    return false;
  }

  // 2. Chỉ bắt các URL chuyển hướng trả về App (custom scheme hoặc localhost hoặc kèm access_token)
  return (
    lower.startsWith('kite://') ||
    lower.includes('localhost:3000') ||
    lower.includes('access_token=') ||
    lower.includes('error_code=') ||
    (lower.includes('code=') && !lower.includes('google.com'))
  );
};

function BrowserMain() {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 47 : 24);
  const webViewRefs = useRef<{ [tabId: string]: WebView | null }>({});
  const webViewContainerRefs = useRef<{ [tabId: string]: View | null }>({});
  const getActiveWebView = () => webViewRefs.current[activeTabId] || null;
  const lastBackedUrlRef = useRef<{ [tabId: string]: string }>({});
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userInitiatedRef = useRef<boolean>(false);
  const closedTabsRef = useRef<BrowserTab[]>([]);
  const isVideoPlayingRef = useRef<boolean>(false);
  const isRestoredRef = useRef<boolean>(false);

  // Trạng thái màn hình khởi động (Splash Screen)
  const [isAppReady, setIsAppReady] = useState<boolean>(false);
  const [showSplashOverlay, setShowSplashOverlay] = useState<boolean>(true);
  const splashFadeAnim = useRef(new Animated.Value(1)).current;
  const splashScaleAnim = useRef(new Animated.Value(0.92)).current;
  const splashGlowAnim = useRef(new Animated.Value(0.75)).current;

  useEffect(() => {
    Animated.spring(splashScaleAnim, {
      toValue: 1,
      friction: 6,
      tension: 40,
      useNativeDriver: true,
    }).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(splashGlowAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(splashGlowAnim, {
          toValue: 0.75,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    return () => pulse.stop();
  }, []);

  useEffect(() => {
    if (isAppReady) {
      SplashScreen.hideAsync().catch(() => {});
      Animated.parallel([
        Animated.timing(splashFadeAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(splashScaleAnim, {
          toValue: 1.06,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowSplashOverlay(false);
      });
    }
  }, [isAppReady]);

  // Trạng thái tài khoản người dùng
  const [userProfile, setUserProfile] = useState<UserProfile>({
    isLoggedIn: false,
    name: '',
    email: '',
    avatarUrl: '',
  });
  const userProfileRef = useRef<UserProfile>(userProfile);

  // Trạng thái đồng bộ toàn bộ tài khoản (true: dùng chung tabs, shortcuts, lịch sử; false: riêng biệt từng tài khoản)
  const [syncAllAccounts, setSyncAllAccounts] = useState<boolean>(false);
  const syncAllAccountsRef = useRef<boolean>(false);
  const profileTabsRef = useRef<
    Record<string, { tabs: BrowserTab[]; activeTabId: string; isIncognito: boolean }>
  >({});

  useEffect(() => {
    syncAllAccountsRef.current = syncAllAccounts;
  }, [syncAllAccounts]);

  useEffect(() => {
    userProfileRef.current = userProfile;
  }, [userProfile]);

  // Quản lý hệ thống Thẻ (Tabs)
  const [tabs, setTabs] = useState<BrowserTab[]>([
    { id: 'tab-1', url: '', title: 'Trang mới', lastActiveAt: Date.now(), isSleeping: false },
  ]);

  // Lưu trạng thái cuộn, URL và snapshot của các thẻ thường vào AsyncStorage (TUYỆT ĐỐI KHÔNG LƯU THẺ ẨN DANH)
  const persistTabsState = async (
    tabsList: BrowserTab[],
    currentActiveId?: string,
    overrideEmail?: string
  ) => {
    try {
      const normalTabs = tabsList.filter((t) => !t.isIncognito);
      if (normalTabs.length === 0) return;

      let idToSave = currentActiveId || activeTabId;
      if (!normalTabs.some((t) => t.id === idToSave)) {
        idToSave = normalTabs[normalTabs.length - 1]?.id || normalTabs[0].id;
      }
      const toPersist = normalTabs.map((t) => ({
        id: t.id,
        url: t.url,
        title: t.title,
        isDesktop: t.isDesktop,
        isIncognito: false,
        isReaderMode: t.isReaderMode,
        snapshotUri: t.snapshotUri,
        frozenState: t.frozenState,
        lastActiveAt: t.id === idToSave ? Date.now() : t.lastActiveAt,
      }));

      const activeEmail =
        overrideEmail ||
        (userProfileRef.current.isLoggedIn ? userProfileRef.current.email : undefined);
      const isSync = syncAllAccountsRef.current;

      const tabsKey = (!isSync && activeEmail)
        ? `@kite_persisted_tabs_state_${activeEmail.toLowerCase()}`
        : STORAGE_PERSISTED_TABS_KEY;
      const activeIdKey = (!isSync && activeEmail)
        ? `@kite_active_tab_id_${activeEmail.toLowerCase()}`
        : STORAGE_ACTIVE_TAB_ID_KEY;

      await Promise.all([
        AsyncStorage.setItem(tabsKey, JSON.stringify(toPersist)),
        idToSave ? AsyncStorage.setItem(activeIdKey, idToSave) : Promise.resolve(),
      ]);
    } catch (e) {}
  };

  // Chụp ảnh màn hình tab đang mở để lưu trữ ảnh xem trước bền vững cho Grid Tabs
  const captureActiveSnapshot = async (tabId: string): Promise<string | null> => {
    try {
      const view = webViewContainerRefs.current[tabId];
      if (!view) return null;
      const tmpUri = await captureRef(view, {
        format: 'jpg',
        quality: 0.65,
        result: 'tmpfile',
      });
      if (!tmpUri) return null;

      // Lưu trữ snapshot cố định vào Paths.document để không bị iOS xóa ngẫu nhiên
      try {
        const destFile = new File(Paths.document, `tab_snapshot_${tabId}.jpg`);
        if (destFile.exists) {
          try { destFile.delete(); } catch {}
        }
        const tmp = new File(tmpUri);
        tmp.copy(destFile);
        return destFile.uri;
      } catch (e) {
        return tmpUri;
      }
    } catch (e) {
      return null;
    }
  };
  const [activeTabId, setActiveTabId] = useState<string>('tab-1');

  // Công cụ tìm kiếm mặc định (Google / Bing / DuckDuckGo / Yahoo)
  const [currentEngineId, setCurrentEngineId] = useState<'google' | 'bing' | 'duckduckgo' | 'yahoo'>('google');

  // Chế độ duyệt web Ẩn danh (Incognito)
  const [isIncognito, setIsIncognito] = useState<boolean>(false);
  const [incognitoPin, setIncognitoPin] = useState<string | null>(null);
  const [isIncognitoUnlocked, setIsIncognitoUnlocked] = useState<boolean>(false);
  const [pinModalVisible, setPinModalVisible] = useState<boolean>(false);
  const [pinModalMode, setPinModalMode] = useState<'unlock' | 'setup' | 'manage'>('unlock');
  const pendingIncognitoActionRef = useRef<(() => void) | null>(null);

  // Xóa ảnh chụp snapshot của tab trên đĩa để giải phóng bộ nhớ và tránh lộ ảnh tab cũ
  const clearTabSnapshot = (tabId: string) => {
    const target = tabs.find((t) => t.id === tabId);
    if (target?.snapshotUri) {
      try {
        const f = new File(target.snapshotUri);
        if (f.exists) f.delete();
      } catch {}
    }
  };

  // Lấy thông tin tab đang hoạt động
  const currentTab =
    tabs.find((t) => t.id === activeTabId) ||
    tabs.find((t) => Boolean(t.isIncognito) === Boolean(isIncognito)) ||
    tabs[0];
  const activeUrl = currentTab?.url || null;

  // Đồng bộ trạng thái isIncognito theo đúng tab đang active hiện tại
  useEffect(() => {
    if (currentTab) {
      setIsIncognito(Boolean(currentTab.isIncognito));
    }
  }, [currentTab?.id, currentTab?.isIncognito]);

  const [inputUrl, setInputUrl] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [canGoBack, setCanGoBack] = useState<boolean>(false);
  const [canGoForward, setCanGoForward] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sheet & Modal hiển thị
  const [shieldSheetVisible, setShieldSheetVisible] = useState<boolean>(false);
  const [tabSheetVisible, setTabSheetVisible] = useState<boolean>(false);
  const [lensModalVisible, setLensModalVisible] = useState<boolean>(false);
  const [lensScreenShotUri, setLensScreenShotUri] = useState<string | null>(null);
  const [qrModalVisible, setQrModalVisible] = useState<boolean>(false);
  const [historySheetVisible, setHistorySheetVisible] = useState<boolean>(false);
  const [bookmarkSheetVisible, setBookmarkSheetVisible] = useState<boolean>(false);
  const [downloadSheetVisible, setDownloadSheetVisible] = useState<boolean>(false);
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownloadItem[]>([]);
  const [videoDownloadSheetVisible, setVideoDownloadSheetVisible] = useState<boolean>(false);
  const [detectedMediaByTab, setDetectedMediaByTab] = useState<Record<string, DetectedMedia[]>>({});
  const activeDetectedMedia = detectedMediaByTab[activeTabId] || [];
  const [passwordManagerVisible, setPasswordManagerVisible] = useState<boolean>(false);
  const [storageManagerVisible, setStorageManagerVisible] = useState<boolean>(false);
  const [extensionSheetVisible, setExtensionSheetVisible] = useState<boolean>(false);
  const [extensions, setExtensions] = useState<ExtensionItem[]>(DEFAULT_EXTENSIONS);
  const [regionSettings, setRegionSettings] = useState<RegionSettings>(DEFAULT_REGION_SETTINGS);
  const [regionSheetVisible, setRegionSheetVisible] = useState<boolean>(false);
  const [browserMenuVisible, setBrowserMenuVisible] = useState<boolean>(false);
  const [isCurrentBookmarked, setIsCurrentBookmarked] = useState<boolean>(false);
  const [downloadPrompt, setDownloadPrompt] = useState<{
    visible: boolean;
    url: string;
    fileName: string;
  } | null>(null);
  const [passwordSavePrompt, setPasswordSavePrompt] = useState<{
    visible: boolean;
    website: string;
    username: string;
    passwordSecret: string;
  } | null>(null);
  const [findInPageVisible, setFindInPageVisible] = useState<boolean>(false);
  const [findInPageStats, setFindInPageStats] = useState<{ total: number; current: number }>({
    total: 0,
    current: 0,
  });

  // Sinh mã script tiện ích mở rộng phù hợp với URL của tab
  const getExtensionsScriptForTab = (
    tabUrl?: string | null,
    timing: 'document_start' | 'document_end' = 'document_end'
  ) => {
    if (!tabUrl || !extensions || extensions.length === 0) return '';
    const matching = extensions.filter(
      (e) => e.enabled && e.runAt === timing && isUrlMatchingPattern(tabUrl, e.matchUrl)
    );
    if (matching.length === 0) return '';
    return (
      '\n/* Kite User Extensions (' +
      timing +
      ') */\n' +
      matching
        .map(
          (e) =>
            `try { /* Extension: ${e.name} */\n${e.code}\n } catch(err) { console.warn("Extension [${e.name}] error:", err); }`
        )
        .join('\n')
    );
  };

  // Cập nhật trạng thái giữ sáng màn hình (Wake Lock)
  const updateWakeLock = (isKeepAwakeActive?: boolean, isVideoPlaying?: boolean) => {
    try {
      if (isKeepAwakeActive || isVideoPlaying) {
        activateKeepAwakeAsync('kite_video_watch');
      } else {
        deactivateKeepAwake('kite_video_watch');
      }
    } catch (e) {}
  };

  // Thống kê Khiên Kite Shield
  const [stats, setStats] = useState<ShieldStats>({
    blockedAds: 0,
    blockedPopups: 0,
    blockedOverlays: 0,
    isShieldActive: true,
    aggressiveMode: true,
    isDataSaverActive: false,
    dataSaverMode: 'block_images',
    isKeepAwakeActive: false,
    isReaderMode: false,
  });



  // Kéo xuống thực hiện hành động nhanh của Kite (Thẻ mới | Tải lại | Đóng thẻ)
  const [pullDistance, setPullDistance] = useState<number>(0);
  const [pullOffset, setPullOffset] = useState<number>(0);
  const [isPulling, setIsPulling] = useState<boolean>(false);
  const [activePullAction, setActivePullAction] = useState<PullActionType>('reload');
  const prevActionRef = useRef<PullActionType>('reload');

  const triggerHaptic = (style: 'light' | 'medium' | 'selection') => {
    try {
      if (style === 'selection') {
        Haptics.selectionAsync();
      } else if (style === 'medium') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else if (style === 'light') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (e) {}
  };

  const handlePullMove = (dy: number, dx: number) => {
    if (isEditing) return;
    // Bắt đầu kéo mượt mà từ 6px
    if (dy < 6) {
      setPullDistance(0);
      setIsPulling(false);
      return;
    }
    const distance = Math.max(0, (dy - 6) * 0.7);
    setPullDistance(distance);
    setPullOffset(dx);
    setIsPulling(true);

    let nextAction: PullActionType = 'reload';
    if (dx < -45) {
      nextAction = 'new_tab';
    } else if (dx > 45) {
      nextAction = 'close_tab';
    }

    if (nextAction !== prevActionRef.current) {
      prevActionRef.current = nextAction;
      setActivePullAction(nextAction);
      triggerHaptic('selection');
    }
  };

  const executePullAction = (action: PullActionType) => {
    if (action === 'reload') {
      const activeWV = getActiveWebView();
      if (activeUrl && activeWV) {
        setIsLoading(true);
        setLoadProgress(0.15);
        triggerLoadingSafetyTimer();
        activeWV.reload();
        showToast('Đang tải lại trang...');
      } else {
        showToast('Đã làm mới trang');
      }
    } else if (action === 'new_tab') {
      handleNewTab(isIncognito);
    } else if (action === 'close_tab') {
      handleCloseTab(activeTabId);
    }
  };

  const handlePullEnd = () => {
    // Ngưỡng kích hoạt: phải vuốt đủ 85px mới kích hoạt hành động
    if (pullDistance >= 50) {
      triggerHaptic('medium');
      executePullAction(activePullAction);
    }
    setIsPulling(false);
    setPullDistance(0);
    setPullOffset(0);
    prevActionRef.current = 'reload';
    setActivePullAction('reload');
  };

  const handlePullCancel = () => {
    setIsPulling(false);
    setPullDistance(0);
    setPullOffset(0);
    prevActionRef.current = 'reload';
    setActivePullAction('reload');
  };

  const headerTouchStartY = useRef(0);
  const headerTouchStartX = useRef(0);
  const headerIsPulling = useRef(false);

  const handleHeaderTouchStart = (e: any) => {
    headerTouchStartY.current = e.nativeEvent.pageY;
    headerTouchStartX.current = e.nativeEvent.pageX;
    headerIsPulling.current = false;
  };

  const handleHeaderTouchMove = (e: any) => {
    const dy = e.nativeEvent.pageY - headerTouchStartY.current;
    const dx = e.nativeEvent.pageX - headerTouchStartX.current;
    if (dy > 8) {
      headerIsPulling.current = true;
      handlePullMove(dy, dx);
    }
  };

  const handleHeaderTouchEnd = () => {
    if (headerIsPulling.current) {
      headerIsPulling.current = false;
      handlePullEnd();
    } else {
      const activeWV = getActiveWebView();
      if (activeWV) {
        activeWV.injectJavaScript('window.scrollTo({ top: 0, behavior: "smooth" }); true;');
      }
    }
  };

  const handleNavigateRef = useRef<(url: string) => void>(() => {});

  useEffect(() => {
    const splashStartTime = Date.now();
    const splashFallback = setTimeout(() => {
      setIsAppReady(true);
    }, 2500);

    AsyncStorage.getItem(STORAGE_ENGINE_KEY).then((eng) => {
      if (eng && SEARCH_ENGINES[eng]) {
        setCurrentEngineId(eng as any);
      }
    });

    AsyncStorage.getItem(STORAGE_PIN_KEY).then((pin) => {
      if (pin) {
        setIncognitoPin(pin);
      }
    });

    AsyncStorage.getItem(STORAGE_EXTENSIONS_KEY).then((res) => {
      if (res) {
        try {
          const parsed = JSON.parse(res);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setExtensions(parsed);
          }
        } catch (e) {}
      }
    });

    loadRegionSettings().then((saved) => {
      if (saved) {
        setRegionSettings(saved);
      }
    });

    // Khôi phục cài đặt đồng bộ tài khoản, tài khoản người dùng và danh sách thẻ
    Promise.all([
      AsyncStorage.getItem(STORAGE_SYNC_ACCOUNTS_KEY),
      AsyncStorage.getItem('@kite_user_profile'),
    ]).then(async ([syncRes, profileRes]) => {
      let isSync = false;
      if (syncRes !== null) {
        try {
          isSync = JSON.parse(syncRes);
        } catch (e) {}
      }
      setSyncAllAccounts(isSync);
      syncAllAccountsRef.current = isSync;

      let currentEmail: string | undefined;
      if (profileRes) {
        try {
          const parsed = JSON.parse(profileRes);
          if (parsed && parsed.email) {
            setUserProfile(parsed);
            userProfileRef.current = parsed;
            currentEmail = parsed.email;
          }
        } catch (e) {}
      }

      // Khôi phục danh sách thẻ, URL và mở chính xác thẻ người dùng đang xem trước khi reload
      const tabsKey =
        !isSync && currentEmail
          ? `@kite_persisted_tabs_state_${currentEmail.toLowerCase()}`
          : STORAGE_PERSISTED_TABS_KEY;
      const activeIdKey =
        !isSync && currentEmail
          ? `@kite_active_tab_id_${currentEmail.toLowerCase()}`
          : STORAGE_ACTIVE_TAB_ID_KEY;

      let [tabsData, savedActiveId] = await Promise.all([
        AsyncStorage.getItem(tabsKey),
        AsyncStorage.getItem(activeIdKey),
      ]);

      if (!tabsData && tabsKey !== STORAGE_PERSISTED_TABS_KEY) {
        tabsData = await AsyncStorage.getItem(STORAGE_PERSISTED_TABS_KEY);
        savedActiveId = await AsyncStorage.getItem(STORAGE_ACTIVE_TAB_ID_KEY);
      }

      if (tabsData) {
        try {
          const savedTabs: BrowserTab[] = JSON.parse(tabsData);
          if (Array.isArray(savedTabs) && savedTabs.length > 0) {
            let targetTab = savedActiveId ? savedTabs.find((t) => t.id === savedActiveId) : null;
            if (!targetTab) {
              const sortedByRecent = [...savedTabs].sort(
                (a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0)
              );
              targetTab = sortedByRecent[0] || savedTabs[savedTabs.length - 1];
            }

            const targetId = targetTab.id;

            const initializedTabs = savedTabs.map((t) => ({
              ...t,
              isSleeping: t.id !== targetId,
            }));

            setTabs(initializedTabs);
            setActiveTabId(targetId);
            setInputUrl(targetTab.url || '');
            setIsIncognito(!!targetTab.isIncognito);
            if (targetTab.isIncognito) {
              setIsIncognitoUnlocked(true);
            }
            if (targetTab.isReaderMode) {
              setStats((prev) => ({ ...prev, isReaderMode: true }));
            }
          }
        } catch (e) {}
      }
      isRestoredRef.current = true;
      const elapsed = Date.now() - splashStartTime;
      const minDisplay = 800;
      const remaining = Math.max(0, minDisplay - elapsed);
      setTimeout(() => {
        setIsAppReady(true);
      }, remaining);
    });

    const { data: authSub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const u = session.user;
        const meta = u.user_metadata || {};
        const profile: UserProfile = {
          isLoggedIn: true,
          name: meta.full_name || meta.name || u.email?.split('@')[0] || 'Người dùng',
          email: u.email || '',
          avatarUrl: meta.avatar_url || meta.picture || '',
        };
        setUserProfile(profile);
        userProfileRef.current = profile;
        await AsyncStorage.setItem('@kite_user_profile', JSON.stringify(profile));
        await upsertCloudProfile(u.id, profile);
        // Cộng dồn vào @kite_saved_accounts
        if (profile.email) {
          const res = await AsyncStorage.getItem('@kite_saved_accounts');
          let list: UserProfile[] = [];
          if (res) {
            try {
              list = JSON.parse(res);
            } catch (e) {}
          }
          if (!Array.isArray(list)) list = [];
          const idx = list.findIndex(
            (a) => a.email?.toLowerCase() === profile.email?.toLowerCase()
          );
          if (idx !== -1) {
            list[idx] = profile;
          } else {
            list.push(profile);
          }
          await AsyncStorage.setItem('@kite_saved_accounts', JSON.stringify(list));
        }
      }
    });

    // Đảm bảo thư mục "Kite" được iOS kích hoạt và hiển thị trong ứng dụng Tệp (Files) dưới mục "Trên iPhone"
    try {
      const welcomeFile = new File(Paths.document, 'Kite_Downloads.txt');
      if (!welcomeFile.exists) {
        welcomeFile.create();
        welcomeFile.write(
          'Trình duyệt Kite - Thư mục lưu trữ tải xuống.\nTất cả tài liệu và hình ảnh bạn tải về từ Kite sẽ được lưu trữ tự động tại đây.'
        );
      }
    } catch (e) {
      console.log('Init Kite Documents directory error:', e);
    }

    // Khôi phục cài đặt Chế độ tiết kiệm dữ liệu
    AsyncStorage.getItem(STORAGE_DATA_SAVER_KEY).then((savedMode) => {
      if (savedMode === 'block_images' || savedMode === 'compress_images') {
        setStats((prev) => ({
          ...prev,
          isDataSaverActive: true,
          dataSaverMode: savedMode,
        }));
      }
    });

    // Khôi phục cài đặt Giữ màn hình luôn sáng
    AsyncStorage.getItem(STORAGE_KEEP_AWAKE_KEY).then((res) => {
      if (res !== null) {
        try {
          const val = JSON.parse(res);
          setStats((prev) => ({ ...prev, isKeepAwakeActive: !!val }));
          updateWakeLock(!!val, isVideoPlayingRef.current);
        } catch (e) {}
      }
    });

    // Khôi phục cài đặt Khiên Kite Shield
    AsyncStorage.getItem(STORAGE_SHIELD_ACTIVE_KEY).then((res) => {
      if (res !== null) {
        try {
          const val = JSON.parse(res);
          setStats((prev) => ({ ...prev, isShieldActive: !!val }));
        } catch (e) {}
      }
    });

    // Khôi phục cài đặt Chế độ chặn gắt gao
    AsyncStorage.getItem(STORAGE_SHIELD_AGGRESSIVE_KEY).then((res) => {
      if (res !== null) {
        try {
          const val = JSON.parse(res);
          setStats((prev) => ({ ...prev, aggressiveMode: !!val }));
        } catch (e) {}
      }
    });

    // Tiếp nhận liên kết chia sẻ từ ứng dụng khác (Share Sheet / Universal Links / OAuth Callback)
    const handleIncomingUrl = (url: string | null) => {
      if (!url) return;
      try {
        const raw = url.trim();
        // Kiểm tra xem có phải là callback OAuth từ Supabase / Google không
        if (isOAuthCallback(raw)) {
          if (raw.includes('error=')) {
            setIsLoading(false);
            showToast('Đăng nhập Google bị gián đoạn, vui lòng thử lại.');
            clearTabSnapshot(activeTabId);
            setTabs((prev) => {
              const updated = prev.map((t) =>
                t.id === activeTabId ? { ...t, url: '', title: 'Trang mới', snapshotUri: undefined } : t
              );
              persistTabsState(updated);
              return updated;
            });
            setInputUrl('');
            return;
          }
          handleAuthCallbackUrl(raw).then((profile) => {
            setIsLoading(false);
            if (profile) {
              setUserProfile(profile);
              AsyncStorage.setItem('@kite_user_profile', JSON.stringify(profile));
              upsertCloudProfile(profile.email || 'user', profile);
              // Cộng dồn vào @kite_saved_accounts
              if (profile.email) {
                AsyncStorage.getItem('@kite_saved_accounts').then((res) => {
                  let list: UserProfile[] = [];
                  if (res) { try { list = JSON.parse(res); } catch (e) {} }
                  if (!Array.isArray(list)) list = [];
                  const idx = list.findIndex((a) => a.email?.toLowerCase() === profile.email?.toLowerCase());
                  if (idx !== -1) { list[idx] = profile; } else { list.push(profile); }
                  AsyncStorage.setItem('@kite_saved_accounts', JSON.stringify(list));
                });
              }
              showToast(`Đăng nhập Google thành công! (${profile.name})`);
            }
            clearTabSnapshot(activeTabId);
            setTabs((prev) => {
              const updated = prev.map((t) =>
                t.id === activeTabId ? { ...t, url: '', title: 'Trang mới', snapshotUri: undefined } : t
              );
              persistTabsState(updated);
              return updated;
            });
            setInputUrl('');
          });
          return;
        }

        let target = raw;
        if (target.startsWith('kite://open?url=')) {
          target = decodeURIComponent(target.replace('kite://open?url=', ''));
        } else if (target.startsWith('kite://')) {
          target = target.replace('kite://', 'https://');
        }
        if (target.startsWith('http://') || target.startsWith('https://')) {
          handleNavigateRef.current(target);
          showToast('Đã nhận liên kết từ ứng dụng khác');
        }
      } catch (e) {}
    };

    Linking.getInitialURL().then(handleIncomingUrl);
    const linkingSub = Linking.addEventListener('url', (event) => {
      handleIncomingUrl(event.url);
    });

    return () => {
      clearTimeout(splashFallback);
      linkingSub.remove();
    };
  }, []);

  // Tự động ghi nhớ thẻ đang xem gần nhất vào bộ nhớ để khi vào lại browser sẽ mở đúng trang đó
  useEffect(() => {
    if (!isRestoredRef.current) return;
    if (activeTabId) {
      AsyncStorage.setItem(STORAGE_ACTIVE_TAB_ID_KEY, activeTabId).catch(() => {});
      setTabs((prev) => {
        const updated = prev.map((t) => (t.id === activeTabId ? { ...t, lastActiveAt: Date.now() } : t));
        persistTabsState(updated, activeTabId);
        return updated;
      });
    }
  }, [activeTabId]);

  // Tạm dừng video & âm thanh trên các tab nền để tiết kiệm pin và dữ liệu
  useEffect(() => {
    Object.entries(webViewRefs.current).forEach(([tabId, ref]) => {
      if (tabId !== activeTabId && ref) {
        ref.injectJavaScript(PAUSE_BACKGROUND_MEDIA_SCRIPT);
      }
    });
  }, [activeTabId]);

  // Tự động đóng băng (Smart Tab Sleeping) các tab nền không hoạt động sau 3 phút để tiết kiệm pin & hạ nhiệt máy
  useEffect(() => {
    const idleCheckInterval = setInterval(() => {
      const now = Date.now();
      const IDLE_TIME_MS = 3 * 60 * 1000;
      setTabs((prev) => {
        const toFreeze = prev.filter(
          (t) =>
            t.id !== activeTabId &&
            t.url &&
            !t.isSleeping &&
            t.lastActiveAt &&
            now - t.lastActiveAt > IDLE_TIME_MS
        );
        if (toFreeze.length === 0) return prev;

        toFreeze.forEach((t) => {
          try {
            webViewRefs.current[t.id]?.injectJavaScript(getCaptureTabStateScript(t.id));
          } catch (e) {}
        });

        setTimeout(() => {
          setTabs((current) =>
            current.map((t) =>
              toFreeze.some((f) => f.id === t.id) && !t.isSleeping && t.id !== activeTabId
                ? { ...t, isSleeping: true }
                : t
            )
          );
        }, 400);

        return prev;
      });
    }, 60000);

    return () => clearInterval(idleCheckInterval);
  }, [activeTabId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  const getBookmarkStorageKey = () => {
    const isSync = syncAllAccountsRef.current;
    const activeEmail =
      userProfileRef.current.isLoggedIn ? userProfileRef.current.email : undefined;
    return !isSync && activeEmail
      ? `@kite_user_bookmarks_${activeEmail.toLowerCase()}`
      : STORAGE_BOOKMARKS_KEY;
  };

  // Kiểm tra trạng thái dấu trang của URL hiện tại
  const checkBookmarkStatus = async (url?: string | null) => {
    if (!url) {
      setIsCurrentBookmarked(false);
      return;
    }
    try {
      const bmKey = getBookmarkStorageKey();
      const data = await AsyncStorage.getItem(bmKey);
      const list: BookmarkItem[] = data ? JSON.parse(data) : DEFAULT_BOOKMARKS;
      const found = list.some(
        (b) => b.url.trim().toLowerCase() === url.trim().toLowerCase()
      );
      setIsCurrentBookmarked(found);
    } catch (e) {
      setIsCurrentBookmarked(false);
    }
  };

  useEffect(() => {
    checkBookmarkStatus(activeUrl);
    setFindInPageVisible(false);
    setFindInPageStats({ total: 0, current: 0 });
  }, [activeUrl, activeTabId, userProfile.email, syncAllAccounts]);

  // Thêm hoặc gỡ Dấu trang cho trang hiện tại
  const handleToggleBookmarkCurrentPage = async (
    customUrl?: string | null,
    customTitle?: string | null
  ) => {
    const targetUrl = customUrl || activeUrl;
    if (!targetUrl || targetUrl.startsWith('about:')) {
      showToast('Không có liên kết để lưu');
      return;
    }
    const targetTitle = customTitle || currentTab?.title || targetUrl;
    try {
      const bmKey = getBookmarkStorageKey();
      const data = await AsyncStorage.getItem(bmKey);
      let list: BookmarkItem[] = data ? JSON.parse(data) : DEFAULT_BOOKMARKS;
      const index = list.findIndex(
        (b) => b.url.trim().toLowerCase() === targetUrl.trim().toLowerCase()
      );
      if (index >= 0) {
        list.splice(index, 1);
        setIsCurrentBookmarked(false);
        showToast('Đã xóa khỏi dấu trang');
      } else {
        const newItem: BookmarkItem = {
          id: `bm-${Date.now()}`,
          url: targetUrl,
          title: targetTitle,
          timestamp: Date.now(),
        };
        list = [newItem, ...list];
        setIsCurrentBookmarked(true);
        triggerHaptic('selection');
        showToast('Đã lưu vào dấu trang');
      }
      await AsyncStorage.setItem(bmKey, JSON.stringify(list));
    } catch (e) {
      showToast('Lỗi khi lưu dấu trang');
    }
  };

  // Đổi công cụ tìm kiếm
  const handleChangeEngine = (engineId: 'google' | 'bing' | 'duckduckgo' | 'yahoo') => {
    setCurrentEngineId(engineId);
    AsyncStorage.setItem(STORAGE_ENGINE_KEY, engineId);
    showToast(`Đã chọn: ${SEARCH_ENGINES[engineId]?.name || engineId}`);
  };

  // Yêu cầu xác thực mã PIN trước khi vào Thẻ ẩn danh
  const requestIncognitoAccess = (action: () => void) => {
    if (!incognitoPin || isIncognitoUnlocked) {
      action();
    } else {
      pendingIncognitoActionRef.current = action;
      setPinModalMode('unlock');
      setPinModalVisible(true);
    }
  };

  const handleSavePin = (newPin: string) => {
    setIncognitoPin(newPin);
    setIsIncognitoUnlocked(true);
    AsyncStorage.setItem(STORAGE_PIN_KEY, newPin);
    showToast('Đã thiết lập mã PIN bảo vệ thẻ ẩn danh');
  };

  const handleDisablePin = () => {
    setIncognitoPin(null);
    setIsIncognitoUnlocked(false);
    AsyncStorage.removeItem(STORAGE_PIN_KEY);
    showToast('Đã tắt mã PIN thẻ ẩn danh');
  };

  const handleSuccessUnlock = () => {
    setIsIncognitoUnlocked(true);
    if (pendingIncognitoActionRef.current) {
      const act = pendingIncognitoActionRef.current;
      pendingIncognitoActionRef.current = null;
      act();
    }
  };

  const handleOpenPinSettings = () => {
    if (incognitoPin) {
      setPinModalMode('manage');
    } else {
      setPinModalMode('setup');
    }
    setPinModalVisible(true);
  };

  // Bật/tắt đồng bộ toàn bộ tài khoản
  const handleToggleSyncAccounts = async (val: boolean) => {
    setSyncAllAccounts(val);
    syncAllAccountsRef.current = val;
    await AsyncStorage.setItem(STORAGE_SYNC_ACCOUNTS_KEY, JSON.stringify(val));
    showToast(
      val
        ? 'Đã bật đồng bộ toàn bộ tài khoản'
        : 'Đã tắt đồng bộ (Dữ liệu tài khoản riêng biệt)'
    );
  };

  // Chuyển đổi tài khoản người dùng và quản lý bộ nhớ thẻ/lịch sử riêng biệt
  const handleSwitchAccount = async (newProfile: UserProfile, previousProfile: UserProfile) => {
    if (syncAllAccountsRef.current) {
      setUserProfile(newProfile);
      userProfileRef.current = newProfile;
      await AsyncStorage.setItem('@kite_user_profile', JSON.stringify(newProfile));
      return;
    }

    const prevEmail = previousProfile?.email?.toLowerCase();
    const newEmail = newProfile?.email?.toLowerCase();

    if (prevEmail === newEmail) {
      setUserProfile(newProfile);
      userProfileRef.current = newProfile;
      await AsyncStorage.setItem('@kite_user_profile', JSON.stringify(newProfile));
      return;
    }

    // 1. Lưu lại trạng thái tabs (gồm cả incognito tabs trong RAM) của tài khoản cũ
    if (prevEmail) {
      profileTabsRef.current[prevEmail] = {
        tabs: [...tabs],
        activeTabId,
        isIncognito,
      };
      await persistTabsState(tabs, activeTabId, previousProfile.email);
    }

    // 2. Cập nhật user profile mới
    setUserProfile(newProfile);
    userProfileRef.current = newProfile;
    if (newProfile.isLoggedIn && newProfile.email) {
      await AsyncStorage.setItem('@kite_user_profile', JSON.stringify(newProfile));
    } else {
      await AsyncStorage.removeItem('@kite_user_profile');
    }

    // 3. Khôi phục tabs của tài khoản mới
    if (newEmail && profileTabsRef.current[newEmail]) {
      const cached = profileTabsRef.current[newEmail];
      setTabs(cached.tabs);
      setActiveTabId(cached.activeTabId);
      setIsIncognito(cached.isIncognito);
      const curTab = cached.tabs.find((t) => t.id === cached.activeTabId);
      setInputUrl(curTab?.url || '');
    } else if (newEmail) {
      const newTabsKey = `@kite_persisted_tabs_state_${newEmail}`;
      const newActiveIdKey = `@kite_active_tab_id_${newEmail}`;
      try {
        const [savedData, savedId] = await Promise.all([
          AsyncStorage.getItem(newTabsKey),
          AsyncStorage.getItem(newActiveIdKey),
        ]);
        if (savedData) {
          const parsedTabs: BrowserTab[] = JSON.parse(savedData);
          if (Array.isArray(parsedTabs) && parsedTabs.length > 0) {
            const targetId =
              savedId && parsedTabs.some((t) => t.id === savedId)
                ? savedId
                : parsedTabs[parsedTabs.length - 1].id;
            const initialized = parsedTabs.map((t) => ({
              ...t,
              isSleeping: t.id !== targetId,
            }));
            setTabs(initialized);
            setActiveTabId(targetId);
            const curTab = initialized.find((t) => t.id === targetId);
            setInputUrl(curTab?.url || '');
            setIsIncognito(false);
            return;
          }
        }
      } catch (e) {}

      // Nếu tài khoản mới chưa có tab nào: khởi tạo 1 tab mới mặc định
      const defaultTab: BrowserTab = {
        id: `tab-${Date.now()}`,
        url: '',
        title: 'Trang mới',
        lastActiveAt: Date.now(),
        isSleeping: false,
      };
      setTabs([defaultTab]);
      setActiveTabId(defaultTab.id);
      setInputUrl('');
      setIsIncognito(false);
    } else {
      // Đăng xuất: đưa về 1 tab mới mặc định
      const defaultTab: BrowserTab = {
        id: `tab-${Date.now()}`,
        url: '',
        title: 'Trang mới',
        lastActiveAt: Date.now(),
        isSleeping: false,
      };
      setTabs([defaultTab]);
      setActiveTabId(defaultTab.id);
      setInputUrl('');
      setIsIncognito(false);
    }
  };

  // Bật/tắt chế độ Ẩn danh
  const handleToggleIncognito = () => {
    if (!isIncognito) {
      requestIncognitoAccess(() => {
        setIsIncognito(true);
        const existingIncognito = tabs.find((t) => t.isIncognito);
        if (existingIncognito) {
          setActiveTabId(existingIncognito.id);
          setInputUrl(existingIncognito.url);
        } else {
          executeNewTab(true);
        }
        showToast('Đã bật chế độ ẩn danh');
      });
    } else {
      setIsIncognitoUnlocked(false);
      setIsIncognito(false);
      const existingNormal = tabs.find((t) => !t.isIncognito);
      if (existingNormal) {
        setActiveTabId(existingNormal.id);
        setInputUrl(existingNormal.url);
      } else {
        executeNewTab(false);
      }
      showToast('Đã tắt chế độ ẩn danh');
    }
  };

  // Tìm kiếm bằng hình ảnh (Search by Image)
  const handleSearchByImage = () => {
    setLensScreenShotUri(null);
    setLensModalVisible(true);
  };

  // Tìm kiếm trên màn hình bằng Google Ống kính (Screen search with Google Lens)
  const handleSearchScreenWithLens = async () => {
    if (!activeUrl) {
      setLensScreenShotUri(null);
      setLensModalVisible(true);
      return;
    }
    showToast('Đang chụp màn hình & quét Google Lens...');
    try {
      const snap = await captureActiveSnapshot(activeTabId);
      setLensScreenShotUri(snap || null);
      setLensModalVisible(true);
    } catch (e) {
      setLensScreenShotUri(null);
      setLensModalVisible(true);
    }
  };

  // Tự động hủy xoay loading sau 8 giây để tránh kẹt loading do kết nối ngầm của web
  const triggerLoadingSafetyTimer = () => {
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    loadingTimerRef.current = setTimeout(() => {
      setIsLoading(false);
    }, 8000);
  };

  // Kiểm tra thông minh: chuỗi nhập vào là URL hay từ khóa tìm kiếm
  const isLikelyUrl = (input: string): boolean => {
    const text = input.trim();
    if (/^(https?:\/\/|about:|data:|file:\/\/)/i.test(text)) return true;
    if (/\s/.test(text)) return false; // Có khoảng trắng => từ khóa tìm kiếm
    if (/^localhost(:\d+)?(\/.*)?$/i.test(text)) return true;
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?(\/.*)?$/.test(text)) return true;
    const hostPart = text.split('/')[0].split('?')[0];
    if (hostPart.includes('.') && !hostPart.startsWith('.') && !hostPart.endsWith('.')) {
      const parts = hostPart.split('.');
      const tld = parts[parts.length - 1];
      if (tld.length >= 2 && /^[a-zA-Z]+$/.test(tld)) {
        return true;
      }
    }
    return false;
  };

  // Điều hướng tới URL mới
  const handleNavigate = (url: string) => {
    Keyboard.dismiss();
    setIsEditing(false);
    let finalUrl = url.trim();
    if (!finalUrl) return;

    userInitiatedRef.current = true;

    const engine = SEARCH_ENGINES[currentEngineId] || SEARCH_ENGINES.google;

    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      if (isLikelyUrl(finalUrl)) {
        finalUrl = 'https://' + finalUrl;
      } else {
        finalUrl = `${engine.searchUrl}${encodeURIComponent(finalUrl)}`;
      }
    }

    if (regionSettings.enabled && regionSettings.useProxyGateway) {
      finalUrl = wrapUrlWithProxyGateway(finalUrl, regionSettings);
    }

    setIsLoading(true);
    setLoadProgress(0.2);
    triggerLoadingSafetyTimer();

    setTabs((prev) => {
      const updated = prev.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              url: finalUrl,
              title: finalUrl,
              lastActiveAt: Date.now(),
              isSleeping: false,
            }
          : t
      );
      persistTabsState(updated);
      return updated;
    });
    setInputUrl(finalUrl);
    delete lastBackedUrlRef.current[activeTabId];
    saveToHistory(finalUrl, url.trim(), activeTabId);
    scheduleProcessPooling(activeTabId);
  };

  // Tạo tab mới dạng trang trống mặc định (hỗ trợ cả tab thường và tab ẩn danh)
  const handleNewTab = (isIncognitoMode: boolean = false) => {
    if (isIncognitoMode) {
      requestIncognitoAccess(() => {
        executeNewTab(true);
      });
    } else {
      executeNewTab(false);
    }
  };

  const executeNewTab = async (isIncognitoMode: boolean) => {
    Keyboard.dismiss();
    const prevActiveId = activeTabId;
    let prevSnap: string | null = null;
    try {
      prevSnap = await captureActiveSnapshot(prevActiveId);
    } catch (e) {}

    const newId = `tab-${Date.now()}`;
    const newTabObj: BrowserTab = {
      id: newId,
      url: '',
      title: 'Trang mới',
      isIncognito: isIncognitoMode,
      lastActiveAt: Date.now(),
      isSleeping: false,
    };
    setTabs((prev) => {
      const updated = prev.map((t) =>
        t.id === prevActiveId && prevSnap ? { ...t, snapshotUri: prevSnap } : t
      ).concat(newTabObj);
      persistTabsState(updated, newId);
      return updated;
    });
    setActiveTabId(newId);
    setInputUrl('');
    setIsIncognito(isIncognitoMode);
    setIsEditing(false);
    setIsLoading(false);
    setStats((prev) => ({
      ...prev,
      blockedAds: 0,
      blockedPopups: 0,
      blockedOverlays: 0,
    }));
    showToast(isIncognitoMode ? 'Đã tạo thẻ ẩn danh mới' : 'Đã tạo thẻ mới');
    scheduleProcessPooling(newId);
  };

  // Đóng tab và giải phóng bộ nhớ webView tương ứng (đảm bảo không bao giờ nhảy lộn xộn giữa tab thường và ẩn danh)
  const handleCloseTab = (id: string) => {
    delete webViewRefs.current[id];
    delete webViewContainerRefs.current[id];
    try {
      const snapFile = new File(Paths.document, `tab_snapshot_${id}.jpg`);
      if (snapFile.exists) snapFile.delete();
    } catch {}
    setDetectedMediaByTab((prev) => {
      if (!prev[id]) return prev;
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });

    // Lưu lại thẻ vừa đóng vào danh sách có thể khôi phục
    const closingTab = tabs.find((t) => t.id === id);
    const isClosingIncognito = Boolean(closingTab?.isIncognito);

    if (closingTab?.snapshotUri) {
      try {
        const f = new File(closingTab.snapshotUri);
        if (f.exists) f.delete();
      } catch {}
    }

    if (closingTab && closingTab.url && !closingTab.isIncognito) {
      closedTabsRef.current.push({ ...closingTab });
      if (closedTabsRef.current.length > 25) {
        closedTabsRef.current.shift();
      }
    }

    const remaining = tabs.filter((t) => t.id !== id);
    const remainingSameMode = remaining.filter(
      (t) => Boolean(t.isIncognito) === isClosingIncognito
    );

    // Trường hợp 1: Không còn tab nào thuộc cùng chế độ này
    if (remainingSameMode.length === 0) {
      if (isClosingIncognito) {
        // Đóng tab ẩn danh cuối cùng -> Danh sách ẩn danh giờ trống rỗng
        const remainingNormal = remaining.filter((t) => !t.isIncognito);
        if (remainingNormal.length > 0) {
          const nextActive = remainingNormal[remainingNormal.length - 1];
          setTabs(remaining);
          persistTabsState(remaining, nextActive.id);
          setActiveTabId(nextActive.id);
          setInputUrl(nextActive.url);
          setIsIncognito(false);
        } else {
          const newNormalId = `tab-${Date.now()}`;
          const newTabObj: BrowserTab = {
            id: newNormalId,
            url: '',
            title: 'Trang mới',
            lastActiveAt: Date.now(),
            isSleeping: false,
            isIncognito: false,
          };
          setTabs([newTabObj]);
          persistTabsState([newTabObj], newNormalId);
          setActiveTabId(newNormalId);
          setInputUrl('');
          setIsIncognito(false);
        }
      } else {
        // Đóng tab thường cuối cùng (trong khi vẫn có thể còn tab ẩn danh)
        // TUYỆT ĐỐI KHÔNG nhảy sang tab ẩn danh! Tạo ngay tab thường mới:
        const newNormalId = `tab-${Date.now()}`;
        const newTabObj: BrowserTab = {
          id: newNormalId,
          url: '',
          title: 'Trang mới',
          lastActiveAt: Date.now(),
          isSleeping: false,
          isIncognito: false,
        };
        const updatedTabs = [...remaining, newTabObj];
        setTabs(updatedTabs);
        persistTabsState(updatedTabs, newNormalId);
        setActiveTabId(newNormalId);
        setInputUrl('');
        setIsIncognito(false);
      }
      return;
    }

    // Trường hợp 2: Vẫn còn tab cùng chế độ
    let nextActiveId = activeTabId;
    if (activeTabId === id) {
      // Chỉ chọn tab tiếp theo TRONG CÙNG CHẾ ĐỘ
      const nextActive = remainingSameMode[remainingSameMode.length - 1];
      nextActiveId = nextActive.id;
      setActiveTabId(nextActive.id);
      setInputUrl(nextActive.url);
      setIsIncognito(isClosingIncognito);
      if (nextActive.isSleeping) {
        setTabs((prev) => {
          const updated = prev
            .filter((t) => t.id !== id)
            .map((t) =>
              t.id === nextActive.id
                ? { ...t, isSleeping: false, lastActiveAt: Date.now() }
                : t
            );
          persistTabsState(updated, nextActiveId);
          return updated;
        });
        scheduleProcessPooling(nextActive.id);
        return;
      }
      scheduleProcessPooling(nextActive.id);
    }

    setTabs(remaining);
    persistTabsState(remaining, nextActiveId);
  };

  // Khôi phục thẻ vừa đóng gần nhất
  const handleRestoreClosedTab = () => {
    if (closedTabsRef.current.length === 0) {
      showToast('Không có thẻ nào để khôi phục');
      return;
    }
    const restored = closedTabsRef.current.pop();
    if (!restored) return;
    const newId = `tab-${Date.now()}`;
    const newTab: BrowserTab = {
      ...restored,
      id: newId,
      snapshotUri: undefined,
      lastActiveAt: Date.now(),
      isSleeping: false,
    };
    setTabs((prev) => {
      const updated = [...prev, newTab];
      persistTabsState(updated, newId);
      return updated;
    });
    setActiveTabId(newId);
    setInputUrl(newTab.url);
    setIsIncognito(!!newTab.isIncognito);
    scheduleProcessPooling(newId);
    showToast(`Đã khôi phục thẻ: ${newTab.title || newTab.url}`);
  };

  // Xóa toàn bộ dữ liệu duyệt web & lịch sử
  const handleClearBrowsingData = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_HISTORY_KEY);
      setStats({
        blockedAds: 0,
        blockedPopups: 0,
        blockedOverlays: 0,
        isShieldActive: true,
        aggressiveMode: true,
      });
      showToast('Đã xóa dữ liệu duyệt web & lịch sử');
    } catch (e) {
      showToast('Lỗi khi xóa dữ liệu');
    }
  };

  // Đóng mọi thẻ theo chế độ (Thường hoặc Ẩn danh)
  const handleCloseAllTabs = (onlyIncognito = false) => {
    Keyboard.dismiss();
    if (onlyIncognito) {
      const remainingNormal = tabs.filter((t) => !t.isIncognito);
      tabs.filter((t) => t.isIncognito).forEach((t) => {
        delete webViewRefs.current[t.id];
        delete webViewContainerRefs.current[t.id];
        if (t.snapshotUri) {
          try {
            const f = new File(t.snapshotUri);
            if (f.exists) f.delete();
          } catch {}
        }
      });

      if (remainingNormal.length === 0) {
        const newId = `tab-${Date.now()}`;
        const newTabObj: BrowserTab = { id: newId, url: '', title: 'Trang mới', isIncognito: false };
        setTabs([newTabObj]);
        persistTabsState([newTabObj]);
        setActiveTabId(newId);
        setIsIncognito(false);
      } else {
        setTabs(remainingNormal);
        persistTabsState(remainingNormal);
        if (tabs.find((t) => t.id === activeTabId)?.isIncognito) {
          setActiveTabId(remainingNormal[0].id);
          setInputUrl(remainingNormal[0].url);
          setIsIncognito(false);
        }
      }
      showToast('Đã đóng tất cả thẻ ẩn danh');
      return;
    }

    // ĐÓNG TẤT CẢ CÁC THẺ THƯỜNG (BẢO LƯU NGUYÊN VẸN CÁC THẺ ẨN DANH NẾU CÓ)
    const incognitoTabs = tabs.filter((t) => t.isIncognito);
    const normalTabs = tabs.filter((t) => !t.isIncognito);

    const toClose = normalTabs.filter((t) => t.url);
    if (toClose.length > 0) {
      closedTabsRef.current.push(...toClose);
      if (closedTabsRef.current.length > 25) {
        closedTabsRef.current = closedTabsRef.current.slice(-25);
      }
    }

    normalTabs.forEach((t) => {
      delete webViewRefs.current[t.id];
      delete webViewContainerRefs.current[t.id];
      if (t.snapshotUri) {
        try {
          const f = new File(t.snapshotUri);
          if (f.exists) f.delete();
        } catch {}
      }
    });

    const newId = `tab-${Date.now()}`;
    const newNormalTab: BrowserTab = {
      id: newId,
      url: '',
      title: 'Trang mới',
      isIncognito: false,
    };
    const updatedTabs = [...incognitoTabs, newNormalTab];
    setTabs(updatedTabs);
    persistTabsState(updatedTabs, newId);
    setActiveTabId(newId);
    setInputUrl('');
    setIsIncognito(false);
    setIsEditing(false);
    setIsLoading(false);
    setTabSheetVisible(false);
    showToast('Đã đóng tất cả thẻ thường');
  };

  // Đóng các thẻ khác (chỉ đóng các thẻ cùng chế độ, không bao giờ xóa thẻ chế độ còn lại)
  const handleCloseOtherTabs = (keepId: string) => {
    const keepTab = tabs.find((t) => t.id === keepId) || tabs[0];
    if (!keepTab) return;
    const isIncognitoMode = Boolean(keepTab.isIncognito);

    const otherModeTabs = tabs.filter((t) => Boolean(t.isIncognito) !== isIncognitoMode);
    const sameModeToClose = tabs.filter(
      (t) => Boolean(t.isIncognito) === isIncognitoMode && t.id !== keepId
    );

    const normalToClose = sameModeToClose.filter((t) => !t.isIncognito && t.url);
    if (normalToClose.length > 0) {
      closedTabsRef.current.push(...normalToClose);
      if (closedTabsRef.current.length > 25) {
        closedTabsRef.current = closedTabsRef.current.slice(-25);
      }
    }

    sameModeToClose.forEach((t) => {
      delete webViewRefs.current[t.id];
      delete webViewContainerRefs.current[t.id];
      if (t.snapshotUri) {
        try {
          const f = new File(t.snapshotUri);
          if (f.exists) f.delete();
        } catch {}
      }
    });

    const updatedTabs = [...otherModeTabs, keepTab];
    setTabs(updatedTabs);
    persistTabsState(updatedTabs, keepTab.id);
    setActiveTabId(keepTab.id);
    setInputUrl(keepTab.url);
    setIsIncognito(isIncognitoMode);
    showToast(isIncognitoMode ? 'Đã đóng các thẻ ẩn danh khác' : 'Đã đóng các thẻ thường khác');
  };

  // Xử lý nút quay lại thông minh:
  // Nếu có lịch sử trang web -> quay lại trang web trước đó
  // Nếu đang mở trang web nhưng hết lịch sử -> quay về Trang chủ (HomeDashboard)
  const canGoBackEffective = canGoBack || !!activeUrl;
  const handleGoBack = () => {
    const activeWV = getActiveWebView();
    if (canGoBack && activeWV) {
      activeWV.goBack();
    } else if (activeUrl) {
      lastBackedUrlRef.current[activeTabId] = activeUrl;
      clearTabSnapshot(activeTabId);
      setTabs((prev) => {
        const updated = prev.map((t) =>
          t.id === activeTabId ? { ...t, url: '', title: 'Trang mới', snapshotUri: undefined } : t
        );
        persistTabsState(updated);
        return updated;
      });
      setInputUrl('');
    }
  };

  const canGoForwardEffective =
    canGoForward || (!activeUrl && !!lastBackedUrlRef.current[activeTabId]);

  const handleGoForward = () => {
    const activeWV = getActiveWebView();
    if (canGoForward && activeWV) {
      activeWV.goForward();
    } else if (!activeUrl && lastBackedUrlRef.current[activeTabId]) {
      const restoreUrl = lastBackedUrlRef.current[activeTabId];
      delete lastBackedUrlRef.current[activeTabId];
      handleNavigate(restoreUrl);
    }
  };

  // Cơ chế Process Pooling & Tab Freezing thông minh:
  // Giữ tối đa MAX_ACTIVE_WEBVIEWS tab đang tải trong bộ nhớ.
  // Gom nhóm domain: tab cùng domain với tab đang mở được ưu tiên giữ ấm (Process Pooling / cookie session).
  // Các tab dư thừa sẽ được lưu vị trí cuộn trang (scrollX, scrollY) và biểu mẫu (input) rồi đóng băng (unmount)
  const scheduleProcessPooling = (curActiveId: string) => {
    setTimeout(() => {
      setTabs((prevTabs) => {
        const webTabs = prevTabs.filter((t) => t.url);
        if (webTabs.length <= MAX_ACTIVE_WEBVIEWS) {
          return prevTabs;
        }

        const curActiveTab = prevTabs.find((t) => t.id === curActiveId);
        const activeDomain = curActiveTab?.url ? getDomain(curActiveTab.url) : '';

        // Phân loại các tab nền đang có URL
        const backgroundWebTabs = webTabs.filter((t) => t.id !== curActiveId);

        // Xếp thứ tự ưu tiên giữ ấm (Process Pooling):
        // 1. Cùng domain với active tab
        // 2. lastActiveAt mới nhất
        const sorted = [...backgroundWebTabs].sort((a, b) => {
          const aSameDomain =
            activeDomain && a.url && getDomain(a.url) === activeDomain ? 1 : 0;
          const bSameDomain =
            activeDomain && b.url && getDomain(b.url) === activeDomain ? 1 : 0;
          if (aSameDomain !== bSameDomain) {
            return bSameDomain - aSameDomain;
          }
          return (b.lastActiveAt || 0) - (a.lastActiveAt || 0);
        });

        // Giữ lại tối đa MAX_ACTIVE_WEBVIEWS - 1 tab nền nóng
        const keepWarmIds = new Set(
          sorted.slice(0, MAX_ACTIVE_WEBVIEWS - 1).map((t) => t.id)
        );
        keepWarmIds.add(curActiveId);

        // Các tab cần đóng băng
        const tabsToFreeze = sorted.filter(
          (t) => !keepWarmIds.has(t.id) && !t.isSleeping
        );

        if (tabsToFreeze.length > 0) {
          tabsToFreeze.forEach((t) => {
            try {
              webViewRefs.current[t.id]?.injectJavaScript(
                getCaptureTabStateScript(t.id)
              );
            } catch (e) {}
          });

          setTimeout(() => {
            setTabs((current) =>
              current.map((t) => {
                if (
                  tabsToFreeze.some((s) => s.id === t.id) &&
                  !t.isSleeping &&
                  t.id !== curActiveId
                ) {
                  return { ...t, isSleeping: true };
                }
                return t;
              })
            );
          }, 400);
        }

        return prevTabs;
      });
    }, 150);
  };

  // Đóng băng toàn bộ các tab nền theo yêu cầu để giải phóng ngay lập tức 100% RAM WebContent process
  const handleFreezeBackgroundTabs = () => {
    const bgTabs = tabs.filter(
      (t) => t.id !== activeTabId && t.url && !t.isSleeping
    );
    if (bgTabs.length === 0) {
      showToast('Tất cả thẻ nền đã được tối ưu');
      return;
    }

    // Chụp lại vị trí cuộn và form inputs trước khi unmount
    bgTabs.forEach((t) => {
      try {
        webViewRefs.current[t.id]?.injectJavaScript(getCaptureTabStateScript(t.id));
      } catch (e) {}
    });

    setTimeout(() => {
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== activeTabId && t.url && !t.isSleeping) {
            return { ...t, isSleeping: true };
          }
          return t;
        })
      );
      showToast(`Đã đóng băng ${bgTabs.length} thẻ nền để giải phóng RAM`);
    }, 350);
  };

  // Mở danh sách Grid Tabs: Tự động chụp ảnh snapshot của tab hiện tại để Grid luôn có ảnh xem trước mới nhất
  const handleOpenTabSheet = async () => {
    try {
      if (currentTab?.url) {
        webViewRefs.current[activeTabId]?.injectJavaScript(getCaptureTabStateScript(activeTabId));
      }
      const snap = await captureActiveSnapshot(activeTabId);
      if (snap) {
        setTabs((prev) => {
          const updated = prev.map((t) =>
            t.id === activeTabId ? { ...t, snapshotUri: snap } : t
          );
          persistTabsState(updated);
          return updated;
        });
      }
    } catch (e) {}
    setTabSheetVisible(true);
  };

  // Chuyển tab theo chiến lược "Snapshot & Swap":
  // 1. Chụp màn hình tab cũ và lưu tọa độ cuộn (scrollX, scrollY)
  // 2. Unmount giải phóng WebView tab cũ khỏi RAM để tránh Jetsam kill trên iOS
  // 3. Nạp URL tab mới và tự động cuộn đúng vị trí đang đọc dở
  const handleSelectTab = async (id: string) => {
    if (id === activeTabId) {
      setTabSheetVisible(false);
      return;
    }

    const previousId = activeTabId;
    const previousTab = tabs.find((t) => t.id === previousId);

    // Chụp snapshot màn hình tab cũ ngay lập tức trước khi chuyển
    let capturedSnapshot: string | null = null;
    if (previousTab?.url) {
      try {
        webViewRefs.current[previousId]?.injectJavaScript(getCaptureTabStateScript(previousId));
        capturedSnapshot = await captureActiveSnapshot(previousId);
      } catch (e) {}
    }

    const target = tabs.find((t) => t.id === id);
    const now = Date.now();

    // Cập nhật trạng thái: Giữ tab cũ trong RAM (chỉ pause media nền) và kích hoạt tab mới
    setTabs((prev) => {
      const updated = prev.map((t) => {
        if (t.id === previousId) {
          try {
            webViewRefs.current[previousId]?.injectJavaScript(PAUSE_BACKGROUND_MEDIA_SCRIPT);
          } catch (e) {}
          return {
            ...t,
            snapshotUri: capturedSnapshot || t.snapshotUri,
          };
        }
        if (t.id === id) {
          return {
            ...t,
            isSleeping: false,
            lastActiveAt: now,
          };
        }
        return t;
      });
      persistTabsState(updated, id);
      return updated;
    });

    setStats((prev) => ({
      ...prev,
      isReaderMode: !!target?.isReaderMode,
    }));

    if (target?.isIncognito) {
      requestIncognitoAccess(() => {
        setActiveTabId(id);
        setInputUrl(target?.url || '');
        setIsIncognito(true);
        scheduleProcessPooling(id);
      });
    } else {
      setIsIncognitoUnlocked(false);
      setActiveTabId(id);
      setInputUrl(target?.url || '');
      setIsIncognito(false);
      scheduleProcessPooling(id);
    }
  };

  // Ghi nhận lịch sử duyệt web (TUYỆT ĐỐI KHÔNG GHI NHẬN KHI LÀ THẺ ẨN DANH)
  const saveToHistory = async (url: string, title: string, tabId?: string) => {
    const targetTab = tabs.find((t) => t.id === (tabId || activeTabId)) || currentTab;
    if (!url || url.startsWith('about:') || isIncognito || targetTab?.isIncognito) return;
    try {
      const isSync = syncAllAccountsRef.current;
      const activeEmail =
        userProfileRef.current.isLoggedIn ? userProfileRef.current.email : undefined;
      const historyKey =
        !isSync && activeEmail
          ? `@kite_browsing_history_${activeEmail.toLowerCase()}`
          : STORAGE_HISTORY_KEY;

      const stored = await AsyncStorage.getItem(historyKey);
      let list: HistoryItem[] = stored ? JSON.parse(stored) : [];
      if (list.length > 0 && list[0].url === url) return;
      const newItem: HistoryItem = {
        id: `hist-${Date.now()}`,
        url,
        title: title || url,
        timestamp: Date.now(),
      };
      const updated = [newItem, ...list.filter((i) => i.url !== url).slice(0, 199)];
      await AsyncStorage.setItem(historyKey, JSON.stringify(updated));
    } catch (e) {}
  };

  // Nhận thông điệp từ script inject bên trong WebView
  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'TAB_STATE_CAPTURED') {
        const { tabId, state } = data;
        setTabs((prev) => {
          const updated = prev.map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  frozenState: state,
                }
              : t
          );
          persistTabsState(updated);
          return updated;
        });
      } else if (data.type === 'BLOCKED_POPUP') {
        setStats((prev) => ({ ...prev, blockedPopups: prev.blockedPopups + 1 }));
      } else if (data.type === 'BLOCKED_OVERLAYS') {
        setStats((prev) => ({
          ...prev,
          blockedOverlays: data.count || prev.blockedOverlays + 1,
        }));
      } else if (data.type === 'BLOCKED_REDIRECT') {
        setStats((prev) => ({ ...prev, blockedAds: prev.blockedAds + 1 }));
        showToast(`Đã chặn nhảy trang: ${data.url || 'Quảng cáo'}`);
      } else if (data.type === 'MANUAL_ZAP_SUCCESS') {
        showToast(`Đã xóa ${data.count || 0} lớp phủ`);
      } else if (data.type === 'FIND_IN_PAGE_RESULT') {
        setFindInPageStats({
          total: data.total || 0,
          current: data.current || 0,
        });
      } else if (data.type === 'READER_MODE_STATE') {
        const isActive = !!data.active;
        setTabs((prev) =>
          prev.map((t) => (t.id === activeTabId ? { ...t, isReaderMode: isActive } : t))
        );
        setStats((prev) => ({ ...prev, isReaderMode: isActive }));
        if (isActive) {
          showToast('Đã bật chế độ đọc báo');
        } else {
          showToast('Đã tắt chế độ đọc báo');
        }
      } else if (data.type === 'VIDEO_FULLSCREEN_ENTER') {
        ScreenOrientation.unlockAsync().catch(() => {});
      } else if (data.type === 'VIDEO_FULLSCREEN_EXIT') {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      } else if (data.type === 'VIDEO_PLAYING') {
        isVideoPlayingRef.current = true;
        updateWakeLock(stats.isKeepAwakeActive, true);
      } else if (data.type === 'VIDEO_PAUSED') {
        isVideoPlayingRef.current = false;
        updateWakeLock(stats.isKeepAwakeActive, false);
      } else if (data.type === 'MEDIA_DETECTED') {
        const media = data.media;
        if (media && media.url) {
          // 1. Loại bỏ hoàn toàn các tệp chunk / phân đoạn nhỏ rời rạc
          const isChunk =
            /\.(ts|m4s|m4f|key|vtt|srt|dfxp|ass|ssa)(\?|$|#)/i.test(media.url) ||
            /[\?&](range|segment|chunk|frag|byterange)=\d+/i.test(media.url) ||
            /\/(seg|chunk|fragment|range)[-_\d]/i.test(media.url);
          if (isChunk) return;

          setDetectedMediaByTab((prev) => {
            const currentList = prev[activeTabId] || [];

            // 2. Hàm sinh chữ ký luồng phát để gom nhóm các biến thể độ phân giải (1080p, 720p, master)
            const getSig = (u: string) => {
              try {
                const clean = u.split('?')[0].split('#')[0].toLowerCase();
                const dm =
                  u.match(/video\/fmp4\/([a-zA-Z0-9]+)/i) ||
                  u.match(/manifest\/video\/([a-zA-Z0-9]+)/i) ||
                  u.match(/[?&]video=([a-zA-Z0-9]+)/i);
                if (dm) return `dm-${dm[1]}`;

                const yt = u.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
                if (yt && u.includes('videoplayback')) return `yt-${yt[1]}`;

                const baseHls = clean.replace(
                  /\/(master|playlist|index|1080p|720p|480p|360p|chunklist[^\/]*|h264[^\/]*|manifest)\.m3u8$/i,
                  ''
                );
                if (baseHls !== clean) return `hls-${baseHls}`;

                return clean;
              } catch (e) {
                return u;
              }
            };

            const newSig = getSig(media.url);
            const existingIdx = currentList.findIndex((m) => getSig(m.url) === newSig);

            if (existingIdx !== -1) {
              // Nếu đã có luồng này và URL mới là master.m3u8 thì ưu tiên nâng cấp lên master
              const isOldMaster = currentList[existingIdx].url.toLowerCase().includes('master.m3u8');
              const isNewMaster = media.url.toLowerCase().includes('master.m3u8');
              if (isNewMaster && !isOldMaster) {
                const updated = [...currentList];
                updated[existingIdx] = {
                  ...updated[existingIdx],
                  url: media.url,
                  format: 'm3u8',
                };
                return { ...prev, [activeTabId]: updated };
              }
              // Đã tồn tại luồng phát này -> Không thêm trùng lặp!
              return prev;
            }

            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } catch (e) {}

            let title = media.title || currentTab?.title || 'Video';
            // Làm sạch tiêu đề (loại bỏ hậu tố tên trang web như | Filmove, - DonghuaWorld...)
            title = title
              .replace(/\s*[-|–—]\s*(Filmove|DonghuaWorld|Xem Phim|Phim Mới|Bilibili|YouTube).*$/i, '')
              .replace(/[\n\r\t]+/g, ' ')
              .trim();

            const newMedia: DetectedMedia = {
              id: `media-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              url: media.url,
              title: title || 'Video',
              format: media.format || 'mp4',
              tabId: activeTabId,
              detectedAt: media.detectedAt || Date.now(),
            };
            return {
              ...prev,
              [activeTabId]: [...currentList, newMedia],
            };
          });
        }
      } else if (data.type === 'KITE_PULL_MOVE') {
        handlePullMove(data.dy, data.dx);
      } else if (data.type === 'KITE_PULL_END') {
        handlePullEnd();
      } else if (data.type === 'KITE_PULL_CANCEL') {
        handlePullCancel();
      } else if (data.type === 'GOOGLE_ACCOUNT_CHOSEN') {
        if (currentTab?.isIncognito || isIncognito) return;
        const activeUrlLower = (currentTab?.url || '').toLowerCase();
        const isLegitGoogle =
          activeUrlLower.includes('accounts.google.com') ||
          activeUrlLower.includes('myaccount.google.com') ||
          activeUrlLower.includes('google.com');
        if (!isLegitGoogle) return;

        const isBadName = Boolean(
          data.name &&
          (data.name.toLowerCase().includes('app store') || data.name.toLowerCase().includes('gemini'))
        );
        if (data.email && !isBadName) {
          const isRealPhoto =
            data.avatarUrl &&
            (data.avatarUrl.includes('googleusercontent.com/a/') ||
              data.avatarUrl.includes('googleusercontent.com/a-/') ||
              data.avatarUrl.includes('googleusercontent.com/ogw/'));
          const chosenProfile: UserProfile = {
            isLoggedIn: true,
            name: data.name || data.email.split('@')[0],
            email: data.email,
            avatarUrl: isRealPhoto ? data.avatarUrl : '',
          };
          setUserProfile(chosenProfile);
          AsyncStorage.setItem('@kite_user_profile', JSON.stringify(chosenProfile));
          // Cộng dồn vào @kite_saved_accounts
          AsyncStorage.getItem('@kite_saved_accounts').then((res) => {
            let list: UserProfile[] = [];
            if (res) { try { list = JSON.parse(res); } catch (e) {} }
            if (!Array.isArray(list)) list = [];
            const idx = list.findIndex((a) => a.email?.toLowerCase() === chosenProfile.email?.toLowerCase());
            if (idx !== -1) { list[idx] = chosenProfile; } else { list.push(chosenProfile); }
            AsyncStorage.setItem('@kite_saved_accounts', JSON.stringify(list));
          });
          showToast(`Đã chuyển sang: ${chosenProfile.email}`);
        }
      } else if (data.type === 'GOOGLE_LOGIN_COMPLETED') {
        if (currentTab?.isIncognito || isIncognito) return;
        const activeUrlLower = (currentTab?.url || '').toLowerCase();
        const isLegitGoogle =
          activeUrlLower.includes('accounts.google.com') ||
          activeUrlLower.includes('myaccount.google.com') ||
          activeUrlLower.includes('google.com');
        if (!isLegitGoogle) return;

        const isBadName = Boolean(
          data.name &&
          (data.name.toLowerCase().includes('app store') || data.name.toLowerCase().includes('gemini'))
        );
        if (data.email && !isBadName) {
          const isRealPhoto =
            data.avatarUrl &&
            (data.avatarUrl.includes('googleusercontent.com/a/') ||
              data.avatarUrl.includes('googleusercontent.com/a-/') ||
              data.avatarUrl.includes('googleusercontent.com/ogw/'));
          const profile: UserProfile = {
            isLoggedIn: true,
            name: data.name || data.email.split('@')[0],
            email: data.email,
            avatarUrl: isRealPhoto ? data.avatarUrl : '',
          };
          setUserProfile(profile);
          AsyncStorage.setItem('@kite_user_profile', JSON.stringify(profile));
          AsyncStorage.getItem('@kite_saved_accounts').then((res) => {
            let list: UserProfile[] = [];
            if (res) {
              try {
                list = JSON.parse(res);
              } catch (e) {}
            }
            if (!Array.isArray(list)) list = [];
            const existingIdx = list.findIndex(
              (a) => a.email && profile.email && a.email.toLowerCase() === profile.email.toLowerCase()
            );
            if (existingIdx !== -1) {
              list[existingIdx] = profile;
            } else {
              list.push(profile);
            }
            AsyncStorage.setItem('@kite_saved_accounts', JSON.stringify(list));
          });
          showToast(`Đăng nhập thành công! (${profile.name || profile.email})`);
        }
      } else if (data.type === 'GOOGLE_USER_PROFILE') {
        if (currentTab?.isIncognito || isIncognito) return;
        const activeUrlLower = (currentTab?.url || '').toLowerCase();
        const isLegitGoogle =
          activeUrlLower.includes('accounts.google.com') ||
          activeUrlLower.includes('myaccount.google.com') ||
          activeUrlLower.includes('google.com');
        if (!isLegitGoogle) return;
        const isBadName = Boolean(
          data.name &&
          (data.name.toLowerCase().includes('app store') || data.name.toLowerCase().includes('gemini'))
        );
        if (data.email && !isBadName) {
          const isRealPhoto =
            data.avatarUrl &&
            (data.avatarUrl.includes('googleusercontent.com/a/') ||
              data.avatarUrl.includes('googleusercontent.com/a-/') ||
              data.avatarUrl.includes('googleusercontent.com/ogw/'));
          const profile: UserProfile = {
            isLoggedIn: true,
            name: data.name || data.email.split('@')[0],
            email: data.email,
            avatarUrl: isRealPhoto ? data.avatarUrl : '',
          };

          const isAtMyAccount = currentTab?.url?.toLowerCase().includes('myaccount.google.com');
          if (isAtMyAccount) {
            setUserProfile(profile);
            AsyncStorage.setItem('@kite_user_profile', JSON.stringify(profile));
            AsyncStorage.getItem('@kite_saved_accounts').then((res) => {
              let list: UserProfile[] = [];
              if (res) {
                try {
                  list = JSON.parse(res);
                } catch (e) {}
              }
              if (!Array.isArray(list)) list = [];
              const existingIdx = list.findIndex(
                (a) => a.email && profile.email && a.email.toLowerCase() === profile.email.toLowerCase()
              );
              if (existingIdx !== -1) {
                list[existingIdx] = profile;
              } else {
                list.push(profile);
              }
              AsyncStorage.setItem('@kite_saved_accounts', JSON.stringify(list));
            });
            // Giữ nguyên tab để người dùng quản lý tài khoản Google bình thường, không đưa về trang trống
            return;
          }

          setUserProfile((prev) => {
            // NẾU NGƯỜI DÙNG ĐÃ ĐĂNG XUẤT: Tuyệt đối không tự động đăng nhập ngầm từ script trang web!
            if (!prev || !prev.isLoggedIn || !prev.email) {
              return prev || { isLoggedIn: false, name: '', email: '', avatarUrl: '' };
            }
            const isDifferentEmail = Boolean(
              prev?.email &&
              profile.email &&
              prev.email.toLowerCase() !== profile.email.toLowerCase()
            );
            // Chỉ cập nhật khi người dùng đang đăng nhập và chuyển sang email khác hoặc có avatar nét hơn
            if (
              isDifferentEmail ||
              (!prev.avatarUrl && profile.avatarUrl) ||
              (!prev.name && profile.name)
            ) {
              AsyncStorage.setItem('@kite_user_profile', JSON.stringify(profile));
              if (isDifferentEmail && profile.email) {
                showToast(`Đã chuyển sang: ${profile.name || profile.email}`);
              }
              return profile;
            }
            return prev;
          });
        }
      } else if (data.type === 'DETECTED_LOGIN') {
        if (currentTab?.isIncognito || isIncognito) return;
        if (data.website && data.username && data.password) {
          const activeUrl = currentTab?.url || '';
          const currentDomain = getDomain(activeUrl) || '';
          const reportedSite = (data.website || '').toLowerCase().trim();

          const isMatchingDomain =
            !currentDomain ||
            reportedSite.includes(currentDomain) ||
            currentDomain.includes(reportedSite) ||
            reportedSite.endsWith('.' + currentDomain);

          if (isMatchingDomain) {
            setPasswordSavePrompt({
              visible: true,
              website: currentDomain || data.website,
              username: data.username,
              passwordSecret: data.password,
            });
          }
        }
      }
    } catch (e) {}
  };

  // Bộ lọc chặn request mạng trước khi tải (chặn đổi URL cướp tab và mạng quảng cáo)
  const handleShouldStartLoad = (request: { url: string; isTopFrame?: boolean }) => {
    const reqUrl = request.url.toLowerCase();

    // 0. Cho phép các trang OAuth và server Supabase xử lý mã xác thực Google
    if (
      reqUrl.includes('accounts.google.com') ||
      reqUrl.includes('myaccount.google.com') ||
      reqUrl.includes('oauth2.googleapis.com') ||
      reqUrl.includes('supabase.co/auth/v1/callback') ||
      reqUrl.includes('supabase.co/auth/v1/authorize')
    ) {
      return true;
    }

    // 1. Bắt Callback hoàn tất trả về App (kite://auth-callback hoặc localhost:3000 hoặc URL chứa session token/error)
    if (isOAuthCallback(request.url)) {
      if (reqUrl.includes('error=')) {
        setIsLoading(false);
        showToast('Đăng nhập Google bị gián đoạn, vui lòng thử lại.');
        clearTabSnapshot(activeTabId);
        setTabs((prev) => {
          const updated = prev.map((t) =>
            t.id === activeTabId ? { ...t, url: '', title: 'Trang mới', snapshotUri: undefined } : t
          );
          persistTabsState(updated);
          return updated;
        });
        setInputUrl('');
        return false;
      }

      handleAuthCallbackUrl(request.url).then((profile) => {
        setIsLoading(false);
        if (profile) {
          setUserProfile(profile);
          AsyncStorage.setItem('@kite_user_profile', JSON.stringify(profile));
          upsertCloudProfile(profile.email || 'user', profile);
          // Cộng dồn vào @kite_saved_accounts
          if (profile.email) {
            AsyncStorage.getItem('@kite_saved_accounts').then((res) => {
              let list: UserProfile[] = [];
              if (res) { try { list = JSON.parse(res); } catch (e) {} }
              if (!Array.isArray(list)) list = [];
              const idx = list.findIndex((a) => a.email?.toLowerCase() === profile.email?.toLowerCase());
              if (idx !== -1) { list[idx] = profile; } else { list.push(profile); }
              AsyncStorage.setItem('@kite_saved_accounts', JSON.stringify(list));
            });
          }
          showToast(`Đăng nhập Google thành công! (${profile.name})`);
        } else {
          showToast('Đăng nhập Google chưa hoàn tất, vui lòng thử lại.');
        }
        clearTabSnapshot(activeTabId);
        setTabs((prev) => {
          const updated = prev.map((t) =>
            t.id === activeTabId ? { ...t, url: '', title: 'Trang mới', snapshotUri: undefined } : t
          );
          persistTabsState(updated);
          return updated;
        });
        setInputUrl('');
      });
      return false;
    }

    // 1. Cho phép các trang nội bộ about/data
    if (reqUrl.startsWith('about:blank') || reqUrl.startsWith('data:')) {
      return true;
    }

    // 1b. Bắt liên kết tải tệp trực tiếp để không chuyển toàn bộ trang sang màn hình trắng
    const isDirectDownload = /\.(mp4|mov|avi|mkv|mp3|wav|zip|rar|7z|tar|gz|pdf|apk|dmg|iso)(\?.*)?$/i.test(request.url);
    if (isDirectDownload) {
      handleFileDownload({ nativeEvent: { downloadUrl: request.url } });
      return false;
    }

    // 2. Nếu người dùng chủ động gõ URL hoặc bấm kết quả tìm kiếm/dấu trang: cho phép tải thẳng
    if (userInitiatedRef.current) {
      userInitiatedRef.current = false;
      return true;
    }

    // 3. Nếu là subframe / iframe (như iframe trình phát video nhúng): không coi là cướp tab
    if (request.isTopFrame === false) {
      return true;
    }

    // 4. Cho phép các trang đăng nhập / chọn tài khoản Google hoạt động thông suốt
    if (
      reqUrl.includes('accounts.google.com') ||
      reqUrl.includes('myaccount.google.com') ||
      reqUrl.includes('oauth2.googleapis.com') ||
      reqUrl.includes('utm_source=sign_in_no_continue')
    ) {
      return true;
    }

    // 5. Chặn các schema độc hại cố tình mở App Store hoặc Telegram
    for (const scheme of BLOCKED_SCHEMES) {
      if (reqUrl.startsWith(scheme)) {
        setStats((prev) => ({ ...prev, blockedAds: prev.blockedAds + 1 }));
        showToast('Đã chặn mở ứng dụng ngoài');
        return false;
      }
    }

    // 6. Kiểm tra các bộ lọc nếu Khiên bảo vệ (Shield) đang bật
    if (stats.isShieldActive) {
      const host = getHostname(reqUrl) || '';

      // A. So khớp hostname chính xác với danh sách mạng quảng cáo
      const isAdDomain = BLOCKED_DOMAINS.some(
        (d) => host === d || host.endsWith('.' + d)
      );
      if (isAdDomain) {
        setStats((prev) => ({ ...prev, blockedAds: prev.blockedAds + 1 }));
        showToast(`Đã chặn mạng quảng cáo: ${host}`);
        return false;
      }

      // B. So khớp từ khóa nhà cái trên domain label (không bị dính chuỗi con chung chung như better, alphabet...)
      const domainLabel = getDomainWithoutSuffix(reqUrl) || '';
      const isGambling = BLOCKED_GAMBLING_KEYWORDS.some((kw) => {
        return domainLabel === kw || (domainLabel.startsWith(kw) && /^\w*$/.test(domainLabel));
      });
      if (isGambling) {
        setStats((prev) => ({ ...prev, blockedAds: prev.blockedAds + 1 }));
        showToast(`Đã chặn web cá cược: ${domainLabel}`);
        return false;
      }

      // C. Xử lý cướp tab giữa các tên miền độc lập (sử dụng getDomain của tldts hỗ trợ chuẩn .com.vn)
      const currentDomain = getDomain(activeUrl || '') || '';
      const targetDomain = getDomain(request.url) || '';

      // Kiểm tra xem trang nguồn có phải là máy tìm kiếm không (so theo hostname, tránh bug /binge-watch/)
      const currentHost = getHostname(activeUrl || '') || '';
      const SEARCH_ENGINE_HOSTS = ['google.com', 'google.com.vn', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'baidu.com'];
      const isFromSearchEngine = SEARCH_ENGINE_HOSTS.some(
        (se) => currentHost === se || currentHost.endsWith('.' + se)
      );

      if (isFromSearchEngine) {
        return true;
      }

      // Khi web phim tự ý đổi toàn bộ trang sang tên miền thương mại điện tử / tiếp thị liên kết
      if (currentDomain && targetDomain && currentDomain !== targetDomain) {
        const isCommerceHijack = COMMERCE_REDIRECT_DOMAINS.some(
          (c) => targetDomain === c || targetDomain.endsWith('.' + c)
        );
        if (isCommerceHijack) {
          setStats((prev) => ({ ...prev, blockedAds: prev.blockedAds + 1 }));
          showToast(`Đã chặn cướp tab sang: ${targetDomain}`);
          return false;
        }
      }
    }

    return true;
  };

  // Cập nhật trạng thái điều hướng cho từng tab riêng biệt
  const handleNavigationStateChangeForTab = (tabId: string, navState: WebViewNavigation) => {
    // 0. Bắt callback Google OAuth từ Supabase
    if (navState.url && isOAuthCallback(navState.url)) {
      if (navState.url.toLowerCase().includes('error=')) {
        setIsLoading(false);
        showToast('Đăng nhập Google bị gián đoạn, vui lòng thử lại.');
        clearTabSnapshot(tabId);
        setTabs((prev) => {
          const updated = prev.map((t) =>
            t.id === tabId ? { ...t, url: '', title: 'Trang mới', snapshotUri: undefined } : t
          );
          persistTabsState(updated);
          return updated;
        });
        setInputUrl('');
        return;
      }

      handleAuthCallbackUrl(navState.url).then((profile) => {
        setIsLoading(false);
        if (profile) {
          setUserProfile(profile);
          AsyncStorage.setItem('@kite_user_profile', JSON.stringify(profile));
          upsertCloudProfile(profile.email || 'user', profile);
          // Cộng dồn vào @kite_saved_accounts
          if (profile.email) {
            AsyncStorage.getItem('@kite_saved_accounts').then((res) => {
              let list: UserProfile[] = [];
              if (res) { try { list = JSON.parse(res); } catch (e) {} }
              if (!Array.isArray(list)) list = [];
              const idx = list.findIndex((a) => a.email?.toLowerCase() === profile.email?.toLowerCase());
              if (idx !== -1) { list[idx] = profile; } else { list.push(profile); }
              AsyncStorage.setItem('@kite_saved_accounts', JSON.stringify(list));
            });
          }
          showToast(`Đăng nhập Google thành công! (${profile.name})`);
        } else {
          showToast('Đăng nhập Google chưa hoàn tất, vui lòng thử lại.');
        }
        clearTabSnapshot(tabId);
        setTabs((prev) => {
          const updated = prev.map((t) =>
            t.id === tabId ? { ...t, url: '', title: 'Trang mới', snapshotUri: undefined } : t
          );
          persistTabsState(updated);
          return updated;
        });
        setInputUrl('');
      });
      return;
    }

    if (tabId === activeTabId) {
      setCanGoBack(navState.canGoBack);
      setCanGoForward(navState.canGoForward);
      if (!isEditing && navState.url) {
        setInputUrl(navState.url);
      }
    }

    if (navState.title) {
      setTabs((prev) => {
        const updated = prev.map((t) => (t.id === tabId ? { ...t, title: navState.title } : t));
        persistTabsState(updated);
        return updated;
      });
    }

    if (navState.url) {
      saveToHistory(navState.url, navState.title || navState.url, tabId);
      const isUrlDifferent = tabs.find((t) => t.id === tabId)?.url !== navState.url;
      setTabs((prev) => {
        const isDiff = prev.find((t) => t.id === tabId)?.url !== navState.url;
        const updated = prev.map((t) =>
          t.id === tabId
            ? {
                ...t,
                url: navState.url,
                isReaderMode: isDiff ? false : t.isReaderMode,
              }
            : t
        );
        persistTabsState(updated);
        return updated;
      });
      if (tabId === activeTabId && isUrlDifferent) {
        setStats((prev) => ({
          ...prev,
          isReaderMode: false,
        }));
      }
      if (isUrlDifferent) {
        setDetectedMediaByTab((prev) => {
          if (!prev[tabId] || prev[tabId].length === 0) return prev;
          const copy = { ...prev };
          delete copy[tabId];
          return copy;
        });
      }
    }
  };

  // Ép gỡ bỏ lớp phủ tàng hình bằng tay (Manual Zap)
  const handleForceZap = () => {
    const activeWV = getActiveWebView();
    if (activeWV && activeUrl) {
      activeWV.injectJavaScript(FORCE_ZAP_SCRIPT);
    } else {
      showToast('Chỉ áp dụng khi đang duyệt web');
    }
  };

  // Bật/tắt chế độ Trang web máy tính (Desktop User-Agent) theo từng trang
  const handleToggleDesktopMode = () => {
    const nextVal = !currentTab?.isDesktop;
    setTabs((prev) => {
      const updated = prev.map((t) => (t.id === activeTabId ? { ...t, isDesktop: nextVal } : t));
      persistTabsState(updated);
      return updated;
    });
    setTimeout(() => {
      const activeWV = getActiveWebView();
      if (activeWV) {
        activeWV.reload();
      }
    }, 80);
    showToast(nextVal ? 'Đã bật chế độ Trang web máy tính' : 'Đã về chế độ Trang web di động');
  };

  // Bật/tắt Khiên Kite Shield
  const handleToggleShield = () => {
    const nextVal = !stats.isShieldActive;
    setStats((prev) => ({ ...prev, isShieldActive: nextVal }));
    AsyncStorage.setItem(STORAGE_SHIELD_ACTIVE_KEY, JSON.stringify(nextVal));
    showToast(nextVal ? 'Đã bật Khiên Kite Shield' : 'Đã tắt Khiên Kite Shield');
  };

  // Bật/tắt Chế độ chặn gắt gao (Aggressive Mode)
  const handleToggleAggressive = () => {
    const nextVal = !stats.aggressiveMode;
    setStats((prev) => ({ ...prev, aggressiveMode: nextVal }));
    AsyncStorage.setItem(STORAGE_SHIELD_AGGRESSIVE_KEY, JSON.stringify(nextVal));
    showToast(nextVal ? 'Đã bật Chế độ chặn gắt gao' : 'Đã tắt Chế độ chặn gắt gao');
  };

  // Bật/tắt chế độ Tiết kiệm dữ liệu (Data Saver)
  const handleToggleDataSaver = () => {
    const nextVal = !stats.isDataSaverActive;
    const mode: DataSaverMode = nextVal ? (stats.dataSaverMode || 'block_images') : 'off';

    setStats((prev) => ({
      ...prev,
      isDataSaverActive: nextVal,
      dataSaverMode: nextVal ? (prev.dataSaverMode || 'block_images') : 'off',
    }));

    AsyncStorage.setItem(STORAGE_DATA_SAVER_KEY, mode);

    if (nextVal) {
      getActiveWebView()?.injectJavaScript(getDataSaverScript(mode));
      showToast(
        mode === 'block_images'
          ? 'Đã bật: Tắt tải hình ảnh (Chạm vào ảnh để tải)'
          : 'Đã bật: Nén & Tối ưu ảnh nhẹ'
      );
    } else {
      getActiveWebView()?.injectJavaScript(getDataSaverScript('off'));
      showToast('Đã tắt Tiết kiệm dữ liệu');
    }
  };

  // Đổi phân loại chế độ Tiết kiệm dữ liệu: Tắt tải ảnh hoàn toàn hoặc Nén ảnh
  const handleChangeDataSaverMode = (mode: 'block_images' | 'compress_images') => {
    setStats((prev) => ({
      ...prev,
      isDataSaverActive: true,
      dataSaverMode: mode,
    }));
    AsyncStorage.setItem(STORAGE_DATA_SAVER_KEY, mode);
    getActiveWebView()?.injectJavaScript(getDataSaverScript(mode));
    showToast(
      mode === 'block_images'
        ? 'Đã bật: Tắt tải hình ảnh (Chạm vào ảnh để tải)'
        : 'Đã bật: Nén & Tối ưu ảnh nhẹ'
    );
  };

  // Bật/tắt chế độ Giữ màn hình luôn sáng (Wake Lock)
  const handleToggleKeepAwake = () => {
    const nextVal = !stats.isKeepAwakeActive;
    setStats((prev) => ({ ...prev, isKeepAwakeActive: nextVal }));
    updateWakeLock(nextVal, isVideoPlayingRef.current);
    AsyncStorage.setItem(STORAGE_KEEP_AWAKE_KEY, JSON.stringify(nextVal));
    showToast(nextVal ? 'Đã bật Giữ màn hình luôn sáng' : 'Đã tắt Giữ màn hình luôn sáng');
  };

  // Bật/tắt Chế độ đọc báo (Reader Mode)
  const handleToggleReaderMode = () => {
    const activeWV = getActiveWebView();
    if (!activeWV || !activeUrl) {
      showToast('Chỉ áp dụng khi đang xem trang web');
      return;
    }
    const currentTabObj = tabs.find((t) => t.id === activeTabId);
    const currentlyActive = !!currentTabObj?.isReaderMode;
    if (currentlyActive) {
      activeWV.injectJavaScript(EXIT_READER_MODE_SCRIPT);
      setTabs((prev) => {
        const updated = prev.map((t) => (t.id === activeTabId ? { ...t, isReaderMode: false } : t));
        persistTabsState(updated);
        return updated;
      });
      setStats((prev) => ({ ...prev, isReaderMode: false }));
      showToast('Đã tắt chế độ đọc báo');
    } else {
      activeWV.injectJavaScript(READER_MODE_SCRIPT);
      setTabs((prev) => {
        const updated = prev.map((t) => (t.id === activeTabId ? { ...t, isReaderMode: true } : t));
        persistTabsState(updated);
        return updated;
      });
      setStats((prev) => ({ ...prev, isReaderMode: true }));
      showToast('Đã bật chế độ đọc báo');
    }
  };

  // Xử lý khi có yêu cầu tải tệp xuống: Mở hộp thoại để người dùng chọn nơi lưu
  const handleFileDownload = async ({ nativeEvent }: { nativeEvent: { downloadUrl: string } }) => {
    const { downloadUrl } = nativeEvent;
    if (!downloadUrl) return;

    let cleanName = '';
    // 1. Tìm tên tệp trong query parameters (filename, file, title, name)
    const paramMatch = downloadUrl.match(/[?&](?:filename|file|title|name)=([^&]+)/i);
    if (paramMatch && paramMatch[1]) {
      try {
        cleanName = decodeURIComponent(paramMatch[1]);
      } catch (e) {
        cleanName = paramMatch[1];
      }
    }

    // 2. Nếu URL chứa url lồng nhau (như proxy?url=https://.../video.mp4)
    if (!cleanName || cleanName.toLowerCase() === 'proxy') {
      const innerUrlMatch = downloadUrl.match(/[?&]url=([^&]+)/i);
      if (innerUrlMatch && innerUrlMatch[1]) {
        try {
          const decodedInner = decodeURIComponent(innerUrlMatch[1]);
          const innerName = decodedInner.split('/').pop()?.split('?')[0];
          if (innerName && innerName.length > 2 && innerName.includes('.')) {
            cleanName = innerName;
          }
        } catch (e) {}
      }
    }

    // 3. Nếu vẫn chưa có, lấy từ đoạn cuối URL
    if (!cleanName) {
      cleanName = downloadUrl.split('/').pop()?.split('?')[0] || '';
    }

    try {
      cleanName = decodeURIComponent(cleanName);
    } catch (e) {}

    // 4. Nếu tên vô nghĩa (như 'proxy', 'download', 'index', hoặc không có đuôi)
    const isGeneric = !cleanName || ['proxy', 'download', 'index', 'api', 'media', 'stream'].includes(cleanName.toLowerCase());
    if (isGeneric || !cleanName.includes('.')) {
      const pageTitle = (currentTab?.title || 'Tep_tai_ve')
        .replace(/[/\\?%*:|"<>]/g, '_')
        .replace(/\s+/g, '_')
        .trim();
      const ext = downloadUrl.toLowerCase().includes('mp3') ? 'mp3' : 'mp4';
      cleanName = `${pageTitle}_${Date.now().toString().slice(-4)}.${ext}`;
    }

    setDownloadPrompt({
      visible: true,
      url: downloadUrl,
      fileName: cleanName,
    });
  };

  // Xử lý tải video được phát hiện trên trang web (Cốc Cốc style)
  const handleDownloadMedia = (media: DetectedMedia) => {
    let ext = 'mp4';
    if (media.format === 'audio') ext = 'mp3';
    else if (media.format === 'm3u8') ext = 'm3u8';
    else if (media.format === 'webm') ext = 'webm';
    else if (media.format === 'mov') ext = 'mov';
    else if (media.format === 'm4v') ext = 'm4v';

    let cleanName = (media.title || currentTab?.title || 'Video')
      .replace(/\s*[-|–—]\s*(Filmove|DonghuaWorld|Xem Phim|Phim Mới|Bilibili|YouTube|Anime|Trang chủ).*$/i, '')
      .replace(/[/\\?%*:|"<>]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleanName || cleanName === 'Video' || cleanName === 'Video không tên') {
      cleanName = `Video_${Date.now()}`;
    }
    if (!cleanName.toLowerCase().endsWith(`.${ext}`)) {
      cleanName = `${cleanName}.${ext}`;
    }

    setDownloadPrompt({
      visible: true,
      url: media.url,
      fileName: cleanName,
    });
  };

  // Người dùng chọn: Lưu trực tiếp vào Kite (Tệp đã tải)
  const handleConfirmSaveToKite = async () => {
    if (!downloadPrompt) return;
    const { url, fileName } = downloadPrompt;
    const taskId = `task-${Date.now()}`;
    const cleanFileName = fileName || `video_${Date.now()}.mp4`;

    // 1. Thêm ngay vào danh sách activeDownloads để hiển thị tiến trình và tên tuổi tệp
    const newTask: ActiveDownloadItem = {
      id: taskId,
      fileName: cleanFileName,
      url,
      progress: 0,
      bytesWritten: 0,
      totalBytes: 0,
      status: 'downloading',
    };
    setActiveDownloads((prev) => [newTask, ...prev]);

    // 2. Đóng hộp thoại DownloadPromptModal để người dùng tiếp tục xem phim
    setDownloadPrompt(null);
    showToast(`Bắt đầu tải: ${cleanFileName}`);

    try {
      const destination = new File(Paths.document, cleanFileName);
      const downloadedFile = await File.downloadFileAsync(url, destination, {
        idempotent: true,
        onProgress: (p) => {
          setActiveDownloads((prev) =>
            prev.map((item) => {
              if (item.id !== taskId) return item;
              const total = p.totalBytes > 0 ? p.totalBytes : 0;
              const percent = total > 0 ? Math.round((p.bytesWritten / total) * 100) : 0;
              return {
                ...item,
                bytesWritten: p.bytesWritten,
                totalBytes: total,
                progress: percent,
              };
            })
          );
        },
      });

      const actualName = downloadedFile?.name || cleanFileName;

      // 3. Xóa khỏi activeDownloads khi hoàn tất
      setActiveDownloads((prev) => prev.filter((item) => item.id !== taskId));

      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}

      try {
        const stored = await AsyncStorage.getItem(STORAGE_DOWNLOADS_KEY);
        const list: DownloadedItem[] = stored ? JSON.parse(stored) : [];
        const newItem: DownloadedItem = {
          id: `dl-${Date.now()}`,
          fileName: actualName,
          uri: downloadedFile.uri,
          fileSize: downloadedFile.size || 0,
          timestamp: Date.now(),
          sourceUrl: url,
        };
        const updated = [newItem, ...list.filter((i) => i.uri !== downloadedFile.uri)];
        await AsyncStorage.setItem(STORAGE_DOWNLOADS_KEY, JSON.stringify(updated));
      } catch (e) {}

      showToast(`Đã tải xong: ${actualName}`);
    } catch (e) {
      setActiveDownloads((prev) => prev.filter((item) => item.id !== taskId));
      showToast(`Tải thất bại: ${cleanFileName}`);
    }
  };

  // Người dùng chọn: Chọn nơi lưu... (Tải với thanh tiến trình gần thanh nav, sau đó mở hộp thoại Lưu tệp/Chia sẻ của iOS)
  const handleConfirmChooseLocation = async () => {
    if (!downloadPrompt) return;
    const { url, fileName } = downloadPrompt;
    const taskId = `task-${Date.now()}`;
    const cleanFileName = fileName || `file_${Date.now()}`;

    // 1. Thêm ngay vào activeDownloads để thanh tiến trình xuất hiện gần thanh nav
    const newTask: ActiveDownloadItem = {
      id: taskId,
      fileName: cleanFileName,
      url,
      progress: 0,
      bytesWritten: 0,
      totalBytes: 0,
      status: 'downloading',
    };
    setActiveDownloads((prev) => [newTask, ...prev]);

    // 2. Đóng hộp thoại DownloadPromptModal ngay lập tức, KHÔNG BAO GIỜ hiển thị modal che màn hình
    setDownloadPrompt(null);
    showToast(`Đang tải tệp: ${cleanFileName}`);

    try {
      const destination = new File(Paths.cache, cleanFileName);
      const downloadedFile = await File.downloadFileAsync(url, destination, {
        idempotent: true,
        onProgress: (p) => {
          setActiveDownloads((prev) =>
            prev.map((item) => {
              if (item.id !== taskId) return item;
              const total = p.totalBytes > 0 ? p.totalBytes : 0;
              const percent = total > 0 ? Math.round((p.bytesWritten / total) * 100) : 0;
              return {
                ...item,
                bytesWritten: p.bytesWritten,
                totalBytes: total,
                progress: percent,
              };
            })
          );
        },
      });

      // 3. Xóa khỏi activeDownloads khi tải xong
      setActiveDownloads((prev) => prev.filter((item) => item.id !== taskId));

      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}

      // 4. Mở ngay hộp thoại Lưu vào Tệp / Chia sẻ của iOS để người dùng chọn nơi lưu
      const canShare = await Sharing.isAvailableAsync();
      if (canShare && downloadedFile?.uri) {
        await Sharing.shareAsync(downloadedFile.uri);
      } else if (downloadedFile?.uri) {
        await Share.share({ url: downloadedFile.uri });
      } else {
        await Share.share({ url });
      }
    } catch (e) {
      setActiveDownloads((prev) => prev.filter((item) => item.id !== taskId));
      showToast(`Tải thất bại: ${cleanFileName}`);
    }
  };

  // Mở trình quản lý Tệp đã tải xuống của Kite
  const handleOpenDownloads = () => {
    setDownloadSheetVisible(true);
  };

  // Mở trình quản lý Bộ nhớ & Bộ nhớ đệm của Kite
  const handleOpenStorageManager = () => {
    setStorageManagerVisible(true);
  };

  // Xóa bộ nhớ đệm web: WebView native HTTP & disk cache + Paths.cache
  const handleClearWebCache = async () => {
    try {
      // 1. Xóa cache trên toàn bộ WebView instances
      Object.values(webViewRefs.current).forEach((ref) => {
        try {
          ref?.clearCache(true);
        } catch {}
      });
      // 2. Xóa các tệp trong thư mục cache hệ thống
      if (Paths.cache && Paths.cache.exists) {
        const items = Paths.cache.list();
        for (const item of items) {
          try {
            item.delete();
          } catch {}
        }
      }
    } catch (e) {
      console.log('Error clearing web cache:', e);
    }
  };

  // Giải phóng ảnh chụp thẻ duyệt web: xóa tệp snapshot trên ổ cứng & dọn tab state
  const handleClearTabSnapshots = async () => {
    try {
      tabs.forEach((t) => {
        if (t.snapshotUri && t.id !== activeTabId) {
          try {
            const f = new File(t.snapshotUri);
            if (f.exists) f.delete();
          } catch {}
        }
      });
      setTabs((prev) => {
        const updated = prev.map((t) => (t.id !== activeTabId ? { ...t, snapshotUri: undefined } : t));
        persistTabsState(updated);
        return updated;
      });
    } catch (e) {
      console.log('Error clearing tab snapshots:', e);
    }
  };

  // Xóa lịch sử duyệt web
  const handleClearBrowsingHistory = async () => {
    try {
      await AsyncStorage.removeItem('@kite_browsing_history');
    } catch (e) {
      console.log('Error clearing history:', e);
    }
  };

  // Xác nhận lưu mật khẩu tự động sau khi đăng nhập
  const handleConfirmSavePassword = async () => {
    if (!passwordSavePrompt) return;
    const { website, username, passwordSecret } = passwordSavePrompt;
    await saveCredentialSecurely(website, username, passwordSecret);
    setPasswordSavePrompt(null);
    showToast(`Đã lưu tài khoản ${website} vào Keychain`);
  };

  // Xử lý Tìm trong trang (Ctrl + F)
  const handleFindInPageSearch = (query: string) => {
    const activeWV = getActiveWebView();
    if (activeWV) {
      activeWV.injectJavaScript(getFindInPageSearchScript(query));
    }
  };

  const handleFindInPageNext = () => {
    const activeWV = getActiveWebView();
    if (activeWV) {
      activeWV.injectJavaScript(getFindInPageNextScript());
    }
  };

  const handleFindInPagePrev = () => {
    const activeWV = getActiveWebView();
    if (activeWV) {
      activeWV.injectJavaScript(getFindInPagePrevScript());
    }
  };

  const handleFindInPageClose = () => {
    setFindInPageVisible(false);
    setFindInPageStats({ total: 0, current: 0 });
    const activeWV = getActiveWebView();
    if (activeWV) {
      activeWV.injectJavaScript(getFindInPageClearScript());
    }
  };

  const isCurrentIncognito = Boolean(currentTab ? currentTab.isIncognito : isIncognito);
  const appBg = isCurrentIncognito ? '#202124' : '#ffffff';
  const viewportBg = activeUrl !== null ? '#ffffff' : appBg;
  const normalTabsCount = tabs.filter((t) => !t.isIncognito).length;
  const incognitoTabsCount = tabs.filter((t) => !!t.isIncognito).length;
  const currentTabCount = isCurrentIncognito ? incognitoTabsCount : normalTabsCount;

  return (
    <View style={[styles.mainContainer, { backgroundColor: appBg }]}>
      <StatusBar
        barStyle={isCurrentIncognito ? 'light-content' : 'dark-content'}
        backgroundColor={appBg}
      />

      {/* VÙNG TOP BAR: Header có nút khiên bên trái, lời chúc ở giữa và NÚT 3 CHẤM BÊN PHẢI */}
      {activeUrl !== null && !isEditing && (
        <View
          style={[
            styles.webTopBar,
            {
              paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 20),
              backgroundColor: appBg,
              borderBottomColor: isIncognito ? '#2d2f31' : '#e4e4e7',
            },
          ]}
          onTouchStart={handleHeaderTouchStart}
          onTouchMove={handleHeaderTouchMove}
          onTouchEnd={handleHeaderTouchEnd}
        >
          <View style={styles.webTopGreetingRow}>
            {/* Nút Khiên chặn quảng cáo bên trái (phong cách Cốc Cốc: icon đen, tag BẬT màu blue) */}
            <TouchableOpacity
              style={styles.webTopShieldBtn}
              onPress={() => setShieldSheetVisible(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
            >
              {stats.isShieldActive && (
                <View style={styles.shieldTagBadge}>
                  <Text style={styles.shieldTagText}>On</Text>
                </View>
              )}
              <Feather
                name="shield"
                size={17}
                color={stats.isShieldActive ? (isIncognito ? '#e4e4e7' : '#09090b') : '#a1a1aa'}
              />
            </TouchableOpacity>

            <Text
              style={[
                styles.webTopGreetingText,
                { color: isIncognito ? '#9ca3af' : '#52525b' },
              ]}
              numberOfLines={1}
            >
              Kite chúc bạn một ngày tốt lành!
            </Text>

            {/* Nút 3 chấm mở Menu tiện ích bên phải */}
            <TouchableOpacity
              style={styles.webTopIconBtn}
              onPress={() => setBrowserMenuVisible(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
            >
              <Feather
                name="more-horizontal"
                size={20}
                color={isIncognito ? '#e8eaed' : '#27272a'}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Vùng duyệt Web hoặc Màn hình tìm kiếm & Lịch sử hoặc Trang trống mặc định */}
      <View style={[styles.viewport, { backgroundColor: viewportBg }]}>
        {/* Thanh tiến trình tải trang (Loading Progress Bar) */}
        {isLoading && activeUrl !== null && (
          <View style={styles.loadingBarTrack} pointerEvents="none">
            <View
              style={[
                styles.loadingBarProgress,
                {
                  width: `${Math.max(10, Math.min(100, (loadProgress || 0.15) * 100))}%`,
                  backgroundColor: isCurrentIncognito ? '#60a5fa' : '#007aff',
                },
              ]}
            />
          </View>
        )}

        {isEditing ? (
          /* MÀN HÌNH TÌM KIẾM & LỊCH SỬ DUYỆT WEB DUY NHẤT CỦA KITE */
          <SearchOverlay
            inputUrl={inputUrl}
            onUrlChange={setInputUrl}
            onSubmit={handleNavigate}
            onCancel={() => {
              setIsEditing(false);
              setInputUrl(activeUrl || '');
            }}
            onSearchByImage={handleSearchByImage}
            onScanQr={() => {
              setIsEditing(false);
              setQrModalVisible(true);
            }}
            currentEngineName={SEARCH_ENGINES[currentEngineId]?.name || 'Google'}
            currentEngineId={currentEngineId}
            onChangeEngine={handleChangeEngine}
            isIncognito={isCurrentIncognito}
            isBookmarked={isCurrentBookmarked}
            onToggleBookmark={() =>
              handleToggleBookmarkCurrentPage(inputUrl, currentTab?.title)
            }
            userEmail={
              syncAllAccounts
                ? undefined
                : userProfile.isLoggedIn
                ? userProfile.email
                : undefined
            }
          />
        ) : (
          <>
            {/* 1. MÀN HÌNH HOME DASHBOARD (Hiển thị khi tab hiện tại là trang mới url === null) */}
            {activeUrl === null && (
              <View
                ref={(ref) => {
                  webViewContainerRefs.current[activeTabId] = ref;
                }}
                collapsable={false}
                style={{ flex: 1, backgroundColor: '#ffffff' }}
              >
                <HomeDashboard
                  activeTabId={activeTabId}
                  onSelectUrl={handleNavigate}
                  onFocusSearch={() => {
                    setInputUrl('');
                    setIsEditing(true);
                  }}
                  currentEngineId={currentEngineId}
                  onChangeEngine={handleChangeEngine}
                  isIncognito={isCurrentIncognito}
                  onToggleIncognito={handleToggleIncognito}
                  onSearchByImage={handleSearchByImage}
                  onScanQr={() => setQrModalVisible(true)}
                  onOpenBookmarks={() => setBookmarkSheetVisible(true)}
                  onOpenHistory={() => setHistorySheetVisible(true)}
                  onOpenDownloads={handleOpenDownloads}
                  onOpenPasswordManager={() => setPasswordManagerVisible(true)}
                  onOpenExtensions={() => setExtensionSheetVisible(true)}
                  onOpenTabs={handleOpenTabSheet}
                  onOpenStorageManager={handleOpenStorageManager}
                  incognitoPin={incognitoPin}
                  onOpenPinSettings={handleOpenPinSettings}
                  userProfile={userProfile}
                  onUpdateProfile={(p) => {
                    setUserProfile(p);
                    userProfileRef.current = p;
                    if (p.isLoggedIn && p.email) {
                      AsyncStorage.setItem('@kite_user_profile', JSON.stringify(p));
                    } else {
                      AsyncStorage.removeItem('@kite_user_profile');
                    }
                  }}
                  syncAllAccounts={syncAllAccounts}
                  onToggleSyncAccounts={handleToggleSyncAccounts}
                  onSwitchAccount={handleSwitchAccount}
                  onShowToast={showToast}
                  onPullMove={handlePullMove}
                  onPullEnd={handlePullEnd}
                  onPullCancel={handlePullCancel}
                  pullDistance={pullDistance}
                />
              </View>
            )}

            {/* 2. CÁC TAB WEB CHẠY ĐỘC LẬP TRONG BỘ NHỚ (KHÔNG RELOAD KHI CHUYỂN TAB) */}
            {tabs.map((tab) => {
              if (!tab.url) return null;
              const isTabActive = tab.id === activeTabId;

              // Process Isolation & Memory Swap: Hoàn toàn giải phóng WKWebView khỏi DOM khi tab đang ngủ
              if (tab.isSleeping && !isTabActive) {
                return null;
              }

              return (
                <View
                  key={tab.id}
                  ref={(ref) => {
                    webViewContainerRefs.current[tab.id] = ref;
                  }}
                  collapsable={false}
                  style={[
                    styles.webViewContainer,
                    { backgroundColor: '#ffffff', display: isTabActive ? 'flex' : 'none' },
                  ]}
                  pointerEvents={isTabActive ? 'auto' : 'none'}
                >
                  <WebView
                    ref={(ref) => {
                      webViewRefs.current[tab.id] = ref;
                    }}
                    originWhitelist={['*']}
                    source={{ uri: tab.url }}
                    style={[styles.webView, { backgroundColor: '#ffffff' }]}
                    incognito={Boolean(tab.isIncognito)}
                    mediaCapturePermissionGrantType="grant"
                    injectedJavaScriptBeforeContentLoadedForMainFrameOnly={true}
                    injectedJavaScriptForMainFrameOnly={false}
                    injectedJavaScriptBeforeContentLoaded={
                      ((stats.isShieldActive ? INJECTED_BEFORE_CONTENT : '') +
                        getRegionInjectedScript(regionSettings) +
                        getExtensionsScriptForTab(tab.url, 'document_start')) ||
                      undefined
                    }
                    injectedJavaScript={
                      ((stats.isShieldActive ? INJECTED_AFTER_CONTENT : '') +
                        VIDEO_SNIFFER_SCRIPT +
                        getExtensionsScriptForTab(tab.url, 'document_end')) ||
                      undefined
                    }
                    onMessage={handleMessage}
                    onShouldStartLoadWithRequest={handleShouldStartLoad}
                    onNavigationStateChange={(navState) =>
                      handleNavigationStateChangeForTab(tab.id, navState)
                    }
                    onLoadStart={() => {
                      if (tab.id === activeTabId) {
                        setIsLoading(true);
                        setLoadProgress(0.15);
                        triggerLoadingSafetyTimer();
                      }
                    }}
                    onLoadProgress={({ nativeEvent }) => {
                      if (tab.id === activeTabId) {
                        setLoadProgress(Math.max(0.15, nativeEvent.progress));
                      }
                    }}
                    onLoadEnd={() => {
                      if (tab.id === activeTabId) {
                        if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
                        setLoadProgress(1);
                        setTimeout(() => {
                          setIsLoading(false);
                        }, 250);
                        if (stats.isDataSaverActive) {
                          const mode = stats.dataSaverMode || 'block_images';
                          webViewRefs.current[tab.id]?.injectJavaScript(getDataSaverScript(mode));
                        }
                        if (tab.isReaderMode) {
                          webViewRefs.current[tab.id]?.injectJavaScript(READER_MODE_SCRIPT);
                          setStats((prev) => ({ ...prev, isReaderMode: true }));
                        }
                        // Chạy các tiện ích mở rộng người dùng đã bật (User Extensions)
                        const extScript = getExtensionsScriptForTab(tab.url, 'document_end');
                        if (extScript) {
                          webViewRefs.current[tab.id]?.injectJavaScript(extScript);
                        }
                        // Khôi phục chính xác vị trí cuộn & dữ liệu biểu mẫu khi tab được đánh thức
                        if (tab.frozenState) {
                          webViewRefs.current[tab.id]?.injectJavaScript(
                            getRestoreTabStateScript(tab.frozenState)
                          );
                        }
                        // Chụp ảnh snapshot của tab sau khi DOM và video player đã render đầy đủ
                        setTimeout(() => {
                          captureActiveSnapshot(tab.id).then((snap) => {
                            if (snap) {
                              setTabs((prev) => {
                                const updated = prev.map((t) =>
                                  t.id === tab.id ? { ...t, snapshotUri: snap } : t
                                );
                                persistTabsState(updated);
                                return updated;
                              });
                            }
                          });
                        }, 1600);

                        setTimeout(() => {
                          captureActiveSnapshot(tab.id).then((snap) => {
                            if (snap) {
                              setTabs((prev) => {
                                const updated = prev.map((t) =>
                                  t.id === tab.id ? { ...t, snapshotUri: snap } : t
                                );
                                persistTabsState(updated);
                                return updated;
                              });
                            }
                          });
                        }, 3500);
                      }
                    }}
                    onError={(syntheticEvent) => {
                      if (tab.id === activeTabId) setIsLoading(false);
                      const { nativeEvent } = syntheticEvent;
                      const failUrl = nativeEvent?.url || '';
                      if (failUrl.includes('auth-callback') || failUrl.startsWith('kite://')) {
                        if (failUrl.includes('access_token=')) {
                          handleAuthCallbackUrl(failUrl).then((profile) => {
                            if (profile) {
                              setUserProfile(profile);
                              AsyncStorage.setItem('@kite_user_profile', JSON.stringify(profile));
                              upsertCloudProfile(profile.email || 'user', profile);
                              // CỘNG DỒN TÀI KHOẢN MỚI VÀO DANH SÁCH ĐÃ ĐĂNG NHẬP
                              AsyncStorage.getItem('@kite_saved_accounts').then((res) => {
                                let list: UserProfile[] = [];
                                if (res) {
                                  try { list = JSON.parse(res); } catch (e) {}
                                }
                                if (!Array.isArray(list)) list = [];
                                const existingIdx = list.findIndex(
                                  (a) => a.email && profile.email && a.email.toLowerCase() === profile.email.toLowerCase()
                                );
                                if (existingIdx !== -1) {
                                  list[existingIdx] = profile;
                                } else {
                                  list.push(profile);
                                }
                                AsyncStorage.setItem('@kite_saved_accounts', JSON.stringify(list));
                              });
                              showToast(`Đăng nhập Google thành công! (${profile.name})`);
                            }
                          });
                        }
                        clearTabSnapshot(tab.id);
                        setTabs((prev) => {
                          const updated = prev.map((t) =>
                            t.id === tab.id ? { ...t, url: '', title: 'Trang mới', snapshotUri: undefined } : t
                          );
                          persistTabsState(updated);
                          return updated;
                        });
                        setInputUrl('');
                      }
                    }}
                    onHttpError={() => {
                      if (tab.id === activeTabId) setIsLoading(false);
                    }}
                    allowsBackForwardNavigationGestures
                    javaScriptEnabled
                    domStorageEnabled
                    databaseEnabled={true}
                    cacheEnabled={true}
                    cacheMode="LOAD_DEFAULT"
                    allowFileAccess={false}
                    allowFileAccessFromFileURLs={false}
                    allowUniversalAccessFromFileURLs={false}
                    allowsInlineMediaPlayback
                    allowsPictureInPictureMediaPlayback
                    allowsFullscreenVideo
                    fraudulentWebsiteWarningEnabled={true}
                    onFileDownload={handleFileDownload}
                    mediaPlaybackRequiresUserAction={false}
                    setSupportMultipleWindows={false}
                    sharedCookiesEnabled={true}
                    thirdPartyCookiesEnabled={true}
                    userAgent={
                      tab.isDesktop
                        ? DESKTOP_USER_AGENT
                        : tab.url?.includes('lens.google.com') ||
                          tab.url?.includes('searchbyimage') ||
                          tab.url?.includes('images.google.com')
                        ? DESKTOP_USER_AGENT
                        : tab.url?.includes('accounts.google.com') ||
                          tab.url?.includes('myaccount.google.com') ||
                          tab.url?.includes('oauth2.googleapis.com') ||
                          tab.url?.includes('supabase.co/auth')
                        ? GOOGLE_AUTH_USER_AGENT
                        : undefined
                    }
                  />
                </View>
              );
            })}
          </>
        )}

        {/* Nút Floating Tải Video (Cốc Cốc style) */}
        {!isEditing && activeUrl !== null && activeDetectedMedia.length > 0 && (
          <TouchableOpacity
            style={[
              styles.floatingVideoDownloadPill,
              activeDownloads.length > 0 && { bottom: 84 },
            ]}
            onPress={() => setVideoDownloadSheetVisible(true)}
            activeOpacity={0.85}
          >
            <View style={styles.floatingVideoIconCircle}>
              <Feather name="download" size={14} color="#ffffff" />
            </View>
            <Text style={styles.floatingVideoText}>Tải Video</Text>
            <View style={styles.floatingVideoCountBadge}>
              <Text style={styles.floatingVideoCountText}>{activeDetectedMedia.length}</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Thanh Floating hiển thị Tiến trình Tải xuống Đang chạy (Active Downloads) */}
        {!isEditing && activeDownloads.length > 0 && (
          <TouchableOpacity
            style={styles.floatingActiveDownloadBanner}
            onPress={() => setDownloadSheetVisible(true)}
            activeOpacity={0.9}
          >
            <View style={styles.downloadBannerIconBox}>
              <Feather name="arrow-down-circle" size={20} color="#007aff" />
            </View>
            <View style={styles.downloadBannerTextCol}>
              <Text style={styles.downloadBannerTitle} numberOfLines={1}>
                {activeDownloads[0].fileName}
              </Text>
              <Text style={styles.downloadBannerSub}>
                {activeDownloads[0].totalBytes > 0
                  ? `Đang tải: ${activeDownloads[0].progress}% • ${(activeDownloads[0].bytesWritten / (1024 * 1024)).toFixed(1)} / ${(activeDownloads[0].totalBytes / (1024 * 1024)).toFixed(1)} MB`
                  : `Đang tải: ${(activeDownloads[0].bytesWritten / (1024 * 1024)).toFixed(1)} MB...`}
              </Text>
              <View style={styles.downloadBannerProgressBar}>
                <View
                  style={[
                    styles.downloadBannerProgressFill,
                    { width: `${Math.max(6, Math.min(100, activeDownloads[0].progress || 0))}%` },
                  ]}
                />
              </View>
            </View>
            <Feather name="chevron-right" size={16} color="#71717a" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        )}

        {/* Thông báo Toast ngắn gọn */}
        {toastMessage && (
          <View style={styles.toastContainer}>
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        )}
      </View>

      {/* THANH ĐIỀU HƯỚNG ĐÁY CỦA KITE */}
      {!isEditing && (
        <BottomBar
          canGoBack={canGoBackEffective}
          canGoForward={canGoForwardEffective}
          onGoBack={handleGoBack}
          onGoForward={handleGoForward}
          onPressSearch={() => {
            setInputUrl(activeUrl || '');
            setIsEditing(true);
          }}
          onSearchByImage={handleSearchByImage}
          onOpenTabs={handleOpenTabSheet}
          onNewTab={() => handleNewTab(isIncognito)}
          tabCount={currentTabCount}
          currentUrl={activeUrl || undefined}
          placeholder={`Tìm trên ${SEARCH_ENGINES[currentEngineId]?.name || 'Google'} hoặc nhập URL`}
          isBookmarked={isCurrentBookmarked}
          onToggleBookmark={() =>
            handleToggleBookmarkCurrentPage(activeUrl, currentTab?.title)
          }
          isIncognito={isCurrentIncognito}
        />
      )}

      {/* Quản lý danh sách Thẻ (Tabs) của Kite */}
      <TabSheet
        visible={tabSheetVisible}
        onClose={() => setTabSheetVisible(false)}
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
        onClearBrowsingData={handleClearBrowsingData}
        onCloseAllTabs={handleCloseAllTabs}
        onCloseOtherTabs={handleCloseOtherTabs}
        incognitoPin={incognitoPin}
        isIncognitoUnlocked={isIncognitoUnlocked}
        onRequestIncognitoUnlock={requestIncognitoAccess}
        onUnlockSuccess={() => setIsIncognitoUnlocked(true)}
        canRestoreClosedTab={closedTabsRef.current.length > 0}
        onRestoreClosedTab={handleRestoreClosedTab}
        onFreezeBackgroundTabs={handleFreezeBackgroundTabs}
        isIncognito={isCurrentIncognito}
      />

      {/* Bảng điều khiển Kite Shield */}
      <ShieldSheet
        visible={shieldSheetVisible}
        onClose={() => setShieldSheetVisible(false)}
        stats={stats}
        currentUrl={currentTab?.url}
        onToggleShield={handleToggleShield}
        onToggleAggressive={handleToggleAggressive}
        onManualZap={handleForceZap}
      />

      {/* Máy quét mã QR (QR Code Scanner) */}
      <QRScannerModal
        visible={qrModalVisible}
        onClose={() => setQrModalVisible(false)}
        onScanUrl={(url) => {
          setQrModalVisible(false);
          handleNavigate(url);
        }}
      />

      {/* Khung ngắm tìm kiếm bằng hình ảnh (Kite Lens) */}
      <ImageSearchModal
        visible={lensModalVisible}
        onClose={() => {
          setLensModalVisible(false);
          setLensScreenShotUri(null);
        }}
        onSearchResult={(url) => {
          setLensModalVisible(false);
          setLensScreenShotUri(null);
          handleNavigate(url);
        }}
        initialImageUri={lensScreenShotUri}
      />

      {/* Quản lý tệp đã tải xuống (Download Sheet) */}
      <DownloadSheet
        visible={downloadSheetVisible}
        onClose={() => setDownloadSheetVisible(false)}
        onShowToast={showToast}
        activeDownloads={activeDownloads}
      />

      {/* Trình quản lý mật khẩu (Password Manager) */}
      <PasswordManagerSheet
        visible={passwordManagerVisible}
        onClose={() => setPasswordManagerVisible(false)}
        onSelectUrl={handleNavigate}
        onShowToast={showToast}
      />

      {/* Hộp thoại xác nhận tải xuống & Chọn nơi lưu */}
      {downloadPrompt && (
        <DownloadPromptModal
          visible={downloadPrompt.visible}
          fileName={downloadPrompt.fileName}
          downloadUrl={downloadPrompt.url}
          onSaveToKite={handleConfirmSaveToKite}
          onChooseLocation={handleConfirmChooseLocation}
          onCancel={() => setDownloadPrompt(null)}
        />
      )}

      {/* Bảng danh sách Video phát hiện trên trang web (Cốc Cốc style) */}
      <VideoDownloadSheet
        visible={videoDownloadSheetVisible}
        onClose={() => setVideoDownloadSheetVisible(false)}
        mediaList={activeDetectedMedia}
        onDownload={handleDownloadMedia}
        onShowToast={showToast}
      />

      {/* Hộp thoại đề xuất lưu mật khẩu tự động sau khi đăng nhập */}
      {passwordSavePrompt && (
        <PasswordSavePromptModal
          visible={passwordSavePrompt.visible}
          website={passwordSavePrompt.website}
          username={passwordSavePrompt.username}
          onSave={handleConfirmSavePassword}
          onDismiss={() => setPasswordSavePrompt(null)}
        />
      )}

      {/* Menu trình duyệt 3 chấm Header (Browser Menu Sheet) */}
      <BrowserMenuSheet
        visible={browserMenuVisible}
        onClose={() => setBrowserMenuVisible(false)}
        currentUrl={activeUrl}
        currentTitle={currentTab?.title}
        currentEngineId={currentEngineId}
        onChangeEngine={handleChangeEngine}
        isDesktop={currentTab?.isDesktop}
        isBookmarked={isCurrentBookmarked}
        isIncognito={isCurrentIncognito}
        onToggleBookmark={() =>
          handleToggleBookmarkCurrentPage(activeUrl, currentTab?.title)
        }
        onToggleDesktop={handleToggleDesktopMode}
        onReload={() => {
          const activeWV = getActiveWebView();
          if (activeWV) {
            setIsLoading(true);
            setLoadProgress(0.15);
            triggerLoadingSafetyTimer();
            activeWV.reload();
            showToast('Đang tải lại trang...');
          }
        }}
        onShare={() => {
          setBrowserMenuVisible(false);
          const rawUrl = activeUrl || currentTab?.url || inputUrl;
          if (!rawUrl || rawUrl.startsWith('about:') || rawUrl.startsWith('kite://')) {
            showToast('Không có liên kết để chia sẻ');
            return;
          }
          let shareUrl = rawUrl.trim();
          if (!shareUrl.startsWith('http://') && !shareUrl.startsWith('https://')) {
            shareUrl = 'https://' + shareUrl;
          }
          const titleToShare = currentTab?.title || 'Kite Browser';

          setTimeout(async () => {
            try {
              if (Platform.OS === 'ios') {
                await Share.share({
                  url: shareUrl,
                });
              } else {
                await Share.share({
                  title: titleToShare,
                  message: `${titleToShare}\n${shareUrl}`,
                });
              }
            } catch (err: any) {
              if (err?.message && !err.message.includes('dismissed') && !err.message.includes('cancel')) {
                showToast('Không thể mở chia sẻ');
              }
            }
          }, Platform.OS === 'ios' ? 500 : 150);
        }}
        onFindInPage={() => {
          if (!activeUrl) {
            showToast('Chỉ tìm được trên trang web');
            return;
          }
          setFindInPageVisible(true);
        }}
        onOpenDownloads={handleOpenDownloads}
        onOpenPasswordManager={() => setPasswordManagerVisible(true)}
        onOpenExtensions={() => setExtensionSheetVisible(true)}
        onOpenBookmarks={() => setBookmarkSheetVisible(true)}
        onOpenHistory={() => setHistorySheetVisible(true)}
        onNewTab={() => handleNewTab(isIncognito)}
        onNewIncognitoTab={() => handleNewTab(true)}
        onOpenShield={() => setShieldSheetVisible(true)}
        onOpenStorageManager={handleOpenStorageManager}
        isReaderMode={Boolean(currentTab?.isReaderMode || stats.isReaderMode)}
        onToggleReaderMode={handleToggleReaderMode}
        isKeepAwakeActive={Boolean(stats.isKeepAwakeActive)}
        onToggleKeepAwake={handleToggleKeepAwake}
        isDataSaverActive={Boolean(stats.isDataSaverActive)}
        onToggleDataSaver={handleToggleDataSaver}
        detectedMediaCount={activeDetectedMedia.length}
        onOpenVideoDownload={() => setVideoDownloadSheetVisible(true)}
        onOpenRegionSheet={() => setRegionSheetVisible(true)}
        isRegionActive={regionSettings.enabled}
        currentRegionText={
          regionSettings.enabled
            ? `${getActiveRegionNode(regionSettings.activeRegionId).flag} ${getActiveRegionNode(regionSettings.activeRegionId).name}`
            : undefined
        }
      />

      {/* Quản lý Tiện ích mở rộng (Extension Sheet) */}
      <ExtensionSheet
        visible={extensionSheetVisible}
        onClose={() => setExtensionSheetVisible(false)}
        onShowToast={showToast}
        onExtensionsUpdated={(updated) => setExtensions(updated)}
        onOpenRegionSheet={() => setRegionSheetVisible(true)}
      />

      {/* Quản lý Chuyển vùng & Proxy (Region Sheet) */}
      <RegionSheet
        visible={regionSheetVisible}
        onClose={() => setRegionSheetVisible(false)}
        settings={regionSettings}
        onUpdateSettings={(newSettings) => setRegionSettings(newSettings)}
        onShowToast={showToast}
        onTestIp={(testUrl) => handleNavigate(testUrl)}
      />

      {/* Khóa mã PIN bảo mật cho Thẻ ẩn danh */}
      <PinModal
        visible={pinModalVisible}
        mode={pinModalMode}
        currentPin={incognitoPin}
        onClose={() => {
          setPinModalVisible(false);
          pendingIncognitoActionRef.current = null;
        }}
        onSuccessUnlock={handleSuccessUnlock}
        onSavePin={handleSavePin}
        onDisablePin={handleDisablePin}
        onShowToast={showToast}
      />

      {/* Lịch sử duyệt web (History Sheet) */}
      <HistorySheet
        visible={historySheetVisible}
        onClose={() => setHistorySheetVisible(false)}
        onSelectUrl={handleNavigate}
        userEmail={
          syncAllAccounts
            ? undefined
            : userProfile.isLoggedIn
            ? userProfile.email
            : undefined
        }
      />

      {/* Danh sách Dấu trang (Bookmark Sheet) */}
      <BookmarkSheet
        visible={bookmarkSheetVisible}
        onClose={() => setBookmarkSheetVisible(false)}
        onSelectUrl={handleNavigate}
        currentUrl={activeUrl}
        currentTitle={currentTab?.title}
        userEmail={
          syncAllAccounts
            ? undefined
            : userProfile.isLoggedIn
            ? userProfile.email
            : undefined
        }
      />

      {/* Quản lý Dung lượng & Bộ nhớ đệm (Storage Manager Sheet) */}
      <StorageManagerSheet
        visible={storageManagerVisible}
        onClose={() => setStorageManagerVisible(false)}
        tabs={tabs.map((t) => ({
          id: t.id,
          title: t.title,
          url: t.url,
          snapshotUri: t.snapshotUri,
        }))}
        activeTabId={activeTabId}
        onClearWebCache={handleClearWebCache}
        onClearTabSnapshots={handleClearTabSnapshots}
        onOpenDownloads={handleOpenDownloads}
        onClearHistory={handleClearBrowsingHistory}
        onShowToast={showToast}
      />

      {/* THANH VUỐT XUỐNG HÀNH ĐỘNG CỦA KITE */}
      <PullDownBar
        pullDistance={pullDistance}
        pullOffset={pullOffset}
        isPulling={isPulling}
        activeAction={activePullAction}
        topInset={activeUrl !== null ? topInset + 24 : topInset}
        isIncognito={isIncognito}
      />

      {/* THANH TÌM TRONG TRANG (CTRL + F) */}
      <FindInPageBar
        visible={findInPageVisible}
        totalMatches={findInPageStats.total}
        currentMatch={findInPageStats.current}
        onSearch={handleFindInPageSearch}
        onNext={handleFindInPageNext}
        onPrev={handleFindInPagePrev}
        onClose={handleFindInPageClose}
        topInset={topInset}
        isIncognito={isIncognito}
      />

      {/* MÀN HÌNH SPLASH SCREEN KHỞI ĐỘNG CỦA KITE */}
      {showSplashOverlay && (
        <Animated.View
          style={[
            styles.splashOverlay,
            {
              opacity: splashFadeAnim,
              transform: [{ scale: splashScaleAnim }],
            },
          ]}
          pointerEvents={isAppReady ? 'none' : 'auto'}
        >
          <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
          <View style={styles.splashContent}>
            <Animated.View style={{ opacity: splashGlowAnim, alignItems: 'center' }}>
              <Image
                source={require('./assets/logokite.png')}
                style={styles.splashLogo}
                resizeMode="contain"
              />
            </Animated.View>
            <Text style={styles.splashTitle}>Kite</Text>
          </View>
          <View style={styles.splashFooter}>
            <ActivityIndicator size="small" color="#007aff" />
          </View>
        </Animated.View>
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <BrowserMain />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999999,
  },
  splashContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    width: 104,
    height: 104,
    borderRadius: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  splashTitle: {
    color: '#09090b',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 18,
  },
  splashFooter: {
    position: 'absolute',
    bottom: 50,
    alignItems: 'center',
  },
  mainContainer: {
    flex: 1,
  },
  viewport: {
    flex: 1,
    position: 'relative',
  },
  webViewContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  webView: {
    flex: 1,
  },
  loadingBarTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    zIndex: 9999,
  },
  loadingBarProgress: {
    height: '100%',
    borderRadius: 1.5,
  },
  toastContainer: {
    position: 'absolute',
    bottom: 18,
    alignSelf: 'center',
    backgroundColor: '#007aff',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  toastText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  webTopBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  webTopGreetingRow: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  webTopIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  webTopGreetingText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  webTopShieldBtn: {
    width: 34,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  shieldTagBadge: {
    position: 'absolute',
    top: 0,
    left: 13,
    backgroundColor: '#007aff',
    paddingHorizontal: 3.5,
    paddingVertical: 1,
    borderRadius: 3.5,
    borderWidth: 0,
    zIndex: 2,
  },
  shieldTagText: {
    color: '#ffffff',
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: -0.2,
    lineHeight: 9,
  },
  headerBadgeDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },
  floatingVideoDownloadPill: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007aff',
    paddingVertical: 8,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: 24,
    shadowColor: '#007aff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 20,
    zIndex: 99999,
  },
  floatingVideoIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  floatingVideoText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginRight: 6,
  },
  floatingVideoCountBadge: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingVideoCountText: {
    color: '#007aff',
    fontSize: 11,
    fontWeight: '800',
  },
  floatingActiveDownloadBanner: {
    position: 'absolute',
    bottom: 14,
    left: 16,
    right: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    zIndex: 99998,
  },
  downloadBannerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  downloadBannerTextCol: {
    flex: 1,
  },
  downloadBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2,
  },
  downloadBannerSub: {
    fontSize: 11,
    color: '#007aff',
    fontWeight: '600',
    marginBottom: 4,
  },
  downloadBannerProgressBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  downloadBannerProgressFill: {
    height: '100%',
    backgroundColor: '#007aff',
    borderRadius: 2,
  },
});
