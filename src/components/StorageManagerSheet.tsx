import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  TextInput,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paths, Directory, File } from 'expo-file-system';
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
  const [searchQuery, setSearchQuery] = useState<string>('');

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

      // 3. Tab Snapshots size (Kite_Snapshots)
      let snapBytes = 0;
      const snapDir = new Directory(Paths.document, 'Kite_Snapshots');
      try {
        if (snapDir.exists) {
          snapBytes = getDirSize(snapDir);
        }
      } catch {}
      for (const tab of tabs) {
        if (tab.snapshotUri && tab.snapshotUri.startsWith('file://') && !tab.snapshotUri.includes('Kite_Snapshots')) {
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

      // 5. AsyncStorage
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

      // 6. Tính toán chi tiết dung lượng lưu trữ theo từng trang web (Website Data)
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
              try {
                const sFile = new File(snapDir, `tab_snapshot_${tab.id}.jpg`);
                if (sFile.exists && typeof sFile.info()?.size === 'number') {
                  snapSize = sFile.info()!.size!;
                }
              } catch {}
              if (snapSize === 0 && tab.snapshotUri && tab.snapshotUri.startsWith('file://')) {
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
          const weight = (d.hasActiveTab ? 3 : 1) * Math.min(d.visitCount, 20);
          totalWeight += weight;
        }

        const sites: SiteStorageItem[] = domainEntries.map((d) => {
          const weight = (d.hasActiveTab ? 3 : 1) * Math.min(d.visitCount, 20);
          const cacheShare = totalWeight > 0 ? (weight / totalWeight) * cacheBytes : 0;
          const totalSiteBytes = Math.round(cacheShare + d.snapshotBytes + 48 * 1024);
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
      setSearchQuery('');
      calculateStorage();
    }
  }, [visible, calculateStorage]);

  // Tổng dung lượng các trang web
  const totalSiteStorageBytes = useMemo(() => {
    const listSum = siteStorageList.reduce((acc, s) => acc + s.sizeBytes, 0);
    return Math.max(listSum, webCacheSize + snapshotsSize);
  }, [siteStorageList, webCacheSize, snapshotsSize]);

  // Lọc danh sách theo từ khóa tìm kiếm
  const filteredSites = useMemo(() => {
    if (!searchQuery.trim()) return siteStorageList;
    const q = searchQuery.toLowerCase().trim();
    return siteStorageList.filter(
      (s) => s.domain.toLowerCase().includes(q) || s.url.toLowerCase().includes(q)
    );
  }, [siteStorageList, searchQuery]);

  // Xóa toàn bộ dữ liệu trang web
  const handleClearAllSitesConfirm = () => {
    if (totalSiteStorageBytes === 0 && siteStorageList.length === 0) {
      if (onShowToast) onShowToast('Không có dữ liệu trang web để xóa');
      return;
    }
    Alert.alert(
      'Xóa tất cả dữ liệu trang web?',
      `Hành động này sẽ giải phóng bộ nhớ đệm, ảnh chụp thẻ và lịch sử của tất cả các trang web (${formatBytes(totalSiteStorageBytes)}).\n\nDấu trang và mật khẩu đã lưu của bạn vẫn được giữ nguyên.`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa tất cả',
          style: 'destructive',
          onPress: async () => {
            setIsCleaning(true);
            try {
              await onClearWebCache();
              await onClearTabSnapshots();
              if (onClearHistory) await onClearHistory();
              setSiteStorageList([]);
              await calculateStorage();
              if (onShowToast) {
                onShowToast(`Đã xóa toàn bộ dữ liệu các trang web (${formatBytes(totalSiteStorageBytes)})`);
              }
            } catch {
              if (onShowToast) onShowToast('Có lỗi xảy ra khi xóa dữ liệu');
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
      `Thao tác này sẽ xóa bộ nhớ đệm, ảnh chụp và dữ liệu đã lưu của trang ${site.domain} (${formatBytes(site.sizeBytes)}).`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            setIsCleaning(true);
            try {
              // 1. Xóa ảnh chụp snapshot của các tab thuộc domain này
              const snapDir = new Directory(Paths.document, 'Kite_Snapshots');
              for (const tab of tabs) {
                if (tab.url && tab.url.toLowerCase().includes(site.domain.toLowerCase())) {
                  try {
                    const snapFile = new File(snapDir, `tab_snapshot_${tab.id}.jpg`);
                    if (snapFile.exists) snapFile.delete();
                  } catch {}
                  if (tab.snapshotUri && tab.snapshotUri.startsWith('file://')) {
                    try {
                      const f = new File(tab.snapshotUri);
                      if (f.exists) f.delete();
                    } catch {}
                  }
                  tab.snapshotUri = null;
                }
              }

              // 2. Xóa lịch sử duyệt web liên quan tới domain
              const allKeys = await AsyncStorage.getAllKeys();
              const histKeys = allKeys.filter((k) => k.startsWith('@kite_browsing_history'));
              if (!histKeys.includes(STORAGE_HISTORY_KEY)) histKeys.push(STORAGE_HISTORY_KEY);

              for (const k of histKeys) {
                try {
                  const stored = await AsyncStorage.getItem(k);
                  if (stored) {
                    const list = JSON.parse(stored);
                    if (Array.isArray(list)) {
                      const filtered = list.filter(
                        (item: any) => !item.url?.toLowerCase().includes(site.domain.toLowerCase())
                      );
                      await AsyncStorage.setItem(k, JSON.stringify(filtered));
                    }
                  }
                } catch {}
              }

              // 3. Xóa các quyền trang web nếu có
              try {
                await AsyncStorage.removeItem(`@kite_site_perm_${site.domain}`);
              } catch {}

              // 4. Cập nhật state
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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheetContainer, { paddingBottom: bottomInset }]}>
          {/* Thanh gạt trên cùng */}
          <View style={styles.dragHandle} />

          {/* Header tối giản */}
          <View style={styles.header}>
            <View style={styles.headerTitleGroup}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                Quản lý bộ nhớ
              </Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                Xem và xóa dữ liệu lưu trữ theo từng trang
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
                  <ActivityIndicator size="small" color="#18181b" />
                ) : (
                  <Feather name="refresh-cw" size={17} color="#18181b" />
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={onClose} activeOpacity={0.7}>
                <Feather name="x" size={19} color="#18181b" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
            bounces={true}
            nestedScrollEnabled={true}
            keyboardShouldPersistTaps="handled"
          >
            {/* 1. TỔNG QUAN DUNG LƯỢNG TRANG WEB */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>TỔNG DUNG LƯỢNG LƯU TRỮ</Text>
              <View style={styles.summaryValueRow}>
                <Text style={styles.summaryValue}>{formatBytes(totalSiteStorageBytes)}</Text>

                {siteStorageList.length > 0 && (
                  <TouchableOpacity
                    style={styles.clearAllBtn}
                    onPress={handleClearAllSitesConfirm}
                    disabled={isCleaning}
                    activeOpacity={0.7}
                  >
                    <Feather name="trash-2" size={13} color="#ef4444" style={{ marginRight: 6 }} />
                    <Text style={styles.clearAllBtnText}>Xóa tất cả</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.summarySubtext}>
                {siteStorageList.length > 0
                  ? `${siteStorageList.length} trang web đang lưu bộ nhớ đệm và ảnh chụp`
                  : 'Chưa có trang web nào lưu trữ dữ liệu'}
              </Text>
            </View>

            {/* Ô tìm kiếm trang web (nếu có từ 3 trang trở lên) */}
            {siteStorageList.length > 2 && (
              <View style={styles.searchContainer}>
                <Feather name="search" size={15} color="#71717a" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Tìm kiếm trang web..."
                  placeholderTextColor="#a1a1aa"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  clearButtonMode="while-editing"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearchQuery('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="x" size={15} color="#71717a" />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* 2. DANH SÁCH CHI TIẾT CÁC TRANG WEB ĐANG LƯU */}
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>CÁC TRANG WEB ĐANG LƯU</Text>
              {siteStorageList.length > 0 && (
                <Text style={styles.sectionBadgeText}>{filteredSites.length} trang</Text>
              )}
            </View>

            <View style={styles.sitesCard}>
              {filteredSites.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Feather name="globe" size={24} color="#a1a1aa" style={{ marginBottom: 8 }} />
                  <Text style={styles.emptyText}>
                    {searchQuery
                      ? 'Không tìm thấy trang web phù hợp'
                      : 'Chưa có dữ liệu trang web nào được lưu'}
                  </Text>
                </View>
              ) : (
                filteredSites.map((site, index) => {
                  const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain_url=https://${site.domain}`;
                  return (
                    <View key={site.domain}>
                      <View style={styles.siteRow}>
                        <Image source={{ uri: faviconUrl }} style={styles.siteFavicon} />

                        <View style={styles.siteInfo}>
                          <Text style={styles.siteDomain} numberOfLines={1}>
                            {site.domain}
                          </Text>
                          <Text style={styles.siteSubtext} numberOfLines={1}>
                            {site.visitCount > 1 ? `${site.visitCount} lần xem` : 'Dữ liệu bộ nhớ đệm'}
                          </Text>
                        </View>

                        <Text style={styles.siteSize}>{formatBytes(site.sizeBytes)}</Text>

                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => handleDeleteSiteData(site)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          activeOpacity={0.7}
                        >
                          <Feather name="trash-2" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                      {index < filteredSites.length - 1 && <View style={styles.divider} />}
                    </View>
                  );
                })
              )}
            </View>

            {/* 3. DUNG LƯỢNG KHÁC (TỆP TẢI VỀ & BỘ NHỚ MÁY) */}
            <View style={styles.otherStorageCard}>
              <View style={styles.otherRow}>
                <View style={styles.otherInfo}>
                  <Text style={styles.otherTitle}>Tệp đã tải xuống</Text>
                  <Text style={styles.otherSubtext}>
                    {formatBytes(downloadsSize)} • Trong thư mục Kite_Downloads
                  </Text>
                </View>
                {onOpenDownloads && (
                  <TouchableOpacity
                    style={styles.otherActionBtn}
                    onPress={() => {
                      onClose();
                      onOpenDownloads();
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.otherActionText}>Quản lý tệp</Text>
                  </TouchableOpacity>
                )}
              </View>

              {freeDiskSpace > 0 && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.diskRow}>
                    <Feather name="hard-drive" size={13} color="#71717a" />
                    <Text style={styles.diskText}>
                      Bộ nhớ máy còn trống {formatBytes(freeDiskSpace)}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    height: '92%',
    maxHeight: '94%',
  },
  dragHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#e4e4e7',
    borderRadius: 2,
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
    fontSize: 18,
    fontWeight: '700',
    color: '#09090b',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#71717a',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f4f4f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  summaryCard: {
    backgroundColor: '#f4f4f5',
    borderRadius: 16,
    padding: 16,
    marginTop: 6,
    marginBottom: 14,
    borderWidth: 0,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#09090b',
    lineHeight: 28,
  },
  summarySubtext: {
    fontSize: 12,
    color: '#71717a',
    marginTop: 4,
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    alignSelf: 'center',
  },
  clearAllBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ef4444',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4f4f5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#09090b',
    padding: 0,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#71717a',
  },
  sitesCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 0,
  },
  siteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  siteFavicon: {
    width: 26,
    height: 26,
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
    color: '#09090b',
    flexShrink: 1,
  },
  siteSubtext: {
    fontSize: 11,
    color: '#71717a',
    marginTop: 2,
  },
  siteSize: {
    fontSize: 13,
    fontWeight: '600',
    color: '#18181b',
    marginRight: 10,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#f4f4f5',
  },
  emptyContainer: {
    padding: 28,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#71717a',
  },
  otherStorageCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 0,
    overflow: 'hidden',
    marginBottom: 14,
  },
  otherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  otherInfo: {
    flex: 1,
    marginRight: 10,
  },
  otherTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#09090b',
  },
  otherSubtext: {
    fontSize: 11,
    color: '#71717a',
    marginTop: 2,
  },
  otherActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#f4f4f5',
    borderWidth: 1,
    borderColor: '#e4e4e7',
  },
  otherActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#18181b',
  },
  diskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#fafafa',
  },
  diskText: {
    fontSize: 11,
    color: '#71717a',
  },
});
