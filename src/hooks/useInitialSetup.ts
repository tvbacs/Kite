import { useState, useRef, useEffect } from 'react';
import { Appearance, Animated, Platform, Linking } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import { BrowserTab, UserProfile, ShieldStats } from '../types/browser';
import { SEARCH_ENGINES } from '../constants/searchEngines';
import { supabase, upsertCloudProfile, handleAuthCallbackUrl } from '../services/supabase';
import {
  RegionSettings,
  loadRegionSettings,
} from '../services/regionService';
import {
  ExtensionItem,
  DEFAULT_EXTENSIONS,
} from '../components/ExtensionSheet';
import {
  STORAGE_SAVED_ACCOUNTS_KEY,
  STORAGE_USER_PROFILE_KEY,
  STORAGE_SYNC_ACCOUNTS_KEY,
  isOAuthCallback,
} from './useAuthProfile';
import {
  STORAGE_DATA_SAVER_KEY,
  STORAGE_KEEP_AWAKE_KEY,
  STORAGE_SHIELD_ACTIVE_KEY,
  STORAGE_SHIELD_AGGRESSIVE_KEY,
  STORAGE_EXTENSIONS_KEY,
} from './useShieldAndExtensions';
import {
  STORAGE_PERSISTED_TABS_KEY,
  STORAGE_ACTIVE_TAB_ID_KEY,
  STORAGE_PERSISTED_INCOGNITO_TABS_KEY,
} from './useBrowserTabs';

export const STORAGE_ENGINE_KEY = '@kite_search_engine';

interface UseInitialSetupProps {
  userProfileRef: React.MutableRefObject<UserProfile>;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  syncAllAccountsRef: React.MutableRefObject<boolean>;
  setSyncAllAccounts: React.Dispatch<React.SetStateAction<boolean>>;
  setTabs: React.Dispatch<React.SetStateAction<BrowserTab[]>>;
  setActiveTabId: React.Dispatch<React.SetStateAction<string>>;
  setInputUrl: React.Dispatch<React.SetStateAction<string>>;
  setIsIncognito: React.Dispatch<React.SetStateAction<boolean>>;
  setIsIncognitoUnlocked: React.Dispatch<React.SetStateAction<boolean>>;
  setStats: React.Dispatch<React.SetStateAction<ShieldStats>>;
  setCurrentEngineId: React.Dispatch<React.SetStateAction<'google' | 'bing' | 'duckduckgo' | 'yahoo'>>;
  setExtensions: React.Dispatch<React.SetStateAction<ExtensionItem[]>>;
  setRegionSettings: React.Dispatch<React.SetStateAction<RegionSettings>>;
  updateWakeLock: (isKeepAwakeActive?: boolean, isVideoPlaying?: boolean) => void;
  isVideoPlayingRef: React.MutableRefObject<boolean>;
  isRestoredRef: React.MutableRefObject<boolean>;
  processedOAuthUrlsRef: React.MutableRefObject<Set<string>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  clearTabSnapshot: (id: string) => void;
  persistTabsState: (tabsList: BrowserTab[], activeId?: string) => void;
  handleNavigateRef: React.MutableRefObject<(url: string) => void>;
  showToast: (msg: string) => void;
  activeTabId: string;
}

export function useInitialSetup({
  userProfileRef,
  setUserProfile,
  syncAllAccountsRef,
  setSyncAllAccounts,
  setTabs,
  setActiveTabId,
  setInputUrl,
  setIsIncognito,
  setIsIncognitoUnlocked,
  setStats,
  setCurrentEngineId,
  setExtensions,
  setRegionSettings,
  updateWakeLock,
  isVideoPlayingRef,
  isRestoredRef,
  processedOAuthUrlsRef,
  setIsLoading,
  clearTabSnapshot,
  persistTabsState,
  handleNavigateRef,
  showToast,
  activeTabId,
}: UseInitialSetupProps) {
  const [isAppReady, setIsAppReady] = useState<boolean>(false);
  const [showSplashOverlay, setShowSplashOverlay] = useState<boolean>(true);
  const splashFadeAnim = useRef(new Animated.Value(1)).current;
  const splashScaleAnim = useRef(new Animated.Value(0.92)).current;
  const splashGlowAnim = useRef(new Animated.Value(0.75)).current;

  // Splash Screen Animations
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

  // Khởi động toàn bộ cấu hình app
  useEffect(() => {
    try {
      Appearance.setColorScheme?.('light');
    } catch (e) {}

    const splashStartTime = Date.now();
    const splashFallback = setTimeout(() => {
      setIsAppReady(true);
    }, 2500);

    AsyncStorage.getItem(STORAGE_ENGINE_KEY).then((eng) => {
      if (eng && SEARCH_ENGINES[eng]) {
        setCurrentEngineId(eng as any);
      }
    });

    AsyncStorage.getItem(STORAGE_EXTENSIONS_KEY).then((res) => {
      if (res) {
        try {
          const parsed = JSON.parse(res);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const merged = DEFAULT_EXTENSIONS.map((builtin) => {
              const found = parsed.find((p: any) => p.id === builtin.id);
              return found ? { ...builtin, enabled: found.enabled } : builtin;
            });
            const custom = parsed.filter(
              (p: any) => !DEFAULT_EXTENSIONS.some((b) => b.id === p.id)
            );
            const finalExts = [...merged, ...custom];
            setExtensions(finalExts);
            AsyncStorage.setItem(STORAGE_EXTENSIONS_KEY, JSON.stringify(finalExts));
            return;
          }
        } catch (e) {}
      }
    });

    loadRegionSettings().then((saved) => {
      if (saved) {
        setRegionSettings(saved);
      }
    });

    Promise.all([
      AsyncStorage.getItem(STORAGE_SYNC_ACCOUNTS_KEY),
      AsyncStorage.getItem(STORAGE_USER_PROFILE_KEY),
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

      const tabsKey =
        !isSync && currentEmail
          ? `@kite_persisted_tabs_state_${currentEmail.toLowerCase()}`
          : STORAGE_PERSISTED_TABS_KEY;
      const activeIdKey =
        !isSync && currentEmail
          ? `@kite_active_tab_id_${currentEmail.toLowerCase()}`
          : STORAGE_ACTIVE_TAB_ID_KEY;

      let [tabsData, savedActiveId, incognitoData] = await Promise.all([
        AsyncStorage.getItem(tabsKey),
        AsyncStorage.getItem(activeIdKey),
        AsyncStorage.getItem(STORAGE_PERSISTED_INCOGNITO_TABS_KEY),
      ]);

      if (!tabsData && tabsKey !== STORAGE_PERSISTED_TABS_KEY) {
        tabsData = await AsyncStorage.getItem(STORAGE_PERSISTED_TABS_KEY);
        savedActiveId = await AsyncStorage.getItem(STORAGE_ACTIVE_TAB_ID_KEY);
      }

      let parsedSavedTabs: BrowserTab[] = [];
      if (tabsData) {
        try {
          const parsed = JSON.parse(tabsData);
          if (Array.isArray(parsed)) parsedSavedTabs = parsed;
        } catch (e) {}
      }

      let parsedIncognitoTabs: BrowserTab[] = [];
      if (incognitoData) {
        try {
          const parsed = JSON.parse(incognitoData);
          if (Array.isArray(parsed)) {
            parsedIncognitoTabs = parsed.map((t) => ({
              ...t,
              isIncognito: true,
              isSleeping: false, // Tab ẩn danh giữ nguyên trạng thái sẵn sàng
            }));
          }
        } catch (e) {}
      }

      const allTabs = [...parsedSavedTabs, ...parsedIncognitoTabs];

      if (allTabs.length > 0) {
        try {
          let targetTab = savedActiveId ? allTabs.find((t) => t.id === savedActiveId) : null;
          if (!targetTab) {
            const sortedByRecent = [...allTabs].sort(
              (a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0)
            );
            targetTab = sortedByRecent[0] || allTabs[allTabs.length - 1];
          }

          const targetId = targetTab.id;
          const initializedTabs = allTabs.map((t, idx) => {
            // Đảm bảo thumbnail luôn tồn tại từ Paths.document nếu có file snapshot
            let effectiveSnapshotUri = t.snapshotUri;
            try {
              const snapFile = new File(Paths.document, `tab_snapshot_${t.id}.jpg`);
              if (snapFile.exists) {
                effectiveSnapshotUri = snapFile.uri;
              }
            } catch (e) {}

            return {
              ...t,
              snapshotUri: effectiveSnapshotUri,
              initialUrl: t.initialUrl || t.url,
              // Tối ưu chuẩn Google Chrome: Khi mở app, chỉ nạp tab đang xem (targetId).
              // Các tab nền giữ nguyên ảnh snapshot để vào màn hình tab là thấy ngay tức thì 0ms,
              // không khởi động nạp mạng đồng loạt làm đơ máy và xoay vòng loading.
              isSleeping: !t.isIncognito && t.id !== targetId,
              isLoading: false,
            };
          });

          setTabs(initializedTabs);
          setActiveTabId(targetId);
          setInputUrl(targetTab.url || '');
          setIsIncognito(!!targetTab.isIncognito);
          if (targetTab.isIncognito) {
            setIsIncognitoUnlocked(false);
          }
          if (targetTab.isReaderMode) {
            setStats((prev) => ({ ...prev, isReaderMode: true }));
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

        if (profile.email) {
          const res = await AsyncStorage.getItem(STORAGE_SAVED_ACCOUNTS_KEY);
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
          await AsyncStorage.setItem(STORAGE_SAVED_ACCOUNTS_KEY, JSON.stringify(list));
        }

        await upsertCloudProfile(u.id, profile);

        let savedActiveEmail = userProfileRef.current?.email?.toLowerCase();
        if (!savedActiveEmail) {
          try {
            const rawSaved = await AsyncStorage.getItem(STORAGE_USER_PROFILE_KEY);
            if (rawSaved) {
              const parsed = JSON.parse(rawSaved);
              if (parsed?.email) {
                savedActiveEmail = parsed.email.toLowerCase();
              }
            }
          } catch (e) {}
        }

        const incomingEmail = profile.email?.toLowerCase();
        if (!savedActiveEmail || savedActiveEmail === incomingEmail) {
          setUserProfile(profile);
          userProfileRef.current = profile;
          await AsyncStorage.setItem(STORAGE_USER_PROFILE_KEY, JSON.stringify(profile));
        }
      }
    });

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

    AsyncStorage.getItem(STORAGE_DATA_SAVER_KEY).then((savedMode) => {
      if (savedMode === 'block_images' || savedMode === 'compress_images') {
        setStats((prev) => ({
          ...prev,
          isDataSaverActive: true,
          dataSaverMode: savedMode,
        }));
      }
    });

    AsyncStorage.getItem(STORAGE_KEEP_AWAKE_KEY).then((res) => {
      if (res !== null) {
        try {
          const val = JSON.parse(res);
          setStats((prev) => ({ ...prev, isKeepAwakeActive: !!val }));
          updateWakeLock(!!val, isVideoPlayingRef.current);
        } catch (e) {}
      }
    });

    AsyncStorage.getItem(STORAGE_SHIELD_ACTIVE_KEY).then((res) => {
      if (res !== null) {
        try {
          const val = JSON.parse(res);
          setStats((prev) => ({ ...prev, isShieldActive: !!val }));
        } catch (e) {}
      }
    });

    AsyncStorage.getItem(STORAGE_SHIELD_AGGRESSIVE_KEY).then((res) => {
      if (res !== null) {
        try {
          const val = JSON.parse(res);
          setStats((prev) => ({ ...prev, aggressiveMode: !!val }));
        } catch (e) {}
      }
    });

    // Tiếp nhận liên kết chia sẻ từ bên ngoài
    const handleIncomingUrl = (url: string | null) => {
      if (!url) return;
      try {
        const raw = url.trim();
        if (isOAuthCallback(raw)) {
          if (processedOAuthUrlsRef.current.has(raw)) {
            return;
          }
          processedOAuthUrlsRef.current.add(raw);

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
              userProfileRef.current = profile;
              AsyncStorage.setItem(STORAGE_USER_PROFILE_KEY, JSON.stringify(profile));
              upsertCloudProfile(profile.email || 'user', profile);
              if (profile.email) {
                AsyncStorage.getItem(STORAGE_SAVED_ACCOUNTS_KEY).then((res) => {
                  let list: UserProfile[] = [];
                  if (res) { try { list = JSON.parse(res); } catch (e) {} }
                  if (!Array.isArray(list)) list = [];
                  const idx = list.findIndex((a) => a.email?.toLowerCase() === profile.email?.toLowerCase());
                  if (idx !== -1) { list[idx] = profile; } else { list.push(profile); }
                  AsyncStorage.setItem(STORAGE_SAVED_ACCOUNTS_KEY, JSON.stringify(list));
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
      authSub?.subscription?.unsubscribe();
    };
  }, []);

  return {
    isAppReady,
    showSplashOverlay,
    splashFadeAnim,
    splashScaleAnim,
    splashGlowAnim,
  };
}
