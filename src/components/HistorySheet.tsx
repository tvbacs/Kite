import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  Image,
  Platform,
  StatusBar,
  Alert,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../constants/theme';
import { extractSearchQuery, isJunkHistoryItem, STORAGE_SEARCH_QUERIES_KEY } from '../constants/searchEngines';

export interface HistoryItem {
  id: string;
  url: string;
  title: string;
  timestamp: number;
}

export const STORAGE_HISTORY_KEY = '@kite_browsing_history';

interface HistorySheetProps {
  visible: boolean;
  onClose: () => void;
  onSelectUrl: (url: string) => void;
  userEmail?: string;
}

export const HistorySheet: React.FC<HistorySheetProps> = ({
  visible,
  onClose,
  onSelectUrl,
  userEmail,
}) => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 48 : 24);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 34 : 16);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const getStorageKey = () =>
    userEmail ? `${STORAGE_HISTORY_KEY}_${userEmail.toLowerCase()}` : STORAGE_HISTORY_KEY;

  const getSearchQueriesKey = () =>
    userEmail ? `${STORAGE_SEARCH_QUERIES_KEY}_${userEmail.toLowerCase()}` : STORAGE_SEARCH_QUERIES_KEY;

  useEffect(() => {
    if (visible) {
      loadHistory();
    }
  }, [visible, userEmail]);

  const loadHistory = async () => {
    try {
      const data = await AsyncStorage.getItem(getStorageKey());
      if (data) {
        const rawList: HistoryItem[] = JSON.parse(data);
        // Loại bỏ triệt để các trang chuyển hướng và rác
        const cleanRawList = rawList.filter((item) => !isJunkHistoryItem(item.url, item.title));

        const seenQueries = new Set<string>();
        const seenUrls = new Set<string>();
        const deduped: HistoryItem[] = [];

        for (const item of cleanRawList) {
          const q = extractSearchQuery(item.url)?.trim().toLowerCase();
          const cleanUrl = item.url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '').toLowerCase();
          let cleanTitle = (item.title || '').trim();
          if (
            !q &&
            (cleanTitle.includes(' - Tìm trên Google') ||
              cleanTitle.includes(' - Google Search') ||
              cleanTitle.includes(' - Bing') ||
              cleanTitle.includes(' - Yahoo'))
          ) {
            cleanTitle = cleanUrl;
          }

          if (q) {
            if (seenQueries.has(q)) continue;
            seenQueries.add(q);
            deduped.push({ ...item, title: cleanTitle || q });
          } else {
            if (seenUrls.has(cleanUrl)) continue;
            seenUrls.add(cleanUrl);
            deduped.push({ ...item, title: cleanTitle || cleanUrl });
          }
        }

        setHistory(deduped);
        // Tự động làm sạch dữ liệu trong storage nếu có rác hoặc trùng lặp
        if (cleanRawList.length < rawList.length || deduped.length < rawList.length) {
          AsyncStorage.setItem(getStorageKey(), JSON.stringify(deduped)).catch(() => {});
        }
      }
    } catch (e) {
      console.log('Error loading history:', e);
    }
  };

  const handleClearAll = () => {
    Alert.alert(
      'Xóa lịch sử duyệt web',
      'Bạn có chắc chắn muốn xóa toàn bộ lịch sử duyệt web không?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa tất cả',
          style: 'destructive',
          onPress: async () => {
            setHistory([]);
            await AsyncStorage.removeItem(getStorageKey());
            await AsyncStorage.removeItem(getSearchQueriesKey());
          },
        },
      ]
    );
  };

  const handleDeleteItem = async (id: string) => {
    const targetItem = history.find((item) => item.id === id);
    const targetQuery = targetItem ? extractSearchQuery(targetItem.url)?.trim().toLowerCase() : null;
    const targetClean = targetItem ? targetItem.url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '').toLowerCase() : null;

    const updated = history.filter((item) => {
      if (item.id === id) return false;
      if (targetQuery) {
        const q = extractSearchQuery(item.url)?.trim().toLowerCase();
        if (q && q === targetQuery) return false;
      }
      if (!targetQuery && targetClean) {
        const clean = item.url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '').toLowerCase();
        if (clean === targetClean) return false;
      }
      return true;
    });

    setHistory(updated);
    await AsyncStorage.setItem(getStorageKey(), JSON.stringify(updated));
  };

  const filteredHistory = history.filter(
    (item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    return `${hours}:${mins} - ${day}/${month}`;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <View style={[styles.container, { paddingTop: topInset, paddingBottom: bottomInset }]}>
        {/* Header: Xóa bên trái, Xong bên phải */}
        <View style={styles.header}>
          {history.length > 0 ? (
            <TouchableOpacity onPress={handleClearAll} style={styles.clearBtn} activeOpacity={0.7}>
              <Text style={styles.clearBtnText}>Xóa</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.placeholderBtn} />
          )}
          <Text style={styles.title}>Lịch sử duyệt web</Text>
          <TouchableOpacity onPress={onClose} style={styles.doneBtn} activeOpacity={0.7}>
            <Text style={styles.doneBtnText}>Xong</Text>
          </TouchableOpacity>
        </View>

        {/* Thanh tìm kiếm lịch sử */}
        <View style={styles.searchContainer}>
          <Feather name="search" size={16} color="#71717a" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm trong lịch sử..."
            placeholderTextColor="#a1a1aa"
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
        </View>

        {/* Danh sách các trang đã duyệt */}
        {filteredHistory.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Feather name="clock" size={44} color="#d4d4d8" />
            <Text style={styles.emptyText}>
              {searchQuery ? 'Không tìm thấy kết quả phù hợp' : 'Chưa có lịch sử duyệt web nào'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredHistory}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const faviconUrl = `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(
                item.url
              )}`;

              return (
                <TouchableOpacity
                  style={styles.historyRow}
                  onPress={() => {
                    onSelectUrl(item.url);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <Image source={{ uri: faviconUrl }} style={styles.favicon} />
                  <View style={styles.textCol}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {item.title || item.url}
                    </Text>
                    <Text style={styles.itemUrl} numberOfLines={1}>
                      {item.url.replace('https://', '').replace('http://', '')}
                    </Text>
                  </View>
                  <Text style={styles.timeText}>{formatTime(item.timestamp)}</Text>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDeleteItem(item.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Feather name="x" size={16} color="#a1a1aa" />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.sheetBackground,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: theme.colors.sheetBackground,
    borderBottomWidth: 1,
    borderBottomColor: '#e4e4e7',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#09090b',
  },
  doneBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  doneBtnText: {
    color: theme.colors.accentBlue,
    fontSize: 16,
    fontWeight: '600',
  },
  clearBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  clearBtnText: {
    color: '#ff3b30',
    fontSize: 16,
    fontWeight: '600',
  },
  placeholderBtn: {
    width: 44,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 42,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 15,
    color: '#09090b',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginBottom: 8,
  },
  favicon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    marginRight: 12,
    backgroundColor: '#f4f4f5',
  },
  textCol: {
    flex: 1,
    marginRight: 10,
  },
  itemTitle: {
    fontSize: 15.5,
    fontWeight: '400',
    color: '#09090b',
    marginBottom: 2,
  },
  itemUrl: {
    fontSize: 12,
    color: '#71717a',
  },
  timeText: {
    fontSize: 11,
    color: '#a1a1aa',
    marginRight: 10,
  },
  deleteBtn: {
    padding: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: '#71717a',
    textAlign: 'center',
  },
});
