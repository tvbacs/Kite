import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  Keyboard,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { STORAGE_HISTORY_KEY, HistoryItem } from './HistorySheet';

interface SearchOverlayProps {
  inputUrl: string;
  onUrlChange: (text: string) => void;
  onSubmit: (url: string) => void;
  onCancel: () => void;
  onSearchByImage: () => void;
  onScanQr?: () => void;
  currentEngineName: string;
  isIncognito: boolean;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({
  inputUrl,
  onUrlChange,
  onSubmit,
  onCancel,
  onSearchByImage,
  onScanQr,
  currentEngineName,
  isIncognito,
  isBookmarked,
  onToggleBookmark,
}) => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 47 : 24);

  const [history, setHistory] = useState<HistoryItem[]>([]);

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

  const handleClearHistory = async () => {
    setHistory([]);
    await AsyncStorage.removeItem(STORAGE_HISTORY_KEY);
  };

  const handleDeleteItem = async (id: string) => {
    const updated = history.filter((item) => item.id !== id);
    setHistory(updated);
    await AsyncStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(updated));
  };

  // Lọc lịch sử theo nội dung đang nhập
  const filteredHistory = inputUrl.trim()
    ? history.filter(
        (h) =>
          h.title.toLowerCase().includes(inputUrl.toLowerCase()) ||
          h.url.toLowerCase().includes(inputUrl.toLowerCase())
      )
    : history;

  const bg = isIncognito ? '#202124' : '#ffffff';
  const pillBg = isIncognito ? '#2d2f31' : '#f4f4f5';
  const textColor = isIncognito ? '#e8eaed' : '#09090b';
  const subColor = isIncognito ? '#9aa0a6' : '#71717a';
  const borderCol = isIncognito ? 'rgba(255,255,255,0.08)' : '#f4f4f5';

  return (
    <View style={[styles.container, { backgroundColor: bg, paddingTop: topInset }]}>
      {/* THANH TÌM KIẾM TRÊN CÙNG KÈM NÚT 'HỦY' */}
      <View style={styles.topSearchHeader}>
        <View style={[styles.searchPill, { backgroundColor: pillBg }]}>
          <Feather name="search" size={17} color={subColor} style={styles.searchIcon} />

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
          <TouchableOpacity
            style={[styles.historyRow, { borderBottomColor: borderCol }]}
            onPress={() => onSubmit(inputUrl)}
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
        )}

        {/* Danh sách các mục lịch sử gần đây (CHỈ HIỂN THỊ KHI KHÔNG PHẢI ẨN DANH) */}
        {!isIncognito &&
          filteredHistory.map((item) => {
            // Trích xuất từ khóa tìm kiếm nếu là link Google
            let displayTitle = item.title;
            if (item.url.includes('google.com/search') && item.url.includes('q=')) {
              try {
                const urlObj = new URL(item.url);
                const q = urlObj.searchParams.get('q');
                if (q) displayTitle = decodeURIComponent(q);
              } catch (e) {}
            }

            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.historyRow, { borderBottomColor: borderCol }]}
                onPress={() => onSubmit(item.url)}
                activeOpacity={0.65}
              >
                <View style={styles.iconCircle}>
                  <Feather name="clock" size={18} color={subColor} />
                </View>

                <View style={styles.textContainer}>
                  <Text style={[styles.mainText, { color: textColor }]} numberOfLines={1}>
                    {displayTitle}
                  </Text>
                  {item.title !== item.url && !item.url.includes('google.com/search') && (
                    <Text style={[styles.subText, { color: subColor }]} numberOfLines={1}>
                      {item.url.replace(/^https?:\/\//i, '').replace(/\/$/, '')}
                    </Text>
                  )}
                </View>

                {/* Bấm vào mũi tên ↗ để điền từ khóa vào thanh tìm kiếm mà chưa duyệt ngay */}
                <TouchableOpacity
                  style={styles.arrowBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  onPress={() => onUrlChange(displayTitle)}
                >
                  <Feather name="arrow-up-right" size={20} color="#007aff" />
                </TouchableOpacity>
              </TouchableOpacity>
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
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 14,
              }}
            >
              <Feather name="eye-off" size={26} color="#9aa0a6" />
            </View>
            <Text style={[styles.emptyTitle, { color: textColor }]}>Chế độ ẩn danh</Text>
            <Text style={[styles.emptySub, { color: subColor }]}>
              Lịch sử tìm kiếm và các trang bạn truy cập sẽ không được lưu lại hay hiển thị tại đây.
            </Text>
          </View>
        )}

        {/* Trạng thái trống nếu chưa có lịch sử ở tab thường */}
        {!isIncognito && filteredHistory.length === 0 && inputUrl.trim().length === 0 && (
          <View style={styles.emptyContainer}>
            <Feather name="clock" size={36} color={subColor} style={{ marginBottom: 10 }} />
            <Text style={[styles.emptyTitle, { color: textColor }]}>Chưa có lịch sử tìm kiếm</Text>
            <Text style={[styles.emptySub, { color: subColor }]}>
              Các tìm kiếm và trang web bạn đã truy cập sẽ xuất hiện tại đây
            </Text>
          </View>
        )}

        {/* Nút Xoá lịch sử (Chỉ ở tab thường) */}
        {!isIncognito && history.length > 0 && inputUrl.trim().length === 0 && (
          <TouchableOpacity
            style={styles.clearHistoryBtn}
            onPress={handleClearHistory}
            activeOpacity={0.7}
          >
            <Text style={styles.clearHistoryText}>Xóa tất cả lịch sử tìm kiếm</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
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
    paddingVertical: 8,
    gap: 10,
  },
  searchPill: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  pillActionBtn: {
    padding: 4,
    marginLeft: 6,
  },
  cancelBtn: {
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007aff',
  },
  historyScroll: {
    flex: 1,
    paddingHorizontal: 14,
    marginTop: 6,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconCircle: {
    width: 32,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    marginRight: 12,
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
  clearHistoryBtn: {
    marginTop: 24,
    marginBottom: 40,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#fee2e2',
  },
  clearHistoryText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
});
