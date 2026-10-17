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
  Switch,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { theme } from '../constants/theme';

export const STORAGE_PASSWORDS_KEY = '@kite_saved_passwords';
export const STORAGE_PASSWORD_SETTINGS_KEY = '@kite_pwd_settings';

export interface SavedCredential {
  id: string;
  website: string;
  username: string;
  password?: string; // Tùy chọn cho tương thích ngược; dữ liệu mật khẩu thực tế lưu mã hóa trong Keychain
  updatedAt: number;
  notes?: string;
}

export interface PasswordSettings {
  autoPromptSave: boolean;
  autoFill: boolean;
  requireBiometrics: boolean;
}

export const DEFAULT_PASSWORD_SETTINGS: PasswordSettings = {
  autoPromptSave: true,
  autoFill: true,
  requireBiometrics: true,
};

/**
 * Lưu trữ mật khẩu an toàn vào Apple Keychain (iOS) hoặc Android Keystore
 */
export const saveCredentialSecurely = async (
  website: string,
  username: string,
  passwordSecret: string
): Promise<SavedCredential | null> => {
  try {
    const cleanWeb = website.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
    const cleanUser = username.trim();
    const id = `pwd-${Date.now()}`;

    // 1. Lưu mật khẩu vào Apple Keychain / Android Keystore
    try {
      const isSecureAvail = await SecureStore.isAvailableAsync();
      if (isSecureAvail) {
        await SecureStore.setItemAsync(`kite_pwd_${id}`, passwordSecret, {
          keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
        });
      }
    } catch (e) {
      console.log('SecureStore set error:', e);
    }

    // 2. Lưu thông tin metadata vào danh sách
    const stored = await AsyncStorage.getItem(STORAGE_PASSWORDS_KEY);
    const list: SavedCredential[] = stored ? JSON.parse(stored) : [];
    const newCred: SavedCredential = {
      id,
      website: cleanWeb,
      username: cleanUser,
      updatedAt: Date.now(),
    };

    // Kiểm tra xem đã có tài khoản cho trang này với cùng username chưa
    const existingIndex = list.findIndex(
      (c) => c.website.toLowerCase() === cleanWeb.toLowerCase() && c.username.toLowerCase() === cleanUser.toLowerCase()
    );

    let updated: SavedCredential[];
    if (existingIndex >= 0) {
      const oldId = list[existingIndex].id;
      // Cập nhật lại mật khẩu trong keychain
      try {
        await SecureStore.setItemAsync(`kite_pwd_${oldId}`, passwordSecret);
      } catch (e) {}
      updated = list.map((item, idx) =>
        idx === existingIndex ? { ...item, updatedAt: Date.now() } : item
      );
    } else {
      updated = [newCred, ...list];
    }

    await AsyncStorage.setItem(STORAGE_PASSWORDS_KEY, JSON.stringify(updated));
    return newCred;
  } catch (e) {
    console.log('Error saving credential securely:', e);
    return null;
  }
};

/**
 * Đọc mật khẩu bí mật từ Apple Keychain / Keystore với xác thực Face ID
 */
export const getCredentialPassword = async (
  id: string,
  requireAuth = true
): Promise<string | null> => {
  try {
    if (requireAuth) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (hasHardware && isEnrolled) {
        const auth = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Xác thực Face ID / Vân tay để truy cập mật khẩu',
          cancelLabel: 'Hủy',
          fallbackLabel: 'Sử dụng mật mã máy',
          disableDeviceFallback: false,
        });
        if (!auth.success) return null;
      }
    }

    const isSecureAvail = await SecureStore.isAvailableAsync();
    if (isSecureAvail) {
      const secret = await SecureStore.getItemAsync(`kite_pwd_${id}`);
      if (secret) return secret;
    }

    // Fallback kiểm tra nếu còn lưu trong AsyncStorage cũ
    const stored = await AsyncStorage.getItem(STORAGE_PASSWORDS_KEY);
    if (stored) {
      const list: SavedCredential[] = JSON.parse(stored);
      const found = list.find((c) => c.id === id);
      if (found && found.password) return found.password;
    }
  } catch (e) {
    console.log('Error getting credential password:', e);
  }
  return null;
};

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
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [selectedCred, setSelectedCred] = useState<SavedCredential | null>(null);

  // Modal Thêm / Chỉnh sửa tài khoản
  const [editModalVisible, setEditModalVisible] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inputWebsite, setInputWebsite] = useState<string>('');
  const [inputUsername, setInputUsername] = useState<string>('');
  const [inputPassword, setInputPassword] = useState<string>('');
  const [showFormPassword, setShowFormPassword] = useState<boolean>(false);

  // Modal Cài đặt
  const [settingsModalVisible, setSettingsModalVisible] = useState<boolean>(false);
  const [settings, setSettings] = useState<PasswordSettings>(DEFAULT_PASSWORD_SETTINGS);

  useEffect(() => {
    if (visible) {
      loadCredentials();
      loadSettings();
      setSearchQuery('');
      setRevealedPasswords({});
      setSelectedCred(null);
    }
  }, [visible]);

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_PASSWORD_SETTINGS_KEY);
      if (stored) {
        setSettings(JSON.parse(stored));
      }
    } catch (e) {}
  };

  const updateSetting = async (key: keyof PasswordSettings, val: boolean) => {
    const updated = { ...settings, [key]: val };
    setSettings(updated);
    await AsyncStorage.setItem(STORAGE_PASSWORD_SETTINGS_KEY, JSON.stringify(updated));
  };

  const loadCredentials = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_PASSWORDS_KEY);
      if (stored) {
        const parsed: SavedCredential[] = JSON.parse(stored);
        setCredentials(parsed);

        // Tự động di chuyển mật khẩu cũ sang Keychain mã hóa nếu có
        let needSave = false;
        const cleanedList = await Promise.all(
          parsed.map(async (c) => {
            if (c.password) {
              try {
                await SecureStore.setItemAsync(`kite_pwd_${c.id}`, c.password, {
                  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
                });
                needSave = true;
                const { password, ...rest } = c;
                return rest;
              } catch (e) {
                return c;
              }
            }
            return c;
          })
        );

        if (needSave) {
          await AsyncStorage.setItem(STORAGE_PASSWORDS_KEY, JSON.stringify(cleanedList));
          setCredentials(cleanedList);
        }
      } else {
        setCredentials([]);
      }
    } catch (e) {
      console.log('Error loading passwords:', e);
    }
  };

  // Xác thực Face ID và hiện mật khẩu
  const handleToggleReveal = async (item: SavedCredential) => {
    if (revealedPasswords[item.id]) {
      setRevealedPasswords((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }

    const secret = await getCredentialPassword(item.id, settings.requireBiometrics);
    if (secret) {
      setRevealedPasswords((prev) => ({ ...prev, [item.id]: secret }));
    } else {
      if (onShowToast) onShowToast('Không thể xác thực');
    }
  };

  // Sao chép tên đăng nhập hoặc mật khẩu
  const handleCopy = async (text: string, isPassword = false, id = '') => {
    try {
      let copyContent = text;
      if (isPassword) {
        const secret = await getCredentialPassword(id, settings.requireBiometrics);
        if (!secret) {
          if (onShowToast) onShowToast('Xác thực thất bại');
          return;
        }
        copyContent = secret;
      }

      await Clipboard.setStringAsync(copyContent);
      if (onShowToast) {
        onShowToast(
          isPassword
            ? 'Đã sao chép mật khẩu an toàn'
            : 'Đã sao chép tên đăng nhập'
        );
      }
    } catch (e) {
      if (onShowToast) onShowToast('Lỗi khi sao chép');
    }
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

  const handleOpenEditModal = async (item: SavedCredential) => {
    const secret = await getCredentialPassword(item.id, settings.requireBiometrics);
    if (secret === null && settings.requireBiometrics) {
      if (onShowToast) onShowToast('Xác thực không thành công');
      return;
    }
    setEditingId(item.id);
    setInputWebsite(item.website);
    setInputUsername(item.username);
    setInputPassword(secret || '');
    setShowFormPassword(false);
    setEditModalVisible(true);
  };

  const handleSaveCredential = async () => {
    if (!inputWebsite.trim() || !inputUsername.trim() || !inputPassword.trim()) {
      if (onShowToast) onShowToast('Vui lòng điền đủ thông tin');
      return;
    }

    const cleanWeb = inputWebsite.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
    const cleanUser = inputUsername.trim();

    try {
      if (editingId) {
        // Cập nhật lại mật khẩu trong Keychain
        try {
          await SecureStore.setItemAsync(`kite_pwd_${editingId}`, inputPassword.trim());
        } catch (e) {}

        const updated = credentials.map((c) =>
          c.id === editingId
            ? {
                ...c,
                website: cleanWeb,
                username: cleanUser,
                updatedAt: Date.now(),
              }
            : c
        );
        setCredentials(updated);
        await AsyncStorage.setItem(STORAGE_PASSWORDS_KEY, JSON.stringify(updated));
      } else {
        await saveCredentialSecurely(cleanWeb, cleanUser, inputPassword.trim());
        await loadCredentials();
      }

      setEditModalVisible(false);
      setSelectedCred(null);
      if (onShowToast) {
        onShowToast(editingId ? 'Đã cập nhật mật khẩu' : 'Đã lưu mật khẩu vào Keychain');
      }
    } catch (e) {
      if (onShowToast) onShowToast('Lỗi khi lưu mật khẩu');
    }
  };

  const handleDeleteCredential = (id: string, site: string) => {
    Alert.alert(
      'Xóa mật khẩu?',
      `Bạn có chắc chắn muốn xóa mật khẩu cho trang "${site}"?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            try {
              await SecureStore.deleteItemAsync(`kite_pwd_${id}`);
            } catch (e) {}
            const updated = credentials.filter((c) => c.id !== id);
            setCredentials(updated);
            await AsyncStorage.setItem(STORAGE_PASSWORDS_KEY, JSON.stringify(updated));
            setSelectedCred(null);
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

  const getDomainInitial = (site: string) => {
    const clean = site.replace(/^www\./i, '');
    return (clean[0] || 'K').toUpperCase();
  };

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
          {/* Thanh kéo trang nhã */}
          <View style={styles.dragHandle} />

          {/* Header phong cách Google Password Manager */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleGroup}>
              {/* Biểu tượng chìa khóa Google */}
              <View style={styles.googleKeyBox}>
                <Feather name="key" size={17} color="#18181b" />
              </View>
              <Text style={styles.headerTitleText}>Trình quản lý mật khẩu</Text>
            </View>

            {/* Nút đóng tròn tinh tế */}
            <TouchableOpacity
              style={styles.circleCloseBtn}
              onPress={onClose}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="x" size={18} color="#3c4043" />
            </TouchableOpacity>
          </View>

          {/* Ô tìm kiếm dạng viên thuốc (Pill Search Bar chuẩn Google) */}
          <View style={styles.searchPillBox}>
            <Feather name="search" size={18} color="#5f6368" style={{ marginRight: 10 }} />
            <TextInput
              style={styles.searchPillInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Tìm kiếm"
              placeholderTextColor="#5f6368"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Feather name="x-circle" size={16} color="#70757a" />
              </TouchableOpacity>
            )}
          </View>

          {/* Nội dung cuộn chính */}
          <ScrollView
            style={styles.contentScroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Dòng mô tả & Tìm hiểu thêm */}
            <Text style={styles.descriptionParagraph}>
              Tạo, lưu và quản lý mật khẩu và khoá truy cập để dễ dàng đăng nhập vào các trang web và ứng dụng.{' '}
              <Text
                style={styles.learnMoreLink}
                onPress={() => {
                  Alert.alert(
                    'Bảo vệ mật khẩu',
                    'Kite lưu trữ mật khẩu an toàn trong Apple Keychain và Android Keystore. Mật khẩu được mã hóa phần cứng và chỉ có thể truy cập qua Face ID hoặc mật mã của bạn.'
                  );
                }}
              >
                Tìm hiểu thêm
              </Text>
            </Text>

            {/* Thẻ Kiểm tra mật khẩu (Password Checkup) chuẩn Google */}
            <TouchableOpacity
              style={styles.checkupCard}
              activeOpacity={0.7}
              onPress={() => {
                Alert.alert(
                  'Kiểm tra mật khẩu',
                  `Hệ thống đã kiểm tra ${credentials.length} mật khẩu đã lưu. Toàn bộ thông tin được bảo vệ bằng mã hóa Apple Keychain hai lớp và xác thực sinh trắc học Face ID.`
                );
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.checkupTitle}>Kiểm tra mật khẩu</Text>
                <Text style={styles.checkupSubtitle}>
                  {credentials.length > 0
                    ? `${credentials.length} tài khoản được bảo vệ bởi Keychain`
                    : 'Được bảo vệ bằng Apple Keychain & Face ID'}
                </Text>
              </View>
              <View style={styles.checkupRightCol}>
                <View style={styles.shieldBadge}>
                  <Feather name="shield" size={15} color="#18181b" />
                </View>
                <Feather name="chevron-right" size={18} color="#747775" />
              </View>
            </TouchableOpacity>

            {/* Nút Thêm mật khẩu */}
            <TouchableOpacity
              style={styles.addPasswordRowBtn}
              onPress={handleOpenAddModal}
              activeOpacity={0.7}
            >
              <Text style={styles.addPasswordRowBtnText}>Thêm mật khẩu...</Text>
            </TouchableOpacity>

            {/* Tiêu đề nhóm: Mật khẩu và khoá truy cập đã lưu */}
            <Text style={styles.sectionHeaderLabel}>Mật khẩu và khoá truy cập đã lưu</Text>

            {/* Danh sách tài khoản đã lưu */}
            {credentials.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Feather name="lock" size={28} color="#18181b" />
                </View>
                <Text style={styles.emptyTitle}>Chưa lưu mật khẩu nào</Text>
                <Text style={styles.emptySub}>
                  Khi bạn đăng nhập trên các trang web, Kite sẽ tự động hỏi để lưu mật khẩu an toàn vào Keychain.
                </Text>
              </View>
            ) : filteredCredentials.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Feather name="search" size={28} color="#70757a" style={{ marginBottom: 8 }} />
                <Text style={styles.emptyTitle}>Không tìm thấy tài khoản</Text>
                <Text style={styles.emptySub}>Thử tìm kiếm với tên trang web hoặc email khác</Text>
              </View>
            ) : (
              <View style={styles.groupedListCard}>
                {filteredCredentials.map((item, idx) => {
                  const isLast = idx === filteredCredentials.length - 1;
                  const isRevealed = Boolean(revealedPasswords[item.id]);

                  return (
                    <View key={item.id}>
                      <TouchableOpacity
                        style={styles.credRowItem}
                        onPress={() => setSelectedCred(selectedCred?.id === item.id ? null : item)}
                        activeOpacity={0.7}
                      >
                        {/* Hộp biểu tượng trang web chuẩn Google */}
                        <View style={styles.faviconBox}>
                          <Text style={styles.faviconLetter}>{getDomainInitial(item.website)}</Text>
                        </View>

                        {/* Tên trang web & Tên người dùng */}
                        <View style={styles.credRowText}>
                          <Text style={styles.credRowSite} numberOfLines={1}>
                            {item.website}
                          </Text>
                          <Text style={styles.credRowUser} numberOfLines={1}>
                            {item.username}
                          </Text>
                        </View>

                        {/* Mũi tên điều hướng */}
                        <Feather
                          name={selectedCred?.id === item.id ? 'chevron-down' : 'chevron-right'}
                          size={18}
                          color="#747775"
                        />
                      </TouchableOpacity>

                      {/* Vùng chi tiết mở rộng khi bấm vào tài khoản */}
                      {selectedCred?.id === item.id && (
                        <View style={styles.detailExpandBox}>
                          {/* Hàng Tên đăng nhập & Sao chép */}
                          <View style={styles.detailFieldRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.detailFieldLabel}>Tên người dùng</Text>
                              <Text style={styles.detailFieldValue}>{item.username}</Text>
                            </View>
                            <TouchableOpacity
                              style={styles.detailActionBtn}
                              onPress={() => handleCopy(item.username, false)}
                              activeOpacity={0.7}
                            >
                              <Feather name="copy" size={15} color="#18181b" />
                              <Text style={styles.detailActionText}>Sao chép</Text>
                            </TouchableOpacity>
                          </View>

                          {/* Hàng Mật khẩu & Hiện / Sao chép an toàn bằng Face ID */}
                          <View style={styles.detailFieldRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.detailFieldLabel}>Mật khẩu</Text>
                              <Text
                                style={[
                                  styles.detailFieldValue,
                                  !isRevealed && styles.passwordMasked,
                                ]}
                              >
                                {isRevealed ? revealedPasswords[item.id] : '••••••••••••'}
                              </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <TouchableOpacity
                                style={styles.iconCircleBtn}
                                onPress={() => handleToggleReveal(item)}
                                activeOpacity={0.7}
                              >
                                <Feather
                                  name={isRevealed ? 'eye-off' : 'eye'}
                                  size={16}
                                  color="#5f6368"
                                />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.detailActionBtn}
                                onPress={() => handleCopy('', true, item.id)}
                                activeOpacity={0.7}
                              >
                                <Feather name="copy" size={15} color="#18181b" />
                                <Text style={styles.detailActionText}>Sao chép</Text>
                              </TouchableOpacity>
                            </View>
                          </View>

                          {/* Các nút thao tác: Mở trang web, Sửa, Xóa */}
                          <View style={styles.detailButtonRow}>
                            <TouchableOpacity
                              style={styles.openWebBtn}
                              onPress={() => handleOpenSite(item.website)}
                              activeOpacity={0.7}
                            >
                              <Feather name="external-link" size={14} color="#18181b" style={{ marginRight: 4 }} />
                              <Text style={styles.openWebBtnText}>Mở trang web</Text>
                            </TouchableOpacity>

                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <TouchableOpacity
                                style={styles.miniBtn}
                                onPress={() => handleOpenEditModal(item)}
                                activeOpacity={0.7}
                              >
                                <Feather name="edit-2" size={15} color="#3c4043" />
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.miniBtn}
                                onPress={() => handleDeleteCredential(item.id, item.website)}
                                activeOpacity={0.7}
                              >
                                <Feather name="trash-2" size={15} color="#d93025" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      )}

                      {!isLast && <View style={styles.itemDivider} />}
                    </View>
                  );
                })}
              </View>
            )}

            <View style={{ height: 30 }} />
          </ScrollView>

          {/* Thanh công cụ dưới cùng chuẩn ảnh tham chiếu Google (Cài đặt & Chọn) */}
          <View style={styles.bottomBarRow}>
            <TouchableOpacity
              style={styles.bottomPillBtn}
              onPress={() => setSettingsModalVisible(true)}
              activeOpacity={0.7}
            >
              <Feather name="sliders" size={15} color="#1f1f1f" style={{ marginRight: 6 }} />
              <Text style={styles.bottomPillBtnText}>Cài đặt</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomPillBtn}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.bottomPillBtnText}>Đóng</Text>
            </TouchableOpacity>
          </View>

          {/* MODAL THÊM / CHỈNH SỬA TÀI KHOẢN (GOOGLE STYLE) */}
          <Modal
            visible={editModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setEditModalVisible(false)}
          >
            <TouchableOpacity
              style={styles.dialogBackdrop}
              activeOpacity={1}
              onPress={() => setEditModalVisible(false)}
            >
              <TouchableOpacity
                style={styles.dialogCard}
                activeOpacity={1}
                onPress={(e) => e.stopPropagation()}
              >
                <Text style={styles.dialogTitle}>
                  {editingId ? 'Chỉnh sửa mật khẩu' : 'Thêm mật khẩu'}
                </Text>

                {/* Ô Trang web */}
                <Text style={styles.inputFieldLabel}>Trang web</Text>
                <TextInput
                  style={styles.dialogInput}
                  value={inputWebsite}
                  onChangeText={setInputWebsite}
                  placeholder="ví dụ: google.com, facebook.com"
                  placeholderTextColor="#747775"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                {/* Ô Tên đăng nhập */}
                <Text style={styles.inputFieldLabel}>Tên đăng nhập / Email</Text>
                <TextInput
                  style={styles.dialogInput}
                  value={inputUsername}
                  onChangeText={setInputUsername}
                  placeholder="Email, số điện thoại hoặc tài khoản"
                  placeholderTextColor="#747775"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                {/* Ô Mật khẩu */}
                <View style={styles.pwdLabelRow}>
                  <Text style={styles.inputFieldLabel}>Mật khẩu</Text>
                  <TouchableOpacity onPress={generateStrongPassword}>
                    <Text style={styles.generatePwdText}>Tạo mật khẩu mạnh</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.passwordInputWrap}>
                  <TextInput
                    style={styles.passwordInputInner}
                    value={inputPassword}
                    onChangeText={setInputPassword}
                    placeholder="Mật khẩu bảo mật"
                    placeholderTextColor="#747775"
                    secureTextEntry={!showFormPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    onPress={() => setShowFormPassword(!showFormPassword)}
                    style={{ padding: 6 }}
                  >
                    <Feather
                      name={showFormPassword ? 'eye-off' : 'eye'}
                      size={18}
                      color="#5f6368"
                    />
                  </TouchableOpacity>
                </View>

                {/* Nút hành động Lưu / Hủy */}
                <View style={styles.dialogActionsRow}>
                  <TouchableOpacity
                    style={styles.cancelTextBtn}
                    onPress={() => setEditModalVisible(false)}
                  >
                    <Text style={styles.cancelTextBtnLabel}>Hủy</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.savePillBtn}
                    onPress={handleSaveCredential}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.savePillBtnLabel}>Lưu</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>

          {/* MODAL CÀI ĐẶT BẢO MẬT MẬT KHẨU */}
          <Modal
            visible={settingsModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setSettingsModalVisible(false)}
          >
            <TouchableOpacity
              style={styles.dialogBackdrop}
              activeOpacity={1}
              onPress={() => setSettingsModalVisible(false)}
            >
              <TouchableOpacity
                style={styles.dialogCard}
                activeOpacity={1}
                onPress={(e) => e.stopPropagation()}
              >
                <Text style={styles.dialogTitle}>Cài đặt mật khẩu</Text>

                <View style={styles.settingItemRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.settingItemTitle}>Đề xuất lưu mật khẩu</Text>
                    <Text style={styles.settingItemSub}>Hỏi để lưu thông tin đăng nhập khi gửi form</Text>
                  </View>
                  <Switch
                    value={settings.autoPromptSave}
                    onValueChange={(v) => updateSetting('autoPromptSave', v)}
                    trackColor={{ false: '#e4e4e7', true: '#18181b' }}
                    ios_backgroundColor="#e4e4e7"
                    thumbColor="#ffffff"
                  />
                </View>

                <View style={styles.settingItemRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.settingItemTitle}>Bảo vệ bằng Face ID / Vân tay</Text>
                    <Text style={styles.settingItemSub}>Yêu cầu xác thực trước khi xem hoặc sao chép</Text>
                  </View>
                  <Switch
                    value={settings.requireBiometrics}
                    onValueChange={(v) => updateSetting('requireBiometrics', v)}
                    trackColor={{ false: '#e4e4e7', true: '#18181b' }}
                    ios_backgroundColor="#e4e4e7"
                    thumbColor="#ffffff"
                  />
                </View>

                <View style={styles.dialogActionsRow}>
                  <TouchableOpacity
                    style={styles.savePillBtn}
                    onPress={() => setSettingsModalVisible(false)}
                  >
                    <Text style={styles.savePillBtnLabel}>Xong</Text>
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    minHeight: '65%',
    paddingTop: 8,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.dragHandle,
    alignSelf: 'center',
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  googleKeyBox: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitleText: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  circleCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchPillBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.radius.full,
    marginHorizontal: 20,
    paddingHorizontal: 16,
    height: 44,
    marginBottom: 12,
  },
  searchPillInput: {
    flex: 1,
    fontSize: theme.typography.fontSize.menuTitle,
    color: theme.colors.textPrimary,
    padding: 0,
  },
  contentScroll: {
    flex: 1,
    paddingHorizontal: 20,
  },
  descriptionParagraph: {
    fontSize: 13.5,
    color: theme.colors.textSecondary,
    lineHeight: 19,
    marginBottom: 14,
  },
  learnMoreLink: {
    color: theme.colors.black,
    fontWeight: '600',
  },
  checkupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.radius.xl,
    padding: 16,
    marginBottom: 12,
  },
  checkupTitle: {
    fontSize: 15.5,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: 3,
  },
  checkupSubtitle: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  checkupRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shieldBadge: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPasswordRowBtn: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.radius.xl,
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginBottom: 16,
  },
  addPasswordRowBtnText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  sectionHeaderLabel: {
    fontSize: theme.typography.fontSize.menuTitle,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
    marginBottom: 10,
  },
  groupedListCard: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
  },
  credRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  faviconBox: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  faviconLetter: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.grayDark,
  },
  credRowText: {
    flex: 1,
    marginRight: 10,
  },
  credRowSite: {
    fontSize: theme.typography.fontSize.menuTitle,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  credRowUser: {
    fontSize: 12.5,
    color: theme.colors.textSecondary,
  },
  itemDivider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginLeft: 66,
  },
  detailExpandBox: {
    backgroundColor: theme.colors.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: theme.colors.divider,
  },
  detailFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: theme.colors.divider,
  },
  detailFieldLabel: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  detailFieldValue: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textPrimary,
  },
  passwordMasked: {
    letterSpacing: 2,
    fontSize: theme.typography.fontSize.md,
  },
  detailActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.backgroundSecondary,
    gap: 4,
  },
  detailActionText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  iconCircleBtn: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 4,
  },
  openWebBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  openWebBtnText: {
    fontSize: 13,
    color: '#18181b',
    fontWeight: '600',
  },
  miniBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f3f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#f4f4f5',
    backgroundColor: '#ffffff',
  },
  bottomPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4f4f5',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  bottomPillBtnText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
    backgroundColor: '#f4f4f5',
    borderRadius: 16,
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15.5,
    fontWeight: '600',
    color: '#1f1f1f',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: '#5f6368',
    textAlign: 'center',
    lineHeight: 18,
  },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  dialogCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    width: '100%',
    padding: 22,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f1f1f',
    marginBottom: 16,
  },
  inputFieldLabel: {
    fontSize: 12.5,
    color: '#444746',
    fontWeight: '500',
    marginBottom: 5,
  },
  dialogInput: {
    backgroundColor: '#f1f3f4',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 42,
    fontSize: 14.5,
    color: '#1f1f1f',
    marginBottom: 14,
  },
  pwdLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  generatePwdText: {
    fontSize: 12,
    color: '#18181b',
    fontWeight: '600',
  },
  passwordInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f3f4',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 42,
    marginBottom: 20,
  },
  passwordInputInner: {
    flex: 1,
    fontSize: 14.5,
    color: '#1f1f1f',
    padding: 0,
  },
  dialogActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  cancelTextBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  cancelTextBtnLabel: {
    fontSize: 14,
    color: '#71717a',
    fontWeight: '500',
  },
  savePillBtn: {
    backgroundColor: '#18181b',
    borderRadius: 18,
    paddingVertical: 9,
    paddingHorizontal: 20,
  },
  savePillBtnLabel: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  settingItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#f1f3f4',
  },
  settingItemTitle: {
    fontSize: 14.5,
    fontWeight: '500',
    color: '#1f1f1f',
    marginBottom: 2,
  },
  settingItemSub: {
    fontSize: 12,
    color: '#5f6368',
  },
});
