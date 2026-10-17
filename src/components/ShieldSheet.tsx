import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Switch } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { ShieldStats } from '../types/browser';
import { theme } from '../constants/theme';

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
            <Text style={styles.title}>Kite Shield</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
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
                trackColor={{ false: '#e4e4e7', true: '#007aff' }}
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
                trackColor={{ false: '#e4e4e7', true: '#007aff' }}
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
    backgroundColor: theme.colors.backdrop,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.sheetBackground,
    borderTopLeftRadius: theme.radius.sheet,
    borderTopRightRadius: theme.radius.sheet,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 36,
  },
  sheetDragHandle: {
    width: 36,
    height: 4,
    backgroundColor: theme.colors.dragHandle,
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
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  optionsList: {
    backgroundColor: '#ffffff',
    borderRadius: theme.radius.xl,
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
    backgroundColor: '#007aff',
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
