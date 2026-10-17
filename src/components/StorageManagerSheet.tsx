import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paths, Directory, File } from 'expo-file-system';
import { theme } from '../constants/theme';
import { STORAGE_DOWNLOADS_KEY, DownloadedItem } from './DownloadSheet';
import { STORAGE_HISTORY_KEY } from './HistorySheet';

export interface TabStorageInfo {
  id: string;
  title: string;
  url: string;
  snapshotUri?: string | null;
}

interface StorageManagerSheetProps {
  visible: boolean;
  onClose: () => void;
  tabs: TabStorageInfo[];
  activeTabId: string;
  onClearWebCache: () => Promise<void>;
  onClearTabSnapshots: () => Promise<void>;
  onOpenDownloads?: () => void;
  onClearHistory?: () => Promise<void>;
  onShowToast?: (message: string) => void;
}

export const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const StorageManagerSheet: React.FC<StorageManagerSheetProps> = ({
  visible,
  onClose,
  tabs,
  activeTabId,
  onClearWebCache,
  onClearTabSnapshots,
  onOpenDownloads,
  onClearHistory,
  onShowToast,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 16);

  const [isLoading, setIsLoading] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);

  // Storage breakdown in bytes
  const [webCacheSize, setWebCacheSize] = useState<number>(0);
  const [snapshotsSize, setSnapshotsSize] = useState<number>(0);
  const [downloadsSize, setDownloadsSize] = useState<number>(0);
  const [historyAndStorageSize, setHistoryAndStorageSize] = useState<number>(0);
  const [freeDiskSpace, setFreeDiskSpace] = useState<number>(0);
  const [totalDiskSpace, setTotalDiskSpace] = useState<number>(0);

  // Calculate sizes of directories recursively
  const getDirSize = (dir: Directory): number => {
    let size = 0;
    try {
      if (!dir.exists) return 0;
      const items = dir.list();
      for (const item of items) {
        try {
          if (item instanceof Directory) {
            size += getDirSize(item);
          } else if (item instanceof File) {
            const info = item.info();
            if (info && typeof info.size === 'number') {
              size += info.size;
            }
          }
        } catch {
          // ignore single item stat error
        }
      }
    } catch {
      // ignore directory list error
    }
    return size;
  };

  const calculateStorage = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Device total & free space
      try {
        if (typeof Paths.availableDiskSpace === 'number') {
          setFreeDiskSpace(Paths.availableDiskSpace);
        }
        if (typeof Paths.totalDiskSpace === 'number') {
          setTotalDiskSpace(Paths.totalDiskSpace);
        }
      } catch {}

      // 2. Web Cache size (Paths.cache)
      let cacheBytes = 0;
      try {
        if (Paths.cache && Paths.cache.exists) {
          cacheBytes = getDirSize(Paths.cache);
        }
      } catch {}
      setWebCacheSize(cacheBytes);

      // 3. Tab Snapshots size
      let snapBytes = 0;
      for (const tab of tabs) {
        if (tab.snapshotUri && tab.snapshotUri.startsWith('file://')) {
          try {
            const file = new File(tab.snapshotUri);
            if (file.exists) {
              const info = file.info();
              if (info && typeof info.size === 'number') {
                snapBytes += info.size;
              }
            }
          } catch {}
        }
      }
      setSnapshotsSize(snapBytes);

      // 4. Downloaded files size
      let dlBytes = 0;
      try {
        const stored = await AsyncStorage.getItem(STORAGE_DOWNLOADS_KEY);
        if (stored) {
          const list: DownloadedItem[] = JSON.parse(stored);
          if (Array.isArray(list)) {
            for (const item of list) {
              if (typeof item.fileSize === 'number' && item.fileSize > 0) {
                dlBytes += item.fileSize;
              } else if (item.uri) {
                try {
                  const file = new File(item.uri);
                  if (file.exists) {
                    const info = file.info();
                    if (info && typeof info.size === 'number') {
                      dlBytes += info.size;
                    }
                  }
                } catch {}
              }
            }
          }
        }
      } catch {}
      setDownloadsSize(dlBytes);

      // 5. AsyncStorage (Browsing history, session, settings)
      let storageBytes = 0;
      try {
        const keys = await AsyncStorage.getAllKeys();
        if (keys.length > 0) {
          const pairs = await AsyncStorage.multiGet(keys);
          for (const [k, v] of pairs) {
            storageBytes += (k?.length || 0) + (v?.length || 0);
          }
        }
      } catch {}
      setHistoryAndStorageSize(storageBytes);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [tabs]);

  useEffect(() => {
    if (visible) {
      calculateStorage();
    }
  }, [visible, calculateStorage]);

  const totalKiteUsage = webCacheSize + snapshotsSize + downloadsSize + historyAndStorageSize;

  // 1. One-tap Smart Optimize
  const handleSmartOptimize = async () => {
    setIsCleaning(true);
    try {
      const spaceToFree = webCacheSize + snapshotsSize;
      await onClearWebCache();
      await onClearTabSnapshots();
      await calculateStorage();
      if (onShowToast) {
        onShowToast(`Đã tối ưu hóa và giải phóng ${formatBytes(spaceToFree)}!`);
      }
    } catch {
      if (onShowToast) onShowToast('Có lỗi xảy ra khi tối ưu');
    } finally {
      setIsCleaning(false);
    }
  };

  // 2. Clear Web Cache Only
  const handleClearCacheConfirm = () => {
    Alert.alert(
      'Xóa bộ nhớ đệm web?',
      'Trang web có thể tải chậm hơn một chút ở lần mở tiếp theo khi nạp lại dữ liệu.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa bộ nhớ đệm',
          style: 'destructive',
          onPress: async () => {
            setIsCleaning(true);
            try {
              await onClearWebCache();
              await calculateStorage();
              if (onShowToast) onShowToast('Đã dọn dẹp toàn bộ bộ nhớ đệm web');
            } catch {
              if (onShowToast) onShowToast('Không thể xóa bộ nhớ đệm');
            } finally {
              setIsCleaning(false);
            }
          },
        },
      ]
    );
  };

  // 3. Clear Tab Snapshots Only
  const handleClearSnapshotsConfirm = () => {
    Alert.alert(
      'Giải phóng ảnh chụp thẻ?',
      'Xóa bộ nhớ tạm ảnh xem trước các thẻ đang không hoạt động. Thẻ của bạn vẫn được giữ nguyên vẹn.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Giải phóng',
          onPress: async () => {
            setIsCleaning(true);
            try {
              await onClearTabSnapshots();
              await calculateStorage();
              if (onShowToast) onShowToast('Đã giải phóng bộ nhớ ảnh chụp thẻ');
            } catch {
              if (onShowToast) onShowToast('Không thể giải phóng ảnh chụp thẻ');
            } finally {
              setIsCleaning(false);
            }
          },
        },
      ]
    );
  };

  // 4. Clear Browsing Data
  const handleClearHistoryConfirm = () => {
    if (!onClearHistory) return;
    Alert.alert(
      'Xóa lịch sử duyệt web?',
      'Toàn bộ lịch sử các trang đã xem sẽ bị xóa. Dấu trang và mật khẩu của bạn không bị ảnh hưởng.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa lịch sử',
          style: 'destructive',
          onPress: async () => {
            setIsCleaning(true);
            try {
              await onClearHistory();
              await calculateStorage();
              if (onShowToast) onShowToast('Đã xóa toàn bộ lịch sử duyệt web');
            } catch {
              if (onShowToast) onShowToast('Không thể xóa lịch sử');
            } finally {
              setIsCleaning(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          style={[styles.sheetContainer, { paddingBottom: bottomInset }]}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Drag Handle */}
          <View style={styles.dragHandle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleGroup}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                Bộ nhớ & Bộ nhớ đệm
              </Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                Tối ưu tốc độ tải trang & Dung lượng lưu trữ
              </Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={calculateStorage}
                disabled={isLoading || isCleaning}
                activeOpacity={0.7}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={theme.colors.black} />
                ) : (
                  <Feather name="refresh-cw" size={18} color={theme.colors.textPrimary} />
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={onClose} activeOpacity={0.7}>
                <Feather name="x" size={20} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* 1. TỔNG QUAN DUNG LƯỢNG */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Dung lượng Kite đang dùng</Text>

              <View style={styles.summaryValueRow}>
                <Text style={styles.summaryValue}>{formatBytes(totalKiteUsage)}</Text>
                <TouchableOpacity
                  style={[styles.optimizeBtn, (isLoading || isCleaning) && styles.btnDisabled]}
                  onPress={handleSmartOptimize}
                  disabled={isLoading || isCleaning}
                  activeOpacity={0.8}
                >
                  {isCleaning ? (
                    <ActivityIndicator size="small" color={theme.colors.white} />
                  ) : (
                    <Text style={styles.optimizeBtnText}>Tối ưu hóa ngay</Text>
                  )}
                </TouchableOpacity>
              </View>

              {freeDiskSpace > 0 && (
                <View style={styles.diskSpaceRow}>
                  <Feather name="hard-drive" size={14} color={theme.colors.textSecondary} />
                  <Text style={styles.diskSpaceText}>
                    Còn trống {formatBytes(freeDiskSpace)} trên bộ nhớ thiết bị
                  </Text>
                </View>
              )}
            </View>

            {/* 2. CHI TIẾT SỬ DỤNG TỪNG PHẦN */}
            <Text style={styles.sectionTitle}>Chi tiết phân bổ dung lượng</Text>

            <View style={styles.breakdownCard}>
              {/* Row 1: Web Cache */}
              <View style={styles.itemRow}>
                <View style={styles.itemIconContainer}>
                  <Feather name="globe" size={18} color={theme.colors.grayDark} />
                </View>
                <View style={styles.itemInfo}>
                  <View style={styles.itemHeaderLine}>
                    <Text style={styles.itemTitle}>Bộ nhớ đệm web (Chrome Cache)</Text>
                    <Text style={styles.itemSize}>{formatBytes(webCacheSize)}</Text>
                  </View>
                  <Text style={styles.itemDesc}>
                    Hình ảnh, file nén JS, CSS và tài nguyên trang web giúp mở tức thì.
                  </Text>
                  <View style={styles.itemActionLine}>
                    <TouchableOpacity
                      style={styles.actionBtnOutline}
                      onPress={handleClearCacheConfirm}
                      disabled={isCleaning || webCacheSize === 0}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.actionBtnText,
                          webCacheSize === 0 && styles.actionBtnTextDisabled,
                        ]}
                      >
                        Xóa bộ nhớ đệm
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <View style={styles.horizontalDivider} />

              {/* Row 2: Tab Snapshots */}
              <View style={styles.itemRow}>
                <View style={styles.itemIconContainer}>
                  <Feather name="layers" size={18} color={theme.colors.grayDark} />
                </View>
                <View style={styles.itemInfo}>
                  <View style={styles.itemHeaderLine}>
                    <Text style={styles.itemTitle}>Ảnh chụp thẻ duyệt web</Text>
                    <Text style={styles.itemSize}>{formatBytes(snapshotsSize)}</Text>
                  </View>
                  <Text style={styles.itemDesc}>
                    Ảnh xem trước tĩnh của {tabs.length} thẻ đang mở trong trình quản lý thẻ.
                  </Text>
                  <View style={styles.itemActionLine}>
                    <TouchableOpacity
                      style={styles.actionBtnOutline}
                      onPress={handleClearSnapshotsConfirm}
                      disabled={isCleaning || snapshotsSize === 0}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.actionBtnText,
                          snapshotsSize === 0 && styles.actionBtnTextDisabled,
                        ]}
                      >
                        Giải phóng ảnh chụp
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <View style={styles.horizontalDivider} />

              {/* Row 3: Downloads */}
              <View style={styles.itemRow}>
                <View style={styles.itemIconContainer}>
                  <Feather name="download" size={18} color={theme.colors.grayDark} />
                </View>
                <View style={styles.itemInfo}>
                  <View style={styles.itemHeaderLine}>
                    <Text style={styles.itemTitle}>Tệp đã tải xuống</Text>
                    <Text style={styles.itemSize}>{formatBytes(downloadsSize)}</Text>
                  </View>
                  <Text style={styles.itemDesc}>
                    Tệp PDF, tài liệu, hình ảnh và video đã lưu về máy.
                  </Text>
                  {onOpenDownloads && (
                    <View style={styles.itemActionLine}>
                      <TouchableOpacity
                        style={styles.actionBtnOutline}
                        onPress={() => {
                          onClose();
                          onOpenDownloads();
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.actionBtnText}>Quản lý tệp tải xuống</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.horizontalDivider} />

              {/* Row 4: Browsing Data & History */}
              <View style={styles.itemRow}>
                <View style={styles.itemIconContainer}>
                  <Feather name="database" size={18} color={theme.colors.grayDark} />
                </View>
                <View style={styles.itemInfo}>
                  <View style={styles.itemHeaderLine}>
                    <Text style={styles.itemTitle}>Lịch sử duyệt & Cookie</Text>
                    <Text style={styles.itemSize}>{formatBytes(historyAndStorageSize)}</Text>
                  </View>
                  <Text style={styles.itemDesc}>
                    Nhật ký các trang web đã truy cập, cookie phiên và dữ liệu biểu mẫu.
                  </Text>
                  {onClearHistory && (
                    <View style={styles.itemActionLine}>
                      <TouchableOpacity
                        style={styles.actionBtnOutline}
                        onPress={handleClearHistoryConfirm}
                        disabled={isCleaning}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.actionBtnText}>Xóa lịch sử duyệt web</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* 3. MẸO TỐI ƯU HÓA NHƯ CHROME */}
            <View style={styles.infoBox}>
              <Feather name="info" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.infoBoxText}>
                Kite áp dụng cơ chế bộ nhớ đệm HTTP và DOM Storage tương tự Google Chrome giúp các
                trang web quen thuộc tải gần như lập tức và tiết kiệm tối đa dữ liệu di động 4G/5G.
              </Text>
            </View>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  sheetBackdrop: {
    flex: 1,
    backgroundColor: theme.colors.backdrop,
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: theme.colors.sheetBackground,
    borderTopLeftRadius: theme.radius.sheet,
    borderTopRightRadius: theme.radius.sheet,
    maxHeight: '90%',
    minHeight: 460,
  },
  dragHandle: {
    width: 36,
    height: 4,
    backgroundColor: theme.colors.dragHandle,
    borderRadius: theme.radius.full,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitleGroup: {
    flex: 1,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: theme.radius.xl,
    padding: 18,
    marginTop: 6,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  summaryValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 2,
  },
  summaryLabel: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  summaryValue: {
    fontSize: 26,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  optimizeBtn: {
    backgroundColor: theme.colors.accentBlue,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  optimizeBtnText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.white,
  },
  diskSpaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  diskSpaceText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  breakdownCard: {
    backgroundColor: theme.colors.sheetCard,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    marginBottom: 16,
  },
  itemRow: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'flex-start',
  },
  itemIconContainer: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    marginTop: 2,
  },
  itemInfo: {
    flex: 1,
  },
  itemHeaderLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  itemTitle: {
    fontSize: theme.typography.fontSize.menuTitle,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    flexShrink: 1,
    marginRight: 8,
  },
  itemSize: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  itemDesc: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    lineHeight: 17,
  },
  itemActionLine: {
    marginTop: 10,
    flexDirection: 'row',
  },
  actionBtnOutline: {
    borderWidth: 1,
    borderColor: '#cce3ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
    backgroundColor: '#eff6ff',
  },
  actionBtnText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.accentBlue,
  },
  actionBtnTextDisabled: {
    color: theme.colors.textMuted,
  },
  horizontalDivider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginHorizontal: 16,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.radius.md,
    padding: 14,
    marginBottom: 10,
  },
  infoBoxText: {
    flex: 1,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
});
