import { useState, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Haptics from 'expo-haptics';
import { WebView } from 'react-native-webview';
import { BrowserTab, ShieldStats, UserProfile, DetectedMedia } from '../types/browser';
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
  STORAGE_PASSWORD_SETTINGS_KEY,
} from '../components/PasswordManagerSheet';
import {
  PermissionRequestPayload,
} from '../components/PermissionPromptModal';
import {
  getSitePermissions,
  setSitePermission,
  PermissionType,
} from '../services/sitePermissionsStorage';
import { STORAGE_SAVED_ACCOUNTS_KEY, STORAGE_USER_PROFILE_KEY } from './useAuthProfile';

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
}: UseWebViewMessageProps) {
  const isVideoPlayingRef = useRef<boolean>(false);

  // Mật khẩu & Quyền
  const [passwordSavePrompt, setPasswordSavePrompt] = useState<{
    visible: boolean;
    website: string;
    username: string;
    passwordSecret: string;
  } | null>(null);

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
            AsyncStorage.setItem(STORAGE_USER_PROFILE_KEY, JSON.stringify(profile));
            AsyncStorage.getItem(STORAGE_SAVED_ACCOUNTS_KEY).then((res) => {
              let list: UserProfile[] = [];
              if (res) { try { list = JSON.parse(res); } catch (e) {} }
              if (!Array.isArray(list)) list = [];
              const existingIdx = list.findIndex(
                (a) => a.email && profile.email && a.email.toLowerCase() === profile.email.toLowerCase()
              );
              if (existingIdx !== -1) { list[existingIdx] = profile; } else { list.push(profile); }
              AsyncStorage.setItem(STORAGE_SAVED_ACCOUNTS_KEY, JSON.stringify(list));
            });
            return;
          }

          setUserProfile((prev) => {
            if (!prev || !prev.isLoggedIn || !prev.email) {
              return prev || { isLoggedIn: false, name: '', email: '', avatarUrl: '' };
            }
            const isDifferentEmail = Boolean(
              prev?.email &&
              profile.email &&
              prev.email.toLowerCase() !== profile.email.toLowerCase()
            );
            if (
              isDifferentEmail ||
              (!prev.avatarUrl && profile.avatarUrl) ||
              (!prev.name && profile.name)
            ) {
              AsyncStorage.setItem(STORAGE_USER_PROFILE_KEY, JSON.stringify(profile));
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
        if (data.website && data.password && data.username) {
          const rawUser = (data.username || '').trim();
          const rawPwd = (data.password || '').trim();
          const lowerUser = rawUser.toLowerCase();

          // 1. Lọc bỏ: Bắt buộc phải có tài khoản thực sự (không chấp nhận rỗng hay fallback "Tài khoản")
          if (
            !rawUser ||
            rawUser.length < 3 ||
            lowerUser === 'tài khoản' ||
            lowerUser === 'tai khoan' ||
            lowerUser === 'admin' ||
            lowerUser === 'user' ||
            lowerUser === 'undefined'
          ) {
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
              setPasswordSavePrompt({
                visible: true,
                website: currentDomain || data.website,
                username: rawUser,
                passwordSecret: rawPwd,
              });
            });
          }
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
    await saveCredentialSecurely(website, username, passwordSecret);
    setPasswordSavePrompt(null);
    showToast(`Đã lưu tài khoản ${website} vào Keychain`);
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
