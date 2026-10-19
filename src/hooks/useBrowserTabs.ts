import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Keyboard, View, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import { captureRef } from 'react-native-view-shot';
import { File, Directory, Paths } from 'expo-file-system';
import { BrowserTab, UserProfile } from '../types/browser';
import { PAUSE_BACKGROUND_MEDIA_SCRIPT, getCaptureTabStateScript } from '../services/antiAdScript';
import { progressBus } from '../components/WebProgressBar';
import { runWhenIdle } from '../utils/idle';

export const STORAGE_PERSISTED_TABS_KEY = '@kite_persisted_tabs_state';
export const STORAGE_ACTIVE_TAB_ID_KEY = '@kite_active_tab_id';
export const STORAGE_PERSISTED_INCOGNITO_TABS_KEY = '@kite_persisted_incognito_tabs_state';
export const MAX_ACTIVE_BACKGROUND_TABS = 2;

// Thư mục lưu trữ snapshot của các thẻ duyệt web thường (tách biệt gọn gàng, không để ngoài thư mục gốc)
export const getSnapshotDirectory = (): Directory => {
  const dir = new Directory(Paths.document, 'Kite_Snapshots');
  if (!dir.exists) {
    try {
      dir.create();
    } catch {}
  }
  return dir;
};

interface UseBrowserTabsProps {
  userProfileRef: React.MutableRefObject<UserProfile>;
  syncAllAccountsRef: React.MutableRefObject<boolean>;
  requestIncognitoAccess: (action: () => void) => void;
  showToast: (msg: string) => void;
  isLoading: boolean;
  setIsLoading: (val: boolean) => void;
  setLoadProgress: (val: number) => void;
  loadingTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setInputUrl: (url: string) => void;
  setIsEditing: (val: boolean) => void;
  triggerLoadingSafetyTimer: () => void;
  resetShieldStatsForTab?: () => void;
}

export function useBrowserTabs({
  userProfileRef,
  syncAllAccountsRef,
  requestIncognitoAccess,
  showToast,
  isLoading,
  setIsLoading,
  setLoadProgress,
  loadingTimerRef,
  setInputUrl,
  setIsEditing,
  triggerLoadingSafetyTimer,
  resetShieldStatsForTab,
}: UseBrowserTabsProps) {
  const [tabs, setTabs] = useState<BrowserTab[]>([
    { id: 'tab-1', url: '', title: 'Trang mới', lastActiveAt: Date.now(), isSleeping: false },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-1');
  const activeTabIdRef = useRef<string>('tab-1');
  const [isIncognito, setIsIncognito] = useState<boolean>(false);
  const [tabSheetVisible, setTabSheetVisible] = useState<boolean>(false);

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const tabSheetVisibleRef = useRef(tabSheetVisible);
  tabSheetVisibleRef.current = tabSheetVisible;

  const lastSavedJsonRef = useRef<Record<string, string>>({});

  const webViewRefs = useRef<{ [tabId: string]: WebView | null }>({});
  const webViewContainerRefs = useRef<{ [tabId: string]: View | null }>({});
  const closedTabsRef = useRef<BrowserTab[]>([]);
  const lastBackedUrlRef = useRef<{ [tabId: string]: string }>({});
  const isRestoredRef = useRef<boolean>(false);

  const getActiveWebView = () =>
    webViewRefs.current[activeTabIdRef.current] || webViewRefs.current[activeTabId] || null;

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

  // Đồng bộ activeTabIdRef
  useEffect(() => {
    activeTabIdRef.current = activeTabId;

    if (!isRestoredRef.current) return;
    if (activeTabId) {
      AsyncStorage.setItem(STORAGE_ACTIVE_TAB_ID_KEY, activeTabId).catch(() => {});
      scheduleProcessPooling(activeTabId);
    }
  }, [activeTabId]);

  // Signature tối ưu: Chỉ kích hoạt lưu khi các thuộc tính bền vững của Tab thật sự thay đổi
  const persistSig = useMemo(
    () =>
      tabs
        .map(
          (t) =>
            `${t.id}|${t.url}|${t.title}|${t.snapshotUri}|${t.isSleeping}|${
              t.frozenState ? 1 : 0
            }`
        )
        .join('~'),
    [tabs]
  );

  // Debounce lưu tabs: 1.5s sau khi ổn định mới ghi đĩa, tuyệt đối KHÔNG chặn luồng Main UI
  useEffect(() => {
    if (!isRestoredRef.current) return;
    const timerId = setTimeout(() => {
      runWhenIdle(() => {
        persistTabsState(tabsRef.current, activeTabIdRef.current);
      });
    }, 1500);
    return () => clearTimeout(timerId);
  }, [persistSig, activeTabId]);

  // Ghi tức thì khi app chuyển sang chạy nền (background / kill)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' && isRestoredRef.current) {
        persistTabsState(tabsRef.current, activeTabIdRef.current);
      }
    });
    return () => sub.remove();
  }, []);

  // Tạm dừng video & âm thanh trên các tab nền
  useEffect(() => {
    Object.entries(webViewRefs.current).forEach(([tabId, ref]) => {
      if (tabId !== activeTabId && ref) {
        ref.injectJavaScript(PAUSE_BACKGROUND_MEDIA_SCRIPT);
      }
    });
  }, [activeTabId]);

  // Tự động đóng băng (Smart Tab Sleeping) theo chuẩn Chrome Mobile:
  // - Các tab nền giữ nguyên trong RAM (Back-Forward Cache / Freeze State) để khi quay lại là 0ms KHÔNG CẦN RELOAD
  // - Chỉ đưa vào chế độ ngủ sâu (isSleeping: true) khi máy mở nhiều tab (> 5 tab) và tab đã không dùng quá 15 phút
  // - TUYỆT ĐỐI không gọi captureActiveSnapshot trên tab nền (tránh ghi đè ảnh hỏng làm mất thumbnail)
  useEffect(() => {
    const idleCheckInterval = setInterval(() => {
      const now = Date.now();
      const LONG_IDLE_TIME_MS = 15 * 60 * 1000; // 15 phút không dùng
      const curActiveId = activeTabIdRef.current;

      setTabs((prev) => {
        // Nếu chỉ có 5 tab trở xuống: Giữ 100% trong RAM giống Chrome để chuyển tab tức thì 0ms
        if (prev.filter((t) => t.url).length <= 5) return prev;

        const toFreeze = prev.filter(
          (t) =>
            t.id !== curActiveId &&
            t.url &&
            !t.isSleeping &&
            !t.isIncognito && // Không bao giờ tự ý ngủ tab ẩn danh
            t.lastActiveAt &&
            now - t.lastActiveAt > LONG_IDLE_TIME_MS
        );
        if (toFreeze.length === 0) return prev;

        toFreeze.forEach((t) => {
          try {
            webViewRefs.current[t.id]?.stopLoading();
          } catch (e) {}
          try {
            webViewRefs.current[t.id]?.injectJavaScript(getCaptureTabStateScript(t.id));
          } catch (e) {}
        });

        setTimeout(() => {
          setTabs((current) => {
            const updated = current.map((t) =>
              toFreeze.some((f) => f.id === t.id) && !t.isSleeping && t.id !== activeTabIdRef.current
                ? { ...t, isSleeping: true, isLoading: false }
                : t
            );
            persistTabsState(updated);
            return updated;
          });
        }, 300);

        return prev;
      });
    }, 60000);

    return () => clearInterval(idleCheckInterval);
  }, []);

  // Lưu trạng thái cuộn, URL và snapshot của các thẻ vào AsyncStorage
  const persistTabsState = async (
    tabsList: BrowserTab[],
    currentActiveId?: string,
    overrideEmail?: string
  ) => {
    try {
      const normalTabs = tabsList.filter((t) => !t.isIncognito);
      const incognitoTabs = tabsList.filter((t) => !!t.isIncognito);

      // 1. Lưu các tab thường
      if (normalTabs.length > 0) {
        let idToSave = currentActiveId || activeTabIdRef.current;
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
          frozenState: t.isSleeping ? t.frozenState : undefined,
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

        const json = JSON.stringify(toPersist);
        if (lastSavedJsonRef.current[tabsKey] !== json) {
          lastSavedJsonRef.current[tabsKey] = json;
          await Promise.all([
            AsyncStorage.setItem(tabsKey, json),
            idToSave ? AsyncStorage.setItem(activeIdKey, idToSave) : Promise.resolve(),
          ]);
        }
      }

      // 2. Lưu các tab ẩn danh vào storage session riêng (tránh bị mất khi app bị kill ngầm hoặc reload)
      if (incognitoTabs.length > 0) {
        const incognitoToPersist = incognitoTabs.map((t) => ({
          id: t.id,
          url: t.url,
          title: t.title,
          isDesktop: t.isDesktop,
          isIncognito: true,
          isReaderMode: t.isReaderMode,
          snapshotUri: undefined, // Tab ẩn danh TUYỆT ĐỐI KHÔNG lưu snapshot ra bộ nhớ
          frozenState: t.isSleeping ? t.frozenState : undefined,
          lastActiveAt: t.lastActiveAt,
        }));
        const incognitoJson = JSON.stringify(incognitoToPersist);
        if (lastSavedJsonRef.current[STORAGE_PERSISTED_INCOGNITO_TABS_KEY] !== incognitoJson) {
          lastSavedJsonRef.current[STORAGE_PERSISTED_INCOGNITO_TABS_KEY] = incognitoJson;
          await AsyncStorage.setItem(STORAGE_PERSISTED_INCOGNITO_TABS_KEY, incognitoJson);
        }
      } else {
        lastSavedJsonRef.current[STORAGE_PERSISTED_INCOGNITO_TABS_KEY] = '';
        await AsyncStorage.removeItem(STORAGE_PERSISTED_INCOGNITO_TABS_KEY);
      }
    } catch (e) {}
  };

  // Chụp ảnh màn hình tab đang mở (CHỈ chụp khi tab thường đang hiển thị thực tế trên màn hình)
  const captureActiveSnapshot = async (tabId: string): Promise<string | null> => {
    try {
      // 0. Tab ẩn danh TUYỆT ĐỐI KHÔNG chụp và KHÔNG lưu snapshot vào bộ nhớ (bảo mật riêng tư)
      const targetTab = tabs.find((t) => t.id === tabId);
      if (targetTab?.isIncognito) {
        return null;
      }

      // 1. Tuyệt đối không chụp tab nền vì tab nền bị ẩn (opacity: 0, translateX: 999999).
      // Chụp tab nền sẽ tạo file hỏng/trắng và làm mất thumbnail cũ!
      if (tabId !== activeTabIdRef.current) {
        return targetTab?.snapshotUri || null;
      }

      const view = webViewContainerRefs.current[tabId];
      if (!view) return null;
      const tmpUri = await captureRef(view, {
        format: 'jpg',
        quality: 0.65,
        result: 'tmpfile',
      });
      if (!tmpUri) return null;

      try {
        const tmp = new File(tmpUri);
        // Kiểm tra file tạm phải tồn tại và có kích thước > 0
        if (!tmp.exists || (tmp.size !== undefined && tmp.size <= 0)) {
          return targetTab?.snapshotUri || null;
        }

        // Lưu vào thư mục Kite_Snapshots chuyên dụng (không để rải rác ngoài thư mục gốc)
        const snapshotDir = getSnapshotDirectory();
        const destFile = new File(snapshotDir, `tab_snapshot_${tabId}.jpg`);
        if (destFile.exists) {
          try { destFile.delete(); } catch {}
        }
        tmp.copy(destFile);

        // Dọn dẹp file cũ ở thư mục gốc Paths.document nếu còn sót lại
        try {
          const oldRootFile = new File(Paths.document, `tab_snapshot_${tabId}.jpg`);
          if (oldRootFile.exists) oldRootFile.delete();
        } catch {}

        return destFile.uri;
      } catch (e) {
        return null;
      }
    } catch (e) {
      return null;
    }
  };

  // Xóa ảnh chụp snapshot của tab
  const clearTabSnapshot = (tabId: string) => {
    const target = tabs.find((t) => t.id === tabId);
    if (target?.snapshotUri) {
      try {
        const f = new File(target.snapshotUri);
        if (f.exists) f.delete();
      } catch {}
    }
    try {
      const snapInSub = new File(getSnapshotDirectory(), `tab_snapshot_${tabId}.jpg`);
      if (snapInSub.exists) snapInSub.delete();
      const snapInRoot = new File(Paths.document, `tab_snapshot_${tabId}.jpg`);
      if (snapInRoot.exists) snapInRoot.delete();
    } catch {}
  };

  // Tạo tab mới
  const handleNewTab = (isIncognitoMode?: boolean, initialUrl?: string) => {
    const effectiveIncognito =
      isIncognitoMode !== undefined ? isIncognitoMode : Boolean(currentTab?.isIncognito);
    if (effectiveIncognito) {
      requestIncognitoAccess(() => {
        executeNewTab(true, initialUrl);
      });
    } else {
      executeNewTab(false, initialUrl);
    }
  };

  const executeNewTab = async (isIncognitoMode: boolean, initialUrl?: string) => {
    Keyboard.dismiss();
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    setIsLoading(false);
    const prevActiveId = activeTabIdRef.current;
    if (prevActiveId && webViewRefs.current[prevActiveId]) {
      try {
        webViewRefs.current[prevActiveId]?.injectJavaScript(PAUSE_BACKGROUND_MEDIA_SCRIPT);
      } catch (e) {}
    }

    const newId = `tab-${Date.now()}`;
    const newTabObj: BrowserTab = {
      id: newId,
      url: initialUrl || '',
      initialUrl: initialUrl || '',
      title: initialUrl ? 'Đang tải...' : 'Trang mới',
      isIncognito: isIncognitoMode,
      lastActiveAt: Date.now(),
      isSleeping: false,
      isLoading: Boolean(initialUrl),
    };
    activeTabIdRef.current = newId;
    setTabs((prev) => prev.concat(newTabObj));
    setActiveTabId(newId);
    setInputUrl(initialUrl || '');
    setIsIncognito(isIncognitoMode);
    setIsEditing(false);
    setIsLoading(Boolean(initialUrl));
    resetShieldStatsForTab?.();
    showToast(isIncognitoMode ? 'Đã tạo thẻ ẩn danh mới' : 'Đã tạo thẻ mới');
    scheduleProcessPooling(newId);
  };

  // Đóng tab
  const handleCloseTab = (id: string) => {
    if (id === activeTabId) {
      const activeWV = getActiveWebView();
      try {
        activeWV?.stopLoading();
      } catch (e) {}
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      setIsLoading(false);
      setLoadProgress(1);
    }
    delete webViewRefs.current[id];
    delete webViewContainerRefs.current[id];

    setTimeout(() => {
      try {
        const snapInSub = new File(getSnapshotDirectory(), `tab_snapshot_${id}.jpg`);
        if (snapInSub.exists) snapInSub.delete();
        const snapFile = new File(Paths.document, `tab_snapshot_${id}.jpg`);
        if (snapFile.exists) snapFile.delete();
      } catch {}
    }, 1000);

    const closingTab = tabs.find((t) => t.id === id);
    const isClosingIncognito = Boolean(closingTab?.isIncognito);

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

    if (remainingSameMode.length === 0) {
      if (isClosingIncognito) {
        const remainingNormal = remaining.filter((t) => !t.isIncognito);
        if (remainingNormal.length > 0) {
          const nextActive = remainingNormal[remainingNormal.length - 1];
          setTabs(remaining);
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
          setActiveTabId(newNormalId);
          setInputUrl('');
          setIsIncognito(false);
        }
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
        const updatedTabs = [...remaining, newTabObj];
        setTabs(updatedTabs);
        setActiveTabId(newNormalId);
        setInputUrl('');
        setIsIncognito(false);
      }
      return;
    }

    const currentModeTabs = tabs.filter(
      (t) => Boolean(t.isIncognito) === isClosingIncognito
    );
    const closedIndex = currentModeTabs.findIndex((t) => t.id === id);

    let nextActiveId = activeTabId;
    if (activeTabId === id) {
      // Chuẩn Chrome: Ưu tiên chọn tab liền kề cùng vị trí (tab trượt tới), nếu không có thì lấy tab trước đó
      const nextActive =
        remainingSameMode[closedIndex] ||
        remainingSameMode[closedIndex - 1] ||
        remainingSameMode[0];
      if (nextActive) {
        nextActiveId = nextActive.id;
        setActiveTabId(nextActive.id);
        setInputUrl(nextActive.url || '');
        setIsIncognito(isClosingIncognito);
        if (nextActive.isSleeping) {
          nextActive.isSleeping = false;
          nextActive.isLoading = true;
          setIsLoading(true);
        } else {
          setIsLoading(false);
          progressBus.set(1);
        }
      }
    }

    setTabs(remaining);
    if (!tabSheetVisible) {
      scheduleProcessPooling(nextActiveId);
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
      initialUrl: restored.initialUrl || restored.url,
      snapshotUri: undefined,
      lastActiveAt: Date.now(),
      isSleeping: false,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
    setInputUrl(newTab.url);
    setIsIncognito(!!newTab.isIncognito);
    scheduleProcessPooling(newId);
    showToast(`Đã khôi phục thẻ: ${newTab.title || newTab.url}`);
  };

  // Đóng mọi thẻ
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
        setActiveTabId(newId);
        setIsIncognito(false);
      } else {
        setTabs(remainingNormal);
        if (tabs.find((t) => t.id === activeTabId)?.isIncognito) {
          setActiveTabId(remainingNormal[0].id);
          setInputUrl(remainingNormal[0].url);
          setIsIncognito(false);
        }
      }
      AsyncStorage.removeItem(STORAGE_PERSISTED_INCOGNITO_TABS_KEY).catch(() => {});
      showToast('Đã đóng tất cả thẻ ẩn danh');
      return;
    }

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
    setActiveTabId(newId);
    setInputUrl('');
    setIsIncognito(false);
    setIsEditing(false);
    setIsLoading(false);
    setTabSheetVisible(false);
    showToast('Đã đóng tất cả thẻ thường');
  };

  // Đóng các thẻ khác
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
    setActiveTabId(keepTab.id);
    setInputUrl(keepTab.url);
    setIsIncognito(isIncognitoMode);
    showToast(isIncognitoMode ? 'Đã đóng các thẻ ẩn danh khác' : 'Đã đóng các thẻ thường khác');
  };

  // LRU Process Pooling & Tab Hibernation
  const sleepTabs = useCallback((ids: string[]) => {
    ids.forEach((id) => {
      const w = webViewRefs.current[id];
      try {
        w?.stopLoading();
        w?.injectJavaScript(getCaptureTabStateScript(id));
      } catch (e) {}
    });

    setTimeout(() => {
      setTabs((cur) =>
        cur.map((t) =>
          ids.includes(t.id) && t.id !== activeTabIdRef.current && !t.isSleeping
            ? { ...t, isSleeping: true, isLoading: false, initialUrl: t.url || t.initialUrl }
            : t
        )
      );
    }, 400);
  }, []);

  const scheduleProcessPooling = useCallback((curActiveId: string) => {
    setTimeout(() => {
      if (tabSheetVisibleRef.current) return;
      const bg = tabsRef.current
        .filter((t) => t.url && !t.isSleeping && t.id !== curActiveId)
        .sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0));
      const toSleep = bg.slice(MAX_ACTIVE_BACKGROUND_TABS).map((t) => t.id);
      if (toSleep.length > 0) {
        sleepTabs(toSleep);
      }
    }, 500);
  }, [sleepTabs]);

  // Đóng băng toàn bộ các tab nền (không đóng băng tab ẩn danh)
  const handleFreezeBackgroundTabs = () => {
    const bgTabs = tabs.filter(
      (t) => t.id !== activeTabId && t.url && !t.isSleeping && !t.isIncognito
    );
    if (bgTabs.length === 0) {
      showToast('Tất cả thẻ nền đã được tối ưu');
      return;
    }

    bgTabs.forEach((t) => {
      try {
        webViewRefs.current[t.id]?.stopLoading();
      } catch (e) {}
      try {
        webViewRefs.current[t.id]?.injectJavaScript(getCaptureTabStateScript(t.id));
      } catch (e) {}
    });

    setTimeout(() => {
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== activeTabId && t.url && !t.isSleeping) {
            return { ...t, isSleeping: true, isLoading: false };
          }
          return t;
        })
      );
      showToast(`Đã đóng băng ${bgTabs.length} thẻ nền để giải phóng RAM`);
    }, 200);
  };

  // Mở giao diện TabSheet - 0ms delay tức thì
  const handleOpenTabSheet = useCallback(() => {
    setTabSheetVisible(true);
    const id = activeTabIdRef.current;
    const t = tabsRef.current.find((x) => x.id === id);
    if (!t?.url || t.isLoading || t.isIncognito) return; // Tab ẩn danh TUYỆT ĐỐI KHÔNG chụp ảnh snapshot

    requestAnimationFrame(() => {
      runWhenIdle(async () => {
        try {
          webViewRefs.current[id]?.injectJavaScript(getCaptureTabStateScript(id));
          const snap = await captureActiveSnapshot(id);
          if (snap) {
            setTabs((prev) =>
              prev.map((x) => (x.id === id ? { ...x, snapshotUri: snap } : x))
            );
          }
        } catch (e) {}
      });
    });
  }, []);

  // Chuyển tab tức thì 0ms chuẩn Chrome
  const handleSelectTab = useCallback((id: string, onTabChanged?: (targetTab: BrowserTab) => void) => {
    activeTabIdRef.current = id;
    setTabSheetVisible(false);

    const previousId = activeTabId;
    const previousTab = tabsRef.current.find((t) => t.id === previousId);
    const target = tabsRef.current.find((t) => t.id === id);
    const now = Date.now();
    const isWakingUp = Boolean(target?.isSleeping);

    if (id === activeTabId) {
      if (target?.url) {
        setInputUrl(target.url);
      }
      if (target?.isSleeping) {
        setTabs((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, isSleeping: false, isLoading: true, lastActiveAt: now } : t
          )
        );
        setIsLoading(true);
        progressBus.set(0.1);
      } else if (target?.isLoading) {
        setIsLoading(true);
        progressBus.set(0.1);
      }
      if (target) {
        onTabChanged?.(target);
      }
      return;
    }

    // 1. Tạm dừng media của tab cũ khi chuyển sang tab khác
    if (previousId && webViewRefs.current[previousId]) {
      try {
        webViewRefs.current[previousId]?.injectJavaScript(PAUSE_BACKGROUND_MEDIA_SCRIPT);
      } catch (e) {}
    }

    // 2. Kích hoạt ngay lập tức tab mới
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          return {
            ...t,
            isSleeping: false,
            isLoading: t.isSleeping ? true : t.isLoading,
            lastActiveAt: now,
          };
        }
        return t;
      })
    );

    if (target?.isIncognito) {
      requestIncognitoAccess(() => {
        setActiveTabId(id);
        setInputUrl(target?.url || '');
        setIsIncognito(true);
      });
    } else {
      setActiveTabId(id);
      setInputUrl(target?.url || '');
      setIsIncognito(false);
    }

    if (target?.url && (target?.isLoading || isWakingUp)) {
      setIsLoading(true);
      progressBus.set(0.1);
    } else {
      setIsLoading(false);
      progressBus.set(1);
    }

    if (target) {
      onTabChanged?.(target);
    }

    setTimeout(() => {
      scheduleProcessPooling(id);
    }, 500);
  }, [scheduleProcessPooling, requestIncognitoAccess, activeTabId]);

  // Xóa toàn bộ snapshots
  const handleClearTabSnapshots = async () => {
    try {
      const snapDir = getSnapshotDirectory();
      if (snapDir.exists) {
        const items = snapDir.list();
        for (const item of items) {
          try {
            if (item instanceof File) item.delete();
          } catch {}
        }
      }
      tabs.forEach((t) => {
        if (t.snapshotUri) {
          try {
            const f = new File(t.snapshotUri);
            if (f.exists) f.delete();
          } catch {}
        }
        try {
          const fRoot = new File(Paths.document, `tab_snapshot_${t.id}.jpg`);
          if (fRoot.exists) fRoot.delete();
        } catch {}
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

  return {
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
    executeNewTab,
    handleCloseTab,
    handleRestoreClosedTab,
    handleCloseAllTabs,
    handleCloseOtherTabs,
    scheduleProcessPooling,
    handleFreezeBackgroundTabs,
    handleOpenTabSheet,
    handleSelectTab,
    handleClearTabSnapshots,
  };
}
