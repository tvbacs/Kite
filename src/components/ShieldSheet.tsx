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
}

export const ShieldSheet: React.FC<ShieldSheetProps> = ({
  visible,
  onClose,
  stats,
  onToggleShield,
  onToggleAggressive,
  onManualZap,
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
              <Feather name="shield" size={18} color="#18181b" />
              <Text style={styles.title}>Kite Shield</Text>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: stats.isShieldActive ? '#18181b' : '#a1a1aa' },
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

          {/* Các tùy chọn chuyên sâu về Chặn quảng cáo */}
          <View style={styles.optionsList}>
            {/* 1. Bảo vệ chủ động */}
            <View style={styles.optionRow}>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Bảo vệ chủ động</Text>
                <Text style={styles.optionDesc}>Chặn mạng quảng cáo & khóa cướp tab</Text>
              </View>
              <Switch
                value={stats.isShieldActive}
                onValueChange={onToggleShield}
                trackColor={{ false: '#e4e4e7', true: '#18181b' }}
                ios_backgroundColor="#e4e4e7"
                thumbColor="#ffffff"
              />
            </View>

            {/* 2. Chế độ triệt để */}
            <View style={[styles.optionRow, { borderBottomWidth: 0 }]}>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Chế độ triệt để</Text>
                <Text style={styles.optionDesc}>Xóa mọi element che mờ khung xem video</Text>
              </View>
              <Switch
                value={stats.aggressiveMode}
                onValueChange={onToggleAggressive}
                trackColor={{ false: '#e4e4e7', true: '#18181b' }}
                ios_backgroundColor="#e4e4e7"
                thumbColor="#ffffff"
              />
            </View>
          </View>

          {/* Nút Phá khóa khẩn cấp */}
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
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 36,
  },
  sheetDragHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#d4d4d8',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#09090b',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  closeBtn: {
    padding: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#f4f4f5',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 18,
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#18181b',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: '#71717a',
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#e4e4e7',
  },
  optionsList: {
    backgroundColor: '#f4f4f5',
    borderRadius: 16,
    paddingVertical: 4,
    marginBottom: 20,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e4e4e7',
  },
  optionInfo: {
    flex: 1,
    marginRight: 12,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#09090b',
  },
  optionDesc: {
    fontSize: 12,
    color: '#71717a',
    marginTop: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#18181b',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
