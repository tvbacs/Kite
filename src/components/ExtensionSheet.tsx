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

export const LIGHT_MODE_START_SCRIPT = `(function() {
  try {
    var _origMM = window.matchMedia;
    window.__kite_orig_matchMedia = window.__kite_orig_matchMedia || _origMM;
    window.matchMedia = function(query) {
      if (typeof query === 'string' && query.indexOf('prefers-color-scheme') !== -1) {
        var isDark = query.indexOf('dark') !== -1;
        return {
          matches: !isDark,
          media: query,
          onchange: null,
          addListener: function() {},
          removeListener: function() {},
          addEventListener: function() {},
          removeEventListener: function() {},
          dispatchEvent: function() { return false; }
        };
      }
      if (window.__kite_orig_matchMedia) {
        return window.__kite_orig_matchMedia.call(window, query);
      }
      return { matches: false, media: query };
    };

    var applyLightEarly = function() {
      try {
        if (document.documentElement) {
          document.documentElement.style.colorScheme = 'light';
          document.documentElement.classList.remove('dark', 'night');
          if (document.documentElement.getAttribute('data-theme') === 'dark') {
            document.documentElement.setAttribute('data-theme', 'light');
          }
        }
        if (document.body) {
          document.body.classList.remove('dark', 'night');
        }
        var meta = document.querySelector('meta[name="color-scheme"]');
        if (!meta && (document.head || document.documentElement)) {
          meta = document.createElement('meta');
          meta.name = 'color-scheme';
          (document.head || document.documentElement).appendChild(meta);
        }
        if (meta) meta.content = 'light';
      } catch(e) {}
    };

    applyLightEarly();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyLightEarly);
    }
  } catch(e) {}
})(); true;`;

export const DARK_MODE_START_SCRIPT = `(function() {
  try {
    var _origMM = window.matchMedia;
    window.__kite_orig_matchMedia = window.__kite_orig_matchMedia || _origMM;
    window.matchMedia = function(query) {
      if (typeof query === 'string' && query.indexOf('prefers-color-scheme') !== -1) {
        var isDark = query.indexOf('dark') !== -1;
        return {
          matches: isDark,
          media: query,
          onchange: null,
          addListener: function() {},
          removeListener: function() {},
          addEventListener: function() {},
          removeEventListener: function() {},
          dispatchEvent: function() { return false; }
        };
      }
      if (window.__kite_orig_matchMedia) {
        return window.__kite_orig_matchMedia.call(window, query);
      }
      return { matches: false, media: query };
    };

    var applyDarkEarly = function() {
      try {
        if (document.documentElement) {
          document.documentElement.style.colorScheme = 'dark';
          document.documentElement.classList.add('dark');
        }
        var meta = document.querySelector('meta[name="color-scheme"]');
        if (!meta && (document.head || document.documentElement)) {
          meta = document.createElement('meta');
          meta.name = 'color-scheme';
          (document.head || document.documentElement).appendChild(meta);
        }
        if (meta) meta.content = 'dark';
      } catch(e) {}
    };

    applyDarkEarly();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyDarkEarly);
    }
  } catch(e) {}
})(); true;`;

export const DARK_MODE_INJECT_SCRIPT = `(function() {
  try {
    // 1. Ghi đè window.matchMedia để trả về prefers-color-scheme: dark
    var _origMM = window.matchMedia;
    window.__kite_orig_matchMedia = window.__kite_orig_matchMedia || _origMM;
    window.matchMedia = function(query) {
      if (typeof query === 'string' && query.indexOf('prefers-color-scheme') !== -1) {
        var isDark = query.indexOf('dark') !== -1;
        return {
          matches: isDark,
          media: query,
          onchange: null,
          addListener: function() {},
          removeListener: function() {},
          addEventListener: function() {},
          removeEventListener: function() {},
          dispatchEvent: function() { return false; }
        };
      }
      if (window.__kite_orig_matchMedia) {
        return window.__kite_orig_matchMedia.call(window, query);
      }
      return { matches: false, media: query };
    };

    // 2. Kích hoạt color-scheme dark và class dark cho trang web
    if (document.documentElement) {
      document.documentElement.style.colorScheme = 'dark';
      document.documentElement.classList.add('dark');
    }
    if (document.body) {
      document.body.classList.add('dark');
    }
    var meta = document.querySelector('meta[name="color-scheme"]');
    if (!meta && (document.head || document.documentElement)) {
      meta = document.createElement('meta');
      meta.name = 'color-scheme';
      (document.head || document.documentElement).appendChild(meta);
    }
    if (meta) meta.content = 'dark';

    // 3. Khôi phục các media query dark mode trong stylesheet nếu trước đó bị vô hiệu hóa
    for (var i = 0; i < document.styleSheets.length; i++) {
      try {
        var sheet = document.styleSheets[i];
        var rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;
        for (var j = 0; j < rules.length; j++) {
          var rule = rules[j];
          if (rule.type === CSSRule.MEDIA_RULE && rule.media && rule.media.mediaText) {
            if (rule.media.mediaText.indexOf('not all and (prefers-color-scheme: dark)') !== -1) {
              rule.media.mediaText = '(prefers-color-scheme: dark)';
            }
          }
        }
      } catch(e) {}
    }

    var checkEl = function(el) {
      if (!el) return null;
      var bg = window.getComputedStyle(el).backgroundColor;
      if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') return null;
      var rgb = bg.match(/\\d+/g);
      if (rgb && rgb.length >= 3) {
        return (parseInt(rgb[0], 10) * 299 + parseInt(rgb[1], 10) * 587 + parseInt(rgb[2], 10) * 114) / 1000;
      }
      return null;
    };

    var isPageAlreadyDark = function() {
      // a. Danh sách các trang vốn dĩ đã là giao diện tối
      var host = window.location.hostname.toLowerCase();
      if (host.includes('youtube.com') || host.includes('bilibili.com') || host.includes('phim') || host.includes('filmove') || host.includes('motchill') || host.includes('tvhay') || host.includes('netflix.com')) {
        return true;
      }

      // b. Kiểm tra data-theme hoặc class night
      var rootTheme = ((document.documentElement ? (document.documentElement.getAttribute('data-theme') || '') : '') + ' ' + (document.body ? (document.body.getAttribute('data-theme') || '') : '')).toLowerCase();
      if (rootTheme.includes('dark') || rootTheme.includes('night')) return true;

      // c. Kiểm tra độ sáng nền thực tế
      var lum = checkEl(document.body);
      if (lum === null) lum = checkEl(document.documentElement);
      if (lum === null) {
        var mainEl = document.querySelector('#root, #app, #main, main, .main-content, #content, [class*="player"], [class*="movie"], [class*="film"], #viewport');
        if (mainEl) lum = checkEl(mainEl);
      }
      if (lum !== null && lum < 140) return true;

      return false;
    };

    var applyOrRemove = function() {
      var styleId = 'kite-dark-mode-style';
      var existingStyle = document.getElementById(styleId);

      // Nếu trang web ĐÃ TỐI SẴN (hoặc đã chuyển sang tối bởi native dark mode) -> Tuyệt đối KHÔNG đảo màu
      if (isPageAlreadyDark()) {
        if (existingStyle) existingStyle.remove();
        if (document.documentElement) document.documentElement.style.filter = '';
        if (document.body) document.body.style.filter = '';
        window.__kite_dark_mode_applied = false;
        return;
      }

      // Nếu là trang web nền sáng thông thường -> Đảo màu sang nền than đen chống lóa
      if (!existingStyle) {
        existingStyle = document.createElement('style');
        existingStyle.id = styleId;
        (document.head || document.documentElement).appendChild(existingStyle);
      }
      existingStyle.textContent = 'html { filter: invert(90%) hue-rotate(180deg) !important; background-color: #171717 !important; } img, video, iframe, canvas, picture, [style*="background-image"], svg, .video-stream, .html5-video-player { filter: invert(100%) hue-rotate(180deg) !important; } body { background-color: transparent !important; }';
      window.__kite_dark_mode_applied = true;
    };

    applyOrRemove();
    setTimeout(applyOrRemove, 350);
    setTimeout(applyOrRemove, 1000);
  } catch(e) {}
})(); true;`;

export const DARK_MODE_REMOVE_SCRIPT = `(function() {
  try {
    // 1. Gỡ bỏ style đảo màu & filter
    var s = document.getElementById('kite-dark-mode-style');
    if (s) s.remove();
    window.__kite_dark_mode_applied = false;
    if (document.documentElement) {
      document.documentElement.style.filter = '';
      document.documentElement.style.backgroundColor = '';
      document.documentElement.style.colorScheme = 'light';
      document.documentElement.classList.remove('dark', 'night');
      if (document.documentElement.getAttribute('data-theme') === 'dark') {
        document.documentElement.setAttribute('data-theme', 'light');
      }
    }
    if (document.body) {
      document.body.style.filter = '';
      document.body.style.backgroundColor = '';
      document.body.classList.remove('dark', 'night');
      if (document.body.getAttribute('data-theme') === 'dark') {
        document.body.setAttribute('data-theme', 'light');
      }
    }

    // 2. Ghi đè window.matchMedia để luôn trả về light mode
    var _origMM = window.matchMedia;
    window.__kite_orig_matchMedia = window.__kite_orig_matchMedia || _origMM;
    window.matchMedia = function(query) {
      if (typeof query === 'string' && query.indexOf('prefers-color-scheme') !== -1) {
        var isDark = query.indexOf('dark') !== -1;
        return {
          matches: !isDark,
          media: query,
          onchange: null,
          addListener: function() {},
          removeListener: function() {},
          addEventListener: function() {},
          removeEventListener: function() {},
          dispatchEvent: function() { return false; }
        };
      }
      if (window.__kite_orig_matchMedia) {
        return window.__kite_orig_matchMedia.call(window, query);
      }
      return { matches: false, media: query };
    };

    // 3. Đặt meta color-scheme thành light
    var meta = document.querySelector('meta[name="color-scheme"]');
    if (!meta && (document.head || document.documentElement)) {
      meta = document.createElement('meta');
      meta.name = 'color-scheme';
      (document.head || document.documentElement).appendChild(meta);
    }
    if (meta) meta.content = 'light';

    // 4. Vô hiệu hóa media query dark mode trong stylesheets để đảm bảo trang hiển thị nền sáng mặc định
    for (var i = 0; i < document.styleSheets.length; i++) {
      try {
        var sheet = document.styleSheets[i];
        var rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;
        for (var j = 0; j < rules.length; j++) {
          var rule = rules[j];
          if (rule.type === CSSRule.MEDIA_RULE && rule.media && rule.media.mediaText) {
            if (rule.media.mediaText.indexOf('prefers-color-scheme: dark') !== -1 || rule.media.mediaText.indexOf('prefers-color-scheme:dark') !== -1) {
              rule.media.mediaText = 'not all and (prefers-color-scheme: dark)';
            }
          }
        }
      } catch(e) {}
    }
  } catch(e) {}
})(); true;`;

export const DEFAULT_EXTENSIONS: ExtensionItem[] = [
  {
    id: 'ext-dark-mode',
    name: 'Giao diện nền tối (Dark Mode)',
    description: 'Tự động kích hoạt nền tối bảo vệ mắt trên các trang web.',
    matchUrl: '*',
    code: DARK_MODE_INJECT_SCRIPT,
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
        if (Array.isArray(parsed) && parsed.length > 0) {
          const merged = DEFAULT_EXTENSIONS.map((builtin) => {
            const found = parsed.find((p: any) => p.id === builtin.id);
            return found ? { ...builtin, enabled: found.enabled } : builtin;
          });
          const custom = parsed.filter(
            (p: any) => !DEFAULT_EXTENSIONS.some((b) => b.id === p.id)
          );
          const finalExts = [...merged, ...custom];
          setExtensions(finalExts);
          await AsyncStorage.setItem(STORAGE_EXTENSIONS_KEY, JSON.stringify(finalExts));
          return;
        }
      }
      setExtensions(DEFAULT_EXTENSIONS);
      await AsyncStorage.setItem(STORAGE_EXTENSIONS_KEY, JSON.stringify(DEFAULT_EXTENSIONS));
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
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
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
    fontWeight: '600',
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
    borderRadius: 24,
    padding: 16,
    marginBottom: 10,
  },
  extCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  extName: {
    fontSize: 16,
    fontWeight: '400',
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
