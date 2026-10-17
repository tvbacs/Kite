import React, { useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../constants/theme';
import {
  AVAILABLE_REGIONS,
  RegionNode,
  RegionSettings,
  saveRegionSettings,
} from '../services/regionService';

interface RegionSheetProps {
  visible: boolean;
  onClose: () => void;
  settings: RegionSettings;
  onUpdateSettings: (newSettings: RegionSettings) => void;
  onShowToast?: (message: string) => void;
  onTestIp?: (url: string) => void;
}

export const RegionSheet: React.FC<RegionSheetProps> = ({
  visible,
  onClose,
  settings,
  onUpdateSettings,
  onShowToast,
  onTestIp,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 16);

  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  const handleToggleMaster = async (val: boolean) => {
    const updated: RegionSettings = {
      ...settings,
      enabled: val,
    };
    onUpdateSettings(updated);
    await saveRegionSettings(updated);

    if (onShowToast) {
      if (val) {
        const activeNode = AVAILABLE_REGIONS.find((r) => r.id === updated.activeRegionId);
        onShowToast(`Đã bật chuyển vùng: ${activeNode?.flag} ${activeNode?.name}`);
      } else {
        onShowToast('Đã tắt chuyển vùng, quay lại mạng trực tiếp 🇻🇳');
      }
    }
  };

  const handleSelectRegion = async (regionId: string) => {
    if (regionId === 'vn') {
      const updated: RegionSettings = {
        ...settings,
        enabled: false,
      };
      onUpdateSettings(updated);
      await saveRegionSettings(updated);
      if (onShowToast) {
        onShowToast('Đã chuyển về 🇻🇳 Mặc định (Tắt chuyển vùng)');
      }
      return;
    }

    const updated: RegionSettings = {
      ...settings,
      enabled: true,
      activeRegionId: regionId,
    };
    onUpdateSettings(updated);
    await saveRegionSettings(updated);

    const activeNode = AVAILABLE_REGIONS.find((r) => r.id === regionId);
    if (onShowToast) {
      onShowToast(`Đã chuyển vùng sang: ${activeNode?.flag} ${activeNode?.name}`);
    }
  };

  const handleToggleSubOption = async (
    key: 'spoofGps' | 'blockWebRtc' | 'useProxyGateway',
    val: boolean
  ) => {
    const updated: RegionSettings = {
      ...settings,
      [key]: val,
    };
    onUpdateSettings(updated);
    await saveRegionSettings(updated);
  };

  const handleOpenTestIp = () => {
    onClose();
    if (onTestIp) {
      onTestIp('https://whoer.net');
    }
  };

  const activeNode = AVAILABLE_REGIONS.find((r) => r.id === settings.activeRegionId) || AVAILABLE_REGIONS[0];

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

          {/* Header thanh thoát */}
          <View style={styles.headerRow}>
            <View style={styles.titleGroup}>
              <Text style={styles.sheetTitle}>Chuyển vùng & Proxy</Text>
            </View>

            {/* Nút Đóng góc phải */}
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="x" size={19} color="#71717a" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* THẺ BẬT/TẮT TỔNG THỂ */}
            <View style={styles.masterToggleCard}>
              <View style={styles.masterTextBox}>
                <Text style={styles.masterTitle}>Kích hoạt chuyển vùng</Text>
                <Text style={styles.masterSub}>
                  {settings.enabled
                    ? 'Lưu lượng web đang được định tuyến bảo vệ'
                    : 'Đang dùng mạng trực tiếp của nhà mạng Việt Nam'}
                </Text>
              </View>
              <Switch
                value={settings.enabled}
                onValueChange={handleToggleMaster}
                trackColor={{
                  false: theme.colors.switchTrackFalse,
                  true: theme.colors.switchTrackTrue,
                }}
                ios_backgroundColor={theme.colors.switchTrackFalse}
                thumbColor={theme.colors.switchThumb}
              />
            </View>

            {/* GỢI Ý KHI GẶP SỰ CỐ KẾT NỐI */}
            <View style={styles.tipNoticeBox}>
              <Feather name="help-circle" size={14} color="#71717a" style={{ marginRight: 7, marginTop: 1 }} />
              <Text style={styles.tipNoticeText}>
                Nếu trang web tải chậm hoặc không vào được, hãy thử tắt chuyển vùng hoặc chọn quốc gia khác.
              </Text>
            </View>

            {/* TIÊU ĐỀ DANH SÁCH MÁY CHỦ */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Chọn quốc gia máy chủ</Text>
            </View>

            {/* DANH SÁCH CÁC QUỐC GIA */}
            <View style={styles.regionListCard}>
              {AVAILABLE_REGIONS.map((region, idx) => {
                const isSelected =
                  (!settings.enabled && region.id === 'vn') ||
                  (settings.enabled && settings.activeRegionId === region.id);
                const isLast = idx === AVAILABLE_REGIONS.length - 1;

                return (
                  <React.Fragment key={region.id}>
                    <TouchableOpacity
                      style={[
                        styles.regionRow,
                        isSelected && styles.regionRowActive,
                      ]}
                      onPress={() => handleSelectRegion(region.id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.flagBox}>
                        <Text style={styles.flagEmoji}>{region.flag}</Text>
                      </View>

                      <View style={styles.regionInfoBox}>
                        <View style={styles.regionNameRow}>
                          <Text style={[styles.regionName, isSelected && styles.regionNameActive]}>
                            {region.name}
                          </Text>
                          <View style={styles.pingBadge}>
                            <View
                              style={[
                                styles.pingDot,
                                {
                                  backgroundColor:
                                    region.pingMs < 80
                                      ? '#10b981'
                                      : region.pingMs < 160
                                      ? '#f59e0b'
                                      : '#6b7280',
                                },
                              ]}
                            />
                            <Text style={styles.pingText}>{region.pingMs}ms</Text>
                          </View>
                        </View>
                        <Text style={styles.regionCity}>{region.city}</Text>
                      </View>

                      <View style={styles.radioBox}>
                        {isSelected ? (
                          <View style={styles.selectedCheck}>
                            <Feather name="check" size={14} color="#ffffff" />
                          </View>
                        ) : (
                          <View style={styles.unselectedCircle} />
                        )}
                      </View>
                    </TouchableOpacity>

                    {!isLast && <View style={styles.divider} />}
                  </React.Fragment>
                );
              })}
            </View>

            {/* TÙY CHỌN BẢO VỆ NÂNG CAO */}
            <TouchableOpacity
              style={styles.advancedToggleBtn}
              onPress={() => setShowAdvanced(!showAdvanced)}
              activeOpacity={0.7}
            >
              <Text style={styles.advancedToggleText}>Cài đặt bảo vệ nâng cao</Text>
              <Feather
                name={showAdvanced ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#71717a"
              />
            </TouchableOpacity>

            {showAdvanced && (
              <View style={styles.advancedCard}>
                {/* 1. Định tuyến Proxy Gateway */}
                <View style={styles.advancedRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.advancedRowTitle}>Định tuyến qua Web Proxy</Text>
                    <Text style={styles.advancedRowSub}>
                      Chuyển tiếp trang web qua máy chủ đặt tại quốc gia đã chọn để đổi địa chỉ IP thực.
                    </Text>
                  </View>
                  <Switch
                    value={settings.useProxyGateway}
                    onValueChange={(val) => handleToggleSubOption('useProxyGateway', val)}
                    trackColor={{
                      false: theme.colors.switchTrackFalse,
                      true: theme.colors.switchTrackTrue,
                    }}
                    ios_backgroundColor={theme.colors.switchTrackFalse}
                    thumbColor={theme.colors.switchThumb}
                  />
                </View>

                <View style={styles.divider} />

                {/* 2. Chống rò rỉ WebRTC */}
                <View style={styles.advancedRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.advancedRowTitle}>Chống lộ IP qua WebRTC</Text>
                    <Text style={styles.advancedRowSub}>
                      Khóa các lệnh truy vấn STUN ngầm nhằm bảo vệ tuyệt đối địa chỉ IP thật không bị rò rỉ.
                    </Text>
                  </View>
                  <Switch
                    value={settings.blockWebRtc}
                    onValueChange={(val) => handleToggleSubOption('blockWebRtc', val)}
                    trackColor={{
                      false: theme.colors.switchTrackFalse,
                      true: theme.colors.switchTrackTrue,
                    }}
                    ios_backgroundColor={theme.colors.switchTrackFalse}
                    thumbColor={theme.colors.switchThumb}
                  />
                </View>

                <View style={styles.divider} />

                {/* 3. Giả lập GPS & Múi giờ */}
                <View style={styles.advancedRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.advancedRowTitle}>Giả lập GPS & Múi giờ</Text>
                    <Text style={styles.advancedRowSub}>
                      Đồng bộ tọa độ GPS và múi giờ trình duyệt trùng khớp với quốc gia đã chọn.
                    </Text>
                  </View>
                  <Switch
                    value={settings.spoofGps}
                    onValueChange={(val) => handleToggleSubOption('spoofGps', val)}
                    trackColor={{
                      false: theme.colors.switchTrackFalse,
                      true: theme.colors.switchTrackTrue,
                    }}
                    ios_backgroundColor={theme.colors.switchTrackFalse}
                    thumbColor={theme.colors.switchThumb}
                  />
                </View>
              </View>
            )}

            {/* NÚT KIỂM TRA ĐỊA CHỈ IP */}
            <TouchableOpacity
              style={styles.testIpBtn}
              onPress={handleOpenTestIp}
              activeOpacity={0.8}
            >
              <Feather name="shield" size={15} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.testIpBtnText}>Kiểm tra địa chỉ IP</Text>
              <Feather name="external-link" size={13} color="#ffffff" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.backdrop,
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: theme.colors.sheetBackground,
    borderTopLeftRadius: theme.radius.sheet,
    borderTopRightRadius: theme.radius.sheet,
    maxHeight: '88%',
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
    backgroundColor: theme.colors.dragHandle,
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
    color: theme.colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusBadgeActive: {
    backgroundColor: '#eff6ff',
  },
  statusBadgeInactive: {
    backgroundColor: '#f4f4f5',
  },
  statusBadgeText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  statusBadgeTextActive: {
    color: theme.colors.accentBlue,
  },
  statusBadgeTextInactive: {
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
  scrollContent: {
    maxHeight: 520,
  },
  masterToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  masterIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#f4f4f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  masterTextBox: {
    flex: 1,
    marginRight: 10,
  },
  masterTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  masterSub: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionSub: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '600',
  },
  regionListCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 14,
  },
  regionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  regionRowActive: {
    backgroundColor: '#f8fafc',
  },
  flagBox: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  flagEmoji: {
    fontSize: 22,
  },
  regionInfoBox: {
    flex: 1,
  },
  regionNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  regionName: {
    fontSize: 14.5,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  regionNameActive: {
    color: theme.colors.accentBlue,
  },
  pingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#f4f4f5',
    borderRadius: 8,
  },
  pingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pingText: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#71717a',
  },
  regionCity: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  radioBox: {
    marginLeft: 8,
  },
  selectedCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unselectedCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#d4d4d8',
  },
  divider: {
    height: 1,
    backgroundColor: '#f4f4f5',
    marginLeft: 56,
  },
  advancedToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  advancedToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  advancedCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 16,
  },
  advancedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  advancedRowTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  advancedRowSub: {
    fontSize: 11.5,
    color: theme.colors.textSecondary,
    lineHeight: 15,
  },
  testIpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.black,
    height: 42,
    borderRadius: 12,
    marginBottom: 16,
  },
  testIpBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  tipNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f4f4f5',
    borderWidth: 0,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  tipNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: '#71717a',
    fontWeight: '500',
  },
});
