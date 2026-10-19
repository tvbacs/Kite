import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  Share,
  Platform,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { Paths, Directory, File } from 'expo-file-system';

export interface ImageContextData {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
}

interface ImageContextMenuSheetProps {
  visible: boolean;
  data: ImageContextData | null;
  onClose: () => void;
  onSearchWithLens: (imageUrl: string) => void;
  onOpenInNewTab: (imageUrl: string) => void;
  onShowToast: (message: string) => void;
}

export const ImageContextMenuSheet: React.FC<ImageContextMenuSheetProps> = ({
  visible,
  data,
  onClose,
  onSearchWithLens,
  onOpenInNewTab,
  onShowToast,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 16);

  if (!data) return null;

  const src = data.src;
  const isDataUri = src.startsWith('data:');
  const isBlobUri = src.startsWith('blob:');

  // 1. Sao chép liên kết hình ảnh
  const handleCopyLink = async () => {
    try {
      await Clipboard.setStringAsync(src);
      onShowToast('Đã sao chép liên kết hình ảnh');
    } catch {
      onShowToast('Không thể sao chép liên kết');
    }
    onClose();
  };

  // 2. Tải ảnh xuống Kite_Downloads
  const handleDownloadImage = async () => {
    try {
      onShowToast('Đang tải hình ảnh xuống...');
      const downloadsDir = new Directory(Paths.document, 'Kite_Downloads');
      if (!downloadsDir.exists) {
        try { downloadsDir.create(); } catch {}
      }

      const timestamp = Date.now();
      let ext = 'jpg';
      if (src.includes('.png')) ext = 'png';
      else if (src.includes('.webp')) ext = 'webp';
      else if (src.includes('.gif')) ext = 'gif';
      else if (src.includes('.svg')) ext = 'svg';

      const fileName = `image_${timestamp}.${ext}`;
      const destFile = new File(downloadsDir, fileName);

      if (isDataUri) {
        // Base64 data URI
        const commaIdx = src.indexOf(',');
        const base64Data = commaIdx !== -1 ? src.slice(commaIdx + 1) : src;
        await destFile.write(base64Data);
        onShowToast(`Đã lưu ảnh ${fileName} vào Kite_Downloads`);
      } else {
        // HTTP URL
        const downloadRes = await FileSystem.downloadAsync(src, destFile.uri);
        if (downloadRes.status === 200) {
          onShowToast(`Đã lưu ảnh ${fileName} vào Kite_Downloads`);
        } else {
          onShowToast('Tải ảnh không thành công');
        }
      }
    } catch (e) {
      onShowToast('Lỗi khi lưu ảnh về máy');
    }
    onClose();
  };

  // 3. Chia sẻ hình ảnh
  const handleShare = async () => {
    try {
      if (isDataUri) {
        onShowToast('Đang chuẩn bị chia sẻ ảnh...');
        const tmpFile = new File(Paths.cache, `share_${Date.now()}.jpg`);
        const commaIdx = src.indexOf(',');
        const base64Data = commaIdx !== -1 ? src.slice(commaIdx + 1) : src;
        await tmpFile.write(base64Data);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(tmpFile.uri);
        }
      } else {
        await Share.share({
          url: src,
          message: src,
        });
      }
    } catch {}
    onClose();
  };

  // 4. Tìm kiếm bằng Google Lens
  const handleSearchLens = () => {
    onClose();
    onSearchWithLens(src);
  };

  // 5. Mở trong thẻ mới
  const handleOpenNewTab = () => {
    onClose();
    onOpenInNewTab(src);
  };

  // Format kích thước ảnh
  const dimensionText = data.width && data.height ? `${data.width} × ${data.height}` : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={[styles.sheet, { paddingBottom: bottomInset }]}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Thanh kéo / Drag handle */}
          <View style={styles.dragHandle} />

          {/* Vùng xem trước ảnh thu nhỏ */}
          <View style={styles.previewCard}>
            <View style={styles.thumbWrapper}>
              <Image
                source={{ uri: src }}
                style={styles.thumbImage}
                resizeMode="cover"
              />
            </View>

            <View style={styles.infoWrapper}>
              <Text style={styles.imageTitle} numberOfLines={2}>
                {data.alt || 'Hình ảnh từ trang web'}
              </Text>
              <View style={styles.metaRow}>
                {dimensionText && (
                  <Text style={styles.metaBadge}>{dimensionText}</Text>
                )}
                <Text style={styles.metaUrl} numberOfLines={1}>
                  {isDataUri ? 'Dữ liệu Base64' : src.replace(/^https?:\/\//i, '').split('/')[0]}
                </Text>
              </View>
            </View>
          </View>

          {/* Danh sách hành động phong cách Google Chrome */}
          <View style={styles.menuList}>
            {/* 1. Tìm bằng Google Lens */}
            <TouchableOpacity
              style={styles.menuItemPrimary}
              activeOpacity={0.7}
              onPress={handleSearchLens}
            >
              <View style={styles.lensIconBox}>
                <Feather name="search" size={17} color="#ffffff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuTextPrimary}>Tìm kiếm bằng Google Lens</Text>
                <Text style={styles.menuSubText}>Tìm vật thể, dịch chữ và hình ảnh tương tự</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#94a3b8" />
            </TouchableOpacity>

            {/* 2. Mở ảnh trong thẻ mới */}
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={handleOpenNewTab}
            >
              <View style={styles.itemIconBox}>
                <Feather name="external-link" size={18} color="#0f172a" />
              </View>
              <Text style={styles.menuText}>Mở hình ảnh trong thẻ mới</Text>
            </TouchableOpacity>

            {/* 3. Tải ảnh xuống */}
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={handleDownloadImage}
            >
              <View style={styles.itemIconBox}>
                <Feather name="download" size={18} color="#0f172a" />
              </View>
              <Text style={styles.menuText}>Lưu hình ảnh vào máy</Text>
            </TouchableOpacity>

            {/* 4. Sao chép liên kết */}
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={handleCopyLink}
            >
              <View style={styles.itemIconBox}>
                <Feather name="copy" size={18} color="#0f172a" />
              </View>
              <Text style={styles.menuText}>Sao chép liên kết hình ảnh</Text>
            </TouchableOpacity>

            {/* 5. Chia sẻ */}
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={handleShare}
            >
              <View style={styles.itemIconBox}>
                <Feather name="share-2" size={18} color="#0f172a" />
              </View>
              <Text style={styles.menuText}>Chia sẻ hình ảnh</Text>
            </TouchableOpacity>
          </View>

          {/* Nút Đóng */}
          <TouchableOpacity
            style={styles.closeButton}
            activeOpacity={0.7}
            onPress={onClose}
          >
            <Text style={styles.closeButtonText}>Đóng</Text>
          </TouchableOpacity>
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
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  dragHandle: {
    width: 38,
    height: 4.5,
    backgroundColor: '#cbd5e1',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 14,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  thumbWrapper: {
    width: 58,
    height: 58,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
    marginRight: 12,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  infoWrapper: {
    flex: 1,
  },
  imageTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    lineHeight: 18,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    marginRight: 8,
  },
  metaUrl: {
    fontSize: 11,
    color: '#94a3b8',
    flex: 1,
  },
  menuList: {
    marginBottom: 14,
  },
  menuItemPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  lensIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a73e8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuTextPrimary: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a73e8',
    marginBottom: 1,
  },
  menuSubText: {
    fontSize: 11,
    color: '#64748b',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  itemIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0f172a',
  },
  closeButton: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
});
