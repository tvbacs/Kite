import React, { useState, useEffect, useRef } from 'react';
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
              <Text style={[styles.mainText, { color: textColor }]} numberOfLines={1}>
                {displayTitle}
              </Text>
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
}) => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 47 : 24);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [enginePickerVisible, setEnginePickerVisible] = useState<boolean>(false);

  useEffect(() => {
    if (!isIncognito) {
      loadHistory();
    } else {
      setHistory([]);
    }
  }, [isIncognito]);

  const loadHistory = async () => {
    if (isIncognito) return;
    try {
      const stored = await AsyncStorage.getItem(STORAGE_HISTORY_KEY);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (e) {
      console.log('Error loading search history:', e);
    }
  };

  const handleDeleteItem = async (id: string) => {
    const updated = history.filter((item) => item.id !== id);
    setHistory(updated);
    await AsyncStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(updated));
  };

  // Lọc lịch sử theo nội dung đang nhập
  const filteredHistory = inputUrl.trim()
    ? history.filter((h) => {
        const q = extractSearchQuery(h.url);
        const titleToMatch = q || h.title;
        return (
          titleToMatch.toLowerCase().includes(inputUrl.toLowerCase()) ||
          h.url.toLowerCase().includes(inputUrl.toLowerCase())
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

          <TextInput
            style={[styles.input, { color: textColor }]}
            value={inputUrl}
            onChangeText={onUrlChange}
            placeholder={`Tìm trên ${currentEngineName} hoặc nhập URL`}
            placeholderTextColor={subColor}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={Platform.OS === 'ios' ? 'web-search' : 'default'}
            returnKeyType="search"
            onSubmitEditing={() => onSubmit(inputUrl)}
            selectTextOnFocus
          />

          {/* Nút lưu Dấu trang (Bookmark) ngay trên thanh URL */}
          {onToggleBookmark && inputUrl.trim().length > 0 && (
            <TouchableOpacity
              style={styles.pillActionBtn}
              onPress={onToggleBookmark}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather
                name="bookmark"
                size={18}
                color={isBookmarked ? '#007aff' : subColor}
              />
            </TouchableOpacity>
          )}

          {inputUrl.length > 0 && (
            <TouchableOpacity
              style={styles.pillActionBtn}
              onPress={() => onUrlChange('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="x-circle" size={16} color={subColor} />
            </TouchableOpacity>
          )}

          {/* Quét mã QR */}
          {!inputUrl && onScanQr && (
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
        {/* Nếu đang gõ, hiển thị gợi ý tìm kiếm trên công cụ tìm kiếm */}
        {inputUrl.trim().length > 0 && (
          <>
            <TouchableOpacity
              style={[styles.historyRow, { borderBottomColor: borderCol }]}
              onPress={() => onSubmit(inputUrl.trim())}
              activeOpacity={0.7}
            >
              <View style={styles.iconCircle}>
                <Feather name="search" size={18} color="#007aff" />
              </View>
              <View style={styles.textContainer}>
                <Text style={[styles.mainText, { color: '#007aff' }]} numberOfLines={1}>
                  Tìm "{inputUrl.trim()}" trên {currentEngineName}
                </Text>
              </View>
              <Feather name="arrow-up-right" size={20} color="#007aff" />
            </TouchableOpacity>

            {/* Gợi ý mở trang web trực tiếp nếu người dùng gõ tên miền thương hiệu không có đuôi (ví dụ: yahoo, youtube, facebook) */}
            {/^[a-zA-Z0-9-]{2,20}$/.test(inputUrl.trim()) && !inputUrl.includes('.') && (
              <TouchableOpacity
                style={[styles.historyRow, { borderBottomColor: borderCol }]}
                onPress={() => onSubmit(`https://${inputUrl.trim().toLowerCase()}.com`)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconCircle, { backgroundColor: '#eef2ff' }]}>
                  <Feather name="globe" size={16} color="#4f46e5" />
                </View>
                <View style={styles.textContainer}>
                  <Text style={[styles.mainText, { color: '#4f46e5' }]} numberOfLines={1}>
                    Đi tới https://{inputUrl.trim().toLowerCase()}.com
                  </Text>
                </View>
                <Feather name="arrow-up-right" size={20} color="#4f46e5" />
              </TouchableOpacity>
            )}
          </>
        )}

        {/* Danh sách các mục lịch sử gần đây (CHỈ HIỂN THỊ KHI KHÔNG PHẢI ẨN DANH) */}
        {!isIncognito && filteredHistory.length > 0 && (
          <View style={styles.historySectionHeader}>
            <Text style={[styles.historySectionTitle, { color: subColor }]}>GẦN ĐÂY</Text>
            <Text style={[styles.swipeHintText, { color: subColor }]}>Vuốt sang trái để xóa</Text>
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
                onUrlChange={onUrlChange}
                onDelete={handleDeleteItem}
              />
            );
          })}

        {/* Thông báo riêng trong chế độ Ẩn danh */}
        {isIncognito && inputUrl.trim().length === 0 && (
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
            style={styles.modalCard}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>Chọn công cụ tìm kiếm</Text>
            <View style={styles.engineGrid}>
              {Object.values(SEARCH_ENGINES).map((eng) => {
                const isSelected = eng.id === currentEngineId;
                return (
                  <TouchableOpacity
                    key={eng.id}
                    style={[styles.engineCardItem, isSelected && styles.engineCardSelected]}
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
                    <Text style={[styles.engineCardName, isSelected && styles.engineCardNameActive]}>
                      {eng.name}
                    </Text>
                    {isSelected && <Feather name="check" size={16} color="#007aff" />}
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
  input: {
    flex: 1,
    fontSize: 15,
    padding: 0,
    height: '100%',
  },
  pillActionBtn: {
    padding: 6,
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
    color: '#007aff',
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
  swipeHintText: {
    fontSize: 11,
    fontStyle: 'italic',
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
    backgroundColor: '#f8fafd',
    borderWidth: 1,
    borderColor: '#e8eaed',
  },
  engineCardSelected: {
    borderColor: '#007aff',
    backgroundColor: '#eff6ff',
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
    color: '#1f1f1f',
  },
  engineCardNameActive: {
    color: '#007aff',
    fontWeight: '600',
  },
});
