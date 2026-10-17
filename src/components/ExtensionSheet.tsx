import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  Platform,
  Alert,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File } from 'expo-file-system';

export const STORAGE_EXTENSIONS_KEY = '@kite_user_extensions';

export interface ExtensionItem {
  id: string;
  name: string;
  description: string;
  matchUrl: string; // e.g. "*", "youtube.com", "facebook.com"
  code: string;
  runAt: 'document_start' | 'document_end';
  enabled: boolean;
  isBuiltIn?: boolean;
  updatedAt: number;
}

export const DEFAULT_EXTENSIONS: ExtensionItem[] = [
  {
    id: 'ext-dark-mode',
    name: 'Giao diện nền tối (Dark Mode Script)',
    description: 'Tự động đảo ngược màu nền và bảo vệ mắt trên các trang web có nền trắng chói',
    matchUrl: '*',
    code: `(function() {
  if (window.__kite_dark_mode_applied) return;
  window.__kite_dark_mode_applied = true;
  const style = document.createElement('style');
  style.id = 'kite-dark-mode-style';
  style.textContent = \`
    html, body {
      background-color: #121212 !important;
      color: #e4e4e7 !important;
    }
    img, video, iframe, canvas {
      filter: brightness(0.9) contrast(1.05) !important;
    }
  \`;
  document.head ? document.head.appendChild(style) : document.documentElement.appendChild(style);
})();`,
    runAt: 'document_end',
    enabled: false,
    isBuiltIn: true,
    updatedAt: Date.now(),
  },
  {
    id: 'ext-skip-ads',
    name: 'Tự động bỏ qua quảng cáo Video (Auto Skip Ads)',
    description: 'Tự động tìm kiếm và nhấn nút "Bỏ qua quảng cáo" trên các trình phát video HTML5',
    matchUrl: '*',
    code: `(function() {
  setInterval(function() {
    try {
      const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .videoAdUiSkipButton, button[class*="skip"]');
      if (skipBtn) {
        skipBtn.click();
      }
      const adOverlay = document.querySelector('.ytp-ad-overlay-close-button');
      if (adOverlay) {
        adOverlay.click();
      }
    } catch(e) {}
  }, 800);
})();`,
    runAt: 'document_end',
    enabled: true,
    isBuiltIn: true,
    updatedAt: Date.now(),
  },
  {
    id: 'ext-speed-controller',
    name: 'Tùy chỉnh tốc độ video (Video Speed Helper)',
    description: 'Tự động kích hoạt thanh điều khiển phím tắt tăng tốc độ phát video lên 1.5x / 2.0x',
    matchUrl: '*',
    code: `(function() {
  window.setAllVideoSpeed = function(rate) {
    document.querySelectorAll('video').forEach(function(v) {
      v.playbackRate = rate;
    });
  };
})();`,
    runAt: 'document_end',
    enabled: true,
    isBuiltIn: true,
    updatedAt: Date.now(),
  },
];

export const isUrlMatchingPattern = (url: string, pattern: string): boolean => {
  if (!pattern || pattern.trim() === '*' || pattern.trim() === '<all_urls>') return true;
  try {
    const cleanPattern = pattern.trim().toLowerCase();
    const cleanUrl = url.toLowerCase();
    if (!cleanPattern.includes('*')) {
      return cleanUrl.includes(cleanPattern);
    }
    const regexPattern = cleanPattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}$`, 'i').test(url);
  } catch {
    return true;
  }
};

interface ExtensionSheetProps {
  visible: boolean;
  onClose: () => void;
  onShowToast?: (message: string) => void;
  onExtensionsUpdated?: (extensions: ExtensionItem[]) => void;
}

export const ExtensionSheet: React.FC<ExtensionSheetProps> = ({
  visible,
  onClose,
  onShowToast,
  onExtensionsUpdated,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 16);

  const [extensions, setExtensions] = useState<ExtensionItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal tạo / chỉnh sửa tiện ích
  const [editModalVisible, setEditModalVisible] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inputName, setInputName] = useState<string>('');
  const [inputDesc, setInputDesc] = useState<string>('');
  const [inputMatchUrl, setInputMatchUrl] = useState<string>('*');
  const [inputCode, setInputCode] = useState<string>('');
  const [inputRunAt, setInputRunAt] = useState<'document_start' | 'document_end'>('document_end');

  useEffect(() => {
    if (visible) {
      loadExtensions();
      setSearchQuery('');
    }
  }, [visible]);

  const loadExtensions = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_EXTENSIONS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setExtensions(parsed);
      } else {
        setExtensions(DEFAULT_EXTENSIONS);
        await AsyncStorage.setItem(STORAGE_EXTENSIONS_KEY, JSON.stringify(DEFAULT_EXTENSIONS));
      }
    } catch (e) {
      setExtensions(DEFAULT_EXTENSIONS);
    }
  };

  const saveExtensionsToStorage = async (updated: ExtensionItem[]) => {
    setExtensions(updated);
    await AsyncStorage.setItem(STORAGE_EXTENSIONS_KEY, JSON.stringify(updated));
    if (onExtensionsUpdated) onExtensionsUpdated(updated);
  };

  const handleToggleExtension = async (id: string) => {
    const updated = extensions.map((ext) =>
      ext.id === id ? { ...ext, enabled: !ext.enabled, updatedAt: Date.now() } : ext
    );
    await saveExtensionsToStorage(updated);
    const target = updated.find((e) => e.id === id);
    if (onShowToast) {
      onShowToast(target?.enabled ? `Đã bật: ${target.name}` : `Đã tắt: ${target?.name}`);
    }
  };

  const handleDeleteExtension = (id: string, name: string) => {
    Alert.alert(
      'Xóa tiện ích mở rộng?',
      `Bạn có chắc chắn muốn xóa extension "${name}"?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            const updated = extensions.filter((e) => e.id !== id);
            await saveExtensionsToStorage(updated);
            if (onShowToast) onShowToast('Đã xóa tiện ích');
          },
        },
      ]
    );
  };

  const handleOpenAddModal = () => {
    setEditingId(null);
    setInputName('');
    setInputDesc('');
    setInputMatchUrl('*');
    setInputRunAt('document_end');
    setInputCode(`// Nhập mã JavaScript của bạn tại đây
(function() {
  console.log('Kite Extension running on:', window.location.href);
})();`);
    setEditModalVisible(true);
  };

  const handleOpenEditModal = (ext: ExtensionItem) => {
    setEditingId(ext.id);
    setInputName(ext.name);
    setInputDesc(ext.description);
    setInputMatchUrl(ext.matchUrl);
    setInputRunAt(ext.runAt);
    setInputCode(ext.code);
    setEditModalVisible(true);
  };

  // Nhập tệp .js hoặc .user.js từ bộ nhớ máy
  const handlePickFile = async () => {
    try {
      const pickRes = await File.pickFileAsync({
        mimeTypes: ['text/javascript', 'application/javascript', 'text/plain', '*/*'],
      });

      if (!pickRes.canceled && pickRes.result) {
        const file = pickRes.result;
        let content = '';
        try {
          content = await file.text();
        } catch {
          const buf = await file.arrayBuffer();
          content = new TextDecoder('utf-8').decode(buf);
        }

        if (!content || !content.trim()) {
          if (onShowToast) onShowToast('Tệp rỗng hoặc không đọc được');
          return;
        }

        // Tự động phân tích Userscript Header nếu có
        let name = (file.name || 'Custom Extension').replace(/\.user\.js$/i, '').replace(/\.js$/i, '');
        let matchUrl = '*';
        let desc = 'Tiện ích nhập từ tệp ' + (file.name || '');
        let runAt: 'document_start' | 'document_end' = 'document_end';

        const nameMatch = content.match(/@name\s+(.+)$/m);
        if (nameMatch) name = nameMatch[1].trim();

        const descMatch = content.match(/@description\s+(.+)$/m);
        if (descMatch) desc = descMatch[1].trim();

        const matchMatch = content.match(/@(match|include)\s+(.+)$/m);
        if (matchMatch) matchUrl = matchMatch[2].trim();

        const runAtMatch = content.match(/@run-at\s+(document-start|document_start|document-end|document_end)/im);
        if (runAtMatch && runAtMatch[1].toLowerCase().includes('start')) {
          runAt = 'document_start';
        }

        setEditingId(null);
        setInputName(name);
        setInputDesc(desc);
        setInputMatchUrl(matchUrl);
        setInputRunAt(runAt);
        setInputCode(content);
        setEditModalVisible(true);
        if (onShowToast) onShowToast('Đã đọc tệp extension thành công!');
      }
    } catch (e) {
      handleOpenAddModal();
    }
  };

  const handleSaveModal = async () => {
    if (!inputName.trim()) {
      if (onShowToast) onShowToast('Vui lòng nhập tên tiện ích');
      return;
    }
    if (!inputCode.trim()) {
      if (onShowToast) onShowToast('Mã JavaScript không được để trống');
      return;
    }

    try {
      let updated: ExtensionItem[];
      if (editingId) {
        updated = extensions.map((e) =>
          e.id === editingId
            ? {
                ...e,
                name: inputName.trim(),
                description: inputDesc.trim() || 'Tiện ích người dùng',
                matchUrl: inputMatchUrl.trim() || '*',
                runAt: inputRunAt,
                code: inputCode.trim(),
                updatedAt: Date.now(),
              }
            : e
        );
      } else {
        const newItem: ExtensionItem = {
          id: `ext-${Date.now()}`,
          name: inputName.trim(),
          description: inputDesc.trim() || 'Tiện ích người dùng',
          matchUrl: inputMatchUrl.trim() || '*',
          runAt: inputRunAt,
          code: inputCode.trim(),
          enabled: true,
          updatedAt: Date.now(),
        };
        updated = [newItem, ...extensions];
      }

      await saveExtensionsToStorage(updated);
      setEditModalVisible(false);
      if (onShowToast) {
        onShowToast(editingId ? 'Đã cập nhật tiện ích' : 'Đã cài đặt tiện ích mới thành công');
      }
    } catch (e) {
      if (onShowToast) onShowToast('Lỗi khi lưu tiện ích');
    }
  };

  const filteredExtensions = extensions.filter(
    (e) =>
      e.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
      e.description.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
      e.matchUrl.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

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
                <Feather name="box" size={18} color="#7c3aed" />
              </View>
              <Text style={styles.sheetTitle}>Tiện ích mở rộng</Text>
              {extensions.length > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{extensions.length}</Text>
                </View>
              )}
            </View>

            <View style={styles.headerRightActions}>
              {/* Nút nhập file script */}
              <TouchableOpacity
                style={styles.importBtn}
                onPress={handlePickFile}
                activeOpacity={0.7}
              >
                <Feather name="upload" size={15} color="#7c3aed" />
                <Text style={styles.importBtnText}>Nhập tệp</Text>
              </TouchableOpacity>

              {/* Nút tạo mới */}
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

          {/* Ô tìm kiếm */}
          {extensions.length > 0 && (
            <View style={styles.searchBarBox}>
              <Feather name="search" size={16} color="#71717a" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Tìm tiện ích theo tên hoặc trang web..."
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

          {/* Danh sách tiện ích */}
          <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
            {filteredExtensions.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Feather name="box" size={40} color="#7c3aed" />
                </View>
                <Text style={styles.emptyTitle}>Chưa có tiện ích nào</Text>
                <Text style={styles.emptySub}>
                  Bạn có thể nhập script .js hoặc tạo extension mới để can thiệp tùy biến trang web theo ý thích.
                </Text>
                <TouchableOpacity
                  style={styles.emptyAddBtn}
                  onPress={handleOpenAddModal}
                  activeOpacity={0.8}
                >
                  <Feather name="plus" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.emptyAddBtnText}>Thêm tiện ích mới</Text>
                </TouchableOpacity>
              </View>
            ) : (
              filteredExtensions.map((item) => {
                return (
                  <View key={item.id} style={styles.extCard}>
                    <View style={styles.extCardTopRow}>
                      <View style={styles.extTitleGroup}>
                        <View style={[styles.extIconCircle, item.enabled ? styles.extIconActive : styles.extIconInactive]}>
                          <Feather
                            name={item.runAt === 'document_start' ? 'zap' : 'code'}
                            size={16}
                            color={item.enabled ? '#7c3aed' : '#a1a1aa'}
                          />
                        </View>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={styles.extName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={styles.extMatchText} numberOfLines={1}>
                            Áp dụng: {item.matchUrl === '*' ? 'Mọi trang web (*)' : item.matchUrl}
                          </Text>
                        </View>
                      </View>

                      {/* Công tắc Bật/Tắt */}
                      <Switch
                        value={item.enabled}
                        onValueChange={() => handleToggleExtension(item.id)}
                        trackColor={{ false: '#e4e4e7', true: '#7c3aed' }}
                        thumbColor="#ffffff"
                      />
                    </View>

                    {item.description ? (
                      <Text style={styles.extDesc} numberOfLines={2}>
                        {item.description}
                      </Text>
                    ) : null}

                    {/* Hàng thao tác dưới của thẻ */}
                    <View style={styles.extCardBottomRow}>
                      <View style={styles.timingBadge}>
                        <Text style={styles.timingBadgeText}>
                          {item.runAt === 'document_start' ? 'Tải trước (start)' : 'Tải sau (end)'}
                        </Text>
                      </View>

                      <View style={styles.extActionsGroup}>
                        <TouchableOpacity
                          style={styles.extActionBtn}
                          onPress={() => handleOpenEditModal(item)}
                          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        >
                          <Feather name="edit-2" size={14} color="#52525b" />
                          <Text style={styles.extActionText}>Sửa mã</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.extActionBtn}
                          onPress={() => handleDeleteExtension(item.id, item.name)}
                          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        >
                          <Feather name="trash-2" size={14} color="#ef4444" />
                          <Text style={[styles.extActionText, { color: '#ef4444' }]}>Xóa</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* MODAL TẠO & SỬA EXTENSION / MÃ JAVASCRIPT */}
          <Modal
            visible={editModalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setEditModalVisible(false)}
          >
            <TouchableOpacity
              style={styles.innerBackdrop}
              activeOpacity={1}
              onPress={() => setEditModalVisible(false)}
            >
              <TouchableOpacity
                style={styles.innerModalBox}
                activeOpacity={1}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={styles.innerHeader}>
                  <Text style={styles.innerTitle}>
                    {editingId ? 'Chỉnh sửa Extension' : 'Tạo Extension mới'}
                  </Text>
                  <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                    <Feather name="x" size={20} color="#71717a" />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 520 }}>
                  <Text style={styles.label}>Tên tiện ích mở rộng</Text>
                  <TextInput
                    style={styles.input}
                    value={inputName}
                    onChangeText={setInputName}
                    placeholder="Ví dụ: Tự động tải video, Đổi giao diện..."
                    placeholderTextColor="#a1a1aa"
                  />

                  <Text style={styles.label}>Mô tả tóm tắt</Text>
                  <TextInput
                    style={styles.input}
                    value={inputDesc}
                    onChangeText={setInputDesc}
                    placeholder="Mô tả tác vụ script này thực hiện..."
                    placeholderTextColor="#a1a1aa"
                  />

                  <Text style={styles.label}>Trang web áp dụng (Match Pattern)</Text>
                  <TextInput
                    style={styles.input}
                    value={inputMatchUrl}
                    onChangeText={setInputMatchUrl}
                    placeholder="Nhập '*' cho mọi trang web, hoặc domain như youtube.com"
                    placeholderTextColor="#a1a1aa"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <Text style={styles.label}>Thời điểm kích hoạt</Text>
                  <View style={styles.timingSelectRow}>
                    <TouchableOpacity
                      style={[
                        styles.timingOption,
                        inputRunAt === 'document_end' && styles.timingOptionActive,
                      ]}
                      onPress={() => setInputRunAt('document_end')}
                    >
                      <Text
                        style={[
                          styles.timingOptionText,
                          inputRunAt === 'document_end' && styles.timingOptionTextActive,
                        ]}
                      >
                        Sau khi nạp xong trang (Khuyên dùng)
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.timingOption,
                        inputRunAt === 'document_start' && styles.timingOptionActive,
                      ]}
                      onPress={() => setInputRunAt('document_start')}
                    >
                      <Text
                        style={[
                          styles.timingOptionText,
                          inputRunAt === 'document_start' && styles.timingOptionTextActive,
                        ]}
                      >
                        Trước khi tải trang (document_start)
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                    <Text style={styles.label}>Mã JavaScript (Script Code)</Text>
                  </View>
                  <TextInput
                    style={styles.codeInput}
                    value={inputCode}
                    onChangeText={setInputCode}
                    placeholder="// Viết mã JavaScript tự chạy tại đây"
                    placeholderTextColor="#a1a1aa"
                    multiline
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                  />

                  <View style={styles.modalActionButtons}>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => setEditModalVisible(false)}
                    >
                      <Text style={styles.cancelBtnText}>Hủy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.saveBtn}
                      onPress={handleSaveModal}
                    >
                      <Text style={styles.saveBtnText}>Lưu & Kích hoạt</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
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
    backgroundColor: '#f5f3ff',
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
    gap: 8,
  },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#f5f3ff',
  },
  importBtnText: {
    color: '#7c3aed',
    fontSize: 12,
    fontWeight: '600',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#7c3aed',
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
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#f5f3ff',
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
    backgroundColor: '#7c3aed',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 16,
  },
  emptyAddBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  extCard: {
    backgroundColor: '#faf5ff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ede9fe',
  },
  extCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  extTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  extIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  extIconActive: {
    backgroundColor: '#ede9fe',
  },
  extIconInactive: {
    backgroundColor: '#e4e4e7',
  },
  extName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e1b4b',
  },
  extMatchText: {
    fontSize: 11,
    color: '#7c3aed',
    marginTop: 2,
  },
  extDesc: {
    fontSize: 12,
    color: '#4c1d95',
    lineHeight: 16,
    marginVertical: 6,
  },
  extCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e9d5ff',
  },
  timingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#ede9fe',
  },
  timingBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6d28d9',
  },
  extActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  extActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  extActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#52525b',
  },
  innerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  innerModalBox: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 20,
    maxHeight: '90%',
  },
  innerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  innerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#09090b',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#52525b',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#f4f4f5',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    fontSize: 14,
    color: '#09090b',
  },
  timingSelectRow: {
    flexDirection: 'column',
    gap: 6,
  },
  timingOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f4f4f5',
  },
  timingOptionActive: {
    backgroundColor: '#ede9fe',
    borderWidth: 1,
    borderColor: '#7c3aed',
  },
  timingOptionText: {
    fontSize: 12,
    color: '#52525b',
    fontWeight: '500',
  },
  timingOptionTextActive: {
    color: '#7c3aed',
    fontWeight: '700',
  },
  codeInput: {
    backgroundColor: '#1e1e2e',
    color: '#a6e3a1',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    padding: 12,
    borderRadius: 12,
    height: 180,
    textAlignVertical: 'top',
  },
  modalActionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
    marginBottom: 10,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#f4f4f5',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#71717a',
  },
  saveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#7c3aed',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
});
