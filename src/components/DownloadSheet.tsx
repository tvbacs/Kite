import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  TextInput,
  Image,
  Linking,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';

export const STORAGE_DOWNLOADS_KEY = '@kite_downloads_list';

export interface DownloadedItem {
  id: string;
  fileName: string;
  uri: string;
  fileSize?: number;
  mimeType?: string;
  timestamp: number;
  sourceUrl?: string;
}

interface DownloadSheetProps {
  visible: boolean;
  onClose: () => void;
  onShowToast?: (message: string) => void;
}

export const DownloadSheet: React.FC<DownloadSheetProps> = ({
  visible,
  onClose,
  onShowToast,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 16);

  const [downloads, setDownloads] = useState<DownloadedItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'images' | 'docs' | 'media'>('all');

  useEffect(() => {
    if (visible) {
      loadDownloads();
      setSearchQuery('');
    }
  }, [visible]);

  const loadDownloads = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_DOWNLOADS_KEY);
      if (stored) {
        setDownloads(JSON.parse(stored));
      } else {
        setDownloads([]);
      }
    } catch (e) {
      console.log('Error loading downloads:', e);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return 'Không rõ dung lượng';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const formatDate = (timestamp: number) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const isToday =
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

      const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      if (isToday) return `Hôm nay, ${timeStr}`;
      return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()} ${timeStr}`;
    } catch {
      return '';
    }
  };

  const getFileCategory = (fileName: string): 'image' | 'doc' | 'media' | 'other' => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic'].includes(ext)) return 'image';
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'].includes(ext)) return 'doc';
    if (['mp4', 'mov', 'mkv', 'avi', 'mp3', 'm4a', 'wav', 'aac'].includes(ext)) return 'media';
    return 'other';
  };

  const getFileIcon = (fileName: string) => {
    const cat = getFileCategory(fileName);
    if (cat === 'image') return { name: 'image' as const, color: '#0284c7', bg: '#e0f2fe' };
    if (cat === 'doc') return { name: 'file-text' as const, color: '#dc2626', bg: '#fee2e2' };
    if (cat === 'media') return { name: 'video' as const, color: '#7c3aed', bg: '#f3e8ff' };
    return { name: 'file' as const, color: '#4b5563', bg: '#f3f4f6' };
  };

  const handleOpenFile = async (item: DownloadedItem) => {
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare && item.uri) {
        await Sharing.shareAsync(item.uri);
      } else {
        if (onShowToast) onShowToast('Không thể mở tệp trên thiết bị');
      }
    } catch (e) {
      if (onShowToast) onShowToast('Không tìm thấy tệp hoặc tệp đã bị xóa');
    }
  };

  const handleDeleteItem = async (id: string, uri?: string) => {
    try {
      const updated = downloads.filter((d) => d.id !== id);
      setDownloads(updated);
      await AsyncStorage.setItem(STORAGE_DOWNLOADS_KEY, JSON.stringify(updated));

      // Thử xóa tệp vật lý trong bộ nhớ đệm nếu có
      if (uri) {
        try {
          const file = new File(uri);
          if (file.exists) {
            file.delete();
          }
        } catch (e) {}
      }

      if (onShowToast) onShowToast('Đã xóa tệp tải xuống');
    } catch (e) {
      console.log('Error deleting file:', e);
    }
  };

  const handleClearAll = () => {
    Alert.alert(
      'Xóa danh sách tải xuống?',
      'Tất cả tệp đã tải xuống sẽ được dọn dẹp khỏi danh sách quản lý của Kite.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa tất cả',
          style: 'destructive',
          onPress: async () => {
            downloads.forEach((item) => {
              if (item.uri) {
                try {
                  const file = new File(item.uri);
                  if (file.exists) file.delete();
                } catch (e) {}
              }
            });
            setDownloads([]);
            await AsyncStorage.removeItem(STORAGE_DOWNLOADS_KEY);
            if (onShowToast) onShowToast('Đã xóa toàn bộ tệp tải xuống');
          },
        },
      ]
    );
  };

  // Lọc theo từ khóa tìm kiếm và category
  const filteredDownloads = downloads.filter((item) => {
    const matchesSearch = item.fileName.toLowerCase().includes(searchQuery.toLowerCase().trim());
    if (!matchesSearch) return false;

    if (selectedFilter === 'all') return true;
    const cat = getFileCategory(item.fileName);
    if (selectedFilter === 'images') return cat === 'image';
    if (selectedFilter === 'docs') return cat === 'doc';
    if (selectedFilter === 'media') return cat === 'media';
    return true;
  });

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
          {/* Thanh kéo trang nhã */}
          <View style={styles.dragHandle} />

          {/* Header thanh tiêu đề */}
          <View style={styles.headerRow}>
            <View style={styles.titleGroup}>
              <View style={styles.titleIconBox}>
                <Feather name="download" size={18} color="#18181b" />
              </View>
              <Text style={styles.sheetTitle}>Tệp đã tải xuống</Text>
              {downloads.length > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{downloads.length}</Text>
                </View>
              )}
            </View>

            <View style={styles.headerRightActions}>
              <TouchableOpacity
                style={styles.openFilesBtn}
                onPress={() => {
                  Linking.openURL('shareddocuments://').catch(() => {});
                }}
                activeOpacity={0.7}
              >
                <Feather name="folder" size={13} color="#18181b" />
                <Text style={styles.openFilesBtnText}>Mở app Tệp</Text>
              </TouchableOpacity>

              {downloads.length > 0 && (
                <TouchableOpacity
                  style={styles.clearAllBtn}
                  onPress={handleClearAll}
                  activeOpacity={0.7}
                >
                  <Text style={styles.clearAllBtnText}>Xóa tất cả</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Feather name="x" size={20} color="#52525b" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Ô tìm kiếm tệp */}
          {downloads.length > 0 && (
            <View style={styles.searchBarBox}>
              <Feather name="search" size={16} color="#71717a" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Tìm kiếm tệp đã tải..."
                placeholderTextColor="#a1a1aa"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Feather name="x-circle" size={16} color="#71717a" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Bộ lọc phân loại nhanh */}
          {downloads.length > 0 && (
            <View style={styles.filterRow}>
              {[
                { id: 'all', label: 'Tất cả' },
                { id: 'images', label: 'Hình ảnh' },
                { id: 'docs', label: 'Tài liệu' },
                { id: 'media', label: 'Video & Audio' },
              ].map((f) => {
                const isSelected = selectedFilter === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.filterChip, isSelected && styles.filterChipActive]}
                    onPress={() => setSelectedFilter(f.id as any)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Danh sách tệp đã tải */}
          <ScrollView
            style={styles.listScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={downloads.length === 0 ? styles.emptyScroll : undefined}
          >
            {downloads.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Feather name="download-cloud" size={40} color="#007aff" />
                </View>
                <Text style={styles.emptyTitle}>Chưa có tệp tải xuống nào</Text>
                <Text style={styles.emptySub}>
                  Các tài liệu, hình ảnh và tệp bạn tải về từ trang web sẽ xuất hiện tại đây
                </Text>
              </View>
            ) : filteredDownloads.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Feather name="search" size={32} color="#a1a1aa" style={{ marginBottom: 10 }} />
                <Text style={styles.emptyTitle}>Không tìm thấy tệp phù hợp</Text>
                <Text style={styles.emptySub}>Thử tìm kiếm với từ khóa khác</Text>
              </View>
            ) : (
              filteredDownloads.map((item) => {
                const iconInfo = getFileIcon(item.fileName);
                const isImg = getFileCategory(item.fileName) === 'image';

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.fileRow}
                    onPress={() => handleOpenFile(item)}
                    activeOpacity={0.7}
                  >
                    {/* Hình thu nhỏ hoặc biểu tượng tệp */}
                    <View style={[styles.fileIconBox, { backgroundColor: iconInfo.bg }]}>
                      {isImg && item.uri ? (
                        <Image
                          source={{ uri: item.uri }}
                          style={styles.thumbnailImg}
                          resizeMode="cover"
                        />
                      ) : (
                        <Feather name={iconInfo.name} size={22} color={iconInfo.color} />
                      )}
                    </View>

                    {/* Tên tệp & dung lượng & ngày */}
                    <View style={styles.fileDetails}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {item.fileName}
                      </Text>
                      <Text style={styles.fileMeta}>
                        {formatFileSize(item.fileSize)} • {formatDate(item.timestamp)}
                      </Text>
                    </View>

                    {/* Nút Chia sẻ */}
                    <TouchableOpacity
                      style={styles.rowActionBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                      onPress={() => handleOpenFile(item)}
                    >
                      <Feather name="share" size={17} color="#007aff" />
                    </TouchableOpacity>

                    {/* Nút Xóa tệp */}
                    <TouchableOpacity
                      style={styles.rowActionBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                      onPress={() => handleDeleteItem(item.id, item.uri)}
                    >
                      <Feather name="trash-2" size={17} color="#ef4444" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })
            )}
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
    maxHeight: '84%',
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
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titleIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f4f4f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#09090b',
  },
  countBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#f4f4f5',
    borderWidth: 1,
    borderColor: '#e4e4e7',
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#71717a',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  openFilesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#f4f4f5',
    borderWidth: 1,
    borderColor: '#e4e4e7',
  },
  openFilesBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#18181b',
  },
  clearAllBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#f4f4f5',
    borderWidth: 1,
    borderColor: '#e4e4e7',
  },
  clearAllBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#71717a',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f4f4f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4f4f5',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 38,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e4e4e7',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#09090b',
    paddingVertical: 0,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#f4f4f5',
    borderWidth: 1,
    borderColor: '#e4e4e7',
  },
  filterChipActive: {
    backgroundColor: '#18181b',
    borderColor: '#18181b',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#52525b',
  },
  filterChipTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  listScroll: {
    maxHeight: 480,
  },
  emptyScroll: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 36,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#09090b',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: '#71717a',
    textAlign: 'center',
    lineHeight: 18,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f4f4f5',
  },
  fileIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbnailImg: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  fileDetails: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#09090b',
    marginBottom: 3,
  },
  fileMeta: {
    fontSize: 12,
    color: '#71717a',
  },
  rowActionBtn: {
    padding: 8,
    marginLeft: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
