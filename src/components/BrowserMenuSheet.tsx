import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  Share,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface BrowserMenuSheetProps {
  visible: boolean;
  onClose: () => void;
  currentUrl?: string | null;
  currentTitle?: string | null;
  isDesktop?: boolean;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  onToggleDesktop?: () => void;
  onReload?: () => void;
  onOpenSearchScreenLens: () => void;
  onOpenDownloads: () => void;
  onOpenPasswordManager: () => void;
  onOpenBookmarks: () => void;
  onOpenHistory: () => void;
  onNewTab: () => void;
  onNewIncognitoTab: () => void;
  onOpenShield: () => void;
}

export const BrowserMenuSheet: React.FC<BrowserMenuSheetProps> = ({
  visible,
  onClose,
  currentUrl,
  currentTitle,
  isDesktop,
  isBookmarked,
  onToggleBookmark,
  onToggleDesktop,
  onReload,
  onOpenSearchScreenLens,
  onOpenDownloads,
  onOpenPasswordManager,
  onOpenBookmarks,
  onOpenHistory,
  onNewTab,
  onNewIncognitoTab,
  onOpenShield,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 16);

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
          {/* Thanh kéo */}
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

          <View style={styles.divider} />

          {/* Danh sách các tính năng tiện ích */}
          <ScrollView style={styles.menuScroll} showsVerticalScrollIndicator={false}>
            {/* 1. TÌM KIẾM TRÊN MÀN HÌNH BẰNG GOOGLE ỐNG KÍNH */}
            <TouchableOpacity
              style={[styles.menuRow, styles.featuredRow]}
              onPress={() => {
                onClose();
                onOpenSearchScreenLens();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconCircle, { backgroundColor: '#e0f2fe' }]}>
                <Feather name="maximize" size={18} color="#0284c7" />
              </View>
              <View style={styles.menuTextContainer}>
                <View style={styles.badgeTitleRow}>
                  <Text style={[styles.menuTitle, { color: '#0284c7' }]}>
                    Tìm kiếm trên màn hình bằng Google Ống kính
                  </Text>
                  <View style={styles.lensBadge}>
                    <Text style={styles.lensBadgeText}>Ống kính</Text>
                  </View>
                </View>
                <Text style={styles.menuSubtitle}>
                  Chụp ảnh màn hình & tìm kiếm tức thì với Google Lens
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color="#0284c7" />
            </TouchableOpacity>

            {/* 2. TỆP ĐÃ TẢI XUỐNG */}
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                onClose();
                onOpenDownloads();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconCircle, { backgroundColor: '#eef2ff' }]}>
                <Feather name="download" size={18} color="#4f46e5" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuTitle}>Tệp đã tải xuống</Text>
                <Text style={styles.menuSubtitle}>Xem danh sách tài liệu, hình ảnh đã tải</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#a1a1aa" />
            </TouchableOpacity>

            {/* 3. TRÌNH QUẢN LÝ MẬT KHẨU */}
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                onClose();
                onOpenPasswordManager();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconCircle, { backgroundColor: '#f0fdf4' }]}>
                <Feather name="key" size={18} color="#16a34a" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuTitle}>Trình quản lý mật khẩu</Text>
                <Text style={styles.menuSubtitle}>Quản lý tài khoản & sao chép mật khẩu an toàn</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#a1a1aa" />
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* 4. DẤU TRANG */}
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                onClose();
                onOpenBookmarks();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconCircle, { backgroundColor: '#fffbeb' }]}>
                <Feather name="bookmark" size={18} color="#d97706" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuTitle}>Dấu trang</Text>
                <Text style={styles.menuSubtitle}>Các trang web bạn đã đánh dấu lưu lại</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#a1a1aa" />
            </TouchableOpacity>

            {/* 5. LỊCH SỬ DUYỆT WEB */}
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                onClose();
                onOpenHistory();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconCircle, { backgroundColor: '#f5f3ff' }]}>
                <Feather name="clock" size={18} color="#7c3aed" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuTitle}>Lịch sử duyệt web</Text>
                <Text style={styles.menuSubtitle}>Tìm lại các trang web bạn đã truy cập gần đây</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#a1a1aa" />
            </TouchableOpacity>

            {/* 6. THẺ MỚI & THẺ ẨN DANH */}
            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                onClose();
                onNewTab();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconCircle, { backgroundColor: '#f4f4f5' }]}>
                <Feather name="plus-circle" size={18} color="#09090b" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuTitle}>Thẻ mới</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#a1a1aa" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                onClose();
                onNewIncognitoTab();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconCircle, { backgroundColor: '#27272a' }]}>
                <Feather name="eye-off" size={18} color="#ffffff" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuTitle}>Thẻ ẩn danh mới</Text>
                <Text style={styles.menuSubtitle}>Duyệt web riêng tư không lưu lịch sử</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#a1a1aa" />
            </TouchableOpacity>

            {/* 7. KHIÊN KITE SHIELD */}
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                onClose();
                onOpenShield();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconCircle, { backgroundColor: '#ecfdf5' }]}>
                <Feather name="shield" size={18} color="#059669" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuTitle}>Khiên Kite Shield & Chặn quảng cáo</Text>
                <Text style={styles.menuSubtitle}>Tùy chỉnh chặn pop-up, tiết kiệm dữ liệu</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#a1a1aa" />
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
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
    maxHeight: '85%',
    paddingHorizontal: 20,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 10,
  },
  dragHandle: {
    width: 38,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#d4d4d8',
    alignSelf: 'center',
    marginBottom: 12,
  },
  siteHeader: {
    alignItems: 'center',
    paddingBottom: 10,
  },
  siteTitle: {
    fontSize: 14,
    fontWeight: '600',
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
    justifyContent: 'space-around',
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    marginBottom: 12,
  },
  quickActionItem: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  quickActionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  quickActionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#52525b',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e4e4e7',
    marginVertical: 6,
  },
  menuScroll: {
    maxHeight: 450,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 6,
    borderRadius: 14,
  },
  featuredRow: {
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 10,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  menuIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  badgeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  lensBadge: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  lensBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#09090b',
  },
  menuSubtitle: {
    fontSize: 12,
    color: '#71717a',
    marginTop: 2,
  },
});
