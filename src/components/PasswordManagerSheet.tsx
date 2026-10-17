import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
  Alert,
  Image,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

export const STORAGE_PASSWORDS_KEY = '@kite_saved_passwords';

export interface SavedCredential {
  id: string;
  website: string;
  username: string;
  password: string;
  updatedAt: number;
  notes?: string;
}

interface PasswordManagerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelectUrl?: (url: string) => void;
  onShowToast?: (message: string) => void;
}

export const PasswordManagerSheet: React.FC<PasswordManagerSheetProps> = ({
  visible,
  onClose,
  onSelectUrl,
  onShowToast,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 16);

  const [credentials, setCredentials] = useState<SavedCredential[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  // Trạng thái modal Thêm / Sửa mật khẩu
  const [editModalVisible, setEditModalVisible] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inputWebsite, setInputWebsite] = useState<string>('');
  const [inputUsername, setInputUsername] = useState<string>('');
  const [inputPassword, setInputPassword] = useState<string>('');
  const [showFormPassword, setShowFormPassword] = useState<boolean>(false);

  useEffect(() => {
    if (visible) {
      loadCredentials();
      setSearchQuery('');
      setVisiblePasswords({});
    }
  }, [visible]);

  const loadCredentials = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_PASSWORDS_KEY);
      if (stored) {
        setCredentials(JSON.parse(stored));
      } else {
        // Mật khẩu mẫu nếu người dùng lần đầu mở
        setCredentials([]);
      }
    } catch (e) {
      console.log('Error loading passwords:', e);
    }
  };

  const handleCopyText = async (text: string, type: 'username' | 'password') => {
    try {
      await Clipboard.setStringAsync(text);
      if (onShowToast) {
        onShowToast(
          type === 'username'
            ? 'Đã sao chép tên đăng nhập'
            : 'Đã sao chép mật khẩu vào bộ nhớ tạm'
        );
      }
    } catch (e) {
      if (onShowToast) onShowToast('Không thể sao chép');
    }
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const generateStrongPassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=';
    let result = '';
    for (let i = 0; i < 16; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setInputPassword(result);
    setShowFormPassword(true);
    if (onShowToast) onShowToast('Đã tạo mật khẩu mạnh ngẫu nhiên');
  };

  const handleOpenAddModal = () => {
    setEditingId(null);
    setInputWebsite('');
    setInputUsername('');
    setInputPassword('');
    setShowFormPassword(false);
    setEditModalVisible(true);
  };

  const handleOpenEditModal = (item: SavedCredential) => {
    setEditingId(item.id);
    setInputWebsite(item.website);
    setInputUsername(item.username);
    setInputPassword(item.password);
    setShowFormPassword(false);
    setEditModalVisible(true);
  };

  const handleSaveCredential = async () => {
    if (!inputWebsite.trim() || !inputUsername.trim() || !inputPassword.trim()) {
      if (onShowToast) onShowToast('Vui lòng điền đủ trang web, tài khoản và mật khẩu');
      return;
    }

    let cleanWeb = inputWebsite.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');

    try {
      let updated: SavedCredential[];
      if (editingId) {
        updated = credentials.map((c) =>
          c.id === editingId
            ? {
                ...c,
                website: cleanWeb,
                username: inputUsername.trim(),
                password: inputPassword.trim(),
                updatedAt: Date.now(),
              }
            : c
        );
      } else {
        const newItem: SavedCredential = {
          id: `pwd-${Date.now()}`,
          website: cleanWeb,
          username: inputUsername.trim(),
          password: inputPassword.trim(),
          updatedAt: Date.now(),
        };
        updated = [newItem, ...credentials];
      }

      setCredentials(updated);
      await AsyncStorage.setItem(STORAGE_PASSWORDS_KEY, JSON.stringify(updated));
      setEditModalVisible(false);
      if (onShowToast) {
        onShowToast(editingId ? 'Đã cập nhật mật khẩu' : 'Đã thêm tài khoản mới');
      }
    } catch (e) {
      if (onShowToast) onShowToast('Lỗi khi lưu mật khẩu');
    }
  };

  const handleDeleteCredential = (id: string, site: string) => {
    Alert.alert(
      'Xóa mật khẩu đã lưu?',
      `Bạn có chắc chắn muốn xóa mật khẩu cho trang "${site}"?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            const updated = credentials.filter((c) => c.id !== id);
            setCredentials(updated);
            await AsyncStorage.setItem(STORAGE_PASSWORDS_KEY, JSON.stringify(updated));
            if (onShowToast) onShowToast('Đã xóa mật khẩu');
          },
        },
      ]
    );
  };

  const handleOpenSite = (website: string) => {
    if (!onSelectUrl) return;
    let url = website;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    onClose();
    onSelectUrl(url);
  };

  const filteredCredentials = credentials.filter(
    (c) =>
      c.website.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
      c.username.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const getFavicon = (site: string) => {
    return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(site)}`;
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

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.titleGroup}>
              <View style={styles.titleIconBox}>
                <Feather name="key" size={18} color="#16a34a" />
              </View>
              <Text style={styles.sheetTitle}>Trình quản lý mật khẩu</Text>
              {credentials.length > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{credentials.length}</Text>
                </View>
              )}
            </View>

            <View style={styles.headerRightActions}>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={handleOpenAddModal}
                activeOpacity={0.7}
              >
                <Feather name="plus" size={16} color="#ffffff" />
                <Text style={styles.addBtnText}>Thêm</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Feather name="x" size={20} color="#52525b" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Ô tìm kiếm tài khoản */}
          {credentials.length > 0 && (
            <View style={styles.searchBarBox}>
              <Feather name="search" size={16} color="#71717a" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Tìm trang web hoặc tài khoản..."
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

          {/* Danh sách thẻ mật khẩu */}
          <ScrollView
            style={styles.listScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={credentials.length === 0 ? styles.emptyScroll : undefined}
          >
            {credentials.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Feather name="shield" size={40} color="#16a34a" />
                </View>
                <Text style={styles.emptyTitle}>Chưa lưu mật khẩu nào</Text>
                <Text style={styles.emptySub}>
                  Mật khẩu và tài khoản của bạn được lưu an toàn cục bộ trên thiết bị này. Nhấn "Thêm" để lưu tài khoản đầu tiên.
                </Text>
                <TouchableOpacity
                  style={styles.emptyAddBtn}
                  onPress={handleOpenAddModal}
                  activeOpacity={0.8}
                >
                  <Feather name="plus" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.emptyAddBtnText}>Thêm mật khẩu mới</Text>
                </TouchableOpacity>
              </View>
            ) : filteredCredentials.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Feather name="search" size={32} color="#a1a1aa" style={{ marginBottom: 10 }} />
                <Text style={styles.emptyTitle}>Không tìm thấy tài khoản</Text>
                <Text style={styles.emptySub}>Thử tìm kiếm với tên miền hoặc email khác</Text>
              </View>
            ) : (
              filteredCredentials.map((item) => {
                const isRevealed = !!visiblePasswords[item.id];

                return (
                  <View key={item.id} style={styles.credCard}>
                    {/* Header của thẻ: Favicon + Domain + Nút Truy cập & Sửa & Xóa */}
                    <View style={styles.credCardHeader}>
                      <View style={styles.siteInfoRow}>
                        <Image
                          source={{ uri: getFavicon(item.website) }}
                          style={styles.siteFavicon}
                        />
                        <TouchableOpacity
                          onPress={() => handleOpenSite(item.website)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.siteName} numberOfLines={1}>
                            {item.website}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.cardActionsRow}>
                        <TouchableOpacity
                          style={styles.cardMiniBtn}
                          onPress={() => handleOpenSite(item.website)}
                          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        >
                          <Feather name="external-link" size={15} color="#007aff" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.cardMiniBtn}
                          onPress={() => handleOpenEditModal(item)}
                          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        >
                          <Feather name="edit-2" size={15} color="#52525b" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.cardMiniBtn}
                          onPress={() => handleDeleteCredential(item.id, item.website)}
                          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        >
                          <Feather name="trash-2" size={15} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Hàng Tên đăng nhập */}
                    <View style={styles.credFieldRow}>
                      <View style={styles.fieldLabelGroup}>
                        <Feather name="user" size={14} color="#71717a" style={{ marginRight: 6 }} />
                        <Text style={styles.fieldValue} numberOfLines={1}>
                          {item.username}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.copyBtn}
                        onPress={() => handleCopyText(item.username, 'username')}
                        activeOpacity={0.7}
                      >
                        <Feather name="copy" size={13} color="#007aff" style={{ marginRight: 4 }} />
                        <Text style={styles.copyBtnText}>Sao chép</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Hàng Mật khẩu */}
                    <View style={[styles.credFieldRow, { borderBottomWidth: 0 }]}>
                      <View style={styles.fieldLabelGroup}>
                        <Feather name="lock" size={14} color="#71717a" style={{ marginRight: 6 }} />
                        <Text
                          style={[
                            styles.fieldValue,
                            !isRevealed && styles.passwordHiddenText,
                          ]}
                          numberOfLines={1}
                        >
                          {isRevealed ? item.password : '••••••••••••'}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity
                          style={styles.eyeBtn}
                          onPress={() => togglePasswordVisibility(item.id)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Feather
                            name={isRevealed ? 'eye-off' : 'eye'}
                            size={15}
                            color="#71717a"
                          />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.copyBtn}
                          onPress={() => handleCopyText(item.password, 'password')}
                          activeOpacity={0.7}
                        >
                          <Feather name="copy" size={13} color="#007aff" style={{ marginRight: 4 }} />
                          <Text style={styles.copyBtnText}>Sao chép</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* MODAL THÊM / CHỈNH SỬA TÀI KHOẢN */}
          <Modal
            visible={editModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setEditModalVisible(false)}
          >
            <TouchableOpacity
              style={styles.innerModalBackdrop}
              activeOpacity={1}
              onPress={() => setEditModalVisible(false)}
            >
              <TouchableOpacity
                style={styles.innerModalBox}
                activeOpacity={1}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={styles.innerModalHeader}>
                  <Text style={styles.innerModalTitle}>
                    {editingId ? 'Chỉnh sửa tài khoản' : 'Thêm tài khoản mới'}
                  </Text>
                  <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                    <Feather name="x" size={20} color="#71717a" />
                  </TouchableOpacity>
                </View>

                {/* Form fields */}
                <Text style={styles.inputLabel}>Trang web hoặc tên miền</Text>
                <TextInput
                  style={styles.modalInput}
                  value={inputWebsite}
                  onChangeText={setInputWebsite}
                  placeholder="Ví dụ: google.com, facebook.com"
                  placeholderTextColor="#a1a1aa"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text style={styles.inputLabel}>Tên đăng nhập hoặc Email</Text>
                <TextInput
                  style={styles.modalInput}
                  value={inputUsername}
                  onChangeText={setInputUsername}
                  placeholder="email@example.com hoặc username"
                  placeholderTextColor="#a1a1aa"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.inputLabel}>Mật khẩu</Text>
                  <TouchableOpacity onPress={generateStrongPassword}>
                    <Text style={styles.generateText}>✨ Tạo mật khẩu mạnh</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.passwordInputContainer}>
                  <TextInput
                    style={styles.modalPasswordInput}
                    value={inputPassword}
                    onChangeText={setInputPassword}
                    placeholder="Nhập mật khẩu..."
                    placeholderTextColor="#a1a1aa"
                    secureTextEntry={!showFormPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={{ padding: 8 }}
                    onPress={() => setShowFormPassword(!showFormPassword)}
                  >
                    <Feather
                      name={showFormPassword ? 'eye-off' : 'eye'}
                      size={17}
                      color="#71717a"
                    />
                  </TouchableOpacity>
                </View>

                {/* Nút hành động */}
                <View style={styles.innerModalActions}>
                  <TouchableOpacity
                    style={styles.innerCancelBtn}
                    onPress={() => setEditModalVisible(false)}
                  >
                    <Text style={styles.innerCancelText}>Hủy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.innerSaveBtn}
                    onPress={handleSaveCredential}
                  >
                    <Text style={styles.innerSaveText}>Lưu tài khoản</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
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
    maxHeight: '86%',
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
    backgroundColor: '#f0fdf4',
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
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#71717a',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#16a34a',
  },
  addBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
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
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#09090b',
    paddingVertical: 0,
  },
  listScroll: {
    maxHeight: 490,
  },
  emptyScroll: {
    paddingVertical: 36,
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#f0fdf4',
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
    marginBottom: 18,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16a34a',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 16,
  },
  emptyAddBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  credCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  credCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    marginBottom: 10,
  },
  siteInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  siteFavicon: {
    width: 22,
    height: 22,
    borderRadius: 6,
  },
  siteName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardMiniBtn: {
    padding: 4,
  },
  credFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
  },
  fieldLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  fieldValue: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  passwordHiddenText: {
    letterSpacing: 2,
    fontSize: 14,
  },
  eyeBtn: {
    padding: 4,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
  },
  copyBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#007aff',
  },
  innerModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  innerModalBox: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  innerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  innerModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#09090b',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#52525b',
    marginBottom: 6,
    marginTop: 8,
  },
  generateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16a34a',
    marginTop: 8,
  },
  modalInput: {
    backgroundColor: '#f4f4f5',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 14,
    color: '#09090b',
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4f4f5',
    borderRadius: 12,
    paddingLeft: 12,
    paddingRight: 6,
    height: 42,
  },
  modalPasswordInput: {
    flex: 1,
    fontSize: 14,
    color: '#09090b',
  },
  innerModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
  },
  innerCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#f4f4f5',
  },
  innerCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#71717a',
  },
  innerSaveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#16a34a',
  },
  innerSaveText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
});
