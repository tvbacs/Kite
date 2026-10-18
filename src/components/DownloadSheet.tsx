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
import { theme } from '../constants/theme';

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

export interface ActiveDownloadItem {
  id: string;
  fileName: string;
  url: string;
  progress: number;
  bytesWritten: number;
  totalBytes: number;
  status: 'downloading' | 'completed' | 'error';
}

interface DownloadSheetProps {
  visible: boolean;
  onClose: () => void;
  onShowToast?: (message: string) => void;
  activeDownloads?: ActiveDownloadItem[];
}

export const DownloadSheet: React.FC<DownloadSheetProps> = ({
  visible,
  onClose,
  onShowToast,
  activeDownloads = [],
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
    if (cat === 'image') return { name: 'image' as const, color: '#52525b', bg: '#f4f4f5' };
    if (cat === 'doc') return { name: 'file-text' as const, color: '#52525b', bg: '#f4f4f5' };
    if (cat === 'media') return { name: 'video' as const, color: '#52525b', bg: '#f4f4f5' };
    return { name: 'file' as const, color: '#52525b', bg: '#f4f4f5' };
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
            <Text style={styles.sheetTitle} numberOfLines={1}>
              Tệp đã tải xuống
            </Text>

            <View style={styles.headerRightActions}>
              <TouchableOpacity
                style={styles.openFilesBtn}
                onPress={() => {
                  Linking.openURL('shareddocuments://').catch(() => {});
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="folder" size={17} color="#18181b" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={18} color="#52525b" />
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
              style={styles.filterScroll}
            >
              {[
                { id: 'all', label: `Tất cả (${downloads.length})` },
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
            </ScrollView>
          )}

          {/* Danh sách tệp đã tải */}
          <ScrollView
            style={styles.listScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={downloads.length === 0 ? styles.emptyScroll : undefined}
          >
            {/* 1. PHẦN ĐANG TẢI XUỐNG (ACTIVE DOWNLOADS) */}
            {activeDownloads && activeDownloads.length > 0 && (
              <View style={styles.activeDownloadsSection}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeaderTitle}>
                    ĐANG TẢI XUỐNG ({activeDownloads.length})
                  </Text>
                </View>
                {activeDownloads.map((task) => (
                  <View key={task.id} style={styles.activeTaskCard}>
                    <View style={styles.activeTaskTopRow}>
                      <View style={styles.activeTaskIconBox}>
                        <Feather name="arrow-down-circle" size={22} color="#007aff" />
                      </View>
                      <View style={styles.activeTaskDetails}>
                        <Text style={styles.activeTaskName} numberOfLines={1}>
                          {task.fileName}
                        </Text>
                        <Text style={styles.activeTaskMeta}>
                          {task.totalBytes > 0
                            ? `Đang tải: ${task.progress}% • ${formatFileSize(task.bytesWritten)} / ${formatFileSize(task.totalBytes)}`
                            : `Đang tải: ${formatFileSize(task.bytesWritten)}...`}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.activeProgressBarTrack}>
                      <View
                        style={[
                          styles.activeProgressBarFill,
                          { width: `${Math.max(6, Math.min(100, task.progress || 0))}%` },
                        ]}
                      />
                    </View>
                  </View>
                ))}
                {filteredDownloads.length > 0 && (
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionHeaderTitle}>ĐÃ TẢI XUỐNG</Text>
                  </View>
                )}
              </View>
            )}

            {/* 2. PHẦN ĐÃ HOÀN THÀNH */}
            {downloads.length === 0 && (!activeDownloads || activeDownloads.length === 0) ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Feather name="download-cloud" size={36} color="#71717a" />
                </View>
                <Text style={styles.emptyTitle}>Chưa có tệp tải xuống nào</Text>
                <Text style={styles.emptySub}>
                  Các tài liệu, hình ảnh và video bạn tải về từ trang web sẽ xuất hiện tại đây
                </Text>
              </View>
            ) : downloads.length > 0 && filteredDownloads.length === 0 ? (
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
                      <Feather name="share" size={17} color="#71717a" />
                    </TouchableOpacity>

                    {/* Nút Xóa tệp */}
                    <TouchableOpacity
                      style={styles.rowActionBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                      onPress={() => handleDeleteItem(item.id, item.uri)}
                    >
                      <Feather name="trash-2" size={17} color="#71717a" />
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
    backgroundColor: theme.colors.backdrop,
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: theme.colors.sheetBackground,
    borderTopLeftRadius: theme.radius.sheet,
    borderTopRightRadius: theme.radius.sheet,
    height: '78%',
    maxHeight: '90%',
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
    backgroundColor: theme.colors.dragHandle,
    alignSelf: 'center',
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#09090b',
    flexShrink: 1,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  openFilesBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.sheetCard,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.sheetCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.sheetCard,
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#09090b',
    paddingVertical: 0,
  },
  filterScroll: {
    marginBottom: 12,
    flexGrow: 0,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: theme.colors.sheetCard,
  },
  filterChipActive: {
    backgroundColor: theme.colors.accentBlue,
    borderColor: theme.colors.accentBlue,
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
    flex: 1,
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
    backgroundColor: theme.colors.sheetCard,
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.sheetCard,
    borderRadius: 16,
    marginBottom: 8,
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
    fontSize: 15.5,
    fontWeight: '400',
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
  activeDownloadsSection: {
    marginBottom: 14,
  },
  sectionHeaderRow: {
    paddingVertical: 6,
    marginBottom: 4,
  },
  sectionHeaderTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#71717a',
    letterSpacing: 0.5,
  },
  activeTaskCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  activeTaskTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  activeTaskIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  activeTaskDetails: {
    flex: 1,
  },
  activeTaskName: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1e3a8a',
    marginBottom: 3,
  },
  activeTaskMeta: {
    fontSize: 11.5,
    color: '#3b82f6',
    fontWeight: '500',
  },
  activeProgressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#bfdbfe',
    overflow: 'hidden',
  },
  activeProgressBarFill: {
    height: '100%',
    backgroundColor: '#007aff',
    borderRadius: 3,
  },
});
