import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  Share,
  Image,
  Switch,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SEARCH_ENGINES } from '../constants/searchEngines';

interface BrowserMenuSheetProps {
  visible: boolean;
  onClose: () => void;
  currentUrl?: string | null;
  currentTitle?: string | null;
  currentEngineId?: string;
  onChangeEngine?: (engineId: 'google' | 'bing' | 'duckduckgo' | 'yahoo') => void;
  isDesktop?: boolean;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  onToggleDesktop?: () => void;
  onReload?: () => void;
  onOpenSearchScreenLens?: () => void;
  onFindInPage?: () => void;
  onOpenDownloads: () => void;
  onOpenPasswordManager: () => void;
  onOpenExtensions: () => void;
  onOpenBookmarks: () => void;
  onOpenHistory: () => void;
  onNewTab: () => void;
  onNewIncognitoTab: () => void;
  onOpenShield: () => void;
  isReaderMode?: boolean;
  onToggleReaderMode?: () => void;
  isKeepAwakeActive?: boolean;
  onToggleKeepAwake?: () => void;
  isDataSaverActive?: boolean;
  onToggleDataSaver?: () => void;
}

export const BrowserMenuSheet: React.FC<BrowserMenuSheetProps> = ({
  visible,
  onClose,
  currentUrl,
  currentTitle,
  currentEngineId = 'google',
  onChangeEngine,
  isDesktop,
  isBookmarked,
  onToggleBookmark,
  onToggleDesktop,
  onReload,
  onOpenSearchScreenLens,
  onFindInPage,
  onOpenDownloads,
  onOpenPasswordManager,
  onOpenExtensions,
  onOpenBookmarks,
  onOpenHistory,
  onNewTab,
  onNewIncognitoTab,
  onOpenShield,
  isReaderMode,
  onToggleReaderMode,
  isKeepAwakeActive,
  onToggleKeepAwake,
  isDataSaverActive,
  onToggleDataSaver,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 16);
  const [engineModalVisible, setEngineModalVisible] = useState(false);

  const handleShare = async () => {
    if (!currentUrl) return;
    try {
      await Share.share({
        url: currentUrl,
        message: currentTitle ? `${currentTitle} - ${currentUrl}` : currentUrl,
      });
    } catch (e) {}
  };

  const getDisplayDomain = (url?: string | null) => {
    if (!url) return '';
    try {
      const match = url.match(/^(?:https?:\/\/)?(?:www\.)?([^\/\?#]+)/i);
      return match ? match[1] : url;
    } catch {
      return url;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={[styles.sheetContainer, { paddingBottom: bottomInset }]}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Thanh kéo Sheet */}
          <View style={styles.dragHandle} />

          {/* Tiêu đề trang web hiện tại */}
          {currentUrl ? (
            <View style={styles.siteHeader}>
              <Text style={styles.siteTitle} numberOfLines={1}>
                {currentTitle || getDisplayDomain(currentUrl)}
              </Text>
              <Text style={styles.siteDomain} numberOfLines={1}>
                {getDisplayDomain(currentUrl)}
              </Text>
            </View>
          ) : null}

          {/* Hàng 4 nút thao tác nhanh trên cùng */}
          <View style={styles.quickActionsBar}>
            {/* Tải lại */}
            <TouchableOpacity
              style={styles.quickActionItem}
              onPress={() => {
                onClose();
                if (onReload) onReload();
              }}
              activeOpacity={0.7}
            >
              <View style={styles.quickActionIconBox}>
                <Feather name="rotate-cw" size={18} color="#09090b" />
              </View>
              <Text style={styles.quickActionLabel}>Tải lại</Text>
            </TouchableOpacity>

            {/* Dấu trang */}
            <TouchableOpacity
              style={styles.quickActionItem}
              onPress={() => {
                onClose();
                if (onToggleBookmark) onToggleBookmark();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.quickActionIconBox, isBookmarked && { backgroundColor: '#eff6ff' }]}>
                <Feather
                  name="bookmark"
                  size={18}
                  color={isBookmarked ? '#007aff' : '#09090b'}
                />
              </View>
              <Text style={[styles.quickActionLabel, isBookmarked && { color: '#007aff' }]}>
                {isBookmarked ? 'Đã lưu' : 'Dấu trang'}
              </Text>
            </TouchableOpacity>

            {/* Chia sẻ */}
            <TouchableOpacity
              style={styles.quickActionItem}
              onPress={() => {
                onClose();
                handleShare();
              }}
              activeOpacity={0.7}
            >
              <View style={styles.quickActionIconBox}>
                <Feather name="share-2" size={18} color="#09090b" />
              </View>
              <Text style={styles.quickActionLabel}>Chia sẻ</Text>
            </TouchableOpacity>

            {/* Chế độ Desktop */}
            <TouchableOpacity
              style={styles.quickActionItem}
              onPress={() => {
                onClose();
                if (onToggleDesktop) onToggleDesktop();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.quickActionIconBox, isDesktop && { backgroundColor: '#eff6ff' }]}>
                <Feather
                  name="monitor"
                  size={18}
                  color={isDesktop ? '#007aff' : '#09090b'}
                />
              </View>
              <Text style={[styles.quickActionLabel, isDesktop && { color: '#007aff' }]}>
                {isDesktop ? 'Máy tính' : 'Di động'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Danh sách các tính năng được gom vào 1 Container duy nhất */}
          <ScrollView
            style={styles.menuScroll}
            contentContainerStyle={styles.menuScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.menuGroupCard}>
              {/* 1. TÌM TRONG TRANG (Ctrl + F) */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  onClose();
                  if (onFindInPage) {
                    onFindInPage();
                  } else if (onOpenSearchScreenLens) {
                    onOpenSearchScreenLens();
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={styles.menuTextContainer}>
                  <Text style={styles.menuTitle}>Tìm trong trang</Text>
                  <Text style={styles.menuSubtitle}>Tìm kiếm từ khóa trên trang web (Ctrl + F)</Text>
                </View>
                <Feather name="search" size={20} color="#27272a" />
              </TouchableOpacity>

              <View style={styles.horizontalDivider} />

              {/* 2. CHẾ ĐỘ ĐỌC BÁO (READER MODE) */}
              {onToggleReaderMode && (
                <>
                  <View style={styles.menuRow}>
                    <View style={styles.menuTextContainer}>
                      <Text style={styles.menuTitle}>Chế độ đọc báo (Reader Mode)</Text>
                      <Text style={styles.menuSubtitle}>Bóc tách nội dung chính, đọc sạch không mỏi mắt</Text>
                    </View>
                    <Switch
                      value={!!isReaderMode}
                      onValueChange={onToggleReaderMode}
                      trackColor={{ false: '#d1d5db', true: '#007aff' }}
                      ios_backgroundColor="#d1d5db"
                      thumbColor="#ffffff"
                    />
                  </View>
                  <View style={styles.horizontalDivider} />
                </>
              )}

              {/* 3. GIỮ MÀN HÌNH LUÔN SÁNG */}
              {onToggleKeepAwake && (
                <>
                  <View style={styles.menuRow}>
                    <View style={styles.menuTextContainer}>
                      <Text style={styles.menuTitle}>Giữ màn hình luôn sáng</Text>
                      <Text style={styles.menuSubtitle}>Không tắt màn hình khi xem phim & lướt web</Text>
                    </View>
                    <Switch
                      value={!!isKeepAwakeActive}
                      onValueChange={onToggleKeepAwake}
                      trackColor={{ false: '#d1d5db', true: '#007aff' }}
                      ios_backgroundColor="#d1d5db"
                      thumbColor="#ffffff"
                    />
                  </View>
                  <View style={styles.horizontalDivider} />
                </>
              )}

              {/* 4. TIẾT KIỆM DỮ LIỆU */}
              {onToggleDataSaver && (
                <>
                  <View style={styles.menuRow}>
                    <View style={styles.menuTextContainer}>
                      <Text style={styles.menuTitle}>Tiết kiệm dữ liệu</Text>
                      <Text style={styles.menuSubtitle}>Tối ưu gói cước di động 4G/5G giới hạn dung lượng</Text>
                    </View>
                    <Switch
                      value={!!isDataSaverActive}
                      onValueChange={onToggleDataSaver}
                      trackColor={{ false: '#d1d5db', true: '#007aff' }}
                      ios_backgroundColor="#d1d5db"
                      thumbColor="#ffffff"
                    />
                  </View>
                  <View style={styles.horizontalDivider} />
                </>
              )}

              {/* 5. TỆP ĐÃ TẢI XUỐNG */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  onClose();
                  onOpenDownloads();
                }}
                activeOpacity={0.7}
              >
                <View style={styles.menuTextContainer}>
                  <Text style={styles.menuTitle}>Tệp đã tải xuống</Text>
                  <Text style={styles.menuSubtitle}>Mở thư mục Kite trong ứng dụng Tệp</Text>
                </View>
                <Feather name="download" size={20} color="#27272a" />
              </TouchableOpacity>

              <View style={styles.horizontalDivider} />

              {/* 6. TRÌNH QUẢN LÝ MẬT KHẨU */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  onClose();
                  onOpenPasswordManager();
                }}
                activeOpacity={0.7}
              >
                <View style={styles.menuTextContainer}>
                  <Text style={styles.menuTitle}>Trình quản lý mật khẩu</Text>
                  <Text style={styles.menuSubtitle}>Quản lý tài khoản & mật khẩu an toàn (Keychain)</Text>
                </View>
                <Feather name="key" size={20} color="#27272a" />
              </TouchableOpacity>

              <View style={styles.horizontalDivider} />

              {/* 7. TIỆN ÍCH MỞ RỘNG (EXTENSIONS) */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  onClose();
                  onOpenExtensions();
                }}
                activeOpacity={0.7}
              >
                <View style={styles.menuTextContainer}>
                  <Text style={styles.menuTitle}>Tiện ích mở rộng (Extensions)</Text>
                  <Text style={styles.menuSubtitle}>Nhập script .js, chặn quảng cáo & tùy biến web</Text>
                </View>
                <Feather name="box" size={20} color="#27272a" />
              </TouchableOpacity>

              <View style={styles.horizontalDivider} />

              {/* 8. DẤU TRANG */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  onClose();
                  onOpenBookmarks();
                }}
                activeOpacity={0.7}
              >
                <View style={styles.menuTextContainer}>
                  <Text style={styles.menuTitle}>Dấu trang</Text>
                  <Text style={styles.menuSubtitle}>Các trang web bạn đã đánh dấu lưu lại</Text>
                </View>
                <Feather name="bookmark" size={20} color="#27272a" />
              </TouchableOpacity>

              <View style={styles.horizontalDivider} />

              {/* 9. LỊCH SỬ DUYỆT WEB */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  onClose();
                  onOpenHistory();
                }}
                activeOpacity={0.7}
              >
                <View style={styles.menuTextContainer}>
                  <Text style={styles.menuTitle}>Lịch sử duyệt web</Text>
                  <Text style={styles.menuSubtitle}>Tìm lại các trang web bạn đã truy cập gần đây</Text>
                </View>
                <Feather name="clock" size={20} color="#27272a" />
              </TouchableOpacity>

              <View style={styles.horizontalDivider} />

              {/* 10. KHIÊN KITE SHIELD */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  onClose();
                  onOpenShield();
                }}
                activeOpacity={0.7}
              >
                <View style={styles.menuTextContainer}>
                  <Text style={styles.menuTitle}>Khiên Kite Shield & Chặn quảng cáo</Text>
                  <Text style={styles.menuSubtitle}>Tùy chỉnh chặn pop-up, chống cướp tab</Text>
                </View>
                <Feather name="shield" size={20} color="#27272a" />
              </TouchableOpacity>

              <View style={styles.horizontalDivider} />

              {/* 11. CÔNG CỤ TÌM KIẾM MẶC ĐỊNH */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  setEngineModalVisible(true);
                }}
                activeOpacity={0.7}
              >
                <View style={styles.menuTextContainer}>
                  <Text style={styles.menuTitle}>Công cụ tìm kiếm</Text>
                  <Text style={styles.menuSubtitle}>Google, Yahoo, Bing hoặc DuckDuckGo</Text>
                </View>
                <View style={styles.engineRightGroup}>
                  <View style={styles.engineBadge}>
                    <Text style={styles.engineBadgeText}>
                      {SEARCH_ENGINES[currentEngineId]?.name || 'Google'}
                    </Text>
                  </View>
                  <Feather name="compass" size={20} color="#27272a" />
                </View>
              </TouchableOpacity>

              <View style={styles.horizontalDivider} />

              {/* 12. THẺ MỚI */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  onClose();
                  onNewTab();
                }}
                activeOpacity={0.7}
              >
                <View style={styles.menuTextContainer}>
                  <Text style={styles.menuTitle}>Thẻ mới</Text>
                  <Text style={styles.menuSubtitle}>Mở một thẻ duyệt web mới</Text>
                </View>
                <Feather name="plus-circle" size={20} color="#27272a" />
              </TouchableOpacity>

              <View style={styles.horizontalDivider} />

              {/* 13. THẺ ẨN DANH MỚI */}
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  onClose();
                  onNewIncognitoTab();
                }}
                activeOpacity={0.7}
              >
                <View style={styles.menuTextContainer}>
                  <Text style={styles.menuTitle}>Thẻ ẩn danh mới</Text>
                  <Text style={styles.menuSubtitle}>Duyệt web riêng tư không lưu lịch sử</Text>
                </View>
                <Feather name="eye-off" size={20} color="#27272a" />
              </TouchableOpacity>
            </View>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Modal chọn công cụ tìm kiếm */}
      <Modal
        visible={engineModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEngineModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.engineBackdrop}
          activeOpacity={1}
          onPress={() => setEngineModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.engineCard}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.engineModalTitle}>Chọn công cụ tìm kiếm mặc định</Text>
            <View style={{ gap: 10 }}>
              {Object.values(SEARCH_ENGINES).map((eng) => {
                const isSelected = eng.id === currentEngineId;
                return (
                  <TouchableOpacity
                    key={eng.id}
                    style={[styles.engineChoiceRow, isSelected && styles.engineChoiceSelected]}
                    onPress={() => {
                      if (onChangeEngine) {
                        onChangeEngine(eng.id as any);
                      }
                      setEngineModalVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Image
                      source={{ uri: eng.logoUrl }}
                      style={styles.enginePickerLogo}
                      resizeMode="contain"
                    />
                    <Text style={[styles.engineChoiceName, isSelected && styles.engineChoiceNameActive]}>
                      {eng.name}
                    </Text>
                    {isSelected && <Feather name="check" size={18} color="#007aff" />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: '86%',
    paddingHorizontal: 16,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  dragHandle: {
    width: 38,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: '#d4d4d8',
    alignSelf: 'center',
    marginBottom: 12,
  },
  siteHeader: {
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 10,
  },
  siteTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#09090b',
    textAlign: 'center',
  },
  siteDomain: {
    fontSize: 12,
    color: '#71717a',
    marginTop: 2,
  },
  quickActionsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f4f4f5',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginBottom: 14,
  },
  quickActionItem: {
    flex: 1,
    alignItems: 'center',
  },
  quickActionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  quickActionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#52525b',
  },
  menuScroll: {
    maxHeight: 450,
  },
  menuScrollContent: {
    paddingBottom: 16,
  },
  menuGroupCard: {
    backgroundColor: '#f4f4f5',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e4e4e7',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  menuTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  menuTitle: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#18181b',
  },
  menuSubtitle: {
    fontSize: 12,
    color: '#71717a',
    marginTop: 2,
    lineHeight: 16,
  },
  horizontalDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e4e4e7',
    marginLeft: 16,
  },
  engineRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  engineBadge: {
    backgroundColor: '#e4e4e7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  engineBadgeText: {
    color: '#18181b',
    fontSize: 11,
    fontWeight: '600',
  },
  engineBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  engineCard: {
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
  engineModalTitle: {
    fontSize: 16.5,
    fontWeight: '700',
    color: '#1f1f1f',
    marginBottom: 16,
    textAlign: 'center',
  },
  engineChoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f8fafd',
    borderWidth: 1,
    borderColor: '#e8eaed',
  },
  engineChoiceSelected: {
    borderColor: '#007aff',
    backgroundColor: '#eff6ff',
  },
  enginePickerLogo: {
    width: 28,
    height: 28,
    marginRight: 12,
  },
  engineChoiceName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  engineChoiceNameActive: {
    color: '#007aff',
    fontWeight: '600',
  },
});
