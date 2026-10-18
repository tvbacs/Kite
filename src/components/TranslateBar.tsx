import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';

interface TranslateBarProps {
  visible: boolean;
  isTranslated: boolean;
  onTranslateToVi: () => void;
  onShowOriginal: () => void;
  onClose: () => void;
  topInset?: number;
  isIncognito?: boolean;
}

export const TranslateBar: React.FC<TranslateBarProps> = ({
  visible,
  isTranslated,
  onTranslateToVi,
  onShowOriginal,
  onClose,
  topInset = 44,
  isIncognito = false,
}) => {
  const slideAnim = useRef(new Animated.Value(-80)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
          speed: 12,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -80,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  const bg = isIncognito ? '#27272a' : '#ffffff';
  const borderCol = isIncognito ? 'rgba(255,255,255,0.1)' : '#e4e4e7';
  const textCol = isIncognito ? '#f4f4f5' : '#09090b';
  const subTextCol = isIncognito ? '#a1a1aa' : '#71717a';

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: topInset + (Platform.OS === 'ios' ? 6 : 8),
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <View style={[styles.barCard, { backgroundColor: bg, borderColor: borderCol }]}>
        {/* Logo Google Dịch */}
        <View style={styles.brandGroup}>
          <View style={styles.iconCircle}>
            <Ionicons name="language" size={16} color="#007aff" />
          </View>
          <Text style={[styles.brandText, { color: textCol }]}>Dịch</Text>
        </View>

        {/* Thanh chuyển đổi 2 ngôn ngữ (Gốc - Tiếng Việt) */}
        <View style={[styles.segmentedControl, { backgroundColor: isIncognito ? '#18181b' : '#f4f4f5' }]}>
          {/* Nút Ngôn ngữ gốc */}
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              !isTranslated && styles.segmentBtnActive,
            ]}
            onPress={onShowOriginal}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.segmentText,
                !isTranslated ? styles.segmentTextActive : { color: subTextCol },
              ]}
              numberOfLines={1}
            >
              Trang gốc
            </Text>
          </TouchableOpacity>

          {/* Mũi tên chuyển đổi */}
          <Feather name="arrow-right" size={12} color="#a1a1aa" style={{ marginHorizontal: 2 }} />

          {/* Nút Tiếng Việt */}
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              isTranslated && styles.segmentBtnActive,
            ]}
            onPress={onTranslateToVi}
            activeOpacity={0.7}
          >
            {isTranslated && (
              <Feather name="check" size={12} color="#ffffff" style={{ marginRight: 4 }} />
            )}
            <Text
              style={[
                styles.segmentText,
                isTranslated ? styles.segmentTextActive : { color: subTextCol },
              ]}
              numberOfLines={1}
            >
              Tiếng Việt
            </Text>
          </TouchableOpacity>
        </View>

        {/* Nút Đóng thanh dịch */}
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.6}
        >
          <Feather name="x" size={16} color={subTextCol} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 9998,
  },
  barCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 8,
  },
  iconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 13,
    fontWeight: '700',
  },
  segmentedControl: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 3,
    justifyContent: 'center',
  },
  segmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 13,
  },
  segmentBtnActive: {
    backgroundColor: '#007aff',
    shadowColor: '#007aff',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
    marginLeft: 6,
  },
});
