import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';

export type PullActionType = 'new_tab' | 'reload' | 'close_tab';

interface PullDownBarProps {
  pullDistance: number; // 0 to ~100
  pullOffset: number; // horizontal dx: negative is left, positive is right
  isPulling: boolean;
  activeAction: PullActionType;
  topInset: number;
  isIncognito?: boolean;
}

export const PullDownBar: React.FC<PullDownBarProps> = ({
  pullDistance,
  pullOffset,
  isPulling,
  activeAction,
  topInset,
  isIncognito = false,
}) => {
  if (!isPulling && pullDistance <= 0) {
    return null;
  }

  // Tiến trình kéo từ 0 -> 1 khi kéo từ 3 -> 20px
  const progress = Math.min(Math.max((pullDistance - 3) / 17, 0), 1);
  const opacity = progress;
  const isTriggered = pullDistance >= 20;

  // Di chuyển thanh bar nhẹ nhàng từ trên xuống dưới
  const translateY = (progress - 1) * 14 + Math.min(pullDistance * 0.45, 26);

  const isDark = isIncognito;
  const getBubbleBg = (action: PullActionType) => {
    if (!isTriggered) {
      return isDark ? '#374151' : '#e4e4e7';
    }
    if (action === 'close_tab') {
      return '#ef4444'; // Màu đỏ cảnh báo khi chọn Đóng thẻ
    }
    return isDark ? '#2563eb' : '#007aff'; // Màu xanh nổi bật khi Thẻ mới hoặc Tải lại
  };

  const getActiveIconColor = () => {
    if (isTriggered) return '#ffffff';
    return isDark ? '#ffffff' : '#09090b';
  };
  const activeTextColor = isDark ? '#ffffff' : '#09090b';
  const inactiveIconColor = isDark ? '#9ca3af' : '#71717a';

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        {
          top: topInset + 6,
          opacity,
          transform: [{ translateY }, { scale: 0.9 + progress * 0.1 }],
        },
      ]}
    >
      {/* Khung nổi màu trắng sáng để luôn hiển thị rõ trên mọi web tối màu */}
      <View
        style={[
          styles.barCard,
          {
            backgroundColor: isDark
              ? 'rgba(30, 30, 36, 0.96)'
              : 'rgba(255, 255, 255, 0.98)',
          },
        ]}
      >
        <View style={styles.actionsRow}>
          {/* NÚT TRÁI: THẺ MỚI (+) */}
          <View style={styles.actionSlot}>
            {activeAction === 'new_tab' ? (
              <View style={styles.activeWrapper}>
                <View style={[styles.bubble, { backgroundColor: getBubbleBg('new_tab') }]}>
                  <Feather name="plus" size={24} color={getActiveIconColor()} />
                </View>
                <Text style={[styles.label, { color: activeTextColor }]}>Thẻ mới</Text>
              </View>
            ) : (
              <View style={styles.inactiveWrapper}>
                <Feather name="plus" size={24} color={inactiveIconColor} />
              </View>
            )}
          </View>

          {/* NÚT GIỮA: TẢI LẠI (XOAY) */}
          <View style={styles.actionSlot}>
            {activeAction === 'reload' ? (
              <View style={styles.activeWrapper}>
                <View style={[styles.bubble, { backgroundColor: getBubbleBg('reload') }]}>
                  <Feather name="rotate-cw" size={22} color={getActiveIconColor()} />
                </View>
                <Text style={[styles.label, { color: activeTextColor }]}>Tải lại</Text>
              </View>
            ) : (
              <View style={styles.inactiveWrapper}>
                <Feather name="rotate-cw" size={22} color={inactiveIconColor} />
              </View>
            )}
          </View>

          {/* NÚT PHẢI: ĐÓNG THẺ (✕) */}
          <View style={styles.actionSlot}>
            {activeAction === 'close_tab' ? (
              <View style={styles.activeWrapper}>
                <View style={[styles.bubble, { backgroundColor: getBubbleBg('close_tab') }]}>
                  <Feather name="x" size={22} color={getActiveIconColor()} />
                </View>
                <Text style={[styles.label, { color: activeTextColor }]}>Đóng thẻ</Text>
              </View>
            ) : (
              <View style={styles.inactiveWrapper}>
                <Feather name="x" size={24} color={inactiveIconColor} />
              </View>
            )}
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
    elevation: 99999,
  },
  barCard: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 30,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: 250,
  },
  actionSlot: {
    width: 68,
    height: 74,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  activeWrapper: {
    alignItems: 'center',
  },
  inactiveWrapper: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#09090b',
    marginTop: 5,
    textAlign: 'center',
  },
});
