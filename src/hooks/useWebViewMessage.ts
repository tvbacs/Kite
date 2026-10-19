import { useState, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Haptics from 'expo-haptics';
import { WebView } from 'react-native-webview';
import { BrowserTab, ShieldStats, UserProfile, DetectedMedia, isPersistable } from '../types/browser';
import { getDomain } from '../utils/tld';
import {
  translateItemsBatch,
} from '../services/translateService';
import {
  getFindInPageSearchScript,
  getFindInPageNextScript,
  getFindInPagePrevScript,
  getFindInPageClearScript,
} from '../services/findInPageScript';
import {
  saveCredentialSecurely,
  getCredentialPassword,
  STORAGE_PASSWORD_SETTINGS_KEY,
  STORAGE_PASSWORDS_KEY,
  SavedCredential,
} from '../components/PasswordManagerSheet';
import { ImageContextData } from '../components/ImageContextMenuSheet';
import {
  PermissionRequestPayload,
} from '../components/PermissionPromptModal';
import {
  getSitePermissions,
  setSitePermission,
  PermissionType,
} from '../services/sitePermissionsStorage';
import { STORAGE_SAVED_ACCOUNTS_KEY, STORAGE_USER_PROFILE_KEY } from './useAuthProfile';
import { syncUserCloudData, syncCloudPasswords } from '../services/supabase';
import { STORAGE_HISTORY_KEY, HistoryItem } from '../components/HistorySheet';

interface UseWebViewMessageProps {
  activeTabId: string;
  currentTab: BrowserTab | undefined;
  tabs: BrowserTab[];
  setTabs: React.Dispatch<React.SetStateAction<BrowserTab[]>>;
  persistTabsState: (tabsList: BrowserTab[], activeId?: string) => void;
  webViewRefs: React.MutableRefObject<{ [tabId: string]: WebView | null }>;
  getActiveWebView: () => WebView | null;
  stats: ShieldStats;
  setStats: React.Dispatch<React.SetStateAction<ShieldStats>>;
  isIncognito: boolean;
  userProfileRef: React.MutableRefObject<UserProfile>;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  setDetectedMediaByTab: React.Dispatch<React.SetStateAction<Record<string, DetectedMedia[]>>>;
  updateWakeLock: (isKeepAwakeActive?: boolean, isVideoPlaying?: boolean) => void;
  handlePullMove: (dy: number, dx: number) => void;
  handlePullEnd: () => void;
  handlePullCancel: () => void;
  canGoBackRef: React.MutableRefObject<boolean>;
  handleGoBackRef: React.MutableRefObject<() => void>;
  showToast: (msg: string) => void;
  onSwitchAccount?: (newProfile: UserProfile, previousProfile: UserProfile) => void;
}

export function useWebViewMessage({
  activeTabId,
  currentTab,
  tabs,
  setTabs,
  persistTabsState,
  webViewRefs,
  getActiveWebView,
  stats,
  setStats,
  isIncognito,
  userProfileRef,
  setUserProfile,
  setDetectedMediaByTab,
  updateWakeLock,
  handlePullMove,
  handlePullEnd,
  handlePullCancel,
  canGoBackRef,
  handleGoBackRef,
  showToast,
  onSwitchAccount,
}: UseWebViewMessageProps) {
  const isVideoPlayingRef = useRef<boolean>(false);

  // Mật khẩu & Quyền
  const [passwordSavePrompt, setPasswordSavePrompt] = useState<{
    visible: boolean;
    website: string;
    username: string;
    passwordSecret: string;
    isUpdate?: boolean;
  } | null>(null);

  const [activeAutofillCredential, setActiveAutofillCredential] = useState<SavedCredential | null>(null);
  const [imageContextMenuData, setImageContextMenuData] = useState<ImageContextData | null>(null);

  const [sitePermissionsSheetVisible, setSitePermissionsSheetVisible] = useState<boolean>(false);
  const [pendingPermissionRequest, setPendingPermissionRequest] = useState<PermissionRequestPayload | null>(null);

  // Tìm trong trang
  const [findInPageVisible, setFindInPageVisible] = useState<boolean>(false);
  const [findInPageStats, setFindInPageStats] = useState<{ total: number; current: number }>({
    total: 0,
    current: 0,
  });

  const pendingShieldStatsRef = useRef<{ popups: number; overlays: number; ads: number }>({
    popups: 0,
    overlays: 0,
    ads: 0,
  });
  const shieldFlushTimerRef = useRef<any>(null);
  const lastRedirectToastTimeRef = useRef<number>(0);

  const scheduleShieldFlush = () => {
    if (shieldFlushTimerRef.current) return;
    shieldFlushTimerRef.current = setTimeout(() => {
      shieldFlushTimerRef.current = null;
      const { popups, overlays, ads } = pendingShieldStatsRef.current;
      if (popups > 0 || overlays > 0 || ads > 0) {
        pendingShieldStatsRef.current = { popups: 0, overlays: 0, ads: 0 };
        setStats((prev) => ({
          ...prev,
          blockedPopups: prev.blockedPopups + popups,
          blockedOverlays: prev.blockedOverlays + overlays,
          blockedAds: prev.blockedAds + ads,
        }));
      }
    }, 1000);
  };

  const handleMessage = (event: any, fromTabId?: string) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'SHIELD_BATCH') {
        const popups = Number(data.popups) || 0;
        const overlays = Number(data.overlays) || 0;
        const redirects = Number(data.redirects) || 0;
        pendingShieldStatsRef.current.popups += popups;
        pendingShieldStatsRef.current.overlays += overlays;
        pendingShieldStatsRef.current.ads += redirects;
        scheduleShieldFlush();

        if (redirects > 0) {
          const now = Date.now();
          if (now - lastRedirectToastTimeRef.current > 3500) {
            lastRedirectToastTimeRef.current = now;
            showToast(`Đã chặn nhảy trang: ${data.lastUrl || 'Quảng cáo'}`);
          }
        }
      } else if (data.type === 'TAB_STATE_CAPTURED') {
        const targetId = data.tabId || fromTabId;
        if (targetId) {
          setTabs((prev) =>
            prev.map((t) =>
              t.id === targetId
                ? {
                    ...t,
                    frozenState: data.state,
                  }
                : t
            )
          );
        }
      } else if (data.type === 'URL_CHANGED') {
        const targetId = data.tabId || fromTabId;
        const newUrl = data.url;
        const newTitle = data.title;
        if (targetId && newUrl && !newUrl.startsWith('about:')) {
          setTabs((prev) => {
            const next = prev.map((t) =>
              t.id === targetId && (t.url !== newUrl || (newTitle && t.title !== newTitle))
                ? {
                    ...t,
                    url: newUrl,
                    initialUrl: newUrl,
                    title: newTitle || t.title,
                  }
                : t
            );
            if (targetId === activeTabId) {
              persistTabsState(next, activeTabId);
            }
            return next;
          });
        }
      } else if (data.type === 'BLOCKED_POPUP') {
        pendingShieldStatsRef.current.popups += 1;
        scheduleShieldFlush();
      } else if (data.type === 'BLOCKED_OVERLAYS') {
        pendingShieldStatsRef.current.overlays += (data.count || 1);
        scheduleShieldFlush();
      } else if (data.type === 'BLOCKED_REDIRECT') {
        pendingShieldStatsRef.current.ads += 1;
        scheduleShieldFlush();
        const now = Date.now();
        if (now - lastRedirectToastTimeRef.current > 3500) {
          lastRedirectToastTimeRef.current = now;
          showToast(`Đã chặn nhảy trang: ${data.url || 'Quảng cáo'}`);
        }
      } else if (data.type === 'MANUAL_ZAP_SUCCESS') {
        showToast(`Đã xóa ${data.count || 0} lớp phủ`);
      } else if (data.type === 'FIND_IN_PAGE_RESULT') {
        setFindInPageStats({
          total: data.total || 0,
          current: data.current || 0,
        });
      } else if (data.type === 'KITE_TRANSLATE_BATCH') {
        const { tabId, batchIndex, items } = data;
        if (Array.isArray(items) && items.length > 0) {
          translateItemsBatch(items, 'vi')
            .then((updates) => {
              const jsonStr = JSON.stringify(updates);
              const script = `
                try {
                  if (typeof window.__kiteApplyBatchTranslation === 'function') {
                    window.__kiteApplyBatchTranslation(${batchIndex}, ${jsonStr});
                  }
                } catch(e) {}
                true;
              `;
              webViewRefs.current[tabId]?.injectJavaScript(script);
            })
            .catch(() => {});
        }
      } else if (data.type === 'KITE_TRANSLATE_DONE') {
        const { tabId, count } = data;
        setTabs((prev) =>
          prev.map((t) => (t.id === tabId ? { ...t, isTranslated: true } : t))
        );
        if (count && count > 0) {
          showToast('Đã dịch toàn bộ trang sang tiếng Việt');
        }
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
        // Đã bỏ logic dò video tải xuống theo yêu cầu
      } else if (data.type === 'KITE_PULL_MOVE') {
        handlePullMove(data.dy, data.dx);
      } else if (data.type === 'KITE_PULL_END') {
        handlePullEnd();
      } else if (data.type === 'KITE_PULL_CANCEL') {
        handlePullCancel();
      } else if (data.type === 'KITE_SWIPE_BACK') {
        if (Platform.OS !== 'ios' && canGoBackRef.current) {
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
          handleGoBackRef.current();
        }
      } else if (data.type === 'GOOGLE_ACCOUNT_CHOSEN' || data.type === 'GOOGLE_LOGIN_COMPLETED') {
        const targetTab = tabs.find((t) => t.id === (data.tabId || fromTabId)) || currentTab;
        if (!isPersistable(targetTab) || isIncognito) return;
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
          AsyncStorage.setItem(STORAGE_USER_PROFILE_KEY, JSON.stringify(chosenProfile));
          AsyncStorage.getItem(STORAGE_SAVED_ACCOUNTS_KEY).then((res) => {
            let list: UserProfile[] = [];
            if (res) { try { list = JSON.parse(res); } catch (e) {} }
            if (!Array.isArray(list)) list = [];
            const idx = list.findIndex((a) => a.email?.toLowerCase() === chosenProfile.email?.toLowerCase());
            if (idx !== -1) { list[idx] = chosenProfile; } else { list.push(chosenProfile); }
            AsyncStorage.setItem(STORAGE_SAVED_ACCOUNTS_KEY, JSON.stringify(list));
          });
          showToast(`Đã chuyển sang: ${chosenProfile.email}`);
        }
      } else if (data.type === 'GOOGLE_USER_PROFILE') {
        const targetTab = tabs.find((t) => t.id === (data.tabId || fromTabId)) || currentTab;
        if (!isPersistable(targetTab) || isIncognito) return;
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

          const currentProfile = userProfileRef.current;
          const wasLoggedIn = Boolean(currentProfile?.isLoggedIn && currentProfile?.email);
          const currentEmail = (currentProfile?.email || '').toLowerCase();
          const newEmail = (profile.email || '').toLowerCase();

          const isNewLogin = !wasLoggedIn;
          const isAccountSwitch = wasLoggedIn && currentEmail !== newEmail;
          const isAccountDataUpdate =
            wasLoggedIn &&
            currentEmail === newEmail &&
            ((!currentProfile?.avatarUrl && profile.avatarUrl) ||
              (!currentProfile?.name && profile.name) ||
              (profile.name && currentProfile?.name !== profile.name));

          if (isAccountSwitch && onSwitchAccount) {
            onSwitchAccount(profile, currentProfile);
          } else if (isNewLogin || isAccountSwitch || isAccountDataUpdate) {
            userProfileRef.current = profile;
            setUserProfile(profile);
            AsyncStorage.setItem(STORAGE_USER_PROFILE_KEY, JSON.stringify(profile));

            AsyncStorage.getItem(STORAGE_SAVED_ACCOUNTS_KEY).then((res) => {
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
              AsyncStorage.setItem(STORAGE_SAVED_ACCOUNTS_KEY, JSON.stringify(list));
            });

            syncUserCloudData(profile).catch(() => {});

            if (isNewLogin) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              showToast(`Đăng nhập Google thành công! (${profile.name || profile.email})`);
            } else if (isAccountSwitch) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              showToast(`Đã chuyển sang: ${profile.name || profile.email}`);
            }
          }
        }
      } else if (data.type === 'DETECTED_LOGIN') {
        const targetTab = tabs.find((t) => t.id === (data.tabId || fromTabId)) || currentTab;
        if (!isPersistable(targetTab) || isIncognito) return;
        if (data.website && data.password && data.username) {
          const rawUser = (data.username || '').trim();
          const rawPwd = (data.password || '').trim();
          const lowerUser = rawUser.toLowerCase();

          // 1. Lọc bỏ: Bắt buộc phải có tài khoản thực sự (độ dài >= 2 ký tự, không chấp nhận rỗng/undefined)
          if (!rawUser || rawUser.length < 2 || lowerUser === 'undefined' || lowerUser === 'null') {
            return;
          }

          // 2. Lọc bỏ: Mật khẩu tối thiểu 4 ký tự; loại bỏ mã số ngắn 4-8 số khi không có email (dạng OTP SMS/2FA)
          if (rawPwd.length < 4) return;
          if (/^\d{4,8}$/.test(rawPwd) && !rawUser.includes('@') && rawUser.length <= 8) {
            return;
          }

          const curUrl = currentTab?.url || '';
          const currentDomain = getDomain(curUrl) || '';
          const reportedSite = (data.website || '').toLowerCase().trim();

          const isMatchingDomain =
            !currentDomain ||
            !reportedSite ||
            reportedSite.includes(currentDomain) ||
            currentDomain.includes(reportedSite) ||
            reportedSite.endsWith('.' + currentDomain);

          if (isMatchingDomain) {
            // Kiểm tra cài đặt autoPromptSave từ người dùng
            AsyncStorage.getItem(STORAGE_PASSWORD_SETTINGS_KEY).then((res) => {
              if (res) {
                try {
                  const settings = JSON.parse(res);
                  if (settings.autoPromptSave === false) return;
                } catch (e) {}
              }

              const targetDomain = currentDomain || data.website;
              AsyncStorage.getItem(STORAGE_PASSWORDS_KEY).then((passRes) => {
                let isUpdate = false;
                if (passRes) {
                  try {
                    const list: SavedCredential[] = JSON.parse(passRes);
                    if (Array.isArray(list)) {
                      isUpdate = list.some((c) => {
                        const sameWeb =
                          c.website.toLowerCase() === targetDomain.toLowerCase() ||
                          targetDomain.toLowerCase().includes(c.website.toLowerCase()) ||
                          c.website.toLowerCase().includes(targetDomain.toLowerCase());
                        const sameUser = c.username.toLowerCase() === rawUser.toLowerCase();
                        return sameWeb && sameUser;
                      });
                    }
                  } catch (e) {}
                }

                setPasswordSavePrompt({
                  visible: true,
                  website: targetDomain,
                  username: rawUser,
                  passwordSecret: rawPwd,
                  isUpdate: isUpdate || Boolean(data.isNewPass),
                });
              });
            });
          }
        }
      } else if (data.type === 'PASSWORD_FORM_FOCUSED') {
        const targetTab = tabs.find((t) => t.id === (data.tabId || fromTabId)) || currentTab;
        if (!isPersistable(targetTab) || isIncognito) return;
        const curUrl = currentTab?.url || '';
        const currentDomain = (getDomain(curUrl) || data.website || '').toLowerCase().trim();
        if (!currentDomain) return;

        AsyncStorage.getItem(STORAGE_PASSWORD_SETTINGS_KEY).then((settingsRes) => {
          let autoFillEnabled = true;
          if (settingsRes) {
            try {
              const settings = JSON.parse(settingsRes);
              if (settings.autoFill === false) autoFillEnabled = false;
            } catch (e) {}
          }
          if (!autoFillEnabled) return;

          AsyncStorage.getItem(STORAGE_PASSWORDS_KEY).then((passRes) => {
            if (!passRes) return;
            try {
              const list: SavedCredential[] = JSON.parse(passRes);
              if (!Array.isArray(list) || list.length === 0) return;

              const matching = list.filter((c) => {
                const credWeb = (c.website || '').toLowerCase().trim();
                return (
                  credWeb === currentDomain ||
                  credWeb.includes(currentDomain) ||
                  currentDomain.includes(credWeb) ||
                  credWeb.endsWith('.' + currentDomain) ||
                  currentDomain.endsWith('.' + credWeb)
                );
              });

              if (matching.length > 0) {
                matching.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
                setActiveAutofillCredential(matching[0]);
              }
            } catch (e) {}
          });
        });
      } else if (data.type === 'IMAGE_LONG_PRESS') {
        if (data.src) {
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (e) {}
          setImageContextMenuData({
            src: data.src,
            alt: data.alt || '',
            width: Number(data.width) || 0,
            height: Number(data.height) || 0,
          });
        }
      } else if (data.type === 'KITE_SITE_PERMISSION_REQUEST') {
        const { permissionType, domain, requestId } = data;
        getSitePermissions(domain).then((perms) => {
          const mappedKey: PermissionType =
            permissionType === 'camera_and_mic' ? 'camera' : (permissionType as PermissionType);
          const currentStatus = perms[mappedKey] || 'ask';

          if (currentStatus === 'allow') {
            webViewRefs.current[activeTabId]?.injectJavaScript(
              `window.__kite_resolve_permission('${requestId}', true); true;`
            );
          } else if (currentStatus === 'block') {
            webViewRefs.current[activeTabId]?.injectJavaScript(
              `window.__kite_resolve_permission('${requestId}', false); true;`
            );
          } else {
            setPendingPermissionRequest({
              permissionType,
              domain,
              requestId,
            });
          }
        });
      } else if (data.type === 'REQUEST_VISITED_URLS') {
        const activeEmail = userProfileRef.current?.isLoggedIn ? userProfileRef.current.email : undefined;
        const keys = [STORAGE_HISTORY_KEY];
        if (activeEmail) {
          keys.unshift(`${STORAGE_HISTORY_KEY}_${activeEmail.toLowerCase()}`);
        }
        AsyncStorage.multiGet(keys).then((stores) => {
          const urlSet = new Set<string>();
          stores.forEach(([_, val]) => {
            if (val) {
              try {
                const arr = JSON.parse(val);
                if (Array.isArray(arr)) {
                  arr.slice(0, 500).forEach((item: HistoryItem) => {
                    if (item && item.url) urlSet.add(item.url);
                  });
                }
              } catch (e) {}
            }
          });
          const urls = Array.from(urlSet);
          if (urls.length > 0) {
            const targetWV = webViewRefs.current[activeTabId] || getActiveWebView();
            if (targetWV) {
              const injectCode = `
                try {
                  if (typeof window.__kiteHighlightVisitedUrls === 'function') {
                    window.__kiteHighlightVisitedUrls(${JSON.stringify(urls)});
                  }
                } catch(e) {}
                true;
              `;
              targetWV.injectJavaScript(injectCode);
            }
          }
        }).catch(() => {});
      }
    } catch (e) {}
  };

  const handleMessageRef = useRef(handleMessage);
  handleMessageRef.current = handleMessage;

  // Cấp quyền trang web
  const handleAllowSitePermission = async () => {
    if (!pendingPermissionRequest) return;
    const { domain, permissionType, requestId } = pendingPermissionRequest;
    if (permissionType === 'camera_and_mic') {
      await setSitePermission(domain, 'camera', 'allow');
      await setSitePermission(domain, 'microphone', 'allow');
    } else {
      await setSitePermission(domain, permissionType as PermissionType, 'allow');
    }
    webViewRefs.current[activeTabId]?.injectJavaScript(
      `window.__kite_resolve_permission('${requestId}', true); true;`
    );
    setPendingPermissionRequest(null);
    showToast(`Đã cấp quyền cho ${domain}`);
  };

  // Chặn quyền trang web
  const handleBlockSitePermission = async () => {
    if (!pendingPermissionRequest) return;
    const { domain, permissionType, requestId } = pendingPermissionRequest;
    if (permissionType === 'camera_and_mic') {
      await setSitePermission(domain, 'camera', 'block');
      await setSitePermission(domain, 'microphone', 'block');
    } else {
      await setSitePermission(domain, permissionType as PermissionType, 'block');
    }
    webViewRefs.current[activeTabId]?.injectJavaScript(
      `window.__kite_resolve_permission('${requestId}', false); true;`
    );
    setPendingPermissionRequest(null);
    showToast(`Đã chặn quyền đối với ${domain}`);
  };

  const handleDismissSitePermission = () => {
    if (!pendingPermissionRequest) return;
    const { requestId } = pendingPermissionRequest;
    webViewRefs.current[activeTabId]?.injectJavaScript(
      `window.__kite_resolve_permission('${requestId}', false); true;`
    );
    setPendingPermissionRequest(null);
  };

  // Xác nhận lưu mật khẩu
  const handleConfirmSavePassword = async () => {
    if (!passwordSavePrompt) return;
    const { website, username, passwordSecret } = passwordSavePrompt;
    const saved = await saveCredentialSecurely(website, username, passwordSecret);
    if (saved && userProfileRef.current?.isLoggedIn) {
      const email = userProfileRef.current.email;
      const userId = userProfileRef.current.id || email;
      if (userId) {
        syncCloudPasswords(userId, [saved], email).catch(() => {});
      }
    }
    setPasswordSavePrompt(null);
    showToast(`Đã lưu tài khoản ${website} vào Keychain`);
  };

  // Tự động điền mật khẩu với Face ID / Biometrics
  const handlePerformAutofill = async (credential: SavedCredential) => {
    try {
      let requireBiometrics = true;
      const settingsRes = await AsyncStorage.getItem(STORAGE_PASSWORD_SETTINGS_KEY);
      if (settingsRes) {
        try {
          const settings = JSON.parse(settingsRes);
          if (settings.requireBiometrics === false) {
            requireBiometrics = false;
          }
        } catch (e) {}
      }

      const pass = await getCredentialPassword(credential.id, requireBiometrics);
      if (!pass) return;

      const activeWV = getActiveWebView();
      if (activeWV) {
        const fillScript = `
          try {
            if (typeof window.__kite_fill_credential === 'function') {
              window.__kite_fill_credential(${JSON.stringify(credential.username)}, ${JSON.stringify(pass)});
            }
          } catch(e) {}
          true;
        `;
        activeWV.injectJavaScript(fillScript);
        setActiveAutofillCredential(null);
        showToast(`Đã tự điền tài khoản: ${credential.username}`);
      }
    } catch (e) {
      showToast('Không thể tự điền mật khẩu');
    }
  };

  const handleDismissAutofill = () => {
    setActiveAutofillCredential(null);
  };

  // Tìm trong trang
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

  return {
    handleMessage,
    handleMessageRef,
    isVideoPlayingRef,
    passwordSavePrompt,
    setPasswordSavePrompt,
    handleConfirmSavePassword,
    activeAutofillCredential,
    setActiveAutofillCredential,
    handlePerformAutofill,
    handleDismissAutofill,
    imageContextMenuData,
    setImageContextMenuData,
    sitePermissionsSheetVisible,
    setSitePermissionsSheetVisible,
    pendingPermissionRequest,
    handleAllowSitePermission,
    handleBlockSitePermission,
    handleDismissSitePermission,
    findInPageVisible,
    setFindInPageVisible,
    findInPageStats,
    setFindInPageStats,
    handleFindInPageSearch,
    handleFindInPageNext,
    handleFindInPagePrev,
    handleFindInPageClose,
  };
}
