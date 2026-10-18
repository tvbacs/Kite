import { useState, useRef, useEffect } from 'react';
import { Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import { ShieldStats, BrowserTab, DataSaverMode } from '../types/browser';
import {
  RegionSettings,
  DEFAULT_REGION_SETTINGS,
} from '../services/regionService';
import {
  ExtensionItem,
  DEFAULT_EXTENSIONS,
  isUrlMatchingPattern,
  DARK_MODE_INJECT_SCRIPT,
  DARK_MODE_REMOVE_SCRIPT,
} from '../components/ExtensionSheet';
import {
  FORCE_ZAP_SCRIPT,
  getDataSaverScript,
  READER_MODE_SCRIPT,
  EXIT_READER_MODE_SCRIPT,
} from '../services/antiAdScript';
import {
  isGoogleTranslateUrl,
  getOriginalUrlFromTranslateUrl,
  getDomTranslationScript,
  getRestoreOriginalScript,
} from '../services/translateService';

export const STORAGE_DATA_SAVER_KEY = '@kite_data_saver_mode';
export const STORAGE_KEEP_AWAKE_KEY = '@kite_keep_awake';
export const STORAGE_SHIELD_ACTIVE_KEY = '@kite_shield_active';
export const STORAGE_SHIELD_AGGRESSIVE_KEY = '@kite_shield_aggressive';
export const STORAGE_EXTENSIONS_KEY = '@kite_browser_extensions';

interface UseShieldAndExtensionsProps {
  activeTabId: string;
  activeUrl: string | null;
  currentTab: BrowserTab | undefined;
  tabs: BrowserTab[];
  setTabs: React.Dispatch<React.SetStateAction<BrowserTab[]>>;
  persistTabsState: (tabsList: BrowserTab[], activeId?: string) => void;
  webViewRefs: React.MutableRefObject<{ [tabId: string]: WebView | null }>;
  getActiveWebView: () => WebView | null;
  updateWakeLock: (isKeepAwakeActive?: boolean, isVideoPlaying?: boolean) => void;
  isVideoPlayingRef: React.MutableRefObject<boolean>;
  handleNavigate: (url: string) => void;
  showToast: (msg: string) => void;
}

export function useShieldAndExtensions({
  activeTabId,
  activeUrl,
  currentTab,
  tabs,
  setTabs,
  persistTabsState,
  webViewRefs,
  getActiveWebView,
  updateWakeLock,
  isVideoPlayingRef,
  handleNavigate,
  showToast,
}: UseShieldAndExtensionsProps) {
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

  const [shieldSheetVisible, setShieldSheetVisible] = useState<boolean>(false);
  const [extensionSheetVisible, setExtensionSheetVisible] = useState<boolean>(false);
  const [extensions, setExtensions] = useState<ExtensionItem[]>(DEFAULT_EXTENSIONS);
  const [regionSettings, setRegionSettings] = useState<RegionSettings>(DEFAULT_REGION_SETTINGS);
  const [regionSheetVisible, setRegionSheetVisible] = useState<boolean>(false);

  const [shieldBadgeMode, setShieldBadgeMode] = useState<'on' | 'vpn'>('on');
  const shieldBadgeAnim = useRef(new Animated.Value(1)).current;

  // Hiệu ứng luân phiên đổi huy hiệu Khiên
  useEffect(() => {
    if (!regionSettings.enabled) {
      setShieldBadgeMode('on');
      shieldBadgeAnim.setValue(1);
      return;
    }

    if (!stats.isShieldActive) {
      setShieldBadgeMode('vpn');
      shieldBadgeAnim.setValue(1);
      return;
    }

    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(shieldBadgeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(shieldBadgeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();

      setTimeout(() => {
        setShieldBadgeMode((prev) => (prev === 'on' ? 'vpn' : 'on'));
      }, 200);
    }, 2800);

    return () => clearInterval(interval);
  }, [regionSettings.enabled, stats.isShieldActive]);

  // Sinh mã script tiện ích mở rộng
  const getExtensionsScriptForTab = (
    tabUrl?: string | null,
    timing: 'document_start' | 'document_end' = 'document_end'
  ) => {
    if (!tabUrl || !extensions || extensions.length === 0) return '';
    const matching = extensions.filter(
      (e) => e.id !== 'ext-dark-mode' && e.enabled && e.runAt === timing && isUrlMatchingPattern(tabUrl, e.matchUrl)
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

  // Cập nhật extension
  const handleExtensionsUpdated = (updated: ExtensionItem[]) => {
    setExtensions(updated);
    const darkModeExt = updated.find((e) => e.id === 'ext-dark-mode');
    const isDarkEnabled = Boolean(darkModeExt?.enabled);

    const script = isDarkEnabled ? DARK_MODE_INJECT_SCRIPT : DARK_MODE_REMOVE_SCRIPT;

    tabs.forEach((t) => {
      webViewRefs.current[t.id]?.injectJavaScript(script);
    });
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

  // Bật/tắt chế độ Trang web máy tính
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

  // Bật/tắt Chế độ chặn gắt gao
  const handleToggleAggressive = () => {
    const nextVal = !stats.aggressiveMode;
    setStats((prev) => ({ ...prev, aggressiveMode: nextVal }));
    AsyncStorage.setItem(STORAGE_SHIELD_AGGRESSIVE_KEY, JSON.stringify(nextVal));
    showToast(nextVal ? 'Đã bật Chế độ chặn gắt gao' : 'Đã tắt Chế độ chặn gắt gao');
  };

  // Bật/tắt chế độ Tiết kiệm dữ liệu
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

  // Bật/tắt giữ màn hình luôn sáng
  const handleToggleKeepAwake = () => {
    const nextVal = !stats.isKeepAwakeActive;
    setStats((prev) => ({ ...prev, isKeepAwakeActive: nextVal }));
    updateWakeLock(nextVal, isVideoPlayingRef.current);
    AsyncStorage.setItem(STORAGE_KEEP_AWAKE_KEY, JSON.stringify(nextVal));
    showToast(nextVal ? 'Đã bật Giữ màn hình luôn sáng' : 'Đã tắt Giữ màn hình luôn sáng');
  };

  // Bật/tắt Chế độ đọc báo
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

  // Dịch trang web
  const isCurrentTranslated = Boolean(
    currentTab?.isTranslated || isGoogleTranslateUrl(activeUrl || currentTab?.url)
  );

  const handleToggleTranslate = () => {
    const rawUrl = activeUrl || currentTab?.url;
    if (!rawUrl || rawUrl.startsWith('about:') || rawUrl.startsWith('kite://')) {
      showToast('Chỉ có thể dịch các trang web thực tế');
      return;
    }

    if (isGoogleTranslateUrl(rawUrl)) {
      const original = getOriginalUrlFromTranslateUrl(rawUrl, currentTab?.originalUrlBeforeTranslate);
      if (original) {
        handleNavigate(original);
        showToast('Đang quay lại trang web gốc...');
        return;
      }
    }

    if (currentTab?.isTranslated) {
      webViewRefs.current[activeTabId]?.injectJavaScript(getRestoreOriginalScript());
      setTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, isTranslated: false } : t))
      );
      showToast('Đã khôi phục ngôn ngữ gốc');
    } else {
      showToast('Đang dịch trang web sang tiếng Việt...');
      webViewRefs.current[activeTabId]?.injectJavaScript(getDomTranslationScript(activeTabId));
    }
  };

  return {
    stats,
    setStats,
    shieldSheetVisible,
    setShieldSheetVisible,
    extensionSheetVisible,
    setExtensionSheetVisible,
    extensions,
    setExtensions,
    regionSettings,
    setRegionSettings,
    regionSheetVisible,
    setRegionSheetVisible,
    shieldBadgeMode,
    shieldBadgeAnim,
    getExtensionsScriptForTab,
    handleExtensionsUpdated,
    handleForceZap,
    handleToggleDesktopMode,
    handleToggleShield,
    handleToggleAggressive,
    handleToggleDataSaver,
    handleChangeDataSaverMode,
    handleToggleKeepAwake,
    handleToggleReaderMode,
    isCurrentTranslated,
    handleToggleTranslate,
  };
}
