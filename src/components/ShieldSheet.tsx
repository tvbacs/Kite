import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Switch } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { ShieldStats } from '../types/browser';

interface ShieldSheetProps {
  visible: boolean;
  onClose: () => void;
  stats: ShieldStats;
  onToggleShield: () => void;
  onToggleAggressive: () => void;
  onManualZap: () => void;
  isDesktop?: boolean;
  onToggleDesktop?: () => void;
  onToggleDataSaver?: () => void;
  onChangeDataSaverMode?: (mode: 'block_images' | 'compress_images') => void;
  onToggleKeepAwake?: () => void;
  onToggleReaderMode?: () => void;
}

export const ShieldSheet: React.FC<ShieldSheetProps> = ({
  visible,
  onClose,
  stats,
  onToggleShield,
  onToggleAggressive,
  onManualZap,
  isDesktop,
  onToggleDesktop,
  onToggleDataSaver,
  onChangeDataSaverMode,
  onToggleKeepAwake,
  onToggleReaderMode,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.sheet}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Tay cầm trượt iOS */}
          <View style={styles.sheetDragHandle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Feather name="shield" size={18} color="#007aff" />
              <Text style={styles.title}>Kite Shield</Text>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: stats.isShieldActive ? '#22c55e' : '#a1a1aa' },
                ]}
              />
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={18} color="#71717a" />
            </TouchableOpacity>
          </View>

          {/* Thống kê chặn */}
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.blockedOverlays}</Text>
              <Text style={styles.statLabel}>Lớp phủ xóa</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.blockedPopups}</Text>
              <Text style={styles.statLabel}>Pop-up chặn</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.blockedAds}</Text>
              <Text style={styles.statLabel}>Nhảy tab chặn</Text>
            </View>
          </View>

          {/* Các tùy chọn */}
          <View style={styles.optionsList}>
            <View style={styles.optionRow}>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Bảo vệ chủ động</Text>
                <Text style={styles.optionDesc}>Chặn mạng quảng cáo & khóa cướp tab</Text>
              </View>
              <Switch
                value={stats.isShieldActive}
                onValueChange={onToggleShield}
                trackColor={{ false: '#e4e4e7', true: '#007aff' }}
                thumbColor="#ffffff"
              />
            </View>

            <View style={styles.optionRow}>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Chế độ triệt để</Text>
                <Text style={styles.optionDesc}>Xóa mọi element che mờ khung xem video</Text>
              </View>
              <Switch
                value={stats.aggressiveMode}
                onValueChange={onToggleAggressive}
                trackColor={{ false: '#e4e4e7', true: '#007aff' }}
                thumbColor="#ffffff"
              />
            </View>

            {onToggleDesktop && (
              <View style={styles.optionRow}>
                <View style={styles.optionInfo}>
                  <Text style={styles.optionTitle}>Trang web máy tính</Text>
                  <Text style={styles.optionDesc}>Đổi sang bản desktop để tải đủ server & chất lượng</Text>
                </View>
                <Switch
                  value={!!isDesktop}
                  onValueChange={onToggleDesktop}
                  trackColor={{ false: '#e4e4e7', true: '#007aff' }}
                  thumbColor="#ffffff"
                />
              </View>
            )}

            {onToggleDataSaver && (
              <View style={styles.optionBlock}>
                <View style={styles.optionRow}>
                  <View style={styles.optionInfo}>
                    <Text style={styles.optionTitle}>Tiết kiệm dữ liệu</Text>
                    <Text style={styles.optionDesc}>Tối ưu gói cước di động 4G/5G giới hạn dung lượng</Text>
                  </View>
                  <Switch
                    value={!!stats.isDataSaverActive}
                    onValueChange={onToggleDataSaver}
                    trackColor={{ false: '#e4e4e7', true: '#007aff' }}
                    thumbColor="#ffffff"
                  />
                </View>

                {stats.isDataSaverActive && onChangeDataSaverMode && (
                  <View style={styles.dataSaverSubMenu}>
                    <TouchableOpacity
                      style={[
                        styles.dataSaverModeBtn,
                        (stats.dataSaverMode === 'block_images' || !stats.dataSaverMode) &&
                          styles.dataSaverModeBtnActive,
                      ]}
                      onPress={() => onChangeDataSaverMode('block_images')}
                      activeOpacity={0.7}
                    >
                      <View style={styles.dataSaverModeHeader}>
                        <Feather
                          name="eye-off"
                          size={15}
                          color={
                            stats.dataSaverMode === 'block_images' || !stats.dataSaverMode
                              ? '#007aff'
                              : '#71717a'
                          }
                        />
                        <Text
                          style={[
                            styles.dataSaverModeTitle,
                            (stats.dataSaverMode === 'block_images' || !stats.dataSaverMode) &&
                              styles.dataSaverModeTitleActive,
                          ]}
                        >
                          Tắt tải hình ảnh (Khuyên dùng)
                        </Text>
                      </View>
                      <Text style={styles.dataSaverModeDesc}>
                        Chặn 100% nạp ảnh, chạm vào ảnh bất kỳ để tải riêng ảnh đó
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.dataSaverModeBtn,
                        stats.dataSaverMode === 'compress_images' &&
                          styles.dataSaverModeBtnActive,
                      ]}
                      onPress={() => onChangeDataSaverMode('compress_images')}
                      activeOpacity={0.7}
                    >
                      <View style={styles.dataSaverModeHeader}>
                        <Feather
                          name="zap"
                          size={15}
                          color={
                            stats.dataSaverMode === 'compress_images'
                              ? '#007aff'
                              : '#71717a'
                          }
                        />
                        <Text
                          style={[
                            styles.dataSaverModeTitle,
                            stats.dataSaverMode === 'compress_images' &&
                              styles.dataSaverModeTitleActive,
                          ]}
                        >
                          Nén & Tối ưu ảnh nhẹ
                        </Text>
                      </View>
                      <Text style={styles.dataSaverModeDesc}>
                        Bỏ ảnh retina 2x/3x độ nét cao, chỉ nạp khi cuộn tới
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {onToggleKeepAwake && (
              <View style={styles.optionRow}>
                <View style={styles.optionInfo}>
                  <Text style={styles.optionTitle}>Giữ màn hình luôn sáng</Text>
                  <Text style={styles.optionDesc}>Không tắt màn hình khi xem phim & lướt web</Text>
                </View>
                <Switch
                  value={!!stats.isKeepAwakeActive}
                  onValueChange={onToggleKeepAwake}
                  trackColor={{ false: '#e4e4e7', true: '#007aff' }}
                  thumbColor="#ffffff"
                />
              </View>
            )}

            {onToggleReaderMode && (
              <View style={styles.optionRow}>
                <View style={styles.optionInfo}>
                  <Text style={styles.optionTitle}>Chế độ đọc báo (Reader Mode)</Text>
                  <Text style={styles.optionDesc}>Bóc tách nội dung chính, đọc sạch không quảng cáo & mỏi mắt</Text>
                </View>
                <Switch
                  value={!!stats.isReaderMode}
                  onValueChange={onToggleReaderMode}
                  trackColor={{ false: '#e4e4e7', true: '#007aff' }}
                  thumbColor="#ffffff"
                />
              </View>
            )}
          </View>

          {/* Nút Phá khóa khẩn cấp - Nền Blue #007aff */}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              onManualZap();
              onClose();
            }}
            activeOpacity={0.8}
          >
            <Feather name="layers" size={16} color="#ffffff" />
            <Text style={styles.actionBtnText}>Ép mở khóa màn hình ngay</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingTop: 12,
    paddingBottom: 38,
  },
  sheetDragHandle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#d4d4d8',
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#09090b',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  closeBtn: {
    padding: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#f4f4f5',
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 24,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#e4e4e7',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#007aff',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: '#71717a',
  },
  optionsList: {
    gap: 18,
    marginBottom: 24,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionInfo: {
    flex: 1,
    marginRight: 12,
  },
  optionTitle: {
    fontSize: 14,
    color: '#09090b',
    fontWeight: '600',
    marginBottom: 2,
  },
  optionDesc: {
    fontSize: 12,
    color: '#71717a',
  },
  optionBlock: {
    backgroundColor: '#ffffff',
  },
  dataSaverSubMenu: {
    marginTop: 10,
    paddingLeft: 4,
    gap: 8,
  },
  dataSaverModeBtn: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dataSaverModeBtnActive: {
    borderColor: '#007aff',
    backgroundColor: '#eff6ff',
  },
  dataSaverModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  dataSaverModeTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  dataSaverModeTitleActive: {
    color: '#007aff',
    fontWeight: '700',
  },
  dataSaverModeDesc: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 15,
  },
  actionButton: {
    height: 46,
    backgroundColor: '#007aff',
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
