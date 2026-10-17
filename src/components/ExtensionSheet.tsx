import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Switch,
  Platform,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../constants/theme';

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
    name: 'Giao diện nền tối (Dark Mode)',
    description: 'Tự động kích hoạt nền tối bảo vệ mắt trên các trang web.',
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
    name: 'Tự động bỏ qua quảng cáo Video',
    description: 'Tự động nhấn nút Bỏ qua quảng cáo trên trình phát video.',
    matchUrl: '*',
    code: `(function() {
  setInterval(function() {
    try {
      if (!document.querySelector('video, [class*="player"], [id*="player"]')) return;
      const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .videoAdUiSkipButton, button[class*="skip"]');
      if (skipBtn) {
        skipBtn.click();
      }
      const adOverlay = document.querySelector('.ytp-ad-overlay-close-button');
      if (adOverlay) {
        adOverlay.click();
      }
    } catch(e) {}
  }, 1500);
})();`,
    runAt: 'document_end',
    enabled: true,
    isBuiltIn: true,
    updatedAt: Date.now(),
  },
  {
    id: 'ext-speed-controller',
    name: 'Tùy chỉnh tốc độ phát video',
    description: 'Hỗ trợ điều khiển phím tắt tăng tốc độ phát video lên 1.5x / 2.0x.',
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
  {
    id: 'ext-region-shield',
    name: 'Chống lộ IP & Giả lập Vị trí',
    description: 'Bảo vệ địa chỉ IP thực không bị quét trộm qua WebRTC STUN và đồng bộ định vị quốc tế.',
    matchUrl: '*',
    code: `(function() {
  if (window.__kite_webrtc_shield) return;
  window.__kite_webrtc_shield = true;
  try {
    if (window.RTCPeerConnection) {
      window.RTCPeerConnection.prototype.createOffer = function() {
        return Promise.reject(new Error('WebRTC IP leak blocked'));
      };
      if (window.RTCPeerConnection.prototype.setLocalDescription) {
        window.RTCPeerConnection.prototype.setLocalDescription = function() {
          return Promise.reject(new Error('WebRTC IP leak blocked'));
        };
      }
    }
  } catch(e) {}
})();`,
    runAt: 'document_start',
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
  onOpenRegionSheet?: () => void;
}

export const ExtensionSheet: React.FC<ExtensionSheetProps> = ({
  visible,
  onClose,
  onShowToast,
  onExtensionsUpdated,
  onOpenRegionSheet,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 16);

  const [extensions, setExtensions] = useState<ExtensionItem[]>([]);

  useEffect(() => {
    if (visible) {
      loadExtensions();
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
          {/* Thanh kéo Sheet */}
          <View style={styles.dragHandle} />

          {/* Header thanh thoát: Tiêu đề bên trái, Nút đóng bên phải */}
          <View style={styles.headerRow}>
            <View style={styles.titleGroup}>
              <Text style={styles.sheetTitle}>Tiện ích mở rộng</Text>
            </View>

            {/* Nút Đóng cố định góc phải */}
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="x" size={19} color="#71717a" />
            </TouchableOpacity>
          </View>

          {/* Danh sách tiện ích tối giản */}
          <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
            {extensions.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Feather name="box" size={36} color="#a1a1aa" />
                <Text style={styles.emptyTitle}>Chưa có tiện ích nào</Text>
                <Text style={styles.emptySub}>
                  Hiện tại chưa có tiện ích mở rộng nào được cài đặt.
                </Text>
              </View>
            ) : (
              extensions.map((item) => {
                return (
                  <View key={item.id} style={styles.extCard}>
                    {/* Hàng trên: Tên + Mô tả và Công tắc */}
                    <View style={styles.extCardTopRow}>
                      <View style={{ flex: 1, marginRight: 12 }}>
                        <Text style={styles.extName} numberOfLines={1}>
                          {item.name}
                        </Text>
                        {item.description ? (
                          <Text style={styles.extDesc} numberOfLines={2}>
                            {item.description}
                          </Text>
                        ) : null}
                      </View>

                      {/* Công tắc Bật/Tắt - Blue khi Bật */}
                      <Switch
                        value={item.enabled}
                        onValueChange={() => handleToggleExtension(item.id)}
                        trackColor={{ false: theme.colors.switchTrackFalse, true: theme.colors.switchTrackTrue }}
                        ios_backgroundColor={theme.colors.switchTrackFalse}
                        thumbColor={theme.colors.switchThumb}
                      />
                    </View>

                  </View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: theme.colors.sheetBackground,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: '86%',
    paddingHorizontal: 16,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  dragHandle: {
    width: 38,
    height: 4.5,
    borderRadius: 3,
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
    gap: 8,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#18181b',
  },
  countBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  countBadgeText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#71717a',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  importBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  importBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#18181b',
  },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 38,
    borderRadius: 10,
    backgroundColor: theme.colors.accentBlue,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 38,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#18181b',
    paddingVertical: 0,
  },
  listScroll: {
    maxHeight: 460,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#18181b',
    marginTop: 12,
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
    backgroundColor: theme.colors.accentBlue,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  emptyAddBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '600',
  },
  extCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  extCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  extName: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#18181b',
    marginBottom: 3,
  },
  extDesc: {
    fontSize: 12.5,
    color: '#71717a',
    lineHeight: 17,
  },
  extCardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 14,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e4e4e7',
  },
  extActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  extActionText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#71717a',
  },
  innerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  innerModalBox: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 380,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  innerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  innerTitle: {
    fontSize: 16.5,
    fontWeight: '700',
    color: '#18181b',
  },
  innerCloseBtn: {
    padding: 4,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#52525b',
    marginBottom: 5,
    marginTop: 8,
  },
  input: {
    height: 40,
    backgroundColor: '#f4f4f5',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13.5,
    color: '#18181b',
    borderWidth: 1,
    borderColor: '#e4e4e7',
  },
  timingSelectRow: {
    flexDirection: 'row',
    gap: 8,
  },
  timingOption: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#f4f4f5',
    borderWidth: 1,
    borderColor: '#e4e4e7',
    alignItems: 'center',
  },
  timingOptionActive: {
    backgroundColor: theme.colors.accentBlue,
    borderColor: theme.colors.accentBlue,
  },
  timingOptionText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#52525b',
    textAlign: 'center',
  },
  timingOptionTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  codeInput: {
    height: 120,
    backgroundColor: '#18181b',
    borderRadius: 10,
    padding: 12,
    fontSize: 12.5,
    color: '#f4f4f5',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlignVertical: 'top',
  },
  modalActionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
    marginBottom: 4,
  },
  cancelBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#f4f4f5',
  },
  cancelBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#71717a',
  },
  saveBtn: {
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: theme.colors.accentBlue,
  },
  saveBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#ffffff',
  },
  regionBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  regionBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  regionBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
  },
  regionBannerBadge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  regionBannerBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
    textTransform: 'uppercase',
  },
  regionBannerSub: {
    fontSize: 11.5,
    color: '#3b82f6',
    marginTop: 2,
  },
});
