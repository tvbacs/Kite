import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  SitePermissionSettings,
  DEFAULT_SITE_PERMISSIONS,
  getSitePermissions,
  setSitePermission,
  resetSitePermissions,
  PermissionType,
  PermissionStatus,
} from '../services/sitePermissionsStorage';

interface SitePermissionsSheetProps {
  visible: boolean;
  onClose: () => void;
  currentUrl?: string | null;
  onShowToast?: (message: string) => void;
}

interface PermissionRowItem {
  id: PermissionType;
  title: string;
  icon: string;
  options: { label: string; value: PermissionStatus }[];
}

export const SitePermissionsSheet: React.FC<SitePermissionsSheetProps> = ({
  visible,
  onClose,
  currentUrl,
  onShowToast,
}) => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 44 : 20);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 16);

  const [permissions, setPermissions] = useState<SitePermissionSettings>(DEFAULT_SITE_PERMISSIONS);
  const [activePickerKey, setActivePickerKey] = useState<PermissionType | null>(null);

  const getCleanDomain = (url?: string | null) => {
    if (!url) return 'Trang web hiện tại';
    try {
      const match = url.match(/^(?:https?:\/\/)?(?:www\.)?([^\/\?#]+)/i);
      return match ? match[1] : url;
    } catch {
      return url;
    }
  };

  const domain = getCleanDomain(currentUrl);

  useEffect(() => {
    if (visible && domain) {
      loadPermissions();
    }
  }, [visible, domain]);

  const loadPermissions = async () => {
    const data = await getSitePermissions(domain);
    setPermissions(data);
  };

  const handleSelectOption = async (type: PermissionType, val: PermissionStatus) => {
    const updated = await setSitePermission(domain, type, val);
    setPermissions(updated);
    setActivePickerKey(null);
    if (onShowToast) {
      const label = val === 'allow' ? 'Đã cho phép' : val === 'block' ? 'Đã chặn' : 'Đã đặt hỏi trước';
      onShowToast(`${label} quyền`);
    }
  };

  const handleReset = async () => {
    await resetSitePermissions(domain);
    setPermissions({ ...DEFAULT_SITE_PERMISSIONS });
    if (onShowToast) {
      onShowToast(`Đã đặt lại toàn bộ quyền cho ${domain}`);
    }
  };

  const PERMISSION_CONFIG: PermissionRowItem[] = [
    {
      id: 'location',
      title: 'Vị trí',
      icon: 'map-pin',
      options: [
        { label: 'Yêu cầu (mặc định)', value: 'ask' },
        { label: 'Cho phép', value: 'allow' },
        { label: 'Chặn', value: 'block' },
      ],
    },
    {
      id: 'camera',
      title: 'Camera',
      icon: 'video',
      options: [
        { label: 'Yêu cầu (mặc định)', value: 'ask' },
        { label: 'Cho phép', value: 'allow' },
        { label: 'Chặn', value: 'block' },
      ],
    },
    {
      id: 'microphone',
      title: 'Micrô',
      icon: 'mic',
      options: [
        { label: 'Yêu cầu (mặc định)', value: 'ask' },
        { label: 'Cho phép', value: 'allow' },
        { label: 'Chặn', value: 'block' },
      ],
    },
    {
      id: 'notifications',
      title: 'Thông báo',
      icon: 'bell',
      options: [
        { label: 'Yêu cầu (mặc định)', value: 'ask' },
        { label: 'Cho phép', value: 'allow' },
        { label: 'Chặn', value: 'block' },
      ],
    },
    {
      id: 'popups',
      title: 'Cửa sổ bật lên và chuyển hướng',
      icon: 'external-link',
      options: [
        { label: 'Chặn (mặc định)', value: 'block' },
        { label: 'Cho phép', value: 'allow' },
      ],
    },
    {
      id: 'downloads',
      title: 'Tự động tải xuống',
      icon: 'download',
      options: [
        { label: 'Yêu cầu (mặc định)', value: 'ask' },
        { label: 'Cho phép', value: 'allow' },
        { label: 'Chặn', value: 'block' },
      ],
    },
  ];

  const getStatusLabel = (item: PermissionRowItem) => {
    const val = permissions[item.id];
    const match = item.options.find((o) => o.value === val);
    return match ? match.label : 'Yêu cầu (mặc định)';
  };

  const activePickerItem = PERMISSION_CONFIG.find((p) => p.id === activePickerKey);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: topInset, paddingBottom: bottomInset }]}>
        {/* Header: Nút quay lại + Tên miền trang web (Giống hệt Chrome) */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Feather name="arrow-left" size={22} color="#09090b" />
          </TouchableOpacity>
          <Text style={styles.headerDomain} numberOfLines={1}>
            {domain}
          </Text>
        </View>

        <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
          {/* PHẦN 1: MỨC SỬ DỤNG (USAGE) */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Mức sử dụng</Text>
          </View>
          <View style={styles.usageCard}>
            <Text style={styles.usageText}>Không có dữ liệu sử dụng lưu trữ</Text>
          </View>

          {/* PHẦN 2: QUYỀN (PERMISSIONS) + NÚT ĐẶT LẠI QUYỀN */}
          <View style={[styles.sectionHeader, styles.permissionsHeaderRow]}>
            <Text style={styles.sectionTitle}>Quyền</Text>
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={handleReset}
              activeOpacity={0.7}
            >
              <Text style={styles.resetBtnText}>Đặt lại quyền</Text>
            </TouchableOpacity>
          </View>

          {/* DANH SÁCH CÁC QUYỀN */}
          <View style={styles.permissionsList}>
            {PERMISSION_CONFIG.map((item) => {
              const currentVal = permissions[item.id];
              const isAllowed = currentVal === 'allow';
              const isBlocked = currentVal === 'block';

              return (
                <View key={item.id} style={styles.permRow}>
                  {/* Icon & Tên quyền bên trái */}
                  <View style={styles.permLeft}>
                    <View style={styles.permIconBox}>
                      <Feather
                        name={item.icon as any}
                        size={18}
                        color={isAllowed ? '#007aff' : isBlocked ? '#ef4444' : '#52525b'}
                      />
                    </View>
                    <Text style={styles.permTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                  </View>

                  {/* Nút Dropdown bên phải chọn trạng thái */}
                  <TouchableOpacity
                    style={[
                      styles.pickerTrigger,
                      isAllowed && styles.pickerTriggerAllowed,
                      isBlocked && styles.pickerTriggerBlocked,
                    ]}
                    onPress={() => setActivePickerKey(item.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.pickerTriggerText,
                        isAllowed && { color: '#007aff', fontWeight: '600' },
                        isBlocked && { color: '#ef4444', fontWeight: '600' },
                      ]}
                      numberOfLines={1}
                    >
                      {getStatusLabel(item)}
                    </Text>
                    <Feather
                      name="chevron-down"
                      size={14}
                      color={isAllowed ? '#007aff' : isBlocked ? '#ef4444' : '#71717a'}
                      style={{ marginLeft: 6 }}
                    />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </ScrollView>

        {/* MODAL BOTTOM PICKER ĐỔI TRẠNG THÁI QUYỀN */}
        {activePickerItem && (
          <Modal
            visible={!!activePickerItem}
            transparent
            animationType="fade"
            onRequestClose={() => setActivePickerKey(null)}
          >
            <TouchableOpacity
              style={styles.pickerBackdrop}
              activeOpacity={1}
              onPress={() => setActivePickerKey(null)}
            >
              <View style={[styles.pickerSheet, { paddingBottom: bottomInset + 10 }]}>
                <View style={styles.pickerSheetHandle} />
                <Text style={styles.pickerSheetTitle}>
                  {activePickerItem.title} ({domain})
                </Text>

                <View style={styles.pickerOptionsList}>
                  {activePickerItem.options.map((opt) => {
                    const isSelected = permissions[activePickerItem.id] === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[styles.pickerOptionRow, isSelected && styles.pickerOptionSelected]}
                        onPress={() => handleSelectOption(activePickerItem.id, opt.value)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.pickerOptionText,
                            isSelected && { color: '#007aff', fontWeight: '700' },
                          ]}
                        >
                          {opt.label}
                        </Text>
                        {isSelected && (
                          <Feather name="check" size={18} color="#007aff" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </TouchableOpacity>
          </Modal>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f5',
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  headerDomain: {
    fontSize: 17,
    fontWeight: '700',
    color: '#09090b',
    flex: 1,
  },
  scrollArea: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sectionHeader: {
    marginTop: 14,
    marginBottom: 10,
  },
  permissionsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 26,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3f3f46',
  },
  resetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#007aff',
    backgroundColor: '#f0f7ff',
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007aff',
  },
  usageCard: {
    backgroundColor: '#f4f4f5',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  usageText: {
    fontSize: 14,
    color: '#71717a',
  },
  permissionsList: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#f4f4f5',
    overflow: 'hidden',
    marginBottom: 30,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f5',
  },
  permLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  permIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#f4f4f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  permTitle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#09090b',
    flex: 1,
  },
  pickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4f4f5',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    maxWidth: 160,
  },
  pickerTriggerAllowed: {
    backgroundColor: '#e0f2fe',
  },
  pickerTriggerBlocked: {
    backgroundColor: '#fee2e2',
  },
  pickerTriggerText: {
    fontSize: 13,
    color: '#3f3f46',
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  pickerSheetHandle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#d4d4d8',
    alignSelf: 'center',
    marginBottom: 16,
  },
  pickerSheetTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#09090b',
    marginBottom: 16,
  },
  pickerOptionsList: {
    gap: 8,
  },
  pickerOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: '#f4f4f5',
  },
  pickerOptionSelected: {
    backgroundColor: '#f0f7ff',
  },
  pickerOptionText: {
    fontSize: 16,
    color: '#18181b',
    fontWeight: '400',
  },
});
