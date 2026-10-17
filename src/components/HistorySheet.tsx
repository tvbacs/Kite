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
}

export const HistorySheet: React.FC<HistorySheetProps> = ({
  visible,
  onClose,
  onSelectUrl,
}) => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 48 : 24);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 34 : 16);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    if (visible) {
      loadHistory();
    }
  }, [visible]);

  const loadHistory = async () => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_HISTORY_KEY);
      if (data) {
        setHistory(JSON.parse(data));
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
            await AsyncStorage.removeItem(STORAGE_HISTORY_KEY);
          },
        },
      ]
    );
  };

  const handleDeleteItem = async (id: string) => {
    const updated = history.filter((item) => item.id !== id);
    setHistory(updated);
    await AsyncStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(updated));
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
              const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(
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
    backgroundColor: '#ffffff',
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    color: '#007aff',
    fontSize: 16,
    fontWeight: '600',
  },
  clearBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  clearBtnText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '600',
  },
  placeholderBtn: {
    width: 44,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4f4f5',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 40,
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
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f4f4f5',
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
    fontSize: 14,
    fontWeight: '600',
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
