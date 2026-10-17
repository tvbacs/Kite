import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Switch } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { ShieldStats } from '../types/browser';
import { theme } from '../constants/theme';

interface ShieldSheetProps {
  visible: boolean;
  onClose: () => void;
  stats: ShieldStats;
  currentUrl?: string;
  onToggleShield: () => void;
  onToggleAggressive: () => void;
  onManualZap?: () => void;
}

const getDomain = (url?: string): string => {
  if (!url) return 'Trang web hiện tại';
  try {
    const formatted = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
    const parsed = new URL(formatted);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0] || 'Trang web hiện tại';
  }
};

export const ShieldSheet: React.FC<ShieldSheetProps> = ({
  visible,
  onClose,
  stats,
  currentUrl,
  onToggleShield,
  onToggleAggressive,
  onManualZap,
}) => {
  const domain = getDomain(currentUrl);

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

          {/* Nút đóng phía trên góc phải */}
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="x" size={16} color="#71717a" />
            </TouchableOpacity>
          </View>

          {/* Tiêu đề trạng thái */}
          <View style={styles.centerSection}>
            <Text style={styles.title}>
              {stats.isShieldActive ? 'Chặn quảng cáo đang bật' : 'Chặn quảng cáo đang tắt'}
            </Text>

            <Text style={styles.subtitle}>
              {stats.isShieldActive
                ? 'Đang chặn quảng cáo và trình theo dõi trên trang này'
                : 'Đã tạm dừng chặn quảng cáo trên trang này'}
            </Text>
          </View>

          {/* Card trắng chính: Trang web & 2 công tắc tùy chọn */}
          <View style={styles.card}>
            {/* Dòng hiển thị Trang web */}
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardHeaderLabel}>Trang web</Text>
              <Text style={styles.cardHeaderDomain} numberOfLines={1}>
                {domain}
              </Text>
            </View>

            <View style={styles.divider} />

            {/* 1. Chặn quảng cáo trên trang này */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.iconCircle}>
                  <Feather name="slash" size={17} color="#09090b" />
                </View>
                <Text style={styles.rowText}>Chặn quảng cáo trên trang này</Text>
              </View>
              <Switch
                value={stats.isShieldActive}
                onValueChange={onToggleShield}
                trackColor={{ false: '#e4e4e7', true: '#007aff' }}
                ios_backgroundColor="#e4e4e7"
                thumbColor="#ffffff"
              />
            </View>

            <View style={styles.divider} />

            {/* 2. Chặn cửa sổ bật lên từ trang này */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.iconCircle}>
                  <Feather name="external-link" size={17} color="#09090b" />
                </View>
                <Text style={styles.rowText}>Chặn cửa sổ bật lên từ trang này</Text>
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

          {/* Ghi chú hướng dẫn */}
          <Text style={styles.footnote}>
            Hãy thử tạm dừng chặn nếu trang web bạn đang xem không hoạt động
          </Text>
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
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 36,
  },
  sheetDragHandle: {
    width: 36,
    height: 4,
    backgroundColor: theme.colors.dragHandle,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerSection: {
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 16,
    marginTop: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#09090b',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#71717a',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    overflow: 'hidden',
    paddingVertical: 4,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardHeaderLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#09090b',
  },
  cardHeaderDomain: {
    fontSize: 15,
    color: '#71717a',
    maxWidth: '65%',
    textAlign: 'right',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#f4f4f5',
    marginHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f4f4f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rowText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#09090b',
    flex: 1,
  },
  footnote: {
    fontSize: 12,
    color: '#71717a',
    marginTop: 10,
    marginBottom: 6,
    paddingHorizontal: 8,
    lineHeight: 17,
  },
});
