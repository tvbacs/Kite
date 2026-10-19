import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  Keyboard,
  Animated,
  PanResponder,
  Image,
  Modal,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { STORAGE_HISTORY_KEY, HistoryItem } from './HistorySheet';
import { STORAGE_BOOKMARKS_KEY, DEFAULT_BOOKMARKS, BookmarkItem } from './BookmarkSheet';
import {
  SEARCH_ENGINES,
  extractSearchQuery,
  isJunkHistoryItem,
  STORAGE_SEARCH_QUERIES_KEY,
} from '../constants/searchEngines';
import { preconnectTarget, isLikelyDomain } from '../services/networkPreconnectService';

export { extractSearchQuery, isJunkHistoryItem, STORAGE_SEARCH_QUERIES_KEY };

export interface FastHistoryItem extends HistoryItem {
  cleanUrl: string;
  lowerCleanUrl: string;
  lowerTitle: string;
  searchQuery: string | null;
  lowerSearchQuery: string | null;
}

export interface FastBookmarkItem extends BookmarkItem {
  cleanUrl: string;
  lowerCleanUrl: string;
}

// Hàm loại bỏ trùng lặp lịch sử (theo từ khóa tìm kiếm hoặc URL đã chuẩn hóa)
export const deduplicateFastHistory = (items: FastHistoryItem[]): FastHistoryItem[] => {
  const seenQueries = new Set<string>();
  const seenUrls = new Set<string>();
  const result: FastHistoryItem[] = [];

  for (const item of items) {
    if (item.lowerSearchQuery) {
      const q = item.lowerSearchQuery.trim();
      if (seenQueries.has(q)) {
        continue;
      }
      seenQueries.add(q);
      result.push(item);
    } else {
      const u = item.lowerCleanUrl.trim();
      if (seenUrls.has(u)) {
        continue;
      }
      seenUrls.add(u);
      result.push(item);
    }
  }

  return result;
};

interface SearchOverlayProps {
  inputUrl: string;
  onUrlChange: (text: string) => void;
  onSubmit: (url: string) => void;
  onCancel: () => void;
  onSearchByImage: () => void;
  onScanQr?: () => void;
  currentEngineId?: string;
  currentEngineName: string;
  onChangeEngine?: (engineId: 'google' | 'bing' | 'duckduckgo' | 'yahoo') => void;
  isIncognito: boolean;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  userEmail?: string;
}

interface SwipeableSearchQueryRowProps {
  query: string;
  textColor: string;
  subColor: string;
  borderCol: string;
  bgColor: string;
  currentEngineName: string;
  onSubmit: (query: string) => void;
  onUrlChange: (query: string) => void;
  onDelete: (query: string) => void;
  highlightPrefix?: string;
}

const SwipeableSearchQueryRow: React.FC<SwipeableSearchQueryRowProps> = ({
  query,
  textColor,
  subColor,
  borderCol,
  bgColor,
  currentEngineName,
  onSubmit,
  onUrlChange,
  onDelete,
  highlightPrefix,
}) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const rowHeight = useRef(new Animated.Value(1)).current;
  const isDeletingRef = useRef(false);
  const isOpenRef = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderMove: (_, gestureState) => {
        if (isDeletingRef.current) return;
        const initial = isOpenRef.current ? -80 : 0;
        const target = initial + gestureState.dx;
        if (target <= 0) {
          translateX.setValue(Math.max(-120, target));
        } else {
          translateX.setValue(0);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isDeletingRef.current) return;
        const currentOffset = isOpenRef.current ? -80 : 0;
        const effectiveDx = currentOffset + gestureState.dx;

        // Vuốt mạnh sang trái: xóa luôn
        if (effectiveDx < -140) {
          triggerDelete();
          return;
        }

        // Vuốt qua ngưỡng -40: mở nút Xóa
        if (effectiveDx < -40) {
          isOpenRef.current = true;
          Animated.spring(translateX, {
            toValue: -80,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        } else {
          isOpenRef.current = false;
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        }
      },
    })
  ).current;

  const closeSwipe = () => {
    isOpenRef.current = false;
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
    }).start();
  };

  const triggerDelete = () => {
    if (isDeletingRef.current) return;
    isDeletingRef.current = true;
    Animated.timing(rowHeight, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start(() => {
      onDelete(query);
    });
  };

  const startsWith =
    highlightPrefix &&
    highlightPrefix.trim().length > 0 &&
    query.toLowerCase().startsWith(highlightPrefix.toLowerCase());

  return (
    <Animated.View
      style={{
        overflow: 'hidden',
        maxHeight: rowHeight.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 80],
        }),
        opacity: rowHeight,
      }}
    >
      <View style={[styles.swipeContainer, { borderBottomColor: borderCol }]}>
        {/* Nút Xóa đỏ ẩn bên dưới khi vuốt ngang */}
        <TouchableOpacity
          style={styles.deleteActionBtn}
          onPress={triggerDelete}
          activeOpacity={0.8}
        >
          <Feather name="trash-2" size={17} color="#ffffff" />
          <Text style={styles.deleteActionText}>Xóa</Text>
        </TouchableOpacity>

        {/* Nội dung hàng */}
        <Animated.View
          style={[
            styles.historyRowInner,
            {
              backgroundColor: bgColor,
              transform: [{ translateX }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity
            style={styles.historyRowContent}
            onPress={() => {
              if (isOpenRef.current) {
                closeSwipe();
              } else {
                onSubmit(query);
              }
            }}
            activeOpacity={0.7}
          >
            <View style={styles.iconCircle}>
              <Feather name="clock" size={17} color={subColor} />
            </View>

            <View style={styles.textContainer}>
              {startsWith ? (
                <Text style={[styles.mainText, { color: textColor }]} numberOfLines={1}>
                  <Text style={{ fontWeight: '400' }}>
                    {query.slice(0, highlightPrefix!.length)}
                  </Text>
                  <Text style={{ fontWeight: '700' }}>
                    {query.slice(highlightPrefix!.length)}
                  </Text>
                </Text>
              ) : (
                <Text style={[styles.mainText, { color: textColor }]} numberOfLines={1}>
                  {query}
                </Text>
              )}
              <Text style={[styles.subText, { color: subColor }]} numberOfLines={1}>
                {highlightPrefix ? 'Lịch sử tìm kiếm' : `Tìm trên ${currentEngineName}`}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Nút xóa nhanh bằng cách chạm x */}
          <TouchableOpacity
            style={styles.quickDeleteBtn}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            onPress={triggerDelete}
            activeOpacity={0.6}
          >
            <Feather name="x" size={16} color={subColor} />
          </TouchableOpacity>

          {/* Nút mũi tên ↗ điền vào ô tìm kiếm */}
          <TouchableOpacity
            style={styles.arrowBtn}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            onPress={() => onUrlChange(query)}
          >
            <Feather name="arrow-up-right" size={20} color="#007aff" />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Animated.View>
  );
};

export const SearchOverlay: React.FC<SearchOverlayProps> = ({
  inputUrl,
  onUrlChange,
  onSubmit,
  onCancel,
  onSearchByImage,
  onScanQr,
  currentEngineId = 'google',
  currentEngineName,
  onChangeEngine,
  isIncognito,
  isBookmarked,
  onToggleBookmark,
  userEmail,
}) => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 47 : 24);

  const [userSearchQueries, setUserSearchQueries] = useState<string[]>([]);
  const [fastHistory, setFastHistory] = useState<FastHistoryItem[]>([]);
  const [fastBookmarks, setFastBookmarks] = useState<FastBookmarkItem[]>([]);
  const [enginePickerVisible, setEnginePickerVisible] = useState<boolean>(false);
  const [text, setText] = useState<string>(inputUrl);
  const [userTypedText, setUserTypedText] = useState<string>(inputUrl);
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const lastTypedLengthRef = useRef<number>(inputUrl.length);
  const inputRef = useRef<TextInput>(null);

  const getStorageKey = () =>
    userEmail ? `${STORAGE_HISTORY_KEY}_${userEmail.toLowerCase()}` : STORAGE_HISTORY_KEY;

  const getSearchQueriesKey = () =>
    userEmail ? `${STORAGE_SEARCH_QUERIES_KEY}_${userEmail.toLowerCase()}` : STORAGE_SEARCH_QUERIES_KEY;

  useEffect(() => {
    if (!isIncognito) {
      loadSearchQueries();
      loadHistory();
      loadBookmarks();
    } else {
      setUserSearchQueries([]);
      setFastHistory([]);
      setFastBookmarks([]);
    }
  }, [isIncognito, userEmail]);

  useEffect(() => {
    if (!text) {
      setUserTypedText('');
      lastTypedLengthRef.current = 0;
      setSelection(undefined);
    }
  }, [text]);

  const loadSearchQueries = async () => {
    if (isIncognito) return;
    try {
      const stored = await AsyncStorage.getItem(getSearchQueriesKey());
      if (stored) {
        const list: string[] = JSON.parse(stored);
        if (Array.isArray(list)) {
          const cleaned = list.filter(
            (q) =>
              typeof q === 'string' &&
              q.trim().length > 0 &&
              !isJunkHistoryItem(q, q) &&
              !q.startsWith('http://') &&
              !q.startsWith('https://')
          );
          setUserSearchQueries(cleaned);
          if (cleaned.length < list.length) {
            AsyncStorage.setItem(getSearchQueriesKey(), JSON.stringify(cleaned)).catch(() => {});
          }
        }
      }
    } catch (e) {
      setUserSearchQueries([]);
    }
  };

  const loadHistory = async () => {
    if (isIncognito) return;
    try {
      const stored = await AsyncStorage.getItem(getStorageKey());
      if (stored) {
        const rawList: HistoryItem[] = JSON.parse(stored);
        // Loại bỏ triệt để các trang chuyển hướng và rác
        const cleanRawList = rawList.filter((item) => !isJunkHistoryItem(item.url, item.title));

        const list: FastHistoryItem[] = cleanRawList.map((item) => {
          const cleanUrl = item.url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
          const query = extractSearchQuery(item.url);
          let cleanTitle = (item.title || '').trim();
          if (
            !query &&
            (cleanTitle.includes(' - Tìm trên Google') ||
              cleanTitle.includes(' - Google Search') ||
              cleanTitle.includes(' - Bing') ||
              cleanTitle.includes(' - Yahoo'))
          ) {
            cleanTitle = cleanUrl;
          }
          return {
            id: item.id,
            url: item.url,
            title: cleanTitle || cleanUrl,
            timestamp: item.timestamp || Date.now(),
            cleanUrl,
            lowerCleanUrl: cleanUrl.toLowerCase(),
            lowerTitle: (cleanTitle || cleanUrl).toLowerCase(),
            searchQuery: query,
            lowerSearchQuery: query ? query.toLowerCase() : null,
          };
        });

        const dedupedList = deduplicateFastHistory(list);
        setFastHistory(dedupedList);

        // Tự động dọn dẹp các mục rác / chuyển hướng khỏi storage nếu phát hiện
        if (cleanRawList.length < rawList.length || dedupedList.length < cleanRawList.length) {
          const cleanStorage: HistoryItem[] = dedupedList.map((i) => ({
            id: i.id,
            url: i.url,
            title: i.title,
            timestamp: i.timestamp,
          }));
          AsyncStorage.setItem(getStorageKey(), JSON.stringify(cleanStorage)).catch(() => {});
        }

        // Tự động gom các từ khóa tìm kiếm hợp lệ nếu danh sách userSearchQueries đang rỗng
        setUserSearchQueries((prev) => {
          if (prev.length > 0) return prev;
          const extractedQueries: string[] = [];
          const seen = new Set<string>();
          for (const item of dedupedList) {
            if (item.searchQuery && !isJunkHistoryItem(item.searchQuery, item.searchQuery)) {
              const lower = item.searchQuery.toLowerCase().trim();
              if (!seen.has(lower)) {
                seen.add(lower);
                extractedQueries.push(item.searchQuery.trim());
              }
            }
          }
          if (extractedQueries.length > 0) {
            AsyncStorage.setItem(getSearchQueriesKey(), JSON.stringify(extractedQueries)).catch(() => {});
            return extractedQueries;
          }
          return prev;
        });
      }
    } catch (e) {
      console.log('Error loading search history:', e);
    }
  };

  const loadBookmarks = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_BOOKMARKS_KEY);
      const rawList: BookmarkItem[] = stored ? JSON.parse(stored) : DEFAULT_BOOKMARKS;
      const list: FastBookmarkItem[] = rawList.map((bm) => {
        const cleanUrl = bm.url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
        return {
          id: bm.id,
          url: bm.url,
          title: bm.title || '',
          cleanUrl,
          lowerCleanUrl: cleanUrl.toLowerCase(),
        };
      });
      setFastBookmarks(list);
    } catch (e) {
      setFastBookmarks([]);
    }
  };

  const saveSearchQuery = (queryText: string) => {
    if (isIncognito) return;
    const clean = queryText.trim();
    if (!clean || clean.startsWith('http://') || clean.startsWith('https://')) return;
    if (isJunkHistoryItem(clean, clean)) return;

    setUserSearchQueries((prev) => {
      const filtered = prev.filter((q) => q.toLowerCase() !== clean.toLowerCase());
      const updated = [clean, ...filtered].slice(0, 50);
      AsyncStorage.setItem(getSearchQueriesKey(), JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  };

  const deleteSearchQuery = (queryText: string) => {
    setUserSearchQueries((prev) => {
      const updated = prev.filter((q) => q.toLowerCase() !== queryText.toLowerCase());
      AsyncStorage.setItem(getSearchQueriesKey(), JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  };

  // Tìm từ khóa / URL khớp nhất từ lịch sử người dùng (Tính toán siêu tốc 0ms, không lag)
  const ghostMatch = useMemo<{
    fullText: string;
    suffix: string;
    isUrl: boolean;
    url?: string;
    title?: string;
  } | null>(() => {
    if (isIncognito) return null;
    const q = text.trim();
    if (!q || q.length < 1) return null;
    const lowerQ = q.toLowerCase();

    // 1. Quét từ khóa tìm kiếm đã tìm (userSearchQueries)
    for (const sq of userSearchQueries) {
      const lowerSq = sq.toLowerCase();
      if (lowerSq.startsWith(lowerQ) && sq.length > q.length) {
        return {
          fullText: sq,
          suffix: sq.slice(q.length),
          isUrl: false,
        };
      }
    }

    // 2. Quét từ khóa tìm kiếm (query) đã lập chỉ mục từ fastHistory
    for (const h of fastHistory) {
      if (h.lowerSearchQuery && h.lowerSearchQuery.startsWith(lowerQ) && h.searchQuery!.length > q.length) {
        return {
          fullText: h.searchQuery!,
          suffix: h.searchQuery!.slice(q.length),
          isUrl: false,
        };
      }
    }

    // 3. Quét tên miền trang web sạch từ lịch sử (history)
    for (const h of fastHistory) {
      if (isJunkHistoryItem(h.url, h.title)) continue;
      if (h.lowerCleanUrl.startsWith(lowerQ) && h.cleanUrl.length > q.length) {
        return {
          fullText: h.cleanUrl,
          suffix: h.cleanUrl.slice(q.length),
          isUrl: true,
          url: h.url,
          title: h.title,
        };
      }
    }

    // 4. Quét dấu trang (bookmarks)
    for (const bm of fastBookmarks) {
      if (bm.lowerCleanUrl.startsWith(lowerQ) && bm.cleanUrl.length > q.length) {
        return {
          fullText: bm.cleanUrl,
          suffix: bm.cleanUrl.slice(q.length),
          isUrl: true,
          url: bm.url,
          title: bm.title,
        };
      }
    }

    return null;
  }, [userSearchQueries, fastHistory, fastBookmarks, text, isIncognito]);

  const ghostSuffix = ghostMatch?.suffix || '';

  // Omnibox Predictive Preconnect: CHỈ kết nối trước dựa trên LỊCH SỬ THỰC TẾ của người dùng
  // Tuyệt đối không đoán bừa hay tự ý kết nối các trang lạ
  useEffect(() => {
    if (isIncognito) return;

    // 1. Khớp chính xác với một URL từ LỊCH SỬ DUYỆT WEB hoặc DẤU TRANG mà người dùng đã từng vào
    if (ghostMatch?.isUrl && ghostMatch.url) {
      preconnectTarget(ghostMatch.url);
      return;
    }

    // 2. Khớp với một từ khóa mà người dùng ĐÃ TỪNG TÌM KIẾM thực tế trước đây (từ userSearchQueries)
    if (ghostMatch && !ghostMatch.isUrl) {
      const engineHost =
        currentEngineId === 'bing'
          ? 'www.bing.com'
          : currentEngineId === 'duckduckgo'
          ? 'duckduckgo.com'
          : currentEngineId === 'yahoo'
          ? 'search.yahoo.com'
          : 'www.google.com';
      preconnectTarget(engineHost);
      return;
    }

    // 3. Hoặc người dùng tự tay gõ một URL/Domain hoàn chỉnh có đuôi tên miền hợp lệ (.com, .vn, .st...)
    const q = text.trim();
    if (q.length >= 4 && isLikelyDomain(q)) {
      preconnectTarget(q);
    }
  }, [ghostMatch, text, currentEngineId, isIncognito]);

  // Khi người dùng gõ phím: Cập nhật ngay lập tức (0ms delay), không chờ debounce
  const handleTextChange = (newText: string) => {
    setText(newText);
    setUserTypedText(newText);
    setSelection(undefined);
  };

  const filterQuery = text.trim();

  // Lọc từ khóa tìm kiếm người dùng (Lịch sử tìm kiếm chính xác, không lẫn trang rác)
  const matchingSearchQueries = useMemo(() => {
    if (isIncognito) return [];
    const seen = new Set<string>();
    const result: string[] = [];

    if (!filterQuery) {
      // Khi ô tìm kiếm rỗng: Hiển thị tối đa 15 từ khóa tìm kiếm gần đây nhất của người dùng
      for (const q of userSearchQueries) {
        const lowerQ = q.toLowerCase();
        if (!seen.has(lowerQ)) {
          seen.add(lowerQ);
          result.push(q);
        }
        if (result.length >= 15) break;
      }
      return result;
    }

    const lower = filterQuery.toLowerCase();

    // Khi người dùng đang gõ: Tìm các từ khóa khớp
    for (const q of userSearchQueries) {
      const lowerQ = q.toLowerCase();
      if (lowerQ.includes(lower) && !seen.has(lowerQ)) {
        seen.add(lowerQ);
        result.push(q);
        if (result.length >= 8) return result;
      }
    }

    // Quét thêm từ fastHistory nếu có searchQuery
    for (const h of fastHistory) {
      if (h.searchQuery && !isJunkHistoryItem(h.searchQuery, h.searchQuery)) {
        const lowerQ = h.searchQuery.toLowerCase();
        if (lowerQ.includes(lower) && !seen.has(lowerQ)) {
          seen.add(lowerQ);
          result.push(h.searchQuery);
          if (result.length >= 8) return result;
        }
      }
    }

    return result;
  }, [userSearchQueries, fastHistory, filterQuery, isIncognito]);

  // Lọc các trang web đã từng truy cập (Chỉ hiện khi người dùng ĐANG GÕ và khớp tên miền/tiêu đề)
  const matchingWebsites = useMemo(() => {
    if (isIncognito || !filterQuery) return [];
    const lower = filterQuery.toLowerCase();
    const result: { id: string; url: string; title: string; cleanUrl: string }[] = [];
    const seenUrls = new Set<string>();

    for (const h of fastHistory) {
      if (h.searchQuery) continue; // Bỏ qua từ khóa tìm kiếm
      if (isJunkHistoryItem(h.url, h.title)) continue; // Bỏ qua trang rác / redirect

      if (h.lowerCleanUrl.includes(lower) || (h.lowerTitle && h.lowerTitle.includes(lower))) {
        if (seenUrls.has(h.lowerCleanUrl)) continue;
        seenUrls.add(h.lowerCleanUrl);
        result.push({
          id: h.id,
          url: h.url,
          title: h.title,
          cleanUrl: h.cleanUrl,
        });
        if (result.length >= 5) break;
      }
    }
    return result;
  }, [fastHistory, filterQuery, isIncognito]);

  const bg = isIncognito ? '#202124' : '#ffffff';
  const pillBg = isIncognito ? '#2d2f31' : '#f4f4f5';
  const textColor = isIncognito ? '#e8eaed' : '#09090b';
  const subColor = isIncognito ? '#9aa0a6' : '#71717a';
  const borderCol = isIncognito ? 'rgba(255,255,255,0.08)' : '#f4f4f5';

  const activeEngine = SEARCH_ENGINES[currentEngineId] || SEARCH_ENGINES.google;

  return (
    <View style={[styles.container, { backgroundColor: bg, paddingTop: topInset }]}>
      {/* THANH TÌM KIẾM TRÊN CÙNG KÈM NÚT 'HỦY' */}
      <View style={styles.topSearchHeader}>
        <View style={[styles.searchPill, { backgroundColor: pillBg }]}>
          {/* Nút chuyển đổi công cụ tìm kiếm trực tiếp trên thanh Search */}
          {onChangeEngine ? (
            <TouchableOpacity
              style={styles.engineSwitchBtn}
              onPress={() => setEnginePickerVisible(true)}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              activeOpacity={0.7}
            >
              <Image
                source={{ uri: activeEngine.logoUrl }}
                style={styles.engineLogoImg}
                resizeMode="contain"
              />
              <Feather name="chevron-down" size={13} color={subColor} style={{ marginLeft: 2 }} />
            </TouchableOpacity>
          ) : (
            <Feather name="search" size={17} color={subColor} style={styles.searchIcon} />
          )}

          <View style={styles.inputWrapper}>
            <TextInput
              ref={inputRef}
              style={[styles.input, { color: textColor, backgroundColor: 'transparent' }]}
              value={text}
              onChangeText={handleTextChange}
              placeholder={`Tìm trên ${currentEngineName} hoặc nhập URL`}
              placeholderTextColor={subColor}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={Platform.OS === 'ios' ? 'web-search' : 'default'}
              returnKeyType="search"
              onSubmitEditing={() => {
                const target = ghostMatch?.isUrl
                  ? (ghostMatch.url || `https://${ghostMatch.fullText}`)
                  : (ghostMatch?.fullText || text);
                if (!ghostMatch?.isUrl && target.trim()) {
                  saveSearchQuery(target.trim());
                }
                onSubmit(target);
              }}
              selectTextOnFocus={!userTypedText}
            />
          </View>

          {/* Cụm nút thao tác bên phải: Cố định bên phải và không bị textfield đè lên */}
          <View style={styles.rightActionsGroup}>
            {/* Nút lưu Dấu trang (Bookmark) ngay trên thanh URL */}
            {onToggleBookmark && text.trim().length > 0 && (
              <TouchableOpacity
                style={styles.pillActionBtn}
                onPress={onToggleBookmark}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                {isBookmarked ? (
                  <Ionicons
                    name="bookmark"
                    size={18}
                    color="#007aff"
                  />
                ) : (
                  <Ionicons
                    name="bookmark-outline"
                    size={18}
                    color={subColor}
                  />
                )}
              </TouchableOpacity>
            )}

            {text.length > 0 && (
              <TouchableOpacity
                style={styles.pillActionBtn}
                onPress={() => {
                  inputRef.current?.clear();
                  setText('');
                  setUserTypedText('');
                  lastTypedLengthRef.current = 0;
                  setSelection(undefined);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                activeOpacity={0.6}
              >
                <Feather name="x" size={17} color={subColor} />
              </TouchableOpacity>
            )}

            {/* Quét ảnh Google Lens khi chưa nhập */}
            {!text && onSearchByImage && (
              <TouchableOpacity
                style={styles.pillActionBtn}
                onPress={() => {
                  Keyboard.dismiss();
                  onCancel();
                  onSearchByImage();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name="google-lens"
                  size={19}
                  color={subColor}
                />
              </TouchableOpacity>
            )}

            {/* Quét mã QR */}
            {!text && onScanQr && (
              <TouchableOpacity
                style={styles.pillActionBtn}
                onPress={onScanQr}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Feather name="maximize" size={17} color={textColor} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => {
            Keyboard.dismiss();
            onCancel();
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelBtnText}>Hủy</Text>
        </TouchableOpacity>
      </View>

      {/* DANH SÁCH LỊCH SỬ TÌM KIẾM / GỢI Ý */}
      <ScrollView
        style={styles.historyScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Nếu người dùng đang gõ: */}
        {text.trim().length > 0 && (
          <>
            {/* DÒNG 1: GỢI Ý ĐẦY ĐỦ (GIỐNG CHROME) HOẶC ĐI TỚI WEBSITE */}
            {ghostMatch ? (
              <TouchableOpacity
                style={[styles.historyRow, { borderBottomColor: borderCol }]}
                onPress={() => {
                  if (ghostMatch.isUrl) {
                    onSubmit(ghostMatch.url || `https://${ghostMatch.fullText}`);
                  } else {
                    saveSearchQuery(ghostMatch.fullText);
                    onSubmit(ghostMatch.fullText);
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={styles.iconCircle}>
                  <Feather
                    name={ghostMatch.isUrl ? 'globe' : 'clock'}
                    size={17}
                    color={subColor}
                  />
                </View>
                <View style={styles.textContainer}>
                  <Text style={[styles.mainText, { color: textColor }]} numberOfLines={1}>
                    {ghostMatch.isUrl ? (
                      <>
                        <Text style={{ fontWeight: '400', color: subColor }}>Đi tới </Text>
                        <Text style={{ fontWeight: '400' }}>
                          https://{text.trim().replace(/^https?:\/\//i, '')}
                        </Text>
                        <Text style={{ fontWeight: '700' }}>{ghostMatch.suffix}</Text>
                      </>
                    ) : (
                      <>
                        <Text style={{ fontWeight: '400' }}>{text.trim()}</Text>
                        <Text style={{ fontWeight: '700' }}>{ghostMatch.suffix}</Text>
                      </>
                    )}
                  </Text>
                  {ghostMatch.title && ghostMatch.isUrl ? (
                    <Text style={[styles.subText, { color: subColor }]} numberOfLines={1}>
                      {ghostMatch.title}
                    </Text>
                  ) : !ghostMatch.isUrl ? (
                    <Text style={[styles.subText, { color: subColor }]} numberOfLines={1}>
                      Lịch sử tìm kiếm
                    </Text>
                  ) : null}
                </View>
                <Feather name="arrow-up-right" size={19} color="#007aff" />
              </TouchableOpacity>
            ) : /^[a-zA-Z0-9-]{2,20}$/.test(text.trim()) && !text.includes('.') ? (
              <TouchableOpacity
                style={[styles.historyRow, { borderBottomColor: borderCol }]}
                onPress={() => onSubmit(`https://${text.trim().toLowerCase()}.com`)}
                activeOpacity={0.7}
              >
                <View style={styles.iconCircle}>
                  <Feather name="globe" size={17} color={subColor} />
                </View>
                <View style={styles.textContainer}>
                  <Text style={[styles.mainText, { color: textColor }]} numberOfLines={1}>
                    Đi tới https://{text.trim().toLowerCase()}.com
                  </Text>
                </View>
                <Feather name="arrow-up-right" size={19} color="#007aff" />
              </TouchableOpacity>
            ) : null}

            {/* DÒNG 2: TÌM TRÊN GOOGLE / CÔNG CỤ TÌM KIẾM */}
            <TouchableOpacity
              style={[styles.historyRow, { borderBottomColor: borderCol }]}
              onPress={() => {
                saveSearchQuery(text.trim());
                onSubmit(text.trim());
              }}
              activeOpacity={0.7}
            >
              <View style={styles.iconCircle}>
                <Feather name="search" size={17} color={subColor} />
              </View>
              <View style={styles.textContainer}>
                <Text style={[styles.mainText, { color: textColor }]} numberOfLines={1}>
                  Tìm "{text.trim()}" trên {currentEngineName}
                </Text>
              </View>
              <Feather name="arrow-up-right" size={19} color="#007aff" />
            </TouchableOpacity>
          </>
        )}

        {/* CÁC TỪ KHÓA TÌM KIẾM ĐÃ LƯU (SEARCH QUERIES) */}
        {!isIncognito && matchingSearchQueries.length > 0 && (
          <>
            <View style={styles.historySectionHeader}>
              <Text style={[styles.historySectionTitle, { color: subColor }]}>
                {filterQuery ? 'GỢI Ý TÌM KIẾM' : 'TÌM KIẾM GẦN ĐÂY'}
              </Text>
            </View>

            {matchingSearchQueries.map((q) => (
              <SwipeableSearchQueryRow
                key={`sq-${q}`}
                query={q}
                textColor={textColor}
                subColor={subColor}
                borderCol={borderCol}
                bgColor={bg}
                currentEngineName={currentEngineName}
                onSubmit={(selectedQuery) => {
                  saveSearchQuery(selectedQuery);
                  onSubmit(selectedQuery);
                }}
                onUrlChange={(selectedText) => {
                  setText(selectedText);
                  setUserTypedText(selectedText);
                  lastTypedLengthRef.current = selectedText.length;
                  setSelection(undefined);
                  if (onUrlChange) {
                    onUrlChange(selectedText);
                  }
                }}
                onDelete={deleteSearchQuery}
                highlightPrefix={filterQuery}
              />
            ))}
          </>
        )}

        {/* CÁC TRANG WEB SẠCH ĐÃ TRUY CẬP (CHỈ KHI ĐANG GÕ VÀ KHỚP) */}
        {!isIncognito && matchingWebsites.length > 0 && (
          <>
            <View style={styles.historySectionHeader}>
              <Text style={[styles.historySectionTitle, { color: subColor }]}>
                TRANG WEB ĐÃ TRUY CẬP
              </Text>
            </View>

            {matchingWebsites.map((site) => (
              <TouchableOpacity
                key={site.id}
                style={[styles.historyRow, { borderBottomColor: borderCol }]}
                onPress={() => onSubmit(site.url)}
                activeOpacity={0.7}
              >
                <View style={styles.iconCircle}>
                  <Feather name="globe" size={17} color={subColor} />
                </View>
                <View style={styles.textContainer}>
                  <Text style={[styles.mainText, { color: textColor }]} numberOfLines={1}>
                    {site.title || site.cleanUrl}
                  </Text>
                  <Text style={[styles.subText, { color: subColor }]} numberOfLines={1}>
                    {site.cleanUrl}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.arrowBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  onPress={() => {
                    setText(site.url);
                    setUserTypedText(site.url);
                    lastTypedLengthRef.current = site.url.length;
                    setSelection(undefined);
                    if (onUrlChange) {
                      onUrlChange(site.url);
                    }
                  }}
                >
                  <Feather name="arrow-up-right" size={20} color="#007aff" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Thông báo riêng trong chế độ Ẩn danh */}
        {isIncognito && text.trim().length === 0 && (
          <View style={styles.emptyContainer}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: 'rgba(255,255,255,0.06)',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <Feather name="eye-off" size={28} color="#9aa0a6" />
            </View>
            <Text style={[styles.emptyTitle, { color: '#e8eaed' }]}>Duyệt web ẩn danh</Text>
            <Text style={[styles.emptySub, { color: '#9aa0a6' }]}>
              Kite sẽ không lưu lịch sử tìm kiếm, dữ liệu trang web hay biểu mẫu trong chế độ này.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* MODAL CHỌN CÔNG CỤ TÌM KIẾM NHANH TRÊN MÀN HÌNH SEARCH */}
      <Modal
        visible={enginePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEnginePickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setEnginePickerVisible(false)}
        >
          <TouchableOpacity
            style={[styles.modalCard, isIncognito && { backgroundColor: '#2d2f31' }]}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, isIncognito && { color: '#e8eaed' }]}>Chọn công cụ tìm kiếm</Text>
            <View style={styles.engineGrid}>
              {Object.values(SEARCH_ENGINES).map((eng) => {
                const isSelected = eng.id === currentEngineId;
                return (
                  <TouchableOpacity
                    key={eng.id}
                    style={[
                      styles.engineCardItem,
                      isIncognito && { backgroundColor: '#202124', borderColor: '#3c4043' },
                      isSelected && (isIncognito ? { borderColor: '#60a5fa', backgroundColor: '#303134' } : styles.engineCardSelected),
                    ]}
                    onPress={() => {
                      if (onChangeEngine) {
                        onChangeEngine(eng.id as any);
                      }
                      setEnginePickerVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Image
                      source={{ uri: eng.logoUrl }}
                      style={styles.enginePickerLogo}
                      resizeMode="contain"
                    />
                    <Text
                      style={[
                        styles.engineCardName,
                        isIncognito && { color: '#e8eaed' },
                        isSelected && (isIncognito ? { color: '#60a5fa', fontWeight: '700' } : styles.engineCardNameActive),
                      ]}
                    >
                      {eng.name}
                    </Text>
                    {isSelected && (
                      <Feather
                        name="check"
                        size={16}
                        color={isIncognito ? '#60a5fa' : '#18181b'}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topSearchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  searchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 12,
  },
  engineSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    paddingRight: 6,
    borderRightWidth: 1,
    borderRightColor: '#d4d4d8',
  },
  engineLogoImg: {
    width: 22,
    height: 22,
  },
  searchIcon: {
    marginRight: 8,
  },
  inputWrapper: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    marginRight: 4,
  },
  ghostTextContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  ghostBaseText: {
    fontSize: 15,
    color: 'transparent',
    padding: 0,
    margin: 0,
  },
  ghostSuffixText: {
    flex: 1,
    fontSize: 15,
    padding: 0,
    margin: 0,
  },
  input: {
    flex: 1,
    fontSize: 15,
    padding: 0,
    margin: 0,
    height: '100%',
  },
  rightActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 5,
  },
  pillActionBtn: {
    padding: 5,
    marginLeft: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    marginLeft: 12,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#18181b',
  },
  historyScroll: {
    flex: 1,
    paddingHorizontal: 14,
    marginTop: 6,
  },
  historySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 4,
  },
  historySectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  swipeContainer: {
    position: 'relative',
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  deleteActionBtn: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 76,
    backgroundColor: '#ef4444',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  deleteActionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  historyRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  historyRowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickDeleteBtn: {
    padding: 6,
    marginRight: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircle: {
    width: 32,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  mainText: {
    fontSize: 15,
    fontWeight: '500',
  },
  subText: {
    fontSize: 12,
    marginTop: 2,
  },
  arrowBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    paddingTop: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 340,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 16.5,
    fontWeight: '700',
    color: '#1f1f1f',
    marginBottom: 16,
    textAlign: 'center',
  },
  engineGrid: {
    gap: 8,
  },
  engineCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f4f4f5',
    borderWidth: 1,
    borderColor: '#e4e4e7',
  },
  engineCardSelected: {
    borderColor: '#18181b',
    backgroundColor: '#ffffff',
  },
  enginePickerLogo: {
    width: 28,
    height: 28,
    marginRight: 12,
  },
  engineCardName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#18181b',
  },
  engineCardNameActive: {
    color: '#18181b',
    fontWeight: '700',
  },
});
