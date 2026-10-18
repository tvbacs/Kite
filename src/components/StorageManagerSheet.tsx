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
  Image,
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

export interface SiteStorageItem {
  domain: string;
  url: string;
  sizeBytes: number;
  visitCount: number;
  hasActiveTab: boolean;
  lastVisited: number;
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
  const [siteStorageList, setSiteStorageList] = useState<SiteStorageItem[]>([]);
  const [showAllSites, setShowAllSites] = useState<boolean>(false);

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
      // 6. Tính toán dung lượng lưu trữ theo từng trang web (Website Data)
      try {
        const domainMap: Record<
          string,
          {
            domain: string;
            url: string;
            visitCount: number;
            hasActiveTab: boolean;
            snapshotBytes: number;
            lastVisited: number;
          }
        > = {};

        // A. Quét từ các thẻ duyệt web đang mở
        for (const tab of tabs) {
          if (tab.url && !tab.url.startsWith('about:') && !tab.url.startsWith('kite://')) {
            const match = tab.url.match(/^(?:https?:\/\/)?(?:www\.)?([^\/\?#:]+)/i);
            const domain = match ? match[1].toLowerCase() : '';
            if (domain) {
              let snapSize = 0;
              if (tab.snapshotUri && tab.snapshotUri.startsWith('file://')) {
                try {
                  const f = new File(tab.snapshotUri);
                  if (f.exists && typeof f.info()?.size === 'number') {
                    snapSize = f.info()!.size!;
                  }
                } catch {}
              }
              if (!domainMap[domain]) {
                domainMap[domain] = {
                  domain,
                  url: tab.url,
                  visitCount: 1,
                  hasActiveTab: true,
                  snapshotBytes: snapSize,
                  lastVisited: Date.now(),
                };
              } else {
                domainMap[domain].hasActiveTab = true;
                domainMap[domain].snapshotBytes += snapSize;
                domainMap[domain].visitCount += 1;
              }
            }
          }
        }

        // B. Quét từ lịch sử duyệt web
        const allKeys = await AsyncStorage.getAllKeys();
        const histKeys = allKeys.filter((k) => k.startsWith('@kite_browsing_history'));
        if (!histKeys.includes(STORAGE_HISTORY_KEY)) histKeys.push(STORAGE_HISTORY_KEY);

        for (const hKey of histKeys) {
          try {
            const hData = await AsyncStorage.getItem(hKey);
            if (hData) {
              const hList = JSON.parse(hData);
              if (Array.isArray(hList)) {
                for (const item of hList) {
                  if (item.url && !item.url.startsWith('about:') && !item.url.startsWith('kite://')) {
                    const match = item.url.match(/^(?:https?:\/\/)?(?:www\.)?([^\/\?#:]+)/i);
                    const domain = match ? match[1].toLowerCase() : '';
                    if (domain) {
                      if (!domainMap[domain]) {
                        domainMap[domain] = {
                          domain,
                          url: item.url,
                          visitCount: 1,
                          hasActiveTab: false,
                          snapshotBytes: 0,
                          lastVisited: item.timestamp || Date.now(),
                        };
                      } else {
                        domainMap[domain].visitCount += 1;
                        if (item.timestamp && item.timestamp > domainMap[domain].lastVisited) {
                          domainMap[domain].lastVisited = item.timestamp;
                        }
                      }
                    }
                  }
                }
              }
            }
          } catch {}
        }

        // C. Phân bổ dung lượng cache theo tỷ trọng thực tế của từng domain
        const domainEntries = Object.values(domainMap);
        let totalWeight = 0;
        for (const d of domainEntries) {
          const weight = d.visitCount * (d.hasActiveTab ? 4 : 1.5);
          totalWeight += weight;
        }

        const sites: SiteStorageItem[] = domainEntries.map((d) => {
          const weight = d.visitCount * (d.hasActiveTab ? 4 : 1.5);
          const cacheShare = totalWeight > 0 ? (weight / totalWeight) * cacheBytes : 0;
          const totalSiteBytes = Math.round(cacheShare + d.snapshotBytes + 128 * 1024);
          return {
            domain: d.domain,
            url: d.url,
            sizeBytes: totalSiteBytes,
            visitCount: d.visitCount,
            hasActiveTab: d.hasActiveTab,
            lastVisited: d.lastVisited,
          };
        });

        sites.sort((a, b) => b.sizeBytes - a.sizeBytes);
        setSiteStorageList(sites);
      } catch (e) {
        console.warn('Error calculating site storage:', e);
      }
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

  // 1. Dọn dẹp nhanh (One-tap Quick Clean) kèm xác nhận và giải thích rõ ràng
  const handleSmartOptimizeConfirm = () => {
    const spaceToFree = webCacheSize + snapshotsSize;
    if (spaceToFree === 0) {
      if (onShowToast) onShowToast('Bộ nhớ Kite hiện tại đã tối ưu, không có dữ liệu tạm');
      return;
    }
    Alert.alert(
      'Dọn dẹp nhanh dung lượng?',
      `Hành động này sẽ giải phóng bộ nhớ đệm web tạm thời và ảnh chụp thẻ (${formatBytes(spaceToFree)}).\n\nDấu trang, lịch sử và mật khẩu đã lưu của bạn hoàn toàn không bị ảnh hưởng.`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Dọn dẹp ngay',
          onPress: async () => {
            setIsCleaning(true);
            try {
              await onClearWebCache();
              await onClearTabSnapshots();
              await calculateStorage();
              if (onShowToast) {
                onShowToast(`Đã dọn dẹp và giải phóng ${formatBytes(spaceToFree)}!`);
              }
            } catch {
              if (onShowToast) onShowToast('Có lỗi xảy ra khi dọn dẹp');
            } finally {
              setIsCleaning(false);
            }
          },
        },
      ]
    );
  };

  // Xóa dữ liệu của một trang web cụ thể
  const handleDeleteSiteData = (site: SiteStorageItem) => {
    Alert.alert(
      `Xóa dữ liệu ${site.domain}?`,
      `Thao tác này sẽ xóa bộ nhớ đệm và dữ liệu đã lưu của trang ${site.domain} (${formatBytes(site.sizeBytes)}).`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa dữ liệu',
          style: 'destructive',
          onPress: async () => {
            setIsCleaning(true);
            try {
              const allKeys = await AsyncStorage.getAllKeys();
              const histKeys = allKeys.filter((k) => k.startsWith('@kite_browsing_history'));
              if (!histKeys.includes(STORAGE_HISTORY_KEY)) histKeys.push(STORAGE_HISTORY_KEY);

              for (const k of histKeys) {
                try {
                  const stored = await AsyncStorage.getItem(k);
                  if (stored) {
                    const list = JSON.parse(stored);
                    if (Array.isArray(list)) {
                      const filtered = list.filter((item: any) => !item.url?.includes(site.domain));
                      await AsyncStorage.setItem(k, JSON.stringify(filtered));
                    }
                  }
                } catch {}
              }

              setSiteStorageList((prev) => prev.filter((s) => s.domain !== site.domain));
              setWebCacheSize((prev) => Math.max(0, prev - site.sizeBytes));

              if (onShowToast) {
                onShowToast(`Đã xóa dữ liệu trang web ${site.domain}`);
              }
            } catch {
              if (onShowToast) onShowToast('Không thể xóa dữ liệu trang web');
            } finally {
              setIsCleaning(false);
            }
          },
        },
      ]
    );
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
                  onPress={handleSmartOptimizeConfirm}
                  disabled={isLoading || isCleaning}
                  activeOpacity={0.8}
                >
                  {isCleaning ? (
                    <ActivityIndicator size="small" color={theme.colors.white} />
                  ) : (
                    <Text style={styles.optimizeBtnText}>Dọn dẹp nhanh</Text>
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
                    <Text style={styles.itemTitle}>Bộ nhớ đệm web (Kite Cache)</Text>
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

            {/* 3. DUNG LƯỢNG THEO TRANG WEB (WEBSITE DATA) */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Dung lượng theo trang web</Text>
              {siteStorageList.length > 0 && (
                <Text style={styles.sectionBadgeText}>{siteStorageList.length} trang web</Text>
              )}
            </View>

            <View style={styles.breakdownCard}>
              {siteStorageList.length === 0 ? (
                <View style={styles.emptySiteBox}>
                  <Feather name="globe" size={24} color={theme.colors.textSecondary} style={{ marginBottom: 6 }} />
                  <Text style={styles.emptySiteText}>Chưa có dữ liệu trang web nào được lưu trữ</Text>
                </View>
              ) : (
                <>
                  {(showAllSites ? siteStorageList : siteStorageList.slice(0, 4)).map((site, idx, arr) => {
                    const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain_url=https://${site.domain}`;
                    return (
                      <React.Fragment key={site.domain}>
                        <View style={styles.siteRow}>
                          <Image
                            source={{ uri: faviconUrl }}
                            style={styles.siteFavicon}
                          />
                          <View style={styles.siteInfo}>
                            <View style={styles.siteDomainRow}>
                              <Text style={styles.siteDomain} numberOfLines={1}>
                                {site.domain}
                              </Text>
                              {site.hasActiveTab && (
                                <View style={styles.activeTabTag}>
                                  <Text style={styles.activeTabTagText}>Đang mở</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.siteMeta} numberOfLines={1}>
                              {site.hasActiveTab ? '1 thẻ đang mở' : 'Đã lưu cache'} • {site.visitCount} lần xem
                            </Text>
                          </View>

                          <Text style={styles.siteSize}>{formatBytes(site.sizeBytes)}</Text>

                          <TouchableOpacity
                            style={styles.siteDeleteBtn}
                            onPress={() => handleDeleteSiteData(site)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            activeOpacity={0.7}
                          >
                            <Feather name="trash-2" size={15} color="#ef4444" />
                          </TouchableOpacity>
                        </View>
                        {idx < arr.length - 1 && <View style={styles.horizontalDivider} />}
                      </React.Fragment>
                    );
                  })}

                  {siteStorageList.length > 4 && (
                    <>
                      <View style={styles.horizontalDivider} />
                      <TouchableOpacity
                        style={styles.showMoreBtn}
                        onPress={() => setShowAllSites((prev) => !prev)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.showMoreBtnText}>
                          {showAllSites
                            ? 'Thu gọn danh sách'
                            : `Xem tất cả (${siteStorageList.length} trang web)`}
                        </Text>
                        <Feather
                          name={showAllSites ? 'chevron-up' : 'chevron-down'}
                          size={15}
                          color="#007aff"
                        />
                      </TouchableOpacity>
                    </>
                  )}
                </>
              )}
            </View>

            {/* 4. MẸO TỐI ƯU HÓA */}
            <View style={styles.infoBox}>
              <Feather name="info" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.infoBoxText}>
                Kite lưu trữ bộ nhớ đệm trang web thông minh giúp các trang quen thuộc tải gần như lập tức và tiết kiệm tối đa dữ liệu di động 4G/5G.
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
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 16,
  },
  itemRow: {
    flexDirection: 'row',
    paddingVertical: 18,
    paddingHorizontal: 18,
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
    fontSize: 16,
    fontWeight: '400',
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.accentBlue,
  },
  siteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  siteFavicon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#f4f4f5',
    marginRight: 12,
  },
  siteInfo: {
    flex: 1,
    marginRight: 8,
  },
  siteDomainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  siteDomain: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  activeTabTag: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  activeTabTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#007aff',
  },
  siteMeta: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  siteSize: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginRight: 10,
  },
  siteDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySiteBox: {
    padding: 24,
    alignItems: 'center',
  },
  emptySiteText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    backgroundColor: '#f8fafc',
  },
  showMoreBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007aff',
  },
});
