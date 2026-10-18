import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { BookmarkItem, DEFAULT_BOOKMARKS, STORAGE_BOOKMARKS_KEY } from '../components/BookmarkSheet';
import { HistoryItem, STORAGE_HISTORY_KEY } from '../components/HistorySheet';
import { BrowserTab, ShieldStats, UserProfile } from '../types/browser';
import { extractSearchQuery, isJunkHistoryItem, STORAGE_SEARCH_QUERIES_KEY } from '../constants/searchEngines';
import { isGoogleTranslateUrl, getOriginalUrlFromTranslateUrl } from '../services/translateService';

interface UseBookmarksAndHistoryProps {
  activeUrl: string | null;
  activeTabId: string;
  currentTab: BrowserTab | undefined;
  tabs: BrowserTab[];
  isIncognito: boolean;
  userProfile: UserProfile;
  userProfileRef: React.MutableRefObject<UserProfile>;
  syncAllAccounts: boolean;
  syncAllAccountsRef: React.MutableRefObject<boolean>;
  setStats: React.Dispatch<React.SetStateAction<ShieldStats>>;
  showToast: (msg: string) => void;
}

export function useBookmarksAndHistory({
  activeUrl,
  activeTabId,
  currentTab,
  tabs,
  isIncognito,
  userProfile,
  userProfileRef,
  syncAllAccounts,
  syncAllAccountsRef,
  setStats,
  showToast,
}: UseBookmarksAndHistoryProps) {
  const [historySheetVisible, setHistorySheetVisible] = useState<boolean>(false);
  const [bookmarkSheetVisible, setBookmarkSheetVisible] = useState<boolean>(false);
  const [isCurrentBookmarked, setIsCurrentBookmarked] = useState<boolean>(false);

  const getBookmarkStorageKey = () => {
    const isSync = syncAllAccountsRef.current;
    const activeEmail =
      userProfileRef.current.isLoggedIn ? userProfileRef.current.email : undefined;
    return !isSync && activeEmail
      ? `@kite_user_bookmarks_${activeEmail.toLowerCase()}`
      : STORAGE_BOOKMARKS_KEY;
  };

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
  }, [activeUrl, activeTabId, userProfile.email, syncAllAccounts]);

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
        try { Haptics.selectionAsync(); } catch (e) {}
        showToast('Đã lưu vào dấu trang');
      }
      await AsyncStorage.setItem(bmKey, JSON.stringify(list));
    } catch (e) {
      showToast('Lỗi khi lưu dấu trang');
    }
  };

  const saveToHistory = async (url: string, title: string, tabId?: string) => {
    const targetTab = tabs.find((t) => t.id === (tabId || activeTabId)) || currentTab;
    if (!url || isIncognito || targetTab?.isIncognito) return;
    if (isJunkHistoryItem(url, title)) return;

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

      // Tự động dọn dẹp các mục chuyển hướng hoặc rác đã lọt vào lịch sử trước đây
      list = list.filter((i) => !isJunkHistoryItem(i.url, i.title));

      const effectiveUrl = isGoogleTranslateUrl(url)
        ? getOriginalUrlFromTranslateUrl(url, targetTab?.originalUrlBeforeTranslate)
        : url;

      if (isJunkHistoryItem(effectiveUrl, title)) return;

      const newQuery = extractSearchQuery(effectiveUrl)?.trim().toLowerCase();
      const cleanNew = effectiveUrl.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '').toLowerCase();

      let cleanTitle = title?.trim() || effectiveUrl;
      if (
        !newQuery &&
        (cleanTitle.includes(' - Tìm trên Google') ||
          cleanTitle.includes(' - Google Search') ||
          cleanTitle.includes(' - Bing') ||
          cleanTitle.includes(' - Yahoo'))
      ) {
        cleanTitle = cleanNew;
      }

      // Lưu từ khóa tìm kiếm vào lịch sử tìm kiếm riêng biệt (@kite_user_search_history)
      if (newQuery) {
        try {
          const rawQ = extractSearchQuery(effectiveUrl)?.trim();
          if (rawQ) {
            const qKey = !isSync && activeEmail
              ? `${STORAGE_SEARCH_QUERIES_KEY}_${activeEmail.toLowerCase()}`
              : STORAGE_SEARCH_QUERIES_KEY;
            const qStored = await AsyncStorage.getItem(qKey);
            let qList: string[] = qStored ? JSON.parse(qStored) : [];
            qList = [rawQ, ...qList.filter((x) => x.toLowerCase() !== rawQ.toLowerCase())].slice(0, 50);
            await AsyncStorage.setItem(qKey, JSON.stringify(qList));
          }
        } catch {}
      }

      if (list.length > 0) {
        const first = list[0];
        const firstQuery = extractSearchQuery(first.url)?.trim().toLowerCase();
        const cleanFirst = first.url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '').toLowerCase();

        if (newQuery && firstQuery && newQuery === firstQuery) {
          if (cleanTitle && cleanTitle !== first.title && cleanTitle !== url) {
            list[0].title = cleanTitle;
            list[0].timestamp = Date.now();
            await AsyncStorage.setItem(historyKey, JSON.stringify(list));
          }
          return;
        }

        if (!newQuery && cleanFirst === cleanNew) {
          if (cleanTitle && cleanTitle !== first.title && cleanTitle !== url && cleanTitle !== cleanNew) {
            list[0].title = cleanTitle;
            list[0].timestamp = Date.now();
            await AsyncStorage.setItem(historyKey, JSON.stringify(list));
          }
          return;
        }
      }

      const newItem: HistoryItem = {
        id: `hist-${Date.now()}`,
        url: effectiveUrl,
        title: cleanTitle,
        timestamp: Date.now(),
      };

      const filtered = list.filter((i) => {
        if (newQuery) {
          const oldQuery = extractSearchQuery(i.url)?.trim().toLowerCase();
          if (oldQuery && oldQuery === newQuery) return false;
        }
        const cleanOld = i.url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '').toLowerCase();
        if (cleanOld === cleanNew) return false;
        return true;
      });

      const updated = [newItem, ...filtered.slice(0, 199)];
      await AsyncStorage.setItem(historyKey, JSON.stringify(updated));
    } catch (e) {}
  };

  const handleClearBrowsingData = async () => {
    try {
      const isSync = syncAllAccountsRef.current;
      const activeEmail =
        userProfileRef.current.isLoggedIn ? userProfileRef.current.email : undefined;
      const historyKey =
        !isSync && activeEmail
          ? `@kite_browsing_history_${activeEmail.toLowerCase()}`
          : STORAGE_HISTORY_KEY;
      const qKey =
        !isSync && activeEmail
          ? `${STORAGE_SEARCH_QUERIES_KEY}_${activeEmail.toLowerCase()}`
          : STORAGE_SEARCH_QUERIES_KEY;

      await AsyncStorage.removeItem(historyKey);
      await AsyncStorage.removeItem(STORAGE_HISTORY_KEY);
      await AsyncStorage.removeItem(qKey);
      await AsyncStorage.removeItem(STORAGE_SEARCH_QUERIES_KEY);

      setStats((prev) => ({
        ...prev,
        blockedAds: 0,
        blockedPopups: 0,
        blockedOverlays: 0,
        isShieldActive: true,
        aggressiveMode: true,
      }));
      showToast('Đã xóa dữ liệu duyệt web & lịch sử');
    } catch (e) {
      showToast('Lỗi khi xóa dữ liệu');
    }
  };

  const handleClearBrowsingHistory = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_HISTORY_KEY);
      await AsyncStorage.removeItem(STORAGE_SEARCH_QUERIES_KEY);
    } catch (e) {
      console.log('Error clearing history:', e);
    }
  };

  return {
    historySheetVisible,
    setHistorySheetVisible,
    bookmarkSheetVisible,
    setBookmarkSheetVisible,
    isCurrentBookmarked,
    checkBookmarkStatus,
    handleToggleBookmarkCurrentPage,
    saveToHistory,
    handleClearBrowsingData,
    handleClearBrowsingHistory,
  };
}
