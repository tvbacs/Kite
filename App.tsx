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
} from 'react-native';
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
import { ShieldStats, BrowserTab, UserProfile, TabFrozenState, DataSaverMode } from './src/types/browser';
import { PinModal } from './src/components/PinModal';

const STORAGE_ENGINE_KEY = '@kite_search_engine';
const STORAGE_PIN_KEY = '@kite_incognito_pin';
const STORAGE_PERSISTED_TABS_KEY = '@kite_persisted_tabs_state';
const STORAGE_ACTIVE_TAB_ID_KEY = '@kite_active_tab_id';
const STORAGE_DATA_SAVER_KEY = '@kite_data_saver_mode';
const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MAX_ACTIVE_WEBVIEWS = 2; // Giữ tối đa 1 đến 2 WebView trong RAM để tránh Jetsam kill trên iOS

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

  // Quản lý hệ thống Thẻ (Tabs)
  const [tabs, setTabs] = useState<BrowserTab[]>([
    { id: 'tab-1', url: '', title: 'Trang mới', lastActiveAt: Date.now(), isSleeping: false },
  ]);

  // Lưu trạng thái cuộn, URL và snapshot của các thẻ vào AsyncStorage
  const persistTabsState = async (tabsList: BrowserTab[], currentActiveId?: string) => {
    try {
      const toPersist = tabsList
        .filter((t) => !t.isIncognito)
        .map((t) => ({
          id: t.id,
          url: t.url,
          title: t.title,
          isDesktop: t.isDesktop,
          snapshotUri: t.snapshotUri,
          frozenState: t.frozenState,
          lastActiveAt: t.lastActiveAt,
        }));
      await AsyncStorage.setItem(STORAGE_PERSISTED_TABS_KEY, JSON.stringify(toPersist));
      const idToSave = currentActiveId || activeTabId;
      if (idToSave) {
        await AsyncStorage.setItem(STORAGE_ACTIVE_TAB_ID_KEY, idToSave);
      }
    } catch (e) {}
  };

  // Chụp ảnh màn hình tab đang mở để phục vụ cơ chế "Snapshot & Swap"
  const captureActiveSnapshot = async (tabId: string): Promise<string | null> => {
    try {
      const view = webViewContainerRefs.current[tabId];
      if (!view) return null;
      const uri = await captureRef(view, {
        format: 'jpg',
        quality: 0.6,
        result: 'tmpfile',
      });
      return uri;
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

  // Lấy thông tin tab đang hoạt động
  const currentTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const activeUrl = currentTab?.url || null;

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
  const [qrModalVisible, setQrModalVisible] = useState<boolean>(false);
  const [historySheetVisible, setHistorySheetVisible] = useState<boolean>(false);
  const [bookmarkSheetVisible, setBookmarkSheetVisible] = useState<boolean>(false);
  const [isCurrentBookmarked, setIsCurrentBookmarked] = useState<boolean>(false);

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

  // Trạng thái tài khoản người dùng
  const [userProfile, setUserProfile] = useState<UserProfile>({
    isLoggedIn: false,
    name: '',
    email: '',
    avatarUrl: '',
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

    AsyncStorage.getItem('@kite_user_profile').then((res) => {
      if (res) {
        try {
          const parsed = JSON.parse(res);
          if (parsed && parsed.email) {
            setUserProfile(parsed);
          }
        } catch (e) {}
      }
    });

    // Khôi phục danh sách thẻ, URL và mở đúng thẻ gần nhất người dùng vừa xem
    Promise.all([
      AsyncStorage.getItem(STORAGE_PERSISTED_TABS_KEY),
      AsyncStorage.getItem(STORAGE_ACTIVE_TAB_ID_KEY),
    ]).then(([tabsData, savedActiveId]) => {
      if (tabsData) {
        try {
          const savedTabs: BrowserTab[] = JSON.parse(tabsData);
          if (Array.isArray(savedTabs) && savedTabs.length > 0) {
            // Xác định thẻ gần nhất người dùng vừa xem:
            // 1. Thẻ có id trùng với savedActiveId
            // 2. Hoặc thẻ có lastActiveAt mới nhất
            // 3. Hoặc thẻ cuối cùng trong danh sách
            let targetTab = savedTabs.find((t) => t.id === savedActiveId);
            if (!targetTab) {
              const sortedByRecent = [...savedTabs].sort(
                (a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0)
              );
              targetTab = sortedByRecent[0] || savedTabs[savedTabs.length - 1];
            }

            const targetId = targetTab.id;

            // Giữ đúng thẻ gần nhất hoạt động (isSleeping: false), đóng băng các thẻ còn lại để bảo vệ RAM
            const initializedTabs = savedTabs.map((t) => ({
              ...t,
              isSleeping: t.id !== targetId,
            }));

            setTabs(initializedTabs);
            setActiveTabId(targetId);
            setInputUrl(targetTab.url || '');
            setIsIncognito(false);
          }
        } catch (e) {}
      }
    });

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

    // Tiếp nhận liên kết chia sẻ từ ứng dụng khác (Share Sheet / Universal Links)
    const handleIncomingUrl = (url: string | null) => {
      if (!url) return;
      try {
        let target = url.trim();
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
      linkingSub.remove();
    };
  }, []);

  // Tự động ghi nhớ thẻ đang xem gần nhất vào bộ nhớ để khi vào lại browser sẽ mở đúng trang đó
  useEffect(() => {
    if (activeTabId && !isIncognito) {
      AsyncStorage.setItem(STORAGE_ACTIVE_TAB_ID_KEY, activeTabId).catch(() => {});
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, lastActiveAt: Date.now() } : t))
      );
    }
  }, [activeTabId, isIncognito]);

  // Tạm dừng video & âm thanh trên các tab nền để tiết kiệm pin và dữ liệu
  useEffect(() => {
    Object.entries(webViewRefs.current).forEach(([tabId, ref]) => {
      if (tabId !== activeTabId && ref) {
        ref.injectJavaScript(PAUSE_BACKGROUND_MEDIA_SCRIPT);
      }
    });
  }, [activeTabId]);

  // Tự động đóng băng (Smart Tab Sleeping) các tab nền không hoạt động sau 5 phút để dọn dẹp RAM
  useEffect(() => {
    const idleCheckInterval = setInterval(() => {
      const now = Date.now();
      const IDLE_TIME_MS = 5 * 60 * 1000;
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

  // Kiểm tra trạng thái dấu trang của URL hiện tại
  const checkBookmarkStatus = async (url?: string | null) => {
    if (!url) {
      setIsCurrentBookmarked(false);
      return;
    }
    try {
      const data = await AsyncStorage.getItem(STORAGE_BOOKMARKS_KEY);
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
  }, [activeUrl]);

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
      const data = await AsyncStorage.getItem(STORAGE_BOOKMARKS_KEY);
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
      await AsyncStorage.setItem(STORAGE_BOOKMARKS_KEY, JSON.stringify(list));
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
    setLensModalVisible(true);
  };

  // Tự động hủy xoay loading sau 4.5 giây để tránh kẹt loading do kết nối ngầm của web
  const triggerLoadingSafetyTimer = () => {
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    loadingTimerRef.current = setTimeout(() => {
      setIsLoading(false);
    }, 4500);
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

  const executeNewTab = (isIncognitoMode: boolean) => {
    Keyboard.dismiss();
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
      const updated = [...prev, newTabObj];
      persistTabsState(updated);
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

  // Đóng tab và giải phóng bộ nhớ webView tương ứng
  const handleCloseTab = (id: string) => {
    delete webViewRefs.current[id];

    // Lưu lại thẻ vừa đóng vào danh sách có thể khôi phục
    const closingTab = tabs.find((t) => t.id === id);
    if (closingTab && closingTab.url && !closingTab.isIncognito) {
      closedTabsRef.current.push({ ...closingTab });
      if (closedTabsRef.current.length > 25) {
        closedTabsRef.current.shift();
      }
    }

    // Nếu chỉ còn 1 tab duy nhất: Xoá tab đó và mở ngay màn hình tab mới
    if (tabs.length <= 1) {
      Keyboard.dismiss();
      const newId = `tab-${Date.now()}`;
      const newTabObj: BrowserTab = {
        id: newId,
        url: '',
        title: 'Trang mới',
        lastActiveAt: Date.now(),
        isSleeping: false,
      };
      setTabs([newTabObj]);
      persistTabsState([newTabObj]);
      setActiveTabId(newId);
      setInputUrl('');
      setIsIncognito(false);
      setIsEditing(false);
      setIsLoading(false);
      setStats((prev) => ({
        ...prev,
        blockedAds: 0,
        blockedPopups: 0,
        blockedOverlays: 0,
      }));
      setTabSheetVisible(false); // Mở ngay màn hình tab mới
      showToast('Đã làm mới sang trang mới');
      return;
    }

    const remaining = tabs.filter((t) => t.id !== id);
    setTabs(remaining);
    persistTabsState(remaining);
    if (activeTabId === id) {
      const nextActive = remaining[remaining.length - 1];
      setActiveTabId(nextActive.id);
      setInputUrl(nextActive.url);
      setIsIncognito(!!nextActive.isIncognito);
      if (nextActive.isSleeping) {
        setTabs((prev) => {
          const updated = prev.map((t) =>
            t.id === nextActive.id
              ? { ...t, isSleeping: false, lastActiveAt: Date.now() }
              : t
          );
          persistTabsState(updated);
          return updated;
        });
      }
      scheduleProcessPooling(nextActive.id);
    }
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
      lastActiveAt: Date.now(),
      isSleeping: false,
    };
    setTabs((prev) => {
      const updated = [...prev, newTab];
      persistTabsState(updated);
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

  // Đóng mọi thẻ
  const handleCloseAllTabs = (onlyIncognito = false) => {
    Keyboard.dismiss();
    if (onlyIncognito) {
      const remaining = tabs.filter((t) => !t.isIncognito);
      tabs.filter((t) => t.isIncognito).forEach((t) => delete webViewRefs.current[t.id]);
      if (remaining.length === 0) {
        const newId = `tab-${Date.now()}`;
        const newTabObj: BrowserTab = { id: newId, url: '', title: 'Trang mới' };
        setTabs([newTabObj]);
        persistTabsState([newTabObj]);
        setActiveTabId(newId);
        setIsIncognito(false);
      } else {
        setTabs(remaining);
        persistTabsState(remaining);
        if (tabs.find((t) => t.id === activeTabId)?.isIncognito) {
          setActiveTabId(remaining[0].id);
          setInputUrl(remaining[0].url);
          setIsIncognito(false);
        }
      }
      showToast('Đã đóng các thẻ ẩn danh');
      return;
    }

    const toClose = tabs.filter((t) => !t.isIncognito && t.url);
    if (toClose.length > 0) {
      closedTabsRef.current.push(...toClose);
      if (closedTabsRef.current.length > 25) {
        closedTabsRef.current = closedTabsRef.current.slice(-25);
      }
    }

    webViewRefs.current = {};
    const newId = `tab-${Date.now()}`;
    const newTabObj: BrowserTab = {
      id: newId,
      url: '',
      title: 'Trang mới',
    };
    setTabs([newTabObj]);
    persistTabsState([newTabObj]);
    setActiveTabId(newId);
    setInputUrl('');
    setIsIncognito(false);
    setIsEditing(false);
    setIsLoading(false);
    setTabSheetVisible(false);
    showToast('Đã đóng tất cả các thẻ');
  };

  // Đóng các thẻ khác (trừ thẻ đang active)
  const handleCloseOtherTabs = (keepId: string) => {
    const keepTab = tabs.find((t) => t.id === keepId) || tabs[0];
    if (keepTab) {
      const toClose = tabs.filter((t) => t.id !== keepId && !t.isIncognito && t.url);
      if (toClose.length > 0) {
        closedTabsRef.current.push(...toClose);
        if (closedTabsRef.current.length > 25) {
          closedTabsRef.current = closedTabsRef.current.slice(-25);
        }
      }

      Object.keys(webViewRefs.current).forEach((id) => {
        if (id !== keepTab.id) delete webViewRefs.current[id];
      });
      setTabs([keepTab]);
      persistTabsState([keepTab]);
      setActiveTabId(keepTab.id);
      setInputUrl(keepTab.url);
      setIsIncognito(!!keepTab.isIncognito);
      showToast('Đã đóng các thẻ khác');
    }
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
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, url: '', title: 'Trang mới' } : t))
      );
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
    if (currentTab?.url) {
      try {
        webViewRefs.current[activeTabId]?.injectJavaScript(getCaptureTabStateScript(activeTabId));
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
    }
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

    // Cập nhật trạng thái: Đóng băng tab cũ (unmount) và kích hoạt tab mới
    setTabs((prev) => {
      const updated = prev.map((t) => {
        if (t.id === previousId) {
          return {
            ...t,
            snapshotUri: capturedSnapshot || t.snapshotUri,
            isSleeping: true,
          };
        }
        if (t.id === id) {
          return {
            ...t,
            isSleeping: false,
            lastActiveAt: now,
          };
        }
        // Giữ tối đa 1 đến 2 WebView trong RAM: mọi tab nền khác đều ở trạng thái ngủ
        return { ...t, isSleeping: true };
      });
      persistTabsState(updated);
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
      const stored = await AsyncStorage.getItem(STORAGE_HISTORY_KEY);
      let list: HistoryItem[] = stored ? JSON.parse(stored) : [];
      if (list.length > 0 && list[0].url === url) return;
      const newItem: HistoryItem = {
        id: `hist-${Date.now()}`,
        url,
        title: title || url,
        timestamp: Date.now(),
      };
      const updated = [newItem, ...list.filter((i) => i.url !== url).slice(0, 199)];
      await AsyncStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(updated));
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
      } else if (data.type === 'KITE_PULL_MOVE') {
        handlePullMove(data.dy, data.dx);
      } else if (data.type === 'KITE_PULL_END') {
        handlePullEnd();
      } else if (data.type === 'KITE_PULL_CANCEL') {
        handlePullCancel();
      } else if (data.type === 'GOOGLE_ACCOUNT_CHOSEN') {
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
          showToast(`Đã chuyển sang: ${chosenProfile.email}`);
        }
      } else if (data.type === 'GOOGLE_LOGIN_COMPLETED') {
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
        // Đưa về màn hình trống (HomeDashboard) ngay khi hoàn tất
        setTabs((prev) =>
          prev.map((t) => (t.id === activeTabId ? { ...t, url: '', title: 'Trang mới' } : t))
        );
        setInputUrl('');
      } else if (data.type === 'GOOGLE_USER_PROFILE') {
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
            showToast(`Đăng nhập thành công! (${profile.name || profile.email})`);
            setTabs((prev) =>
              prev.map((t) => (t.id === activeTabId ? { ...t, url: '', title: 'Trang mới' } : t))
            );
            setInputUrl('');
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
      }
    } catch (e) {}
  };

  // Bộ lọc chặn request mạng trước khi tải (chặn đổi URL cướp tab và mạng quảng cáo)
  const handleShouldStartLoad = (request: { url: string; isTopFrame?: boolean }) => {
    const reqUrl = request.url.toLowerCase();

    // 1. Cho phép các trang nội bộ about/data
    if (reqUrl.startsWith('about:blank') || reqUrl.startsWith('data:')) {
      return true;
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
        if (activeUrl && activeUrl.startsWith('http')) {
          setTimeout(() => {
            const activeWV = getActiveWebView();
            if (activeWV) {
              activeWV.injectJavaScript(`
                if (!document.body || !document.body.children || document.body.children.length === 0) {
                  window.location.replace(${JSON.stringify(activeUrl)});
                }
              `);
            }
          }, 150);
        }
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
        if (activeUrl && activeUrl.startsWith('http')) {
          setTimeout(() => {
            const activeWV = getActiveWebView();
            if (activeWV) {
              activeWV.injectJavaScript(`
                if (!document.body || !document.body.children || document.body.children.length === 0) {
                  window.location.replace(${JSON.stringify(activeUrl)});
                }
              `);
            }
          }, 150);
        }
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
          if (activeUrl && activeUrl.startsWith('http')) {
            setTimeout(() => {
              const activeWV = getActiveWebView();
              if (activeWV) {
                activeWV.injectJavaScript(`
                  if (!document.body || !document.body.children || document.body.children.length === 0) {
                    window.location.replace(${JSON.stringify(activeUrl)});
                  }
                `);
              }
            }, 150);
          }
          return false;
        }
      }
    }

    return true;
  };

  // Cập nhật trạng thái điều hướng cho từng tab riêng biệt
  const handleNavigationStateChangeForTab = (tabId: string, navState: WebViewNavigation) => {
    const isLoginDone =
      navState.url &&
      (navState.url.toLowerCase().includes('utm_source=sign_in_no_continue') ||
        navState.url.toLowerCase().includes('myaccount.google.com'));

    if (tabId === activeTabId) {
      setCanGoBack(navState.canGoBack);
      setCanGoForward(navState.canGoForward);
      if (!isEditing && navState.url && !isLoginDone) {
        setInputUrl(navState.url);
      }
    }

    if (navState.title && !isLoginDone) {
      setTabs((prev) => {
        const updated = prev.map((t) => (t.id === tabId ? { ...t, title: navState.title } : t));
        persistTabsState(updated);
        return updated;
      });
    }

    if (navState.url) {
      if (isLoginDone) {
        // Chờ 600ms để script trích xuất avatar & profile rồi đưa thẳng về màn hình trống (HomeDashboard)
        setTimeout(() => {
          setTabs((prev) => {
            const updated = prev.map((t) => (t.id === tabId ? { ...t, url: '', title: 'Trang mới' } : t));
            persistTabsState(updated);
            return updated;
          });
          setInputUrl('');
        }, 600);
        return;
      }

      saveToHistory(navState.url, navState.title || navState.url, tabId);
      setTabs((prev) => {
        const isUrlDifferent = prev.find((t) => t.id === tabId)?.url !== navState.url;
        const updated = prev.map((t) =>
          t.id === tabId
            ? {
                ...t,
                url: navState.url,
                isReaderMode: isUrlDifferent ? false : t.isReaderMode,
              }
            : t
        );
        persistTabsState(updated);
        return updated;
      });
      if (tabId === activeTabId) {
        setStats((prev) => ({
          ...prev,
          isReaderMode: false,
        }));
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
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, isDesktop: nextVal } : t))
    );
    setTimeout(() => {
      const activeWV = getActiveWebView();
      if (activeWV) {
        activeWV.reload();
      }
    }, 80);
    showToast(nextVal ? 'Đã bật chế độ Trang web máy tính' : 'Đã về chế độ Trang web di động');
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
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, isReaderMode: false } : t))
      );
      setStats((prev) => ({ ...prev, isReaderMode: false }));
      showToast('Đã tắt chế độ đọc báo');
    } else {
      activeWV.injectJavaScript(READER_MODE_SCRIPT);
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, isReaderMode: true } : t))
      );
      setStats((prev) => ({ ...prev, isReaderMode: true }));
    }
  };

  // Xử lý tải tệp xuống trên iOS và kết hợp Share Sheet để người dùng lưu vào Files
  const handleFileDownload = async ({ nativeEvent }: { nativeEvent: { downloadUrl: string } }) => {
    const { downloadUrl } = nativeEvent;
    if (!downloadUrl) return;
    showToast('Đang tải tệp...');
    try {
      const downloadedFile = await File.downloadFileAsync(downloadUrl, Paths.cache, { idempotent: true });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare && downloadedFile?.uri) {
        await Sharing.shareAsync(downloadedFile.uri);
      } else if (downloadedFile?.uri) {
        await Share.share({ url: downloadedFile.uri });
      } else {
        await Share.share({ url: downloadUrl });
      }
      showToast('Tải xuống hoàn tất!');
    } catch (e) {
      Share.share({ url: downloadUrl });
    }
  };

  const isCurrentIncognito = Boolean(currentTab?.isIncognito || isIncognito);
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

      {/* VÙNG TOP BAR: Dòng chữ chúc mừng Kite màu xanh blue ở trên cùng khi duyệt web */}
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
            <Text
              style={[
                styles.webTopGreetingText,
                { color: isIncognito ? '#9ca3af' : '#52525b' },
              ]}
              numberOfLines={1}
            >
              Kite chúc bạn một ngày tốt lành!
            </Text>
          </View>
        </View>
      )}

      {/* Vùng duyệt Web hoặc Màn hình tìm kiếm & Lịch sử hoặc Trang trống mặc định */}
      <View style={[styles.viewport, { backgroundColor: viewportBg }]}>
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
            isIncognito={isIncognito}
            isBookmarked={isCurrentBookmarked}
            onToggleBookmark={() =>
              handleToggleBookmarkCurrentPage(inputUrl, currentTab?.title)
            }
          />
        ) : (
          <>
            {/* 1. MÀN HÌNH HOME DASHBOARD (Hiển thị khi tab hiện tại là trang mới url === null) */}
            {activeUrl === null && (
              <HomeDashboard
                activeTabId={activeTabId}
                onSelectUrl={handleNavigate}
                onFocusSearch={() => {
                  setInputUrl('');
                  setIsEditing(true);
                }}
                currentEngineId={currentEngineId}
                onChangeEngine={handleChangeEngine}
                isIncognito={isIncognito}
                onToggleIncognito={handleToggleIncognito}
                onSearchByImage={handleSearchByImage}
                onScanQr={() => setQrModalVisible(true)}
                onOpenBookmarks={() => setBookmarkSheetVisible(true)}
                onOpenHistory={() => setHistorySheetVisible(true)}
                onOpenTabs={handleOpenTabSheet}
                incognitoPin={incognitoPin}
                onOpenPinSettings={handleOpenPinSettings}
                userProfile={userProfile}
                onUpdateProfile={(p) => {
                  setUserProfile(p);
                  if (p.isLoggedIn && p.email) {
                    AsyncStorage.setItem('@kite_user_profile', JSON.stringify(p));
                  } else {
                    AsyncStorage.removeItem('@kite_user_profile');
                    AsyncStorage.removeItem('@kite_saved_accounts');
                  }
                }}
                onShowToast={showToast}
                onPullMove={handlePullMove}
                onPullEnd={handlePullEnd}
                onPullCancel={handlePullCancel}
                pullDistance={pullDistance}
              />
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
                    source={{ uri: tab.url }}
                    style={[styles.webView, { backgroundColor: '#ffffff' }]}
                    incognito={tab.isIncognito || isIncognito}
                    injectedJavaScriptBeforeContentLoaded={
                      stats.isShieldActive ? INJECTED_BEFORE_CONTENT : undefined
                    }
                    injectedJavaScript={
                      stats.isShieldActive ? INJECTED_AFTER_CONTENT : undefined
                    }
                    onMessage={handleMessage}
                    onShouldStartLoadWithRequest={handleShouldStartLoad}
                    onNavigationStateChange={(navState) =>
                      handleNavigationStateChangeForTab(tab.id, navState)
                    }
                    onLoadStart={() => {
                      if (tab.id === activeTabId) {
                        setIsLoading(true);
                        triggerLoadingSafetyTimer();
                      }
                    }}
                    onLoadProgress={({ nativeEvent }) => {
                      if (tab.id === activeTabId) {
                        setLoadProgress(nativeEvent.progress);
                        if (nativeEvent.progress >= 0.8) {
                          setIsLoading(false);
                        }
                      }
                    }}
                    onLoadEnd={() => {
                      if (tab.id === activeTabId) {
                        setIsLoading(false);
                        setLoadProgress(1);
                        if (stats.isDataSaverActive) {
                          const mode = stats.dataSaverMode || 'block_images';
                          webViewRefs.current[tab.id]?.injectJavaScript(getDataSaverScript(mode));
                        }
                        // Khôi phục chính xác vị trí cuộn & dữ liệu biểu mẫu khi tab được đánh thức
                        if (tab.frozenState) {
                          webViewRefs.current[tab.id]?.injectJavaScript(
                            getRestoreTabStateScript(tab.frozenState)
                          );
                        }
                        // Chụp ảnh snapshot nền của tab để Grid Tabs luôn sẵn sàng ảnh xem trước tĩnh
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
                        }, 750);
                      }
                    }}
                    onError={() => {
                      if (tab.id === activeTabId) setIsLoading(false);
                    }}
                    onHttpError={() => {
                      if (tab.id === activeTabId) setIsLoading(false);
                    }}
                    allowsBackForwardNavigationGestures
                    javaScriptEnabled
                    domStorageEnabled
                    allowsInlineMediaPlayback
                    allowsPictureInPictureMediaPlayback
                    allowsFullscreenVideo
                    fraudulentWebsiteWarningEnabled={false}
                    onFileDownload={handleFileDownload}
                    mediaPlaybackRequiresUserAction={false}
                    setSupportMultipleWindows={false}
                    userAgent={
                      tab.isDesktop
                        ? DESKTOP_USER_AGENT
                        : tab.url?.includes('lens.google.com') ||
                          tab.url?.includes('searchbyimage') ||
                          tab.url?.includes('images.google.com')
                        ? DESKTOP_USER_AGENT
                        : undefined
                    }
                  />
                </View>
              );
            })}
          </>
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
          isReaderMode={!!currentTab?.isReaderMode}
          onToggleReaderMode={handleToggleReaderMode}
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
        onToggleShield={() =>
          setStats((prev) => ({ ...prev, isShieldActive: !prev.isShieldActive }))
        }
        onToggleAggressive={() =>
          setStats((prev) => ({ ...prev, aggressiveMode: !prev.aggressiveMode }))
        }
        onManualZap={handleForceZap}
        isDesktop={currentTab?.isDesktop}
        onToggleDesktop={handleToggleDesktopMode}
        onToggleDataSaver={handleToggleDataSaver}
        onChangeDataSaverMode={handleChangeDataSaverMode}
        onToggleKeepAwake={handleToggleKeepAwake}
        onToggleReaderMode={handleToggleReaderMode}
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
        onClose={() => setLensModalVisible(false)}
        onSearchResult={(url) => {
          setLensModalVisible(false);
          handleNavigate(url);
        }}
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
      />

      {/* Danh sách Dấu trang (Bookmark Sheet) */}
      <BookmarkSheet
        visible={bookmarkSheetVisible}
        onClose={() => setBookmarkSheetVisible(false)}
        onSelectUrl={handleNavigate}
        currentUrl={activeUrl}
        currentTitle={currentTab?.title}
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  webTopGreetingRow: {
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  webTopGreetingText: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
});
