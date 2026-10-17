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
  Alert,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../constants/theme';

export interface BookmarkItem {
  id: string;
  url: string;
  title: string;
  timestamp?: number;
}

export const STORAGE_BOOKMARKS_KEY = '@kite_user_bookmarks';

export const DEFAULT_BOOKMARKS: BookmarkItem[] = [
  { id: 'bm-1', title: 'Google', url: 'https://www.google.com' },
  { id: 'bm-2', title: 'ChatGPT', url: 'https://chatgpt.com' },
  { id: 'bm-3', title: 'Gemini', url: 'https://gemini.google.com' },
  { id: 'bm-4', title: 'YouTube', url: 'https://m.youtube.com' },
  { id: 'bm-5', title: 'Donghua World', url: 'https://donghuaworld.com' },
  { id: 'bm-6', title: 'HHPANDA', url: 'https://hhpanda.st' },
  { id: 'bm-7', title: 'Bilibili TV', url: 'https://www.bilibili.tv' },
  { id: 'bm-8', title: 'Nyaa', url: 'https://nyaa.si' },
  { id: 'bm-9', title: 'Facebook', url: 'https://www.facebook.com' },
];

interface BookmarkSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelectUrl: (url: string) => void;
  currentUrl?: string | null;
  currentTitle?: string | null;
  userEmail?: string;
}

export const BookmarkSheet: React.FC<BookmarkSheetProps> = ({
  visible,
  onClose,
  onSelectUrl,
  currentUrl,
  currentTitle,
  userEmail,
}) => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 48 : 24);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 34 : 16);

  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isAddMode, setIsAddMode] = useState<boolean>(false);
  const [addTitle, setAddTitle] = useState<string>('');
  const [addUrl, setAddUrl] = useState<string>('');

  const getStorageKey = () =>
    userEmail ? `${STORAGE_BOOKMARKS_KEY}_${userEmail.toLowerCase()}` : STORAGE_BOOKMARKS_KEY;

  useEffect(() => {
    if (visible) {
      loadBookmarks();
      setIsAddMode(false);
    }
  }, [visible, userEmail]);

  const loadBookmarks = async () => {
    try {
      const key = getStorageKey();
      const data = await AsyncStorage.getItem(key);
      if (data) {
        setBookmarks(JSON.parse(data));
      } else {
        setBookmarks(DEFAULT_BOOKMARKS);
        await AsyncStorage.setItem(key, JSON.stringify(DEFAULT_BOOKMARKS));
      }
    } catch (e) {
      console.log('Error loading bookmarks:', e);
    }
  };

  const saveBookmarks = async (newList: BookmarkItem[]) => {
    setBookmarks(newList);
    try {
      await AsyncStorage.setItem(getStorageKey(), JSON.stringify(newList));
    } catch (e) {}
  };

  const handleDeleteItem = async (id: string) => {
    const updated = bookmarks.filter((item) => item.id !== id);
    await saveBookmarks(updated);
  };

  const handleAddNewBookmark = async () => {
    if (!addTitle.trim() || !addUrl.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tên và địa chỉ web.');
      return;
    }
    let url = addUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    const newItem: BookmarkItem = {
      id: `bm-${Date.now()}`,
      title: addTitle.trim(),
      url,
      timestamp: Date.now(),
    };
    const updated = [newItem, ...bookmarks];
    await saveBookmarks(updated);
    setAddTitle('');
    setAddUrl('');
    setIsAddMode(false);
  };

  const openAddCurrentPage = () => {
    if (currentUrl) {
      setAddTitle(currentTitle || currentUrl);
      setAddUrl(currentUrl);
    } else {
      setAddTitle('');
      setAddUrl('');
    }
    setIsAddMode(true);
  };

  const filteredBookmarks = bookmarks.filter(
    (item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getFaviconUrl = (url: string) => {
    return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url)}`;
  };

  const getCleanDomain = (url: string) => {
    try {
      return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    } catch (e) {
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
      <View style={styles.modalBackdrop}>
        <View style={[styles.sheetContainer, { paddingTop: topInset + 6, paddingBottom: bottomInset + 10 }]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Thanh dấu trang</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Feather name="x" size={18} color="#09090b" />
            </TouchableOpacity>
          </View>

          {/* Thanh tìm kiếm dấu trang */}
          <View style={styles.searchBar}>
            <Feather name="search" size={16} color="#71717a" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm kiếm"
              placeholderTextColor="#a1a1aa"
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
              autoCapitalize="none"
            />
          </View>

          {/* Form thêm dấu trang mới */}
          {isAddMode && (
            <View style={styles.addFormCard}>
              <Text style={styles.addFormTitle}>Thêm dấu trang mới</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Tên trang web"
                placeholderTextColor="#a1a1aa"
                value={addTitle}
                onChangeText={setAddTitle}
              />
              <TextInput
                style={styles.formInput}
                placeholder="Địa chỉ URL (https://...)"
                placeholderTextColor="#a1a1aa"
                value={addUrl}
                onChangeText={setAddUrl}
                autoCapitalize="none"
                keyboardType="url"
              />
              <View style={styles.formBtnRow}>
                <TouchableOpacity
                  style={styles.formCancelBtn}
                  onPress={() => setIsAddMode(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.formCancelText}>Hủy</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.formSubmitBtn}
                  onPress={handleAddNewBookmark}
                  activeOpacity={0.8}
                >
                  <Text style={styles.formSubmitText}>Lưu dấu trang</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Danh sách Dấu trang phong cách iOS */}
          <View style={styles.listCard}>
            {filteredBookmarks.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Feather name="bookmark" size={40} color="#d4d4d8" />
                <Text style={styles.emptyText}>Chưa có dấu trang nào</Text>
              </View>
            ) : (
              <FlatList
                data={filteredBookmarks}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.bookmarkRow}
                    onPress={() => {
                      onSelectUrl(item.url);
                      onClose();
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.faviconBox}>
                      <Image
                        source={{ uri: getFaviconUrl(item.url) }}
                        style={styles.favicon}
                        resizeMode="contain"
                      />
                    </View>

                    <View style={styles.infoArea}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.itemUrl} numberOfLines={1}>
                        {getCleanDomain(item.url)}
                      </Text>
                    </View>

                    <TouchableOpacity
                      onPress={() => handleDeleteItem(item.id)}
                      style={styles.deleteRowBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Feather name="x" size={15} color="#a1a1aa" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>

          {/* Thanh đáy: Thêm dấu trang */}
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={styles.addBookmarkBtn}
              onPress={openAddCurrentPage}
              activeOpacity={0.8}
            >
              <Feather name="bookmark" size={16} color="#007aff" />
              <Text style={styles.addBookmarkText}>
                {currentUrl ? 'Đánh dấu trang hiện tại' : 'Thêm dấu trang'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    flex: 1,
    backgroundColor: theme.colors.sheetBackground,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 16,
    marginTop: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#09090b',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#09090b',
  },
  listCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  bookmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  faviconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#f4f4f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  favicon: {
    width: 22,
    height: 22,
    borderRadius: 4,
  },
  infoArea: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#09090b',
    marginBottom: 2,
  },
  itemUrl: {
    fontSize: 12,
    color: '#71717a',
  },
  deleteRowBtn: {
    padding: 6,
    marginLeft: 8,
  },
  separator: {
    height: 1,
    backgroundColor: '#e4e4e7',
    marginLeft: 64,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#71717a',
  },
  bottomBar: {
    paddingTop: 12,
    alignItems: 'center',
  },
  addBookmarkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  addBookmarkText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.accentBlue,
  },
  addFormCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  addFormTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#09090b',
    marginBottom: 12,
  },
  formInput: {
    height: 42,
    backgroundColor: '#f4f4f5',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#09090b',
    marginBottom: 10,
  },
  formBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  formCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#f4f4f5',
  },
  formCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#71717a',
  },
  formSubmitBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: theme.colors.accentBlue,
  },
  formSubmitText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
});
