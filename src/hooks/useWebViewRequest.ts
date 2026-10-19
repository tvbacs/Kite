import { useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { WebViewNavigation } from 'react-native-webview';
import { BrowserTab, ShieldStats, UserProfile } from '../types/browser';
import {
  BLOCKED_DOMAINS,
  BLOCKED_GAMBLING_KEYWORDS,
  COMMERCE_REDIRECT_DOMAINS,
  BLOCKED_SCHEMES,
  isSuspiciousAdUrl,
  isLegitimateAuthUrl,
} from '../constants/blocklist';
import { getDomain, getHostname, getDomainWithoutSuffix } from '../utils/tld';
import {
  isGoogleTranslateUrl,
  getOriginalUrlFromTranslateUrl,
} from '../services/translateService';
import { isOAuthCallback, STORAGE_SAVED_ACCOUNTS_KEY, STORAGE_USER_PROFILE_KEY } from './useAuthProfile';
import { handleAuthCallbackUrl, upsertCloudProfile, syncUserCloudData } from '../services/supabase';
import { isJunkHistoryItem } from '../constants/searchEngines';
import { isDownloadableUrl } from './useDownloads';

interface UseWebViewRequestProps {
  activeTabId: string;
  activeUrl: string | null;
  tabs: BrowserTab[];
  setTabs: React.Dispatch<React.SetStateAction<BrowserTab[]>>;
  persistTabsState: (tabsList: BrowserTab[], activeId?: string) => void;
  clearTabSnapshot: (tabId: string) => void;
  setInputUrl: (url: string) => void;
  setIsLoading: (val: boolean) => void;
  userInitiatedRef: React.MutableRefObject<boolean>;
  processedOAuthUrlsRef: React.MutableRefObject<Set<string>>;
  userProfileRef: React.MutableRefObject<UserProfile>;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  stats: ShieldStats;
  setStats: React.Dispatch<React.SetStateAction<ShieldStats>>;
  handleFileDownload?: (event: any) => void;
  handleStartDirectDownload?: (url: string) => void;
  saveToHistory: (url: string, title: string, tabId?: string) => void;
  setCanGoBack: (val: boolean) => void;
  setCanGoForward: (val: boolean) => void;
  isEditing: boolean;
  setDetectedMediaByTab?: React.Dispatch<React.SetStateAction<Record<string, any[]>>>;
  showToast: (msg: string) => void;
}

const BLOCKED_DOMAINS_SET = new Set(BLOCKED_DOMAINS.map((d) => d.toLowerCase()));
const COMMERCE_REDIRECT_SET = new Set(COMMERCE_REDIRECT_DOMAINS.map((c) => c.toLowerCase()));
const SEARCH_ENGINE_HOSTS = ['google.com', 'google.com.vn', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'baidu.com'];
const SEARCH_ENGINE_HOSTS_SET = new Set(SEARCH_ENGINE_HOSTS);

export function useWebViewRequest({
  activeTabId,
  activeUrl,
  tabs,
  setTabs,
  persistTabsState,
  clearTabSnapshot,
  setInputUrl,
  setIsLoading,
  userInitiatedRef,
  processedOAuthUrlsRef,
  userProfileRef,
  setUserProfile,
  stats,
  setStats,
  handleFileDownload,
  handleStartDirectDownload,
  saveToHistory,
  setCanGoBack,
  setCanGoForward,
  isEditing,
  setDetectedMediaByTab,
  showToast,
}: UseWebViewRequestProps) {
  // Bộ lọc chặn request mạng trước khi tải (chặn đổi URL cướp tab và mạng quảng cáo)
  // Tối ưu hóa O(1) bằng Set và fast-path để không làm đơ Main UI Thread trên Android!
  const blockedCountRef = useRef(0);
  const persistTabsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleShouldStartLoad = (request: { url: string; isTopFrame?: boolean }) => {
    // Fast-path 0: User-initiated navigation (gõ URL hoặc bấm link trực tiếp) -> Cho qua tức thì 0ms!
    if (userInitiatedRef.current) {
      userInitiatedRef.current = false;
      return true;
    }

    const reqUrl = request.url.toLowerCase();

    // Fast-path 1: Sub-resource hoặc iframe không phải main frame: cho qua ngay lập tức 0ms
    if (request.isTopFrame === false) {
      return true;
    }

    // 0. Bắt link tải file trực tiếp hoặc API proxy tải video (như VidSnap, TikTok/Douyin downloader...)
    // Ngăn chặn WKWebView điều hướng làm vỡ giao diện / hiện player hỏng, kích hoạt thanh đề xuất tải xuống (3 trạng thái: Lưu..., Tiến trình, Mở trong...)!
    if (isDownloadableUrl(request.url)) {
      if (handleFileDownload) {
        handleFileDownload({ nativeEvent: { downloadUrl: request.url } });
      }
      return false;
    }

    // 0a. Tự động bypass lỗi 400 SetSID cross-domain của Google & YouTube trên WebKit iOS
    if (reqUrl.includes('/setsid') || reqUrl.includes('/accounts/setsid')) {
      try {
        const parsed = new URL(request.url);
        let continueUrl = parsed.searchParams.get('continue');
        if (continueUrl) {
          try {
            while (continueUrl && (continueUrl.includes('%3A') || continueUrl.includes('%2F'))) {
              const decoded = decodeURIComponent(continueUrl);
              if (decoded === continueUrl) break;
              continueUrl = decoded;
            }
          } catch (eDec) {}

          if (
            continueUrl.startsWith('http://') ||
            continueUrl.startsWith('https://') ||
            continueUrl.startsWith('kite://')
          ) {
            setTimeout(() => {
              setTabs((prev) => {
                const updated = prev.map((t) =>
                  t.id === activeTabId ? { ...t, url: continueUrl! } : t
                );
                persistTabsState(updated);
                return updated;
              });
              setInputUrl(continueUrl!);
            }, 0);
            return false;
          }
        }
      } catch (e) {}
    }

    // Fast-path 2: Search engines (Google, Bing, DuckDuckGo, Yahoo) luôn cho qua 0ms
    if (
      reqUrl.includes('google.') ||
      reqUrl.includes('bing.com') ||
      reqUrl.includes('duckduckgo.com') ||
      reqUrl.includes('yahoo.com')
    ) {
      return true;
    }

    // Fast-path 3: Cùng host hoặc domain với trang web đang xem -> Cho qua ngay lập tức 0ms
    const reqHost = getHostname(reqUrl) || '';
    const curHost = getHostname(activeUrl || '') || '';
    if (curHost && (reqHost === curHost || reqHost.endsWith('.' + curHost) || curHost.endsWith('.' + reqHost))) {
      return true;
    }

    if (reqUrl.startsWith('about:blank') || reqUrl.startsWith('data:')) {
      return true;
    }

    // 0. Cho phép toàn bộ các trang OAuth, SSO, Authentication và cổng thanh toán chính thức (Google, YouTube, Apple, Facebook, Microsoft, Zalo, MoMo, VNPay...)
    if (
      isLegitimateAuthUrl(request.url) ||
      reqUrl.includes('accounts.google.') ||
      reqUrl.includes('accounts.youtube.com') ||
      reqUrl.includes('myaccount.google.com') ||
      reqUrl.includes('oauth2.googleapis.com') ||
      reqUrl.includes('supabase.co/auth/v1/callback') ||
      reqUrl.includes('supabase.co/auth/v1/authorize')
    ) {
      // 1. Nếu là Callback xác thực trả về App
      if (isOAuthCallback(request.url)) {
      if (processedOAuthUrlsRef.current.has(request.url)) {
        return false;
      }
      processedOAuthUrlsRef.current.add(request.url);

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

      setTimeout(() => {
        handleAuthCallbackUrl(request.url).then((profile) => {
          setIsLoading(false);
          if (profile) {
            setUserProfile(profile);
            userProfileRef.current = profile;
            AsyncStorage.setItem(STORAGE_USER_PROFILE_KEY, JSON.stringify(profile));
            syncUserCloudData(profile).catch(() => {});
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
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            showToast(`Đăng nhập Google thành công! (${profile.name || profile.email})`);
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
      }, 0);
      return false;
    }
    return true;
  }

    for (const scheme of BLOCKED_SCHEMES) {
      if (reqUrl.startsWith(scheme)) {
        blockedCountRef.current += 1;
        return false;
      }
    }

    // Fast-path 4: Cho công cụ tìm kiếm: Cho qua tức thì không duyệt danh sách
    if (SEARCH_ENGINE_HOSTS_SET.has(reqHost) || SEARCH_ENGINE_HOSTS.some((se) => reqHost.endsWith('.' + se))) {
      return true;
    }

    if (stats.isShieldActive) {
      const host = reqHost;
      if (BLOCKED_DOMAINS_SET.has(host)) {
        blockedCountRef.current += 1;
        return false;
      }
      for (let i = 0; i < BLOCKED_DOMAINS.length; i++) {
        const d = BLOCKED_DOMAINS[i];
        if (host === d || host.endsWith('.' + d) || host.includes('.' + d)) {
          blockedCountRef.current += 1;
          return false;
        }
      }

      for (let j = 0; j < BLOCKED_GAMBLING_KEYWORDS.length; j++) {
        const kw = BLOCKED_GAMBLING_KEYWORDS[j];
        if (host.includes(kw)) {
          blockedCountRef.current += 1;
          return false;
        }
      }

      // Kiểm tra toàn diện bằng isSuspiciousAdUrl
      if (isSuspiciousAdUrl(request.url, curHost)) {
        blockedCountRef.current += 1;
        showToast('Đã chặn quảng cáo nhảy trang');
        return false;
      }

      const currentDomain = getDomain(activeUrl || '') || '';
      const targetDomain = getDomain(request.url) || '';

      if (currentDomain && targetDomain && currentDomain !== targetDomain) {
        // Chặn các trang thương mại điện tử cướp tab chuyển hướng
        if (COMMERCE_REDIRECT_SET.has(targetDomain)) {
          blockedCountRef.current += 1;
          showToast('Đã chặn chuyển hướng mua sắm');
          return false;
        }
        for (let k = 0; k < COMMERCE_REDIRECT_DOMAINS.length; k++) {
          const c = COMMERCE_REDIRECT_DOMAINS[k];
          if (targetDomain === c || targetDomain.endsWith('.' + c)) {
            blockedCountRef.current += 1;
            showToast('Đã chặn chuyển hướng mua sắm');
            return false;
          }
        }
      }
    }

    return true;
  };

  // Flush blocked count vào stats một lần duy nhất, không block loading
  const flushBlockedCount = () => {
    if (blockedCountRef.current > 0) {
      const count = blockedCountRef.current;
      blockedCountRef.current = 0;
      setStats((prev) => ({ ...prev, blockedAds: prev.blockedAds + count }));
    }
  };

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  const canGoBackRef = useRef<Record<string, boolean>>({});
  const canGoForwardRef = useRef<Record<string, boolean>>({});
  const pendingNavRef = useRef<Record<string, WebViewNavigation>>({});
  const navDebounceTimerRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});

  // Luôn đồng bộ canGoBack/canGoForward ngay khi chuyển đổi tab
  useEffect(() => {
    setCanGoBack(canGoBackRef.current[activeTabId] ?? false);
    setCanGoForward(canGoForwardRef.current[activeTabId] ?? false);
  }, [activeTabId, setCanGoBack, setCanGoForward]);

  // Cập nhật trạng thái điều hướng cho từng tab riêng biệt
  const handleNavigationStateChangeForTab = (tabId: string, navState: WebViewNavigation) => {
    const prevCanGoBack = canGoBackRef.current[tabId];
    const prevCanGoForward = canGoForwardRef.current[tabId];
    canGoBackRef.current[tabId] = navState.canGoBack;
    canGoForwardRef.current[tabId] = navState.canGoForward;

    // Tự động bypass SetSID nếu xuất hiện trong điều hướng trạng thái
    if (navState.url && navState.url.toLowerCase().includes('/setsid')) {
      try {
        const parsed = new URL(navState.url);
        let continueUrl = parsed.searchParams.get('continue');
        if (continueUrl) {
          try {
            while (continueUrl && (continueUrl.includes('%3A') || continueUrl.includes('%2F'))) {
              const decoded = decodeURIComponent(continueUrl);
              if (decoded === continueUrl) break;
              continueUrl = decoded;
            }
          } catch (eDec) {}

          if (
            continueUrl.startsWith('http://') ||
            continueUrl.startsWith('https://') ||
            continueUrl.startsWith('kite://')
          ) {
            setTabs((prev) => {
              const updated = prev.map((t) =>
                t.id === tabId ? { ...t, url: continueUrl! } : t
              );
              persistTabsState(updated);
              return updated;
            });
            if (tabId === activeTabIdRef.current) {
              setInputUrl(continueUrl!);
            }
            return;
          }
        }
      } catch (eSetSid) {}
    }

    if (navState.url && isOAuthCallback(navState.url)) {
      if (processedOAuthUrlsRef.current.has(navState.url)) {
        return;
      }
      processedOAuthUrlsRef.current.add(navState.url);

      if (navState.url.toLowerCase().includes('error=')) {
        setIsLoading(false);
        showToast('Đăng nhập Google bị gián đoạn, vui lòng thử lại.');
        clearTabSnapshot(tabId);
        setTabs((prev) => {
          const updated = prev.map((t) =>
            t.id === tabId ? { ...t, url: '', title: 'Trang mới', snapshotUri: undefined } : t
          );
          return updated;
        });
        setInputUrl('');
        return;
      }

      handleAuthCallbackUrl(navState.url).then((profile) => {
        setIsLoading(false);
        if (profile) {
          setUserProfile(profile);
          userProfileRef.current = profile;
          AsyncStorage.setItem(STORAGE_USER_PROFILE_KEY, JSON.stringify(profile));
          syncUserCloudData(profile).catch(() => {});
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
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          showToast(`Đăng nhập Google thành công! (${profile.name || profile.email})`);
        } else {
          showToast('Đăng nhập Google chưa hoàn tất, vui lòng thử lại.');
        }
        clearTabSnapshot(tabId);
        setTabs((prev) => {
          const updated = prev.map((t) =>
            t.id === tabId ? { ...t, url: '', title: 'Trang mới', snapshotUri: undefined } : t
          );
          return updated;
        });
        setInputUrl('');
      });
      return;
    }

    if (tabId === activeTabIdRef.current) {
      if (prevCanGoBack !== navState.canGoBack) {
        setCanGoBack(navState.canGoBack);
      }
      if (prevCanGoForward !== navState.canGoForward) {
        setCanGoForward(navState.canGoForward);
      }
    }

    // Debounce 250ms các cập nhật URL và Title để không làm nghẽn JS thread khi trang đang nạp các subresource
    pendingNavRef.current[tabId] = navState;
    if (navDebounceTimerRef.current[tabId]) return;

    navDebounceTimerRef.current[tabId] = setTimeout(() => {
      navDebounceTimerRef.current[tabId] = null;
      const nav = pendingNavRef.current[tabId];
      if (!nav) return;

      const curTab = tabsRef.current.find((t) => t.id === tabId);
      // Chặn trạng thái ma: Nếu tab đã về Home (url rỗng), bỏ qua nav event muộn của trang cũ
      if (!curTab?.url) return;

      if (nav.url && !nav.loading && !isJunkHistoryItem(nav.url, nav.title)) {
        saveToHistory(nav.url, nav.title || nav.url, tabId);
      }

      const isUrlDifferent = Boolean(nav.url && curTab.url !== nav.url);
      const isTitleDifferent = Boolean(nav.title && curTab.title !== nav.title);
      const isStillLoading = Boolean(nav.loading);
      const shouldClearLoading = Boolean(curTab.isLoading && !isStillLoading);

      if (isUrlDifferent || isTitleDifferent || shouldClearLoading) {
        setTabs((prev) => {
          const idx = prev.findIndex((t) => t.id === tabId);
          if (idx < 0) return prev;
          const cur = prev[idx];
          if (!cur.url) return prev;

          const nextUrl = nav.url || cur.url;
          const nextTitle = nav.title || cur.title;
          const nextLoading = isStillLoading ? cur.isLoading : false;

          if (cur.url === nextUrl && cur.title === nextTitle && cur.isLoading === nextLoading) {
            return prev;
          }

          const next = prev.slice();
          next[idx] = {
            ...cur,
            url: nextUrl,
            initialUrl: nextUrl,
            title: nextTitle,
            isLoading: nextLoading,
            isReaderMode: isUrlDifferent ? false : cur.isReaderMode,
            isTranslated: isUrlDifferent ? false : cur.isTranslated,
          };
          return next;
        });
      }

      if (tabId === activeTabIdRef.current && isUrlDifferent) {
        if (!isEditing && nav.url) {
          if (isGoogleTranslateUrl(nav.url)) {
            const original = getOriginalUrlFromTranslateUrl(
              nav.url,
              tabsRef.current.find((t) => t.id === tabId)?.originalUrlBeforeTranslate
            );
            setInputUrl(original || nav.url);
          } else {
            setInputUrl(nav.url);
          }
        }
        setStats((prev) => ({
          ...prev,
          isReaderMode: false,
        }));
      }

      if (isUrlDifferent && setDetectedMediaByTab) {
        setDetectedMediaByTab((prev) => {
          if (!prev[tabId] || prev[tabId].length === 0) return prev;
          const copy = { ...prev };
          delete copy[tabId];
          return copy;
        });
      }
    }, 250);
  };

  return {
    handleShouldStartLoad,
    handleNavigationStateChangeForTab,
    flushBlockedCount,
  };
}
