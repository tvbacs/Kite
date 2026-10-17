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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { STORAGE_HISTORY_KEY, HistoryItem } from './HistorySheet';
import { STORAGE_BOOKMARKS_KEY, DEFAULT_BOOKMARKS, BookmarkItem } from './BookmarkSheet';
import { SEARCH_ENGINES } from '../constants/searchEngines';

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

interface SwipeableHistoryRowProps {
  item: HistoryItem;
  displayTitle: string;
  query: string | null;
  textColor: string;
  subColor: string;
  borderCol: string;
  bgColor: string;
  currentEngineName: string;
  onSubmit: (url: string) => void;
  onUrlChange: (text: string) => void;
  onDelete: (id: string) => void;
  highlightPrefix?: string;
}

// Hàm trích xuất từ khóa tìm kiếm từ các công cụ tìm kiếm phổ biến (Google, Yahoo, Bing, DuckDuckGo)
export const extractSearchQuery = (url: string): string | null => {
  try {
    const u = new URL(url);
    if (
      (u.hostname.includes('google.com') || u.hostname.includes('google.com.vn')) &&
      u.pathname.includes('/search') &&
      u.searchParams.get('q')
    ) {
      return decodeURIComponent(u.searchParams.get('q') || '');
    }
    if (u.hostname.includes('yahoo.com') && u.pathname.includes('/search') && u.searchParams.get('p')) {
      return decodeURIComponent(u.searchParams.get('p') || '');
    }
    if (u.hostname.includes('bing.com') && u.pathname.includes('/search') && u.searchParams.get('q')) {
      return decodeURIComponent(u.searchParams.get('q') || '');
    }
    if (u.hostname.includes('duckduckgo.com') && u.searchParams.get('q')) {
      return decodeURIComponent(u.searchParams.get('q') || '');
    }
  } catch (e) {}
  return null;
};

const SwipeableHistoryRow: React.FC<SwipeableHistoryRowProps> = ({
  item,
  displayTitle,
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

        // Nếu vuốt mạnh sang trái: xóa luôn
        if (effectiveDx < -140) {
          triggerDelete();
          return;
        }

        // Nếu vuốt qua ngưỡng -40: mở nút Xóa
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
      onDelete(item.id);
    });
  };

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

        {/* Nội dung hàng có thể vuốt trượt */}
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
                // NẾU LÀ TỪ KHÓA TÌM KIẾM: Tìm lại trên CÔNG CỤ TÌM KIẾM HIỆN TẠI (ví dụ: Yahoo) thay vì link cũ!
                if (query) {
                  onSubmit(query);
                } else {
                  onSubmit(item.url);
                }
              }
            }}
            activeOpacity={0.7}
          >
            <View style={styles.iconCircle}>
              <Feather name={query ? 'search' : 'clock'} size={17} color={subColor} />
            </View>

            <View style={styles.textContainer}>
              {highlightPrefix &&
              highlightPrefix.trim().length > 0 &&
              displayTitle.toLowerCase().startsWith(highlightPrefix.toLowerCase()) ? (
                <Text style={[styles.mainText, { color: textColor }]} numberOfLines={1}>
                  <Text style={{ fontWeight: '400' }}>
                    {displayTitle.slice(0, highlightPrefix.length)}
                  </Text>
                  <Text style={{ fontWeight: '700' }}>
                    {displayTitle.slice(highlightPrefix.length)}
                  </Text>
                </Text>
              ) : (
                <Text style={[styles.mainText, { color: textColor }]} numberOfLines={1}>
                  {displayTitle}
                </Text>
              )}
              {query ? (
                <Text style={[styles.subText, { color: subColor }]} numberOfLines={1}>
                  Tìm trên {currentEngineName}
                </Text>
              ) : item.title !== item.url ? (
                <Text style={[styles.subText, { color: subColor }]} numberOfLines={1}>
                  {item.url.replace(/^https?:\/\//i, '').replace(/\/$/, '')}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>

          {/* Nút xóa nhanh bằng cách chạm */}
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
            onPress={() => onUrlChange(displayTitle)}
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

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [enginePickerVisible, setEnginePickerVisible] = useState<boolean>(false);
  const [text, setText] = useState<string>(inputUrl);
  const [userTypedText, setUserTypedText] = useState<string>(inputUrl);
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const lastTypedLengthRef = useRef<number>(inputUrl.length);

  const getStorageKey = () =>
    userEmail ? `${STORAGE_HISTORY_KEY}_${userEmail.toLowerCase()}` : STORAGE_HISTORY_KEY;

  useEffect(() => {
    if (!isIncognito) {
      loadHistory();
      loadBookmarks();
    } else {
      setHistory([]);
      setBookmarks([]);
    }
  }, [isIncognito, userEmail]);

  useEffect(() => {
    setText(inputUrl);
  }, [inputUrl]);

  useEffect(() => {
    if (!text) {
      setUserTypedText('');
      lastTypedLengthRef.current = 0;
      setSelection(undefined);
    }
  }, [text]);

  const loadHistory = async () => {
    if (isIncognito) return;
    try {
      const stored = await AsyncStorage.getItem(getStorageKey());
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (e) {
      console.log('Error loading search history:', e);
    }
  };

  const loadBookmarks = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_BOOKMARKS_KEY);
      if (stored) {
        setBookmarks(JSON.parse(stored));
      } else {
        setBookmarks(DEFAULT_BOOKMARKS);
      }
    } catch (e) {
      setBookmarks(DEFAULT_BOOKMARKS);
    }
  };

  const handleDeleteItem = async (id: string) => {
    const updated = history.filter((item) => item.id !== id);
    setHistory(updated);
    await AsyncStorage.setItem(getStorageKey(), JSON.stringify(updated));
  };

  // Tìm từ khóa / URL khớp nhất từ lịch sử người dùng để làm gợi ý mờ phía sau (Ghost Text) và mục gợi ý trên cùng
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

    // 1. Quét từ khóa tìm kiếm (query) trong lịch sử trước
    for (const h of history) {
      const extractedQuery = extractSearchQuery(h.url);
      if (extractedQuery) {
        const cleanQuery = extractedQuery.trim();
        if (cleanQuery.toLowerCase().startsWith(lowerQ) && cleanQuery.length > q.length) {
          return {
            fullText: cleanQuery,
            suffix: cleanQuery.slice(q.length),
            isUrl: false,
          };
        }
      }
    }

    // 2. Quét tên miền trang web sạch từ lịch sử (history) và dấu trang (bookmarks)
    for (const h of history) {
      const cleanUrl = h.url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
      if (cleanUrl.toLowerCase().startsWith(lowerQ) && cleanUrl.length > q.length) {
        return {
          fullText: cleanUrl,
          suffix: cleanUrl.slice(q.length),
          isUrl: true,
          url: h.url,
          title: h.title,
        };
      }
    }

    for (const bm of bookmarks) {
      const cleanUrl = bm.url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
      if (cleanUrl.toLowerCase().startsWith(lowerQ) && cleanUrl.length > q.length) {
        return {
          fullText: cleanUrl,
          suffix: cleanUrl.slice(q.length),
          isUrl: true,
          url: bm.url,
          title: bm.title,
        };
      }
    }

    return null;
  }, [history, bookmarks, text, isIncognito]);

  const ghostSuffix = ghostMatch?.suffix || '';

  // Gợi ý tìm kiếm: CHỈ gợi ý các từ khóa và nội dung mà người dùng ĐÃ TÌM TRONG LỊCH SỬ trước đó
  const historySearchSuggestions = useMemo(() => {
    if (isIncognito) return [];
    const q = text.trim();
    if (!q) return [];
    const lowerQ = q.toLowerCase();

    const seen = new Set<string>();
    if (ghostMatch) {
      seen.add(ghostMatch.fullText.toLowerCase());
    }

    const list: { text: string; isSearchQuery: boolean; url?: string; title?: string }[] = [];

    // 1. Quét tìm các từ khóa tìm kiếm (search queries) mà người dùng từng tìm trước đây trong lịch sử
    for (const item of history) {
      const extractedQuery = extractSearchQuery(item.url);
      if (extractedQuery) {
        const clean = extractedQuery.trim();
        const lower = clean.toLowerCase();
        if (lower.includes(lowerQ) && !seen.has(lower)) {
          seen.add(lower);
          list.push({ text: clean, isSearchQuery: true });
        }
      }
    }

    // 2. Quét tìm tiêu đề trang web đã từng truy cập trong lịch sử khớp với từ khóa
    for (const item of history) {
      if (item.title) {
        const cleanTitle = item.title.trim();
        const lowerTitle = cleanTitle.toLowerCase();
        if (!cleanTitle.startsWith('http') && lowerTitle.includes(lowerQ) && !seen.has(lowerTitle)) {
          seen.add(lowerTitle);
          list.push({ text: cleanTitle, isSearchQuery: false, url: item.url, title: cleanTitle });
        }
      }
      const cleanUrl = item.url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
      const lowerUrl = cleanUrl.toLowerCase();
      if (lowerUrl.includes(lowerQ) && !seen.has(lowerUrl)) {
        seen.add(lowerUrl);
        list.push({ text: cleanUrl, isSearchQuery: false, url: item.url, title: item.title });
      }
    }

    // Ưu tiên hiển thị: các từ khóa bắt đầu bằng chuỗi người dùng gõ trước (startsWith), rồi đến chứa (includes)
    return list.sort((a, b) => {
      const aStarts = a.text.toLowerCase().startsWith(lowerQ);
      const bStarts = b.text.toLowerCase().startsWith(lowerQ);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.text.length - b.text.length;
    }).slice(0, 5);
  }, [history, text, isIncognito, ghostMatch]);

  // Debounce đẩy URL về App.tsx để tránh re-render toàn bộ ứng dụng mỗi ký tự gõ gây đơ/lag
  const debounceUrlChangeRef = useRef<any>(null);

  // Khi người dùng gõ phím: CHỈ cập nhật nội dung gõ, TUYỆT ĐỐI KHÔNG tự động fill chèn chữ vào ô nhập
  const handleTextChange = (newText: string) => {
    setText(newText);
    setUserTypedText(newText);
    setSelection(undefined);

    if (onUrlChange) {
      if (debounceUrlChangeRef.current) {
        clearTimeout(debounceUrlChangeRef.current);
      }
      debounceUrlChangeRef.current = setTimeout(() => {
        onUrlChange(newText);
      }, 350);
    }
  };

  const filterQuery = text.trim();

  // Lọc lịch sử theo nội dung đang nhập (lọc theo nội dung người dùng thực tế gõ)
  const filteredHistory = filterQuery
    ? history.filter((h) => {
        const q = extractSearchQuery(h.url);
        const titleToMatch = q || h.title;
        return (
          titleToMatch.toLowerCase().includes(filterQuery.toLowerCase()) ||
          h.url.toLowerCase().includes(filterQuery.toLowerCase())
        );
      })
    : history;

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
            {/* Lớp hiển thị gợi ý mờ phía sau con trỏ (Ghost Suggestion Overlay - chỉ hiển thị chữ mờ khi đang có nội dung gõ) */}
            {ghostSuffix && text.trim().length > 0 ? (
              <View pointerEvents="none" style={styles.ghostTextContainer}>
                <Text style={styles.ghostBaseText} numberOfLines={1}>
                  {text}
                </Text>
                <Text
                  style={[
                    styles.ghostSuffixText,
                    { color: isIncognito ? '#6b7280' : '#a1a1aa' },
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {ghostSuffix}
                </Text>
              </View>
            ) : null}

            <TextInput
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
                const target = ghostMatch?.fullText || (ghostSuffix ? `${text.trim()}${ghostSuffix}` : text);
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
                <Feather
                  name="bookmark"
                  size={18}
                  color={isBookmarked ? '#007aff' : subColor}
                />
              </TouchableOpacity>
            )}

            {text.length > 0 && (
              <TouchableOpacity
                style={styles.pillActionBtn}
                onPress={() => {
                  setText('');
                  setUserTypedText('');
                  lastTypedLengthRef.current = 0;
                  setSelection(undefined);
                  onUrlChange('');
                }}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <Feather name="x-circle" size={16} color={subColor} />
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

      {/* DANH SÁCH LỊCH SỬ DUYỆT WEB / GỢI Ý */}
      <ScrollView
        style={styles.historyScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Nếu người dùng đang gõ:
            Dòng 1: Hiện đầy đủ mục gợi ý khớp với ghost text (để người dùng bấm vào luôn như Chrome) HOẶC Đi tới https://...com
            Dòng 2: Tìm "<inputUrl>" trên Google (được đưa xuống dưới Đi tới theo yêu cầu)
        */}
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
              /* Nếu không có ghost match nhưng người dùng gõ tên miền (như vidsnaps, google, fb): ĐƯA "ĐI TỚI" LÊN TRÊN "TÌM" */
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

            {/* DÒNG 2: TÌM TRÊN GOOGLE (NẰM DƯỚI ĐI TỚI THEO ĐÚNG YÊU CẦU CỦA USER) */}
            <TouchableOpacity
              style={[styles.historyRow, { borderBottomColor: borderCol }]}
              onPress={() => onSubmit(text.trim())}
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

        {/* Các gợi ý tìm kiếm từ LỊCH SỬ đã tìm trước đây */}
        {!isIncognito &&
          historySearchSuggestions.length > 0 &&
          historySearchSuggestions.map((sug, idx) => {
            const prefixLen = filterQuery.length;
            const startsWithQuery = sug.text.toLowerCase().startsWith(filterQuery.toLowerCase());
            const prefixPart = startsWithQuery ? sug.text.slice(0, prefixLen) : '';
            const restPart = startsWithQuery ? sug.text.slice(prefixLen) : sug.text;

            return (
              <View
                key={`hist-sug-${idx}`}
                style={[styles.swipeContainer, { borderBottomColor: borderCol }]}
              >
                <View style={[styles.historyRowInner, { backgroundColor: bg }]}>
                  <TouchableOpacity
                    style={styles.historyRowContent}
                    onPress={() => onSubmit(sug.text)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.iconCircle}>
                      <Feather name={sug.isSearchQuery ? 'search' : 'clock'} size={17} color={subColor} />
                    </View>
                    <View style={styles.textContainer}>
                      <Text style={[styles.mainText, { color: textColor }]} numberOfLines={1}>
                        {startsWithQuery ? (
                          <>
                            <Text style={{ fontWeight: '400' }}>{prefixPart}</Text>
                            <Text style={{ fontWeight: '700' }}>{restPart}</Text>
                          </>
                        ) : (
                          sug.text
                        )}
                      </Text>
                      <Text style={[styles.subText, { color: subColor }]} numberOfLines={1}>
                        {sug.isSearchQuery ? 'Lịch sử tìm kiếm' : 'Trang đã truy cập'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Nút mũi tên ↗ điền vào ô tìm kiếm */}
                  <TouchableOpacity
                    style={styles.arrowBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    onPress={() => {
                      setText(sug.text);
                      setUserTypedText(sug.text);
                      lastTypedLengthRef.current = sug.text.length;
                      setSelection(undefined);
                      onUrlChange(sug.text);
                    }}
                  >
                    <Feather name="arrow-up-right" size={20} color="#007aff" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

        {/* Danh sách các mục lịch sử gần đây (CHỈ HIỂN THỊ KHI KHÔNG PHẢI ẨN DANH) */}
        {!isIncognito && filteredHistory.length > 0 && (
          <View style={styles.historySectionHeader}>
            <Text style={[styles.historySectionTitle, { color: subColor }]}>GẦN ĐÂY</Text>
          </View>
        )}

        {!isIncognito &&
          filteredHistory.map((item) => {
            const query = extractSearchQuery(item.url);
            const displayTitle = query || item.title;

            return (
              <SwipeableHistoryRow
                key={item.id}
                item={item}
                displayTitle={displayTitle}
                query={query}
                textColor={textColor}
                subColor={subColor}
                borderCol={borderCol}
                bgColor={bg}
                currentEngineName={currentEngineName}
                onSubmit={onSubmit}
                onUrlChange={(selectedText) => {
                  setText(selectedText);
                  setUserTypedText(selectedText);
                  lastTypedLengthRef.current = selectedText.length;
                  setSelection(undefined);
                  onUrlChange(selectedText);
                }}
                onDelete={handleDeleteItem}
                highlightPrefix={filterQuery}
              />
            );
          })}

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
