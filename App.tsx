import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  StatusBar,
  Animated,
  Image,
  Text,
  useWindowDimensions,
  Platform,
  TouchableOpacity,
  StyleSheet,
  LogBox,
  AppState,
} from 'react-native';

LogBox.ignoreLogs(['Cannot record touch move without a touch start.']);
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paths } from 'expo-file-system';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Feather from '@expo/vector-icons/Feather';

// Components
import { WebTopBar } from './src/components/WebTopBar';
import { BottomBar } from './src/components/BottomBar';
import { ShieldSheet } from './src/components/ShieldSheet';
import { TabSheet } from './src/components/TabSheet';
import { HomeDashboard } from './src/components/HomeDashboard';
import { SearchOverlay } from './src/components/SearchOverlay';
import { ImageSearchModal } from './src/components/ImageSearchModal';
import { QRScannerModal } from './src/components/QRScannerModal';
import { HistorySheet } from './src/components/HistorySheet';
import { BookmarkSheet } from './src/components/BookmarkSheet';
import { DownloadSheet } from './src/components/DownloadSheet';
import { DownloadPromptModal } from './src/components/DownloadPromptModal';
import { VideoDownloadSheet } from './src/components/VideoDownloadSheet';
import { PasswordManagerSheet } from './src/components/PasswordManagerSheet';
import { PasswordSavePromptModal } from './src/components/PasswordSavePromptModal';
import { PasswordAutofillBar } from './src/components/PasswordAutofillBar';
import { ImageContextMenuSheet } from './src/components/ImageContextMenuSheet';
import { BrowserMenuSheet, triggerNativeShare } from './src/components/BrowserMenuSheet';
import { StorageManagerSheet } from './src/components/StorageManagerSheet';
import { RegionSheet } from './src/components/RegionSheet';
import { FindInPageBar } from './src/components/FindInPageBar';
import { TabWebView } from './src/components/TabWebView';
import { OfflineDinoScreen } from './src/components/OfflineDinoScreen';
import { WebProgressBar, WebProgressBarRef, progressBus } from './src/components/WebProgressBar';
import { PullDownBar } from './src/components/PullDownBar';
import { PinModal } from './src/components/PinModal';
import { SitePermissionsSheet } from './src/components/SitePermissionsSheet';
import { PermissionPromptModal } from './src/components/PermissionPromptModal';
import { ExtensionSheet } from './src/components/ExtensionSheet';

// Hooks & Services
import { useAuthProfile } from './src/hooks/useAuthProfile';
import { useBrowserTabs } from './src/hooks/useBrowserTabs';
import { useBrowserNavigation } from './src/hooks/useBrowserNavigation';
import { usePullActions } from './src/hooks/usePullActions';
import { useDownloads, isDownloadableUrl, extractFileNameFromUrl } from './src/hooks/useDownloads';
import { useWebViewMessage } from './src/hooks/useWebViewMessage';
import { useShieldAndExtensions } from './src/hooks/useShieldAndExtensions';
import { useBookmarksAndHistory } from './src/hooks/useBookmarksAndHistory';
import { useInitialSetup } from './src/hooks/useInitialSetup';
import { useWebViewRequest } from './src/hooks/useWebViewRequest';
import { saveCloudSettings } from './src/services/supabase';
import { isLegitimateAuthUrl } from './src/constants/blocklist';

import { styles } from './src/styles/App.styles';
import { SEARCH_ENGINES, isJunkHistoryItem } from './src/constants/searchEngines';
import { getActiveRegionNode, getRegionInjectedScript } from './src/services/regionService';
import {
  INJECTED_BEFORE_CONTENT,
  INJECTED_AFTER_CONTENT,
  PAUSE_BACKGROUND_MEDIA_SCRIPT,
} from './src/services/antiAdScript';
import { PULL_GESTURE_SCRIPT } from './src/services/pullGestureScript';
import { PASSWORD_INTERCEPT_SCRIPT } from './src/services/passwordScript';
import { IMAGE_CONTEXT_SCRIPT } from './src/services/imageContextScript';
import { SITE_PERMISSIONS_INJECT_SCRIPT } from './src/services/sitePermissionsScript';
import {
  LIGHT_MODE_START_SCRIPT,
  DARK_MODE_START_SCRIPT,
  DARK_MODE_INJECT_SCRIPT,
  DARK_MODE_REMOVE_SCRIPT,
} from './src/components/ExtensionSheet';
import { BrowserTab, UserProfile } from './src/types/browser';

const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const GOOGLE_AUTH_USER_AGENT =
  Platform.OS === 'ios'
    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
    : 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36';

function BrowserMain() {
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 47 : 24);

  // Trạng thái cơ bản của browser
  const [inputUrl, setInputUrl] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const progressBarRef = useRef<WebProgressBarRef>(null);
  const setLoadProgress = (val: number) => {
    progressBus.set(val);
  };
  const [canGoBack, setCanGoBack] = useState<boolean>(false);
  const [canGoForward, setCanGoForward] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [currentEngineId, setCurrentEngineId] = useState<'google' | 'bing' | 'duckduckgo' | 'yahoo'>('google');

  // Modals & Sheets
  const [storageManagerVisible, setStorageManagerVisible] = useState<boolean>(false);
  const [lensModalVisible, setLensModalVisible] = useState<boolean>(false);
  const [lensScreenShotUri, setLensScreenShotUri] = useState<string | null>(null);
  const [qrModalVisible, setQrModalVisible] = useState<boolean>(false);
  const [browserMenuVisible, setBrowserMenuVisible] = useState<boolean>(false);

  // Refs
  const [appStateStatus, setAppStateStatus] = useState<string>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      setAppStateStatus(nextState);
    });
    return () => sub.remove();
  }, []);

  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userInitiatedRef = useRef<boolean>(false);
  const handleNavigateRef = useRef<(url: string) => void>(() => {});

  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  const triggerLoadingSafetyTimer = () => {
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    loadingTimerRef.current = setTimeout(() => {
      setLoadProgress(1);
      setTimeout(() => {
        setIsLoading(false);
      }, 150);
      setTabs((prev) =>
        prev.map((t) => (t.isLoading ? { ...t, isLoading: false } : t))
      );
    }, 5000);
  };

  const updateWakeLock = (isKeepAwakeActive?: boolean, isVideoPlaying?: boolean) => {
    try {
      if (isKeepAwakeActive || isVideoPlaying) {
        activateKeepAwakeAsync('kite_video_watch');
      } else {
        deactivateKeepAwake('kite_video_watch');
      }
    } catch (e) {}
  };

  // 1. Hook quản lý tài khoản & PIN
  const auth = useAuthProfile({ showToast });

  // 2. Hook quản lý Tabs
  const browserTabs = useBrowserTabs({
    userProfileRef: auth.userProfileRef,
    syncAllAccountsRef: auth.syncAllAccountsRef,
    requestIncognitoAccess: auth.requestIncognitoAccess,
    showToast,
    isLoading,
    setIsLoading,
    setLoadProgress,
    loadingTimerRef,
    setInputUrl,
    setIsEditing,
    triggerLoadingSafetyTimer,
  });

  const {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    activeTabIdRef,
    isIncognito,
    setIsIncognito,
    tabSheetVisible,
    setTabSheetVisible,
    webViewRefs,
    webViewContainerRefs,
    closedTabsRef,
    lastBackedUrlRef,
    isRestoredRef,
    getActiveWebView,
    currentTab,
    activeUrl,
    persistTabsState,
    captureActiveSnapshot,
    clearTabSnapshot,
    handleNewTab,
    handleCloseTab,
    handleRestoreClosedTab,
    handleCloseAllTabs,
    handleCloseOtherTabs,
    scheduleProcessPooling,
    handleFreezeBackgroundTabs,
    handleOpenTabSheet,
    handleSelectTab,
    handleClearTabSnapshots,
  } = browserTabs;

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  // 3. Hook quản lý Khiên, Extension, Dark mode, Reader mode
  const shield = useShieldAndExtensions({
    activeTabId,
    activeUrl,
    currentTab,
    tabs,
    setTabs,
    persistTabsState,
    webViewRefs,
    getActiveWebView,
    updateWakeLock,
    isVideoPlayingRef: { current: false },
    handleNavigate: (url) => nav.handleNavigate(url),
    showToast,
  });

  // 4. Hook quản lý Bookmark & History
  const bookmarksAndHistory = useBookmarksAndHistory({
    activeUrl,
    activeTabId,
    currentTab,
    tabs,
    isIncognito,
    userProfile: auth.userProfile,
    userProfileRef: auth.userProfileRef,
    syncAllAccounts: auth.syncAllAccounts,
    syncAllAccountsRef: auth.syncAllAccountsRef,
    setStats: shield.setStats,
    showToast,
  });

  // 5. Hook quản lý Downloads
  const downloads = useDownloads({
    activeTabId,
    currentTab,
    showToast,
  });

  // 6. Hook quản lý Pull gestures
  const pull = usePullActions({
    isEditing,
    activeTabIdRef,
    tabs,
    webViewRefs,
    getActiveWebView,
    setIsLoading,
    setLoadProgress,
    triggerLoadingSafetyTimer,
    handleRetryOfflineTab: (tabId) => nav.handleRetryOfflineTab(tabId),
    handleNewTab,
    handleCloseTab,
    isIncognito,
    showToast,
  });

  // Modals state object cho BackHandler
  const modalsState = {
    passwordSavePrompt: null as any,
    setPasswordSavePrompt: (_v: any) => {},
    findInPageVisible: false,
    setFindInPageVisible: (_v: boolean) => {},
    downloadPrompt: downloads.downloadPrompt,
    setDownloadPrompt: downloads.setDownloadPrompt,
    completedDownload: downloads.completedDownload,
    setCompletedDownload: downloads.setCompletedDownload,
    chooseLocationModalVisible: downloads.chooseLocationModalVisible,
    setChooseLocationModalVisible: downloads.setChooseLocationModalVisible,
    pinModalVisible: auth.pinModalVisible,
    setPinModalVisible: auth.setPinModalVisible,
    qrModalVisible,
    setQrModalVisible,
    lensModalVisible,
    setLensModalVisible,
    browserMenuVisible,
    setBrowserMenuVisible,
    tabSheetVisible,
    setTabSheetVisible,
    videoDownloadSheetVisible: downloads.videoDownloadSheetVisible,
    setVideoDownloadSheetVisible: downloads.setVideoDownloadSheetVisible,
    downloadSheetVisible: downloads.downloadSheetVisible,
    setDownloadSheetVisible: downloads.setDownloadSheetVisible,
    historySheetVisible: bookmarksAndHistory.historySheetVisible,
    setHistorySheetVisible: bookmarksAndHistory.setHistorySheetVisible,
    bookmarkSheetVisible: bookmarksAndHistory.bookmarkSheetVisible,
    setBookmarkSheetVisible: bookmarksAndHistory.setBookmarkSheetVisible,
    passwordManagerVisible: false,
    setPasswordManagerVisible: (_v: boolean) => {},
    storageManagerVisible,
    setStorageManagerVisible,
    extensionSheetVisible: shield.extensionSheetVisible,
    setExtensionSheetVisible: shield.setExtensionSheetVisible,
    regionSheetVisible: shield.regionSheetVisible,
    setRegionSheetVisible: shield.setRegionSheetVisible,
    sitePermissionsSheetVisible: false,
    setSitePermissionsSheetVisible: (_v: boolean) => {},
  };

  // 7. Hook điều hướng URL & Back/Forward
  const nav = useBrowserNavigation({
    screenWidth,
    tabs,
    setTabs,
    activeTabId,
    activeTabIdRef,
    activeUrl,
    currentTab,
    getActiveWebView,
    webViewRefs,
    lastBackedUrlRef,
    userInitiatedRef,
    loadingTimerRef,
    isLoading,
    setIsLoading,
    setLoadProgress,
    triggerLoadingSafetyTimer,
    canGoBack,
    canGoForward,
    isEditing,
    setIsEditing,
    setInputUrl,
    currentEngineId,
    regionSettings: shield.regionSettings,
    persistTabsState,
    clearTabSnapshot,
    scheduleProcessPooling,
    saveToHistory: bookmarksAndHistory.saveToHistory,
    showToast,
    modalsState,
  });

  handleNavigateRef.current = nav.handleNavigate;

  const canGoBackRef = useRef(nav.canGoBackEffective);
  canGoBackRef.current = nav.canGoBackEffective;
  const handleGoBackRef = useRef(nav.handleGoBack);
  handleGoBackRef.current = nav.handleGoBack;

  const handleSwitchAccountRef = useRef<((newProfile: UserProfile, previousProfile: UserProfile) => Promise<void>) | null>(null);

  // 8. Hook xử lý handleMessage từ webview
  const webViewMessage = useWebViewMessage({
    activeTabId,
    currentTab,
    tabs,
    setTabs,
    persistTabsState,
    webViewRefs,
    getActiveWebView,
    stats: shield.stats,
    setStats: shield.setStats,
    isIncognito,
    userProfileRef: auth.userProfileRef,
    setUserProfile: auth.setUserProfile,
    setDetectedMediaByTab: downloads.setDetectedMediaByTab,
    updateWakeLock,
    handlePullMove: pull.handlePullMove,
    handlePullEnd: pull.handlePullEnd,
    handlePullCancel: pull.handlePullCancel,
    canGoBackRef,
    handleGoBackRef,
    showToast,
    onSwitchAccount: (newP, oldP) => handleSwitchAccountRef.current?.(newP, oldP),
  });

  modalsState.passwordSavePrompt = webViewMessage.passwordSavePrompt;
  modalsState.setPasswordSavePrompt = webViewMessage.setPasswordSavePrompt;
  modalsState.findInPageVisible = webViewMessage.findInPageVisible;
  modalsState.setFindInPageVisible = webViewMessage.setFindInPageVisible;
  modalsState.sitePermissionsSheetVisible = webViewMessage.sitePermissionsSheetVisible;
  modalsState.setSitePermissionsSheetVisible = webViewMessage.setSitePermissionsSheetVisible;

  // 9. Hook xử lý Request & NavStateChange
  const webViewRequest = useWebViewRequest({
    activeTabId,
    activeUrl,
    tabs,
    setTabs,
    persistTabsState,
    clearTabSnapshot,
    setInputUrl,
    setIsLoading,
    userInitiatedRef,
    processedOAuthUrlsRef: auth.processedOAuthUrlsRef,
    userProfileRef: auth.userProfileRef,
    setUserProfile: auth.setUserProfile,
    stats: shield.stats,
    setStats: shield.setStats,
    handleFileDownload: downloads.handleFileDownload,
    handleStartDirectDownload: downloads.handleStartDirectDownload,
    saveToHistory: bookmarksAndHistory.saveToHistory,
    setCanGoBack,
    setCanGoForward,
    isEditing,
    setDetectedMediaByTab: downloads.setDetectedMediaByTab,
    showToast,
  });

  // Password Manager Sheet Visibility
  const [passwordManagerVisible, setPasswordManagerVisible] = useState<boolean>(false);
  modalsState.passwordManagerVisible = passwordManagerVisible;
  modalsState.setPasswordManagerVisible = setPasswordManagerVisible;

  // 10. Hook khởi động ban đầu
  const initialSetup = useInitialSetup({
    userProfileRef: auth.userProfileRef,
    setUserProfile: auth.setUserProfile,
    syncAllAccountsRef: auth.syncAllAccountsRef,
    setSyncAllAccounts: auth.setSyncAllAccounts,
    setTabs,
    setActiveTabId,
    setInputUrl,
    setIsIncognito,
    setIsIncognitoUnlocked: auth.setIsIncognitoUnlocked,
    setStats: shield.setStats,
    setCurrentEngineId,
    setExtensions: shield.setExtensions,
    setRegionSettings: shield.setRegionSettings,
    updateWakeLock,
    isVideoPlayingRef: webViewMessage.isVideoPlayingRef,
    isRestoredRef,
    processedOAuthUrlsRef: auth.processedOAuthUrlsRef,
    setIsLoading,
    clearTabSnapshot,
    persistTabsState,
    handleNavigateRef,
    showToast,
    activeTabId,
  });

  // Chuyển đổi tài khoản
  const handleSwitchAccount = async (newProfile: UserProfile, previousProfile: UserProfile) => {
    if (auth.syncAllAccountsRef.current) {
      auth.setUserProfile(newProfile);
      auth.userProfileRef.current = newProfile;
      await AsyncStorage.setItem('@kite_user_profile', JSON.stringify(newProfile));
      return;
    }

    const prevEmail = previousProfile?.email?.toLowerCase();
    const newEmail = newProfile?.email?.toLowerCase();

    if (prevEmail === newEmail) {
      auth.setUserProfile(newProfile);
      auth.userProfileRef.current = newProfile;
      await AsyncStorage.setItem('@kite_user_profile', JSON.stringify(newProfile));
      return;
    }

    if (prevEmail) {
      auth.profileTabsRef.current[prevEmail] = {
        tabs: [...tabs],
        activeTabId,
        isIncognito,
      };
      await persistTabsState(tabs, activeTabId, previousProfile.email);
    }

    auth.setUserProfile(newProfile);
    auth.userProfileRef.current = newProfile;
    if (newProfile.isLoggedIn && newProfile.email) {
      await AsyncStorage.setItem('@kite_user_profile', JSON.stringify(newProfile));
    } else {
      await AsyncStorage.removeItem('@kite_user_profile');
    }

    if (newEmail && auth.profileTabsRef.current[newEmail]) {
      const cached = auth.profileTabsRef.current[newEmail];
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
              initialUrl: t.initialUrl || t.url,
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
  handleSwitchAccountRef.current = handleSwitchAccount;

  const handleToggleIncognito = (forced?: boolean) => {
    const nextVal = typeof forced === 'boolean' ? forced : !isCurrentIncognito;
    if (nextVal) {
      auth.requestIncognitoAccess(() => {
        setIsIncognito(true);
        // Tạm dừng toàn bộ các tab thường đang chạy nền
        tabs.filter((t) => !t.isIncognito).forEach((t) => {
          try {
            webViewRefs.current[t.id]?.injectJavaScript(PAUSE_BACKGROUND_MEDIA_SCRIPT);
          } catch (e) {}
        });
        const incognitoList = tabs.filter((t) => !!t.isIncognito);
        const existingIncognito = incognitoList.sort(
          (a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0)
        )[0];
        if (existingIncognito) {
          setTabs((prev) =>
            prev.map((t) =>
              t.id === existingIncognito.id
                ? { ...t, isSleeping: false, lastActiveAt: Date.now() }
                : t
            )
          );
          setActiveTabId(existingIncognito.id);
          setInputUrl(existingIncognito.url);
        } else {
          browserTabs.executeNewTab(true);
        }
        showToast('Đã bật chế độ ẩn danh');
      });
    } else {
      auth.setIsIncognitoUnlocked(false);
      setIsIncognito(false);
      // Tạm dừng và cho TẤT CẢ các tab ẩn danh vào giấc ngủ (isSleeping: true) ngay lập tức
      // để bảo vệ tuyệt đối sự riêng tư và triệt tiêu 100% âm thanh / video / livestream chạy ngầm!
      tabs.filter((t) => t.isIncognito).forEach((t) => {
        try {
          webViewRefs.current[t.id]?.injectJavaScript(PAUSE_BACKGROUND_MEDIA_SCRIPT);
        } catch (e) {}
      });
      const normalList = tabs.filter((t) => !t.isIncognito);
      const existingNormal = normalList.sort(
        (a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0)
      )[0];
      if (existingNormal) {
        setTabs((prev) =>
          prev.map((t) => {
            if (t.id === existingNormal.id) return { ...t, isSleeping: false, lastActiveAt: Date.now() };
            return t;
          })
        );
        setActiveTabId(existingNormal.id);
        setInputUrl(existingNormal.url);
      } else {
        browserTabs.executeNewTab(false);
      }
      showToast('Đã tắt chế độ ẩn danh');
    }
  };

  const handleReloadOrStop = useCallback(() => {
    const curTab = currentTab;
    if (curTab?.isOffline) {
      if (curTab.offlineUrl) {
        nav.handleNavigate(curTab.offlineUrl);
      }
      showToast('Đang thử kết nối lại...');
      return;
    }
    const activeWV = getActiveWebView();
    if (!activeWV) return;
    if (isLoading) {
      activeWV.stopLoading();
      setIsLoading(false);
      setLoadProgress(0);
      showToast('Đã dừng tải');
    } else {
      setIsLoading(true);
      setLoadProgress(0.15);
      triggerLoadingSafetyTimer();
      activeWV.reload();
      showToast('Đang tải lại trang...');
    }
  }, [currentTab, isLoading, nav, showToast, triggerLoadingSafetyTimer]);

  const handleSearchByImage = () => {
    setLensScreenShotUri(null);
    setLensModalVisible(true);
  };

  const handleChangeEngine = (engineId: 'google' | 'bing' | 'duckduckgo' | 'yahoo') => {
    setCurrentEngineId(engineId);
    AsyncStorage.setItem('@kite_search_engine', engineId);
    showToast(`Đã chọn: ${SEARCH_ENGINES[engineId]?.name || engineId}`);
    if (auth.userProfileRef.current.isLoggedIn) {
      saveCloudSettings(
        auth.userProfileRef.current.id || auth.userProfileRef.current.email!,
        { searchEngineId: engineId },
        auth.userProfileRef.current.email
      ).catch(() => {});
    }
  };

  const handleOpenStorageManager = () => {
    setStorageManagerVisible(true);
  };

  const handleClearWebCache = async () => {
    try {
      Object.values(webViewRefs.current).forEach((ref: any) => {
        try {
          ref?.clearCache?.(true);
        } catch {}
      });
      if (Paths?.cache && (Paths.cache as any)?.exists) {
        const items = (Paths.cache as any)?.list?.() || [];
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

  // 11. Giới hạn số lượng WebViews nạp đồng thời vào RAM/GPU chuẩn Chrome (tối đa 3 tab cùng chế độ + 1 tab gần nhất của chế độ kia)
  // Giúp khi chuyển đổi qua lại giữa Tab Thường và Tab Ẩn danh không bị reload lại trang từ đầu hay mất video/stream đang xem
  const isCurrentIncognito = Boolean(currentTab ? currentTab.isIncognito : isIncognito);
  const MAX_LIVE_TABS = 3;
  const liveTabIds = useMemo(() => {
    const sortedLive = [...tabs]
      .filter(
        (t) =>
          (t.url || t.initialUrl) &&
          !t.isSleeping &&
          Boolean(t.isIncognito) === Boolean(isCurrentIncognito)
      )
      .sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0))
      .slice(0, MAX_LIVE_TABS)
      .map((t) => t.id);
    const set = new Set(sortedLive);
    if (activeTabId) set.add(activeTabId);

    // Giữ lại tab đang xem gần nhất của chế độ còn lại (tab ẩn danh hoặc tab thường vừa rời đi)
    // để không bị unmount native WKWebView/WebView, giữ nguyên trạng thái video/livestream/vị trí đọc
    const otherModeActive = tabs
      .filter(
        (t) =>
          (t.url || t.initialUrl) &&
          !t.isSleeping &&
          Boolean(t.isIncognito) !== Boolean(isCurrentIncognito)
      )
      .sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0))[0];

    if (otherModeActive) {
      set.add(otherModeActive.id);
    }

    return set;
  }, [tabs, activeTabId, isCurrentIncognito]);

  // Tối ưu hóa chuỗi script inject: gom memo ở ngoài map để không ghép chuỗi lặp lại mỗi render
  const baseInjectedBefore = useMemo(() => {
    return (
      (shield.stats.isShieldActive ? INJECTED_BEFORE_CONTENT : '') +
      PULL_GESTURE_SCRIPT +
      getRegionInjectedScript(shield.regionSettings) +
      (shield.extensions.some((e) => e.id === 'ext-dark-mode' && e.enabled)
        ? DARK_MODE_START_SCRIPT
        : '')
    );
  }, [shield.stats.isShieldActive, shield.regionSettings, shield.extensions]);

  const baseInjectedAfter = useMemo(() => {
    return (
      (shield.stats.isShieldActive ? INJECTED_AFTER_CONTENT : '') +
      PULL_GESTURE_SCRIPT +
      SITE_PERMISSIONS_INJECT_SCRIPT +
      PASSWORD_INTERCEPT_SCRIPT +
      IMAGE_CONTEXT_SCRIPT +
      (shield.extensions.some((e) => e.id === 'ext-dark-mode' && e.enabled)
        ? DARK_MODE_INJECT_SCRIPT
        : DARK_MODE_REMOVE_SCRIPT)
    );
  }, [shield.stats.isShieldActive, shield.extensions]);

  // Callbacks ổn định (stable memoized callbacks) cho TabWebView để memo hoạt động 100% hiệu quả
  const webViewRequestRef = useRef(webViewRequest);
  webViewRequestRef.current = webViewRequest;

  const bookmarksAndHistoryRef = useRef(bookmarksAndHistory);
  bookmarksAndHistoryRef.current = bookmarksAndHistory;

  const captureActiveSnapshotRef = useRef(captureActiveSnapshot);
  captureActiveSnapshotRef.current = captureActiveSnapshot;

  const handleRegisterWebViewRef = useCallback((tabId: string, ref: any) => {
    webViewRefs.current[tabId] = ref;
  }, []);

  const handleRegisterContainerRef = useCallback((tabId: string, ref: any) => {
    webViewContainerRefs.current[tabId] = ref;
  }, []);

  const handleTabMessage = useCallback((event: any, tabId?: string) => {
    webViewMessage.handleMessageRef.current(event, tabId);
  }, []);

  const handleTabNavigationStateChange = useCallback((tabId: string, navState: any) => {
    webViewRequestRef.current.handleNavigationStateChangeForTab(tabId, navState);
  }, []);

  const handleShouldStartLoad = useCallback((request: any) => {
    return webViewRequestRef.current.handleShouldStartLoad(request);
  }, []);

  const handleTabLoadStart = useCallback((tabId: string, e?: any) => {
    const loadingUrl = e?.nativeEvent?.url || '';
    if (loadingUrl === 'about:blank') return;

    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      if (idx < 0) return prev;
      if (prev[idx].isLoading) return prev;
      const next = prev.slice();
      next[idx] = { ...prev[idx], isLoading: true };
      return next;
    });

    if (tabId === activeTabIdRef.current) {
      setIsLoading(true);
      progressBus.set(0.05);
      triggerLoadingSafetyTimer();
    }
  }, []);

  const handleTabLoadProgress = useCallback((tabId: string, e?: any) => {
    const prog = e?.nativeEvent?.progress || 0;
    if (tabId === activeTabIdRef.current) {
      progressBus.set(prog);
    }
  }, []);

  const handleTabLoadEnd = useCallback((tabId: string, e?: any) => {
    const endUrl = e?.nativeEvent?.url || '';
    if (endUrl === 'about:blank') return;

    const curTab = tabsRef.current?.find((t) => t.id === tabId);
    const finalNavUrl = endUrl || curTab?.url;
    if (finalNavUrl && !isJunkHistoryItem(finalNavUrl, curTab?.title)) {
      bookmarksAndHistoryRef.current.saveToHistory(finalNavUrl, curTab?.title || finalNavUrl, tabId);
    }

    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      if (idx < 0) return prev;
      const cur = prev[idx];
      if (!cur.isLoading && !cur.isNavigatingFromHome) return prev;
      const next = prev.slice();
      next[idx] = {
        ...cur,
        isLoading: false,
        isNavigatingFromHome: false,
      };
      return next;
    });

    if (tabId === activeTabIdRef.current) {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      progressBus.set(1);
      setTimeout(() => {
        if (tabId === activeTabIdRef.current) {
          setIsLoading(false);
        }
      }, 150);
      webViewRequestRef.current.flushBlockedCount();

      setTimeout(() => {
        if (tabId === activeTabIdRef.current) {
          const cTab = tabsRef.current?.find((t) => t.id === tabId);
          if (cTab && !cTab.isOffline) {
            captureActiveSnapshotRef.current(tabId)
              .then((snap) => {
                if (snap) {
                  setTabs((prev) => {
                    const cIdx = prev.findIndex((t) => t.id === tabId);
                    if (cIdx < 0 || prev[cIdx].snapshotUri === snap) return prev;
                    const next = prev.slice();
                    next[cIdx] = { ...prev[cIdx], snapshotUri: snap };
                    return next;
                  });
                }
              })
              .catch(() => {});
          }
        }
      }, 600);
    }
  }, []);

  const handleTabError = useCallback((tabId: string, e?: any) => {
    const nativeEvent = e?.nativeEvent || {};
    const tab = tabsRef.current?.find((t) => t.id === tabId);
    const failUrl = nativeEvent.url || tab?.url || '';
    if (failUrl.startsWith('kite://') || failUrl.startsWith('intent://')) {
      return;
    }
    if (tab?.url?.includes('accounts.google.com') && failUrl.startsWith('http://localhost:3000')) {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? { ...t, url: '', initialUrl: '', title: 'Trang mới', snapshotUri: undefined, isLoading: false }
            : t
        )
      );
      setInputUrl('');
      return;
    }

    const code = nativeEvent.code;
    const description = (nativeEvent.description || '').toLowerCase();
    const domain = (nativeEvent.domain || '');

    // Bỏ qua các lỗi hủy điều hướng (Navigation Cancellation / Redirects):
    // 1. iOS WKWebView: code -999 (NSURLErrorCancelled) phát sinh khi chuyển hướng hoặc hủy request cũ giữa chừng
    // 2. iOS WKWebView: code 102 (WebKitErrorDomain - Frame load interrupted)
    // 3. Android: code -1 (ERR_ABORTED)
    if (
      code === -999 ||
      code === 102 ||
      code === -1 ||
      description.includes('cancelled') ||
      description.includes('-999') ||
      description.includes('err_aborted') ||
      description.includes('frame load interrupted') ||
      (domain === 'NSURLErrorDomain' && code === -999)
    ) {
      return;
    }

    // Không chuyển sang màn hình Offline đối với các URL trung gian xác thực (Google OAuth 2FA, CheckCookie, Token Handshake)
    const isAuthHandshake =
      isLegitimateAuthUrl(failUrl) ||
      failUrl.includes('/CheckCookie') ||
      failUrl.includes('accounts.google.com') ||
      failUrl.includes('myaccount.google.com') ||
      failUrl.includes('oauth');
    if (isAuthHandshake) {
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, isLoading: false } : t))
      );
      if (tabId === activeTabIdRef.current) {
        setIsLoading(false);
        progressBus.set(1);
      }
      return;
    }

    const targetOfflineUrl = tab?.url || (failUrl !== 'about:blank' ? failUrl : '');
    if (targetOfflineUrl) {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? {
                ...t,
                isOffline: true,
                offlineUrl: targetOfflineUrl,
                isLoading: false,
              }
            : t
        )
      );
      if (tabId === activeTabIdRef.current) {
        setIsLoading(false);
        progressBus.set(1);
      }
    } else {
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, isLoading: false } : t))
      );
      if (tabId === activeTabIdRef.current) {
        setIsLoading(false);
        progressBus.set(1);
      }
    }
  }, []);

  const handleTabHttpError = useCallback((tabId: string, e?: any) => {
    const statusCode = e?.nativeEvent?.statusCode;
    const tab = tabsRef.current?.find((t) => t.id === tabId);
    if (statusCode && statusCode >= 500 && tab?.url) {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? {
                ...t,
                isOffline: true,
                offlineUrl: t.url,
                isLoading: false,
              }
            : t
        )
      );
    } else {
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, isLoading: false } : t))
      );
    }
    if (tabId === activeTabIdRef.current) {
      setIsLoading(false);
      progressBus.set(1);
    }
  }, []);

  const appBg = isCurrentIncognito ? '#202124' : '#ffffff';
  const viewportBg = activeUrl !== null ? '#ffffff' : appBg;
  const isHomeVisible = activeUrl === null;
  const normalTabsCount = tabs.filter((t) => !t.isIncognito).length;
  const incognitoTabsCount = tabs.filter((t) => !!t.isIncognito).length;
  const currentTabCount = isCurrentIncognito ? incognitoTabsCount : normalTabsCount;

  const handlePressSearchFromBottomBar = useCallback(() => {
    setInputUrl(activeUrl || '');
    setIsEditing(true);
  }, [activeUrl]);

  const handleNewTabFromBottomBar = useCallback(() => {
    handleNewTab(isCurrentIncognito);
  }, [handleNewTab, isCurrentIncognito]);

  const handleToggleBookmarkFromBottomBar = useCallback(() => {
    bookmarksAndHistoryRef.current.handleToggleBookmarkCurrentPage(activeUrl, currentTab?.title);
  }, [activeUrl, currentTab?.title]);

  const handleOpenSitePermissionsFromBottomBar = useCallback(() => {
    webViewMessage.setSitePermissionsSheetVisible(true);
  }, [webViewMessage]);

  // Luôn chủ động đồng bộ StatusBar (giờ, pin, sóng màu đen cho nền sáng, màu trắng cho ẩn danh)
  useEffect(() => {
    if (!lensModalVisible && !qrModalVisible && !tabSheetVisible) {
      const style = isCurrentIncognito ? 'light-content' : 'dark-content';
      StatusBar.setBarStyle(style, true);
    }
  }, [isCurrentIncognito, lensModalVisible, qrModalVisible, tabSheetVisible, activeUrl]);

  return (
    <View style={[styles.mainContainer, { backgroundColor: appBg }]}>
      <StatusBar
        barStyle={isCurrentIncognito ? 'light-content' : 'dark-content'}
        backgroundColor={appBg}
      />

      {/* 1. THANH TOP BAR TIỆN ÍCH */}
      <WebTopBar
        activeUrl={activeUrl}
        isEditing={isEditing}
        isCurrentIncognito={isCurrentIncognito}
        appBg={appBg}
        stats={shield.stats}
        regionSettings={shield.regionSettings}
        shieldBadgeMode={shield.shieldBadgeMode}
        shieldBadgeAnim={shield.shieldBadgeAnim}
        onOpenShield={() => shield.setShieldSheetVisible(true)}
        onOpenRegion={() => shield.setRegionSheetVisible(true)}
        onOpenMenu={() => setBrowserMenuVisible(true)}
        onTouchStart={pull.handleHeaderTouchStart}
        onTouchMove={pull.handleHeaderTouchMove}
        onTouchEnd={pull.handleHeaderTouchEnd}
      />

      {/* 2. VÙNG VIEWPORT (WEBVIEW / SEARCH OVERLAY / HOME DASHBOARD) */}
      <View
        style={[styles.viewport, { backgroundColor: viewportBg }]}
      >
        {/* Thanh tiến trình tải trang độc lập chuẩn Chrome: không làm re-render giao diện App */}
        <WebProgressBar
          ref={progressBarRef}
          isLoading={isLoading && activeUrl !== null}
          isIncognito={isCurrentIncognito}
        />

        {/* Home Dashboard luôn giữ trạng thái gắn kết (persistent) để chuyển trang và quay về Home tức thì 0ms chuẩn Chrome, không tốn tài nguyên unmount/mount */}
        <View
          ref={(ref) => {
            if (isHomeVisible) {
              webViewContainerRefs.current[activeTabId] = ref;
            }
          }}
          collapsable={false}
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: appBg,
              zIndex: isHomeVisible ? 20 : -1,
              elevation: isHomeVisible ? 20 : -1,
              opacity: isHomeVisible ? 1 : 0,
            },
          ]}
          pointerEvents={isHomeVisible ? 'auto' : 'none'}
        >
          <HomeDashboard
            activeTabId={activeTabId}
            onSelectUrl={nav.handleNavigate}
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
            onOpenBookmarks={() => bookmarksAndHistory.setBookmarkSheetVisible(true)}
            onOpenHistory={() => bookmarksAndHistory.setHistorySheetVisible(true)}
            onOpenDownloads={downloads.handleOpenDownloads}
            onOpenPasswordManager={() => setPasswordManagerVisible(true)}
            onOpenExtensions={() => shield.setExtensionSheetVisible(true)}
            onOpenTabs={handleOpenTabSheet}
            onOpenStorageManager={handleOpenStorageManager}
            incognitoPin={auth.incognitoPin}
            onOpenPinSettings={auth.handleOpenPinSettings}
            userProfile={auth.userProfile}
            onUpdateProfile={auth.handleUpdateProfile}
            syncAllAccounts={auth.syncAllAccounts}
            onToggleSyncAccounts={auth.handleToggleSyncAccounts}
            onSwitchAccount={handleSwitchAccount}
            onShowToast={showToast}
            onPullMove={pull.handlePullMove}
            onPullEnd={pull.handlePullEnd}
            onPullCancel={pull.handlePullCancel}
            pullDistance={pull.pullDistance}
            refreshTrigger={pull.homeRefreshTrigger}
          />
        </View>

        {/* Màn hình khóa Tab ẩn danh chuẩn Chrome khi có cài đặt mã PIN bảo vệ */}
        {isCurrentIncognito && auth.incognitoPin && !auth.isIncognitoUnlocked ? (
          <View style={styles.incognitoLockOverlay}>
            <View style={styles.incognitoLockBox}>
              <View style={styles.incognitoLockIconCircle}>
                <Feather name="lock" size={32} color="#f43f5e" />
              </View>
              <Text style={styles.incognitoLockTitle}>Thẻ ẩn danh đã bị khóa</Text>
              <Text style={styles.incognitoLockSubtitle}>
                Để bảo vệ quyền riêng tư của bạn, hãy nhập mã PIN để mở khóa các thẻ ẩn danh.
              </Text>
              <TouchableOpacity
                style={styles.incognitoUnlockBtn}
                onPress={() => {
                  auth.setPinModalMode('unlock');
                  auth.setPinModalVisible(true);
                }}
                activeOpacity={0.8}
              >
                <Feather name="unlock" size={16} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={styles.incognitoUnlockBtnText}>Mở khóa thẻ ẩn danh</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.incognitoSwitchToNormalBtn}
                onPress={() => handleToggleIncognito(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.incognitoSwitchToNormalText}>Chuyển sang các thẻ thường</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {tabs.map((tab) => {
          if (!tab.url && !tab.initialUrl) return null;
              if (!liveTabIds.has(tab.id)) return null;

              const isTabActive = tab.id === activeTabId;

              // Tab đang ngủ (isSleeping) chỉ ẩn khi KHÔNG phải là tab active.
              // Khi người dùng chọn tab này, nó sẽ được active và bắt đầu nạp chuẩn Google Chrome.
              if (tab.isSleeping && !isTabActive) {
                return null;
              }

              const isAuthUrl = Boolean(
                tab.url && (
                  isLegitimateAuthUrl(tab.url) ||
                  tab.url.includes('accounts.google.com') ||
                  tab.url.includes('myaccount.google.com') ||
                  tab.url.includes('oauth2.googleapis.com') ||
                  tab.url.includes('supabase.co/auth')
                )
              );

              const userAgent = tab.isDesktop
                ? DESKTOP_USER_AGENT
                : tab.url?.includes('lens.google.com') ||
                  tab.url?.includes('searchbyimage') ||
                  tab.url?.includes('images.google.com')
                ? DESKTOP_USER_AGENT
                : isAuthUrl
                ? GOOGLE_AUTH_USER_AGENT
                : undefined;

              const injectedBefore =
                (baseInjectedBefore + shield.getExtensionsScriptForTab(tab.url, 'document_start')) ||
                undefined;

              const injectedAfter =
                (baseInjectedAfter + shield.getExtensionsScriptForTab(tab.url, 'document_end')) ||
                undefined;

              return (
                <TabWebView
                  key={tab.id}
                  tab={tab}
                  isTabActive={isTabActive}
                  onRegisterRef={handleRegisterWebViewRef}
                  onRegisterContainerRef={handleRegisterContainerRef}
                  injectedBefore={injectedBefore}
                  injectedAfter={injectedAfter}
                  userAgent={userAgent}
                  onMessage={handleTabMessage}
                  onShouldStartLoadWithRequest={handleShouldStartLoad}
                  onNavigationStateChange={handleTabNavigationStateChange}
                  onLoadStart={handleTabLoadStart}
                  onLoadProgress={handleTabLoadProgress}
                  onLoadEnd={handleTabLoadEnd}
                  onError={handleTabError}
                  onHttpError={handleTabHttpError}
                  onFileDownload={downloads.handleFileDownload}
                />
              );
            })}

            {/* Màn hình không có mạng */}
            {currentTab?.isOffline && (
              <View style={[StyleSheet.absoluteFill, { zIndex: 30, elevation: 25 }]}>
                <OfflineDinoScreen
                  url={currentTab.offlineUrl || currentTab.url}
                  onRetry={() => nav.handleRetryOfflineTab(currentTab.id)}
                  onGoHome={() => nav.handleGoHomeFromOffline(currentTab.id)}
                  isDarkTheme={isCurrentIncognito || shield.extensions.some((e) => e.id === 'ext-dark-mode' && e.enabled)}
                />
              </View>
            )}

        {/* SearchOverlay: Hiển thị đè lên trên (Overlay zIndex 100), tuyệt đối KHÔNG unmount TabWebView hay HomeDashboard! */}
        {isEditing && (
          <View
            style={[
              StyleSheet.absoluteFill,
              { zIndex: 100, elevation: 100, backgroundColor: appBg },
            ]}
          >
            <SearchOverlay
              inputUrl={inputUrl}
              onUrlChange={setInputUrl}
              onSubmit={nav.handleNavigate}
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
              isBookmarked={bookmarksAndHistory.isCurrentBookmarked}
              onToggleBookmark={() =>
                bookmarksAndHistory.handleToggleBookmarkCurrentPage(inputUrl, currentTab?.title)
              }
              userEmail={
                auth.syncAllAccounts
                  ? undefined
                  : auth.userProfile.isLoggedIn
                  ? auth.userProfile.email
                  : undefined
              }
            />
          </View>
        )}

        {/* Nút Floating Tải Video (Cốc Cốc style) */}
        {!isEditing && activeUrl !== null && downloads.activeDetectedMedia.length > 0 && (
          <TouchableOpacity
            style={[
              styles.floatingVideoDownloadPill,
              (downloads.activeDownloads.length > 0 || downloads.completedDownload !== null || downloads.downloadPrompt !== null) && { bottom: 84 },
            ]}
            onPress={() => downloads.setVideoDownloadSheetVisible(true)}
            activeOpacity={0.85}
          >
            <View style={styles.floatingVideoIconCircle}>
              <Feather name="download" size={14} color="#ffffff" />
            </View>
            <Text style={styles.floatingVideoText}>Tải Video</Text>
            <View style={styles.floatingVideoCountBadge}>
              <Text style={styles.floatingVideoCountText}>{downloads.activeDetectedMedia.length}</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Thanh Floating Tải xuống chuẩn Google Chrome iOS (3 trạng thái) */}
        {!isEditing && (
          <>
            {/* Trạng thái 1: Đang tải xuống (Active Progress) */}
            {downloads.activeDownloads.length > 0 ? (
              <TouchableOpacity
                style={styles.floatingActiveDownloadBanner}
                onPress={() => downloads.setDownloadSheetVisible(true)}
                activeOpacity={0.9}
              >
                <View style={styles.downloadBannerIconBox}>
                  <Feather name="arrow-down-circle" size={20} color="#007aff" />
                </View>
                <View style={styles.downloadBannerTextCol}>
                  <Text style={styles.downloadBannerTitle} numberOfLines={1}>
                    {downloads.activeDownloads[0].fileName}
                  </Text>
                  <Text style={styles.downloadBannerSub}>
                    {downloads.activeDownloads[0].totalBytes > 0
                      ? `Đang tải: ${downloads.activeDownloads[0].progress}% • ${(downloads.activeDownloads[0].bytesWritten / (1024 * 1024)).toFixed(1)} / ${(downloads.activeDownloads[0].totalBytes / (1024 * 1024)).toFixed(1)} MB`
                      : `Đang tải: ${(downloads.activeDownloads[0].bytesWritten / (1024 * 1024)).toFixed(1)} MB...`}
                  </Text>
                  <View style={styles.downloadBannerProgressBar}>
                    <View
                      style={[
                        styles.downloadBannerProgressFill,
                        { width: `${Math.max(6, Math.min(100, downloads.activeDownloads[0].progress || 0))}%` },
                      ]}
                    />
                  </View>
                </View>
                <Feather name="chevron-right" size={16} color="#71717a" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            ) : downloads.completedDownload ? (
              /* Trạng thái 2: Đã tải xong (Folder icon, "Đã tải xuống xong", "Mở trong...", "X") */
              <View style={styles.floatingActiveDownloadBanner}>
                <View style={styles.downloadBannerFolderBox}>
                  <Feather name="folder" size={22} color="#007aff" />
                </View>
                <View style={styles.downloadBannerTextCol}>
                  <Text style={styles.downloadBannerCompletedTitle} numberOfLines={1}>
                    Đã tải xuống xong
                  </Text>
                  <Text style={styles.downloadBannerCompletedSub} numberOfLines={1}>
                    {downloads.completedDownload.fileName}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.chromeOpenInBtn}
                  onPress={() => downloads.handleOpenIn(downloads.completedDownload!.uri)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chromeOpenInText}>Mở trong...</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.chromeBannerCloseBtn}
                  onPress={() => downloads.setCompletedDownload(null)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={0.6}
                >
                  <Feather name="x" size={18} color="#71717a" />
                </TouchableOpacity>
              </View>
            ) : downloads.downloadPrompt ? (
              /* Trạng thái 3: Đề xuất tải xuống ([fileName], "Từ: domain", "Lưu...", "X") */
              <View style={styles.floatingActiveDownloadBanner}>
                <View style={styles.downloadBannerIconBox}>
                  <Feather name="arrow-down" size={20} color="#007aff" />
                </View>
                <View style={styles.downloadBannerTextCol}>
                  <Text style={styles.downloadBannerPromptFileName} numberOfLines={2}>
                    {downloads.downloadPrompt.fileName}
                  </Text>
                  <Text style={styles.downloadBannerPromptDomain} numberOfLines={1}>
                    Từ: {downloads.downloadPrompt.sourceDomain}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.chromeSaveActionBtn}
                  onPress={() => downloads.setChooseLocationModalVisible(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chromeSaveActionText}>Lưu...</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.chromeBannerCloseBtn}
                  onPress={() => downloads.setDownloadPrompt(null)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={0.6}
                >
                  <Feather name="x" size={18} color="#71717a" />
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        )}


      </View>

      {/* 3. THANH ĐIỀU HƯỚNG BOTTOM BAR */}
      {!isEditing && (
        <BottomBar
          canGoBack={nav.canGoBackEffective}
          canGoForward={nav.canGoForwardEffective}
          onGoBack={nav.handleGoBack}
          onGoForward={nav.handleGoForward}
          onPressSearch={handlePressSearchFromBottomBar}
          onSearchByImage={handleSearchByImage}
          onOpenTabs={handleOpenTabSheet}
          onNewTab={handleNewTabFromBottomBar}
          tabCount={currentTabCount}
          currentUrl={activeUrl || undefined}
          placeholder={`Tìm trên ${SEARCH_ENGINES[currentEngineId]?.name || 'Google'} hoặc nhập URL`}
          isBookmarked={bookmarksAndHistory.isCurrentBookmarked}
          onToggleBookmark={handleToggleBookmarkFromBottomBar}
          isIncognito={isCurrentIncognito}
          isLoading={isLoading}
          onReload={handleReloadOrStop}
          onOpenSitePermissions={handleOpenSitePermissionsFromBottomBar}
        />
      )}

      {/* Toast thông báo nổi phía trên Bottom Bar (luôn hiển thị rõ, không bị che khuất) */}
      {toastMessage && (
        <View style={styles.toastContainer} pointerEvents="none">
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

      {/* 4. MODALS & SHEETS */}
      <TabSheet
        visible={tabSheetVisible}
        onClose={() => {
          setTabSheetVisible(false);
          const cur = tabs.find((t) => t.id === activeTabId);
          if (cur?.isSleeping) {
            setIsLoading(true);
            setLoadProgress(0);
            setTabs((prev) =>
              prev.map((t) =>
                t.id === activeTabId && t.isSleeping
                  ? { ...t, isSleeping: false, isLoading: true, lastActiveAt: Date.now() }
                  : t
              )
            );
          }
        }}
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={(id) =>
          handleSelectTab(id, (targetTab) => {
            shield.setStats((prev) => ({
              ...prev,
              isReaderMode: !!targetTab.isReaderMode,
            }));
          })
        }
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
        onClearBrowsingData={bookmarksAndHistory.handleClearBrowsingData}
        onCloseAllTabs={handleCloseAllTabs}
        onCloseOtherTabs={handleCloseOtherTabs}
        incognitoPin={auth.incognitoPin}
        isIncognitoUnlocked={auth.isIncognitoUnlocked}
        onRequestIncognitoUnlock={auth.requestIncognitoAccess}
        onUnlockSuccess={() => auth.setIsIncognitoUnlocked(true)}
        canRestoreClosedTab={closedTabsRef.current.length > 0}
        onRestoreClosedTab={handleRestoreClosedTab}
        onFreezeBackgroundTabs={handleFreezeBackgroundTabs}
        isIncognito={isCurrentIncognito}
      />

      <ShieldSheet
        visible={shield.shieldSheetVisible}
        onClose={() => shield.setShieldSheetVisible(false)}
        stats={shield.stats}
        currentUrl={currentTab?.url}
        onToggleShield={shield.handleToggleShield}
        onToggleAggressive={shield.handleToggleAggressive}
        onManualZap={shield.handleForceZap}
      />

      {qrModalVisible && (
        <QRScannerModal
          visible={qrModalVisible}
          onClose={() => setQrModalVisible(false)}
          onScanUrl={(url) => {
            setQrModalVisible(false);
            nav.handleNavigate(url);
          }}
        />
      )}

      {lensModalVisible && (
        <ImageSearchModal
          visible={lensModalVisible}
          onClose={() => {
            setLensModalVisible(false);
            setLensScreenShotUri(null);
          }}
          onSearchResult={(url) => {
            setLensModalVisible(false);
            setLensScreenShotUri(null);
            nav.handleNavigate(url);
          }}
          initialImageUri={lensScreenShotUri}
        />
      )}

      <DownloadSheet
        visible={downloads.downloadSheetVisible}
        onClose={() => downloads.setDownloadSheetVisible(false)}
        onShowToast={showToast}
        activeDownloads={downloads.activeDownloads}
      />

      {downloads.downloadPrompt && (
        <DownloadPromptModal
          visible={downloads.chooseLocationModalVisible}
          fileName={downloads.downloadPrompt.fileName}
          downloadUrl={downloads.downloadPrompt.url}
          onConfirm={downloads.handleConfirmDownload}
          onClose={() => downloads.setChooseLocationModalVisible(false)}
        />
      )}

      <VideoDownloadSheet
        visible={downloads.videoDownloadSheetVisible}
        onClose={() => downloads.setVideoDownloadSheetVisible(false)}
        mediaList={downloads.activeDetectedMedia}
        onDownload={downloads.handleDownloadMedia}
        onShowToast={showToast}
      />

      <PasswordManagerSheet
        visible={passwordManagerVisible}
        onClose={() => setPasswordManagerVisible(false)}
        onSelectUrl={nav.handleNavigate}
        onShowToast={showToast}
        userProfile={auth.userProfile}
        syncAllAccounts={auth.syncAllAccounts}
      />


      {webViewMessage.passwordSavePrompt && (
        <PasswordSavePromptModal
          visible={webViewMessage.passwordSavePrompt.visible}
          website={webViewMessage.passwordSavePrompt.website}
          username={webViewMessage.passwordSavePrompt.username}
          isUpdate={webViewMessage.passwordSavePrompt.isUpdate}
          onSave={webViewMessage.handleConfirmSavePassword}
          onDismiss={() => webViewMessage.setPasswordSavePrompt(null)}
        />
      )}

      <PasswordAutofillBar
        credential={webViewMessage.activeAutofillCredential}
        onFill={webViewMessage.handlePerformAutofill}
        onDismiss={webViewMessage.handleDismissAutofill}
        bottomOffset={Platform.OS === 'ios' ? 70 : 60}
      />

      <ImageContextMenuSheet
        visible={!!webViewMessage.imageContextMenuData}
        data={webViewMessage.imageContextMenuData}
        onClose={() => webViewMessage.setImageContextMenuData(null)}
        onSearchWithLens={(imageUrl) => {
          webViewMessage.setImageContextMenuData(null);
          if (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
            setLensScreenShotUri(imageUrl);
            setLensModalVisible(true);
          } else {
            const lensUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`;
            browserTabs.handleNewTab(isIncognito, lensUrl);
            showToast('Đang tìm kiếm với Google Lens...');
          }
        }}
        onOpenInNewTab={(imageUrl) => {
          webViewMessage.setImageContextMenuData(null);
          browserTabs.handleNewTab(isIncognito, imageUrl);
        }}
        onShowToast={showToast}
      />

      <BrowserMenuSheet
        visible={browserMenuVisible}
        onClose={() => setBrowserMenuVisible(false)}
        currentUrl={activeUrl}
        currentTitle={currentTab?.title}
        currentEngineId={currentEngineId}
        onChangeEngine={handleChangeEngine}
        isDesktop={currentTab?.isDesktop}
        isBookmarked={bookmarksAndHistory.isCurrentBookmarked}
        isIncognito={isCurrentIncognito}
        isTranslated={shield.isCurrentTranslated}
        onToggleTranslate={shield.handleToggleTranslate}
        onToggleBookmark={() =>
          bookmarksAndHistory.handleToggleBookmarkCurrentPage(activeUrl, currentTab?.title)
        }
        onToggleDesktop={shield.handleToggleDesktopMode}
        onReload={() => {
          if (currentTab?.isOffline) {
            nav.handleRetryOfflineTab(activeTabId);
            showToast('Đang thử kết nối lại...');
            return;
          }
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
          const rawUrl = activeUrl || currentTab?.url || inputUrl;
          const shareUrl =
            rawUrl && !rawUrl.startsWith('about:') && !rawUrl.startsWith('kite://')
              ? rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
                ? rawUrl.trim()
                : `https://${rawUrl.trim()}`
              : 'https://kitebrowser.com';
          const titleToShare =
            currentTab?.title || (rawUrl ? 'Kite Browser' : 'Kite Browser - Trình duyệt siêu tốc & an toàn');

          triggerNativeShare(shareUrl, titleToShare);
        }}
        onFindInPage={() => {
          if (!activeUrl) {
            showToast('Chỉ tìm được trên trang web');
            return;
          }
          webViewMessage.setFindInPageVisible(true);
        }}
        onOpenDownloads={downloads.handleOpenDownloads}
        onOpenPasswordManager={() => setPasswordManagerVisible(true)}
        onOpenExtensions={() => shield.setExtensionSheetVisible(true)}
        onOpenBookmarks={() => bookmarksAndHistory.setBookmarkSheetVisible(true)}
        onOpenHistory={() => bookmarksAndHistory.setHistorySheetVisible(true)}
        onNewTab={() => handleNewTab(isIncognito)}
        onNewIncognitoTab={() => handleNewTab(true)}
        onOpenShield={() => shield.setShieldSheetVisible(true)}
        onOpenStorageManager={handleOpenStorageManager}
        isReaderMode={Boolean(currentTab?.isReaderMode || shield.stats.isReaderMode)}
        onToggleReaderMode={shield.handleToggleReaderMode}
        isKeepAwakeActive={Boolean(shield.stats.isKeepAwakeActive)}
        onToggleKeepAwake={shield.handleToggleKeepAwake}
        isDataSaverActive={Boolean(shield.stats.isDataSaverActive)}
        onToggleDataSaver={shield.handleToggleDataSaver}
        detectedMediaCount={0}
        onOpenVideoDownload={undefined}
        onOpenRegionSheet={() => shield.setRegionSheetVisible(true)}
        isRegionActive={shield.regionSettings.enabled}
        currentRegionText={
          shield.regionSettings.enabled
            ? `${getActiveRegionNode(shield.regionSettings.activeRegionId).flag} ${getActiveRegionNode(shield.regionSettings.activeRegionId).name}`
            : undefined
        }
        onOpenSitePermissions={() => webViewMessage.setSitePermissionsSheetVisible(true)}
      />

      <ExtensionSheet
        visible={shield.extensionSheetVisible}
        onClose={() => shield.setExtensionSheetVisible(false)}
        onShowToast={showToast}
        onExtensionsUpdated={shield.handleExtensionsUpdated}
        onOpenRegionSheet={() => shield.setRegionSheetVisible(true)}
      />

      <RegionSheet
        visible={shield.regionSheetVisible}
        onClose={() => shield.setRegionSheetVisible(false)}
        settings={shield.regionSettings}
        onUpdateSettings={(newSettings) => shield.setRegionSettings(newSettings)}
        onShowToast={showToast}
        onTestIp={(testUrl) => nav.handleNavigate(testUrl)}
      />

      <SitePermissionsSheet
        visible={webViewMessage.sitePermissionsSheetVisible}
        onClose={() => webViewMessage.setSitePermissionsSheetVisible(false)}
        currentUrl={activeUrl}
        onShowToast={showToast}
      />

      <PermissionPromptModal
        visible={!!webViewMessage.pendingPermissionRequest}
        request={webViewMessage.pendingPermissionRequest}
        onAllow={webViewMessage.handleAllowSitePermission}
        onBlock={webViewMessage.handleBlockSitePermission}
        onDismiss={webViewMessage.handleDismissSitePermission}
      />

      <PinModal
        visible={auth.pinModalVisible}
        mode={auth.pinModalMode}
        currentPin={auth.incognitoPin}
        onClose={() => {
          auth.setPinModalVisible(false);
          auth.pendingIncognitoActionRef.current = null;
        }}
        onSuccessUnlock={auth.handleSuccessUnlock}
        onSavePin={auth.handleSavePin}
        onDisablePin={auth.handleDisablePin}
        onShowToast={showToast}
      />

      <HistorySheet
        visible={bookmarksAndHistory.historySheetVisible}
        onClose={() => bookmarksAndHistory.setHistorySheetVisible(false)}
        onSelectUrl={nav.handleNavigate}
        userEmail={
          auth.syncAllAccounts
            ? undefined
            : auth.userProfile.isLoggedIn
            ? auth.userProfile.email
            : undefined
        }
      />

      <BookmarkSheet
        visible={bookmarksAndHistory.bookmarkSheetVisible}
        onClose={() => bookmarksAndHistory.setBookmarkSheetVisible(false)}
        onSelectUrl={nav.handleNavigate}
        currentUrl={activeUrl}
        currentTitle={currentTab?.title}
        userEmail={
          auth.syncAllAccounts
            ? undefined
            : auth.userProfile.isLoggedIn
            ? auth.userProfile.email
            : undefined
        }
      />

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
        onOpenDownloads={downloads.handleOpenDownloads}
        onClearHistory={bookmarksAndHistory.handleClearBrowsingHistory}
        onShowToast={showToast}
      />

      <PullDownBar
        pullDistance={pull.pullDistance}
        pullOffset={pull.pullOffset}
        isPulling={pull.isPulling}
        activeAction={pull.activePullAction}
        topInset={activeUrl !== null ? topInset + 24 : topInset}
        isIncognito={isIncognito}
      />

      <FindInPageBar
        visible={webViewMessage.findInPageVisible}
        totalMatches={webViewMessage.findInPageStats.total}
        currentMatch={webViewMessage.findInPageStats.current}
        onSearch={webViewMessage.handleFindInPageSearch}
        onNext={webViewMessage.handleFindInPageNext}
        onPrev={webViewMessage.handleFindInPagePrev}
        onClose={webViewMessage.handleFindInPageClose}
        topInset={topInset}
        isIncognito={isIncognito}
      />

      {/* Khi chuyển app ra ngoài màn hình đa nhiệm (Recent Apps / Multitasking), che tab ẩn danh để chống lộ dữ liệu */}
      {appStateStatus !== 'active' && isCurrentIncognito ? (
        <View style={styles.appSwitcherPrivacyShield} pointerEvents="none">
          <View style={styles.appSwitcherPrivacyCircle}>
            <Feather name="eye-off" size={40} color="#f43f5e" />
          </View>
          <Text style={styles.appSwitcherPrivacyTitle}>Tab ẩn danh được bảo vệ</Text>
          <Text style={styles.appSwitcherPrivacySub}>
            Nội dung duyệt web được bảo mật khi chuyển đổi ứng dụng
          </Text>
        </View>
      ) : null}

      {/* Splash Screen */}
      {initialSetup.showSplashOverlay && (
        <Animated.View
          style={[
            styles.splashOverlay,
            {
              opacity: initialSetup.splashFadeAnim,
              transform: [{ scale: initialSetup.splashScaleAnim }],
            },
          ]}
          pointerEvents={initialSetup.isAppReady ? 'none' : 'auto'}
        >
          <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
          <View style={styles.splashContent}>
            <Animated.View style={{ opacity: initialSetup.splashGlowAnim, alignItems: 'center' }}>
              <Image
                source={require('./assets/logokite.png')}
                style={styles.splashLogo}
                resizeMode="contain"
              />
            </Animated.View>
            <Text style={styles.splashTitle}>Kite</Text>
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
