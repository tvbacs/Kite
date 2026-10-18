import { useRef, useEffect } from 'react';
import { Keyboard, PanResponder, BackHandler, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { WebView } from 'react-native-webview';
import { BrowserTab } from '../types/browser';
import { SEARCH_ENGINES, isJunkHistoryItem } from '../constants/searchEngines';
import { RegionSettings, wrapUrlWithProxyGateway } from '../services/regionService';
import { progressBus } from '../components/WebProgressBar';
import { runWhenIdle } from '../utils/idle';

interface UseBrowserNavigationProps {
  screenWidth: number;
  tabs: BrowserTab[];
  setTabs: React.Dispatch<React.SetStateAction<BrowserTab[]>>;
  activeTabId: string;
  activeTabIdRef: React.MutableRefObject<string>;
  activeUrl: string | null;
  currentTab: BrowserTab | undefined;
  getActiveWebView: () => WebView | null;
  webViewRefs: React.MutableRefObject<{ [tabId: string]: WebView | null }>;
  lastBackedUrlRef: React.MutableRefObject<{ [tabId: string]: string }>;
  userInitiatedRef: React.MutableRefObject<boolean>;
  loadingTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  isLoading: boolean;
  setIsLoading: (val: boolean) => void;
  setLoadProgress: (val: number) => void;
  triggerLoadingSafetyTimer: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  isEditing: boolean;
  setIsEditing: (val: boolean) => void;
  setInputUrl: (val: string) => void;
  currentEngineId: 'google' | 'bing' | 'duckduckgo' | 'yahoo';
  regionSettings: RegionSettings;
  persistTabsState: (tabsList: BrowserTab[], activeId?: string) => void;
  clearTabSnapshot: (tabId: string) => void;
  scheduleProcessPooling: (tabId: string) => void;
  saveToHistory: (url: string, title: string, tabId?: string) => void;
  showToast: (msg: string) => void;
  // Modal states để Android hardware back press đóng
  modalsState: {
    passwordSavePrompt: any;
    setPasswordSavePrompt: (v: any) => void;
    findInPageVisible: boolean;
    setFindInPageVisible: (v: boolean) => void;
    downloadPrompt: any;
    setDownloadPrompt: (v: any) => void;
    completedDownload: any;
    setCompletedDownload: (v: any) => void;
    chooseLocationModalVisible: boolean;
    setChooseLocationModalVisible: (v: boolean) => void;
    pinModalVisible: boolean;
    setPinModalVisible: (v: boolean) => void;
    qrModalVisible: boolean;
    setQrModalVisible: (v: boolean) => void;
    lensModalVisible: boolean;
    setLensModalVisible: (v: boolean) => void;
    browserMenuVisible: boolean;
    setBrowserMenuVisible: (v: boolean) => void;
    tabSheetVisible: boolean;
    setTabSheetVisible: (v: boolean) => void;
    videoDownloadSheetVisible: boolean;
    setVideoDownloadSheetVisible: (v: boolean) => void;
    downloadSheetVisible: boolean;
    setDownloadSheetVisible: (v: boolean) => void;
    historySheetVisible: boolean;
    setHistorySheetVisible: (v: boolean) => void;
    bookmarkSheetVisible: boolean;
    setBookmarkSheetVisible: (v: boolean) => void;
    passwordManagerVisible: boolean;
    setPasswordManagerVisible: (v: boolean) => void;
    storageManagerVisible: boolean;
    setStorageManagerVisible: (v: boolean) => void;
    extensionSheetVisible: boolean;
    setExtensionSheetVisible: (v: boolean) => void;
    regionSheetVisible: boolean;
    setRegionSheetVisible: (v: boolean) => void;
    sitePermissionsSheetVisible: boolean;
    setSitePermissionsSheetVisible: (v: boolean) => void;
  };
}

export function useBrowserNavigation({
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
  regionSettings,
  persistTabsState,
  clearTabSnapshot,
  scheduleProcessPooling,
  saveToHistory,
  showToast,
  modalsState,
}: UseBrowserNavigationProps) {
  const isEditingRef = useRef(isEditing);
  isEditingRef.current = isEditing;

  // Kiểm tra chuỗi nhập vào là URL hay từ khóa tìm kiếm
  const isLikelyUrl = (input: string): boolean => {
    const text = input.trim();
    if (/^(https?:\/\/|about:|data:|file:\/\/)/i.test(text)) return true;
    if (/\s/.test(text)) return false;
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
    modalsState.setDownloadPrompt(null);
    modalsState.setCompletedDownload(null);
    modalsState.setChooseLocationModalVisible(false);

    let finalUrl = url.trim();
    if (!finalUrl) return;

    const activeWV = getActiveWebView();

    // Lối tắt Trò chơi Khủng Long
    const lowerTrim = finalUrl.toLowerCase();
    if (
      lowerTrim === 'chrome://dino' ||
      lowerTrim === 'kite://dino' ||
      lowerTrim === 'dino' ||
      lowerTrim === 'offline' ||
      lowerTrim === 'test-offline'
    ) {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      setIsLoading(false);
      setLoadProgress(0);
      setTabs((prev) => {
        const updated = prev.map((t) =>
          t.id === activeTabId
            ? {
                ...t,
                url: 'chrome://dino',
                initialUrl: 'chrome://dino',
                title: 'Trò chơi Khủng Long',
                isOffline: true,
                offlineUrl: 'chrome://dino',
                isLoading: false,
                isSleeping: false,
                snapshotUri: undefined,
              }
            : t
        );
        return updated;
      });
      setInputUrl('chrome://dino');
      return;
    }

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
    setLoadProgress(0);
    progressBus.set(0.05);
    triggerLoadingSafetyTimer();

    const isFromHome = !currentTab?.url;

    setTabs((prev) => {
      const updated = prev.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              url: finalUrl,
              initialUrl: finalUrl,
              title: finalUrl,
              lastActiveAt: Date.now(),
              isSleeping: false,
              isReaderMode: false,
              isLoading: true,
              isOffline: false,
              offlineUrl: undefined,
              snapshotUri: undefined,
              isNavigatingFromHome: isFromHome,
            }
          : t
      );
      return updated;
    });
    setInputUrl(finalUrl);
    if (currentTab?.url === finalUrl || currentTab?.initialUrl === finalUrl) {
      try {
        activeWV?.reload();
      } catch (e) {}
    }
    delete lastBackedUrlRef.current[activeTabId];

    // Safety timeout: Tối đa 400ms nếu mạng chưa bắn progress thì tự động hạ Home để hiện webview
    if (isFromHome) {
      setTimeout(() => {
        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeTabId && t.isNavigatingFromHome
              ? { ...t, isNavigatingFromHome: false }
              : t
          )
        );
      }, 400);
    }

    // Trì hoãn scheduler pooling sang background (300ms) để UI chuyển trang tức thì 0ms chuẩn Chrome
    setTimeout(() => {
      scheduleProcessPooling(activeTabId);
    }, 300);
  };

  // Thử kết nối lại trang từ màn hình Offline Dino
  const handleRetryOfflineTab = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    const targetUrl = tab?.offlineUrl || tab?.url;
    if (!targetUrl || targetUrl === 'chrome://dino') {
      showToast('Đang ở chế độ chơi Khủng Long');
      return;
    }

    setTabs((prev) => {
      const updated = prev.map((t) =>
        t.id === tabId ? { ...t, isOffline: false, isLoading: true } : t
      );
      return updated;
    });

    if (tabId === activeTabId) {
      setIsLoading(true);
      setLoadProgress(0);
      progressBus.set(0.05);
      triggerLoadingSafetyTimer();
    }

    const wv = webViewRefs.current[tabId];
    if (wv) {
      try {
        wv.reload();
      } catch (e) {
        handleNavigate(targetUrl);
      }
    } else {
      handleNavigate(targetUrl);
    }
  };

  // Về trang chủ từ màn hình Offline Dino
  const handleGoHomeFromOffline = (tabId: string) => {
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    setTabs((prev) => {
      const updated = prev.map((t) =>
        t.id === tabId
          ? {
              ...t,
              url: '',
              initialUrl: '',
              title: 'Trang mới',
              isOffline: false,
              offlineUrl: undefined,
              isLoading: false,
              snapshotUri: undefined,
            }
          : t
      );
      return updated;
    });
    if (tabId === activeTabId) {
      setInputUrl('');
      setIsLoading(false);
      setLoadProgress(0);
      progressBus.reset();
    }
  };

  // Nút Back thông minh & phản hồi tức thì 0ms:
  // - Nếu có thể goBack -> goBack tức thì từ BFCache (không gọi stopLoading làm trắng màn hình)
  // - Nếu đang ở trang web nhưng không còn trang trước -> quay về Trang chủ
  const canGoBackEffective = Boolean(canGoBack || !!activeUrl || isLoading || currentTab?.isOffline);
  const lastGoBackTimeRef = useRef<number>(0);
  const lastGoForwardTimeRef = useRef<number>(0);

  const handleGoBack = () => {
    // Chống double invocation (khi cử chỉ OS và cử chỉ WebView cùng bắn tín hiệu trong 400ms)
    const now = Date.now();
    if (now - lastGoBackTimeRef.current < 400) {
      return;
    }
    lastGoBackTimeRef.current = now;

    if (currentTab?.isOffline) {
      handleGoHomeFromOffline(activeTabId);
      return;
    }

    const activeWV = getActiveWebView();

    // 1. Dừng bộ đếm an toàn và ẩn thanh tiến trình
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    setIsLoading(false);
    progressBus.set(1);

    // Nếu tab vừa điều hướng từ Home hoặc không có lịch sử trang trước:
    // Quay về Trang chủ ngay lập tức 0ms!
    if (currentTab?.isNavigatingFromHome || !canGoBack) {
      try {
        activeWV?.stopLoading();
      } catch (e) {}
      if (activeUrl) {
        lastBackedUrlRef.current[activeTabId] = activeUrl;
      }
      runWhenIdle(() => {
        clearTabSnapshot(activeTabId);
      });
      setTabs((prev) => {
        const updated = prev.map((t) =>
          t.id === activeTabId
            ? {
                ...t,
                url: '',
                initialUrl: '',
                title: 'Trang mới',
                snapshotUri: undefined,
                isLoading: false,
                isNavigatingFromHome: false,
              }
            : t
        );
        return updated;
      });
      setInputUrl('');
      return;
    }

    // 2. Điều hướng: Nếu có thể goBack trong lịch sử WebView
    // QUAN TRỌNG: Tuyệt đối không gọi stopLoading() ở đây!
    // activeWV.goBack() tận dụng Back-Forward Cache (BFCache) của Chromium/WebKit
    // để chuyển trang 0ms mượt mà, không giật màn hình trắng!
    if (canGoBack && activeWV) {
      try {
        activeWV.goBack();
      } catch (e) {}
    } else if (activeUrl) {
      // Quay về Trang chủ
      try {
        activeWV?.stopLoading();
      } catch (e) {}
      lastBackedUrlRef.current[activeTabId] = activeUrl;
      runWhenIdle(() => {
        clearTabSnapshot(activeTabId);
      });
      setTabs((prev) => {
        const updated = prev.map((t) =>
          t.id === activeTabId
            ? {
                ...t,
                url: '',
                initialUrl: '',
                title: 'Trang mới',
                snapshotUri: undefined,
                isLoading: false,
                isNavigatingFromHome: false,
              }
            : t
        );
        return updated;
      });
      setInputUrl('');
    }
  };

  const canGoForwardEffective = Boolean(
    canGoForward || (!activeUrl && !!lastBackedUrlRef.current[activeTabId])
  );

  const handleGoForward = () => {
    const now = Date.now();
    if (now - lastGoForwardTimeRef.current < 400) {
      return;
    }
    lastGoForwardTimeRef.current = now;

    const activeWV = getActiveWebView();
    if (canGoForward && activeWV) {
      activeWV.goForward();
    } else if (!activeUrl && lastBackedUrlRef.current[activeTabId]) {
      const restoreUrl = lastBackedUrlRef.current[activeTabId];
      delete lastBackedUrlRef.current[activeTabId];
      handleNavigate(restoreUrl);
    }
  };

  // Edge Swipe Navigation (Vuốt mép màn hình)
  const canGoBackRef = useRef(canGoBackEffective);
  canGoBackRef.current = canGoBackEffective;

  const canGoForwardRef = useRef(canGoForwardEffective);
  canGoForwardRef.current = canGoForwardEffective;

  const handleGoBackRef = useRef(handleGoBack);
  handleGoBackRef.current = handleGoBack;

  const handleGoForwardRef = useRef(handleGoForward);
  handleGoForwardRef.current = handleGoForward;

  // Ref để đọc isLoading tức thì trong PanResponder (tránh stale closure)
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;

  const edgePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      // QUAN TRỌNG: Dùng onMoveShouldSetPanResponder (KHÔNG phải Capture)
      // để TouchableOpacity vẫn nhận được touch event trước.
      // Chỉ claim gesture khi vuốt mép RÕ RÀNG (dx > 30), và KHÔNG khi đang loading.
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (isEditingRef.current) return false;
        if (isLoadingRef.current) return false; // Không cướp touch khi đang tải trang
        const isFromLeftEdge = gestureState.x0 < 80 && gestureState.dx > 30;
        const isFromRightEdge = gestureState.x0 > screenWidth - 80 && gestureState.dx < -30;
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5;
        return (isFromLeftEdge || isFromRightEdge) && isHorizontal;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isEditingRef.current) return;
        const isFromLeftEdge = gestureState.x0 < 95;
        const isFromRightEdge = gestureState.x0 > screenWidth - 95;
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2;

        if (isFromLeftEdge && gestureState.dx > 30 && isHorizontal) {
          if (canGoBackRef.current) {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
            handleGoBackRef.current();
          }
        } else if (isFromRightEdge && gestureState.dx < -30 && isHorizontal) {
          if (canGoBackRef.current) {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
            handleGoBackRef.current();
          } else if (canGoForwardRef.current) {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
            handleGoForwardRef.current();
          }
        }
      },
    })
  ).current;

  // Xử lý phím Back phần cứng trên Android
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const onBackPress = () => {
      const m = modalsState;
      if (m.passwordSavePrompt) {
        m.setPasswordSavePrompt(null);
        return true;
      }
      if (m.findInPageVisible) {
        m.setFindInPageVisible(false);
        return true;
      }
      if (m.downloadPrompt) {
        m.setDownloadPrompt(null);
        return true;
      }
      if (m.completedDownload) {
        m.setCompletedDownload(null);
        return true;
      }
      if (m.chooseLocationModalVisible) {
        m.setChooseLocationModalVisible(false);
        return true;
      }
      if (m.pinModalVisible) {
        m.setPinModalVisible(false);
        return true;
      }
      if (m.qrModalVisible) {
        m.setQrModalVisible(false);
        return true;
      }
      if (m.lensModalVisible) {
        m.setLensModalVisible(false);
        return true;
      }
      if (isEditing) {
        setIsEditing(false);
        setInputUrl(activeUrl || '');
        return true;
      }
      if (m.browserMenuVisible) {
        m.setBrowserMenuVisible(false);
        return true;
      }
      if (m.tabSheetVisible) {
        m.setTabSheetVisible(false);
        return true;
      }
      if (m.videoDownloadSheetVisible) {
        m.setVideoDownloadSheetVisible(false);
        return true;
      }
      if (m.downloadSheetVisible) {
        m.setDownloadSheetVisible(false);
        return true;
      }
      if (m.historySheetVisible) {
        m.setHistorySheetVisible(false);
        return true;
      }
      if (m.bookmarkSheetVisible) {
        m.setBookmarkSheetVisible(false);
        return true;
      }
      if (m.passwordManagerVisible) {
        m.setPasswordManagerVisible(false);
        return true;
      }
      if (m.storageManagerVisible) {
        m.setStorageManagerVisible(false);
        return true;
      }
      if (m.extensionSheetVisible) {
        m.setExtensionSheetVisible(false);
        return true;
      }
      if (m.regionSheetVisible) {
        m.setRegionSheetVisible(false);
        return true;
      }
      if (m.sitePermissionsSheetVisible) {
        m.setSitePermissionsSheetVisible(false);
        return true;
      }

      if (canGoBackEffective) {
        handleGoBack();
        return true;
      }

      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [canGoBackEffective, isEditing, activeUrl, modalsState]);

  return {
    handleNavigate,
    handleRetryOfflineTab,
    handleGoHomeFromOffline,
    handleGoBack,
    handleGoForward,
    canGoBackEffective,
    canGoForwardEffective,
    edgePanResponder,
    isLikelyUrl,
  };
}
