import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Platform,
  Vibration,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface PinModalProps {
  visible: boolean;
  inline?: boolean;
  mode: 'unlock' | 'setup' | 'manage';
  currentPin: string | null;
  onClose: () => void;
  onSuccessUnlock: () => void;
  onSavePin: (pin: string) => void;
  onDisablePin: () => void;
  onShowToast?: (msg: string) => void;
}

export const PinModal: React.FC<PinModalProps> = ({
  visible,
  inline = false,
  mode: initialMode,
  currentPin,
  onClose,
  onSuccessUnlock,
  onSavePin,
  onDisablePin,
  onShowToast,
}) => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 48 : 24);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 34 : 16);

  // Flow states
  // 'unlock' | 'setup_new' | 'setup_confirm' | 'verify_for_change' | 'verify_for_disable' | 'manage_menu'
  type FlowState =
    | 'unlock'
    | 'setup_new'
    | 'setup_confirm'
    | 'verify_for_change'
    | 'verify_for_disable'
    | 'manage_menu';

  const [flowState, setFlowState] = useState<FlowState>('unlock');
  const [pinDigits, setPinDigits] = useState<string>('');
  const [firstPin, setFirstPin] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setPinDigits('');
      setFirstPin('');
      setErrorMessage('');
      if (initialMode === 'unlock') {
        setFlowState('unlock');
      } else if (initialMode === 'setup') {
        setFlowState('setup_new');
      } else if (initialMode === 'manage') {
        setFlowState('manage_menu');
      }
    }
  }, [visible, initialMode]);

  const triggerShake = () => {
    try {
      Vibration.vibrate(150);
    } catch (e) {}

    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  };

  const handleKeyPress = (digit: string) => {
    if (pinDigits.length >= 4) return;
    const nextPin = pinDigits + digit;
    setPinDigits(nextPin);
    setErrorMessage('');

    if (nextPin.length === 4) {
      setTimeout(() => {
        handlePinComplete(nextPin);
      }, 100);
    }
  };

  const handleDelete = () => {
    if (pinDigits.length > 0) {
      setPinDigits((prev) => prev.slice(0, -1));
      setErrorMessage('');
    }
  };

  const handlePinComplete = (entered: string) => {
    if (flowState === 'unlock') {
      if (entered === currentPin) {
        onSuccessUnlock();
        onClose();
        if (onShowToast) onShowToast('Đã mở khóa thẻ ẩn danh');
      } else {
        triggerShake();
        setErrorMessage('Mã PIN không chính xác, vui lòng thử lại');
        setPinDigits('');
      }
    } else if (flowState === 'setup_new') {
      setFirstPin(entered);
      setPinDigits('');
      setFlowState('setup_confirm');
    } else if (flowState === 'setup_confirm') {
      if (entered === firstPin) {
        onSavePin(entered);
        onClose();
        if (onShowToast) onShowToast('Đã cài đặt mã PIN bảo vệ thẻ ẩn danh');
      } else {
        triggerShake();
        setErrorMessage('Mã PIN xác nhận không khớp, hãy nhập lại');
        setPinDigits('');
        setFirstPin('');
        setFlowState('setup_new');
      }
    } else if (flowState === 'verify_for_change') {
      if (entered === currentPin) {
        setPinDigits('');
        setFlowState('setup_new');
      } else {
        triggerShake();
        setErrorMessage('Mã PIN hiện tại không đúng');
        setPinDigits('');
      }
    } else if (flowState === 'verify_for_disable') {
      if (entered === currentPin) {
        onDisablePin();
        onClose();
        if (onShowToast) onShowToast('Đã tắt mã PIN bảo vệ thẻ ẩn danh');
      } else {
        triggerShake();
        setErrorMessage('Mã PIN không đúng');
        setPinDigits('');
      }
    }
  };

  const getHeaderInfo = () => {
    switch (flowState) {
      case 'unlock':
        return {
          icon: 'eye-off',
          title: 'Khóa thẻ ẩn danh',
          subtitle: 'Nhập mã PIN 4 chữ số để tiếp tục',
        };
      case 'setup_new':
        return {
          icon: 'lock',
          title: 'Tạo mã PIN mới',
          subtitle: 'Nhập 4 chữ số bảo mật cho thẻ ẩn danh',
        };
      case 'setup_confirm':
        return {
          icon: 'shield',
          title: 'Xác nhận mã PIN',
          subtitle: 'Nhập lại 4 chữ số vừa chọn',
        };
      case 'verify_for_change':
        return {
          icon: 'key',
          title: 'Đổi mã PIN',
          subtitle: 'Nhập mã PIN hiện tại để xác thực',
        };
      case 'verify_for_disable':
        return {
          icon: 'unlock',
          title: 'Tắt mã PIN',
          subtitle: 'Nhập mã PIN hiện tại để tắt bảo vệ',
        };
      default:
        return {
          icon: 'lock',
          title: 'Mã PIN',
          subtitle: '',
        };
    }
  };

  const headerInfo = getHeaderInfo();

  if (!visible) return null;

  const modalBody = (
    <View style={[styles.overlay, inline && styles.inlineOverlay]}>
      <BlurView
        intensity={Platform.OS === 'ios' ? 75 : 95}
        tint="light"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {flowState === 'manage_menu' ? (
          // BOTTOM SHEET MENU QUẢN LÝ MÃ PIN (ĐỔI PIN / TẮT PIN)
          <View style={styles.manageBackdrop}>
            <View style={[styles.manageSheet, { paddingBottom: Math.max(bottomInset, 20) }]}>
              <View style={styles.sheetDragHandle} />
              <View style={styles.sheetHeaderRow}>
                <Text style={styles.manageTitle}>Bảo mật thẻ ẩn danh</Text>
                <TouchableOpacity style={styles.sheetCloseBtn} onPress={onClose} activeOpacity={0.7}>
                  <Feather name="x" size={16} color="#71717a" />
                </TouchableOpacity>
              </View>

              <View style={styles.manageCard}>
                <TouchableOpacity
                  style={styles.manageRowItem}
                  onPress={() => {
                    setPinDigits('');
                    setErrorMessage('');
                    setFlowState('verify_for_change');
                  }}
                  activeOpacity={0.65}
                >
                  <View style={styles.manageIconBox}>
                    <Feather name="key" size={18} color="#09090b" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.manageRowTitle}>Đổi mã PIN</Text>
                    <Text style={styles.manageRowSub}>Thay đổi sang mã 4 chữ số mới</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color="#a1a1aa" />
                </TouchableOpacity>

                <View style={styles.manageDivider} />

                <TouchableOpacity
                  style={styles.manageRowItem}
                  onPress={() => {
                    setPinDigits('');
                    setErrorMessage('');
                    setFlowState('verify_for_disable');
                  }}
                  activeOpacity={0.65}
                >
                  <View style={[styles.manageIconBox, { backgroundColor: '#fee2e2' }]}>
                    <Feather name="unlock" size={18} color="#dc2626" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.manageRowTitle, { color: '#dc2626' }]}>Tắt mã PIN</Text>
                    <Text style={styles.manageRowSub}>Bỏ mật khẩu khóa khi vào thẻ ẩn danh</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color="#a1a1aa" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          // BÀN PHÍM NHẬP MÃ PIN SỐ iOS HIỆN ĐẠI
          <View style={[styles.keypadContainer, { paddingTop: topInset + 20, paddingBottom: bottomInset + 16 }]}>
            {/* Nút Hủy / Đóng ở góc trên */}
            <View style={styles.topBarRow}>
              <TouchableOpacity style={styles.cancelTopBtn} onPress={onClose} activeOpacity={0.7}>
                <Feather name="x" size={20} color="#09090b" />
              </TouchableOpacity>
            </View>

            {/* Khối Header & Icon */}
            <View style={styles.headerBox}>
              <View style={styles.bigIconBox}>
                <Feather name={headerInfo.icon as any} size={28} color="#09090b" />
              </View>
              <Text style={styles.titleText}>{headerInfo.title}</Text>
              <Text style={styles.subText}>{headerInfo.subtitle}</Text>
            </View>

            {/* 4 Chấm chỉ thị mã PIN */}
            <Animated.View style={[styles.dotsContainer, { transform: [{ translateX: shakeAnim }] }]}>
              {[0, 1, 2, 3].map((index) => {
                const isFilled = pinDigits.length > index;
                return (
                  <View
                    key={`dot-${index}`}
                    style={[
                      styles.pinDot,
                      isFilled && styles.pinDotFilled,
                      Boolean(errorMessage) && styles.pinDotError,
                    ]}
                  />
                );
              })}
            </Animated.View>

            {/* Thông báo lỗi nếu có */}
            {Boolean(errorMessage) ? (
              <Text style={styles.errorText}>{errorMessage}</Text>
            ) : (
              <View style={{ height: 22 }} />
            )}

            {/* BÀN PHÍM SỐ TRÒN CHUẨN iOS */}
            <View style={styles.keypadGrid}>
              {[
                ['1', '2', '3'],
                ['4', '5', '6'],
                ['7', '8', '9'],
              ].map((row, rowIdx) => (
                <View key={`row-${rowIdx}`} style={styles.keypadRow}>
                  {row.map((digit) => (
                    <TouchableOpacity
                      key={`key-${digit}`}
                      style={styles.keyBtn}
                      onPress={() => handleKeyPress(digit)}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.keyDigit}>{digit}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}

              {/* Hàng cuối: Trống bên trái, Phím 0 ở giữa, Nút Xóa bên phải */}
              <View style={styles.keypadRow}>
                <View style={styles.keyBtnPlaceholder} />
                <TouchableOpacity
                  style={styles.keyBtn}
                  onPress={() => handleKeyPress('0')}
                  activeOpacity={0.6}
                >
                  <Text style={styles.keyDigit}>0</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.keyBtnAction}
                  onPress={handleDelete}
                  activeOpacity={0.6}
                >
                  <Feather name="delete" size={24} color="#09090b" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    );

    if (inline) {
      return modalBody;
    }

    return (
      <Modal
        visible={visible}
        animationType="fade"
        transparent={true}
        onRequestClose={onClose}
      >
        {modalBody}
      </Modal>
    );
  };

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(255, 255, 255, 0.94)',
    },
    inlineOverlay: {
      ...StyleSheet.absoluteFill,
      zIndex: 99999,
      elevation: 99999,
    },
  keypadContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  topBarRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 6,
  },
  cancelTopBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e5e5ea',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBox: {
    alignItems: 'center',
    marginTop: 6,
  },
  bigIconBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f4f4f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  titleText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#09090b',
    marginBottom: 6,
  },
  subText: {
    fontSize: 13,
    color: '#71717a',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    marginVertical: 18,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#a1a1aa',
    backgroundColor: 'transparent',
  },
  pinDotFilled: {
    borderColor: '#09090b',
    backgroundColor: '#09090b',
  },
  pinDotError: {
    borderColor: '#ef4444',
    backgroundColor: '#ef4444',
  },
  errorText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#ef4444',
    textAlign: 'center',
    height: 22,
  },
  keypadGrid: {
    width: '100%',
    maxWidth: 320,
    gap: 16,
    marginBottom: 20,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  keyBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  keyDigit: {
    fontSize: 28,
    fontWeight: '400',
    color: '#09090b',
  },
  keyBtnPlaceholder: {
    width: 72,
    height: 72,
  },
  keyBtnAction: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // MANAGE MENU STYLES
  manageBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  manageSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  sheetDragHandle: {
    width: 38,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#d4d4d8',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  manageTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#09090b',
  },
  sheetCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f4f4f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  manageCard: {
    backgroundColor: '#f4f4f5',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  manageRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  manageIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e4e4e7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  manageRowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#09090b',
    marginBottom: 2,
  },
  manageRowSub: {
    fontSize: 11,
    color: '#71717a',
  },
  manageDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e4e4e7',
    marginLeft: 62,
  },
});
