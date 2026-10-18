import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
  Vibration,
  Dimensions,
  StatusBar,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface QRScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScanUrl: (url: string) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const RETICLE_SIZE = Math.min(Math.round(SCREEN_WIDTH * 0.68), 260);

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  visible,
  onClose,
  onScanUrl,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 16);
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 44 : 24);

  const [permission, requestPermission] = useCameraPermissions();
  const [torchEnabled, setTorchEnabled] = useState<boolean>(false);
  const [hasScanned, setHasScanned] = useState<boolean>(false);

  useEffect(() => {
    if (visible) {
      setHasScanned(false);
      setTorchEnabled(false);
      if (!permission?.granted) {
        requestPermission();
      }
    }
  }, [visible]);

  const toggleTorch = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    setTorchEnabled((prev) => !prev);
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (hasScanned || !data) return;
    setHasScanned(true);

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      try {
        Vibration.vibrate(100);
      } catch (err) {}
    }

    let cleanUrl = data.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      if (cleanUrl.includes('.') && !cleanUrl.includes(' ')) {
        cleanUrl = 'https://' + cleanUrl;
      }
    }

    onScanUrl(cleanUrl);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

        {/* Nút đóng tròn mờ chuẩn Apple ở góc trên bên phải */}
        <TouchableOpacity
          style={[styles.floatingCloseBtn, { top: topInset + 12 }]}
          onPress={onClose}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="x" size={22} color="#ffffff" />
        </TouchableOpacity>

        {/* Nếu chưa cấp quyền Camera */}
        {!permission?.granted ? (
          <View style={[styles.permissionContainer, { paddingTop: topInset + 60, paddingBottom: bottomInset + 30 }]}>
            <View style={styles.permIconCircle}>
              <Feather name="camera-off" size={36} color="#94a3b8" />
            </View>
            <Text style={styles.permTitle}>Cần quyền sử dụng Camera</Text>
            <Text style={styles.permSub}>
              Kite cần quyền truy cập camera để quét mã QR và mở liên kết trang web ngay lập tức.
            </Text>
            <TouchableOpacity
              style={styles.grantBtn}
              onPress={requestPermission}
              activeOpacity={0.8}
            >
              <Text style={styles.grantBtnText}>Cấp quyền Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dismissBtn}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.dismissBtnText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Khi đã có quyền: Hiển thị Camera toàn màn hình chuẩn Apple Code Scanner */
          <View style={StyleSheet.absoluteFill}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={torchEnabled}
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              onBarcodeScanned={hasScanned ? undefined : handleBarcodeScanned}
            />

            {/* Khung ngắm 4 góc bo cong dày màu trắng chuẩn Apple (Reticle) */}
            <View style={styles.viewfinderCenter} pointerEvents="none">
              <View style={[styles.reticleBox, { width: RETICLE_SIZE, height: RETICLE_SIZE }]}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>

              <Text style={styles.hintText}>
                Hướng camera vào mã QR
              </Text>
            </View>

            {/* Nút đèn pin nổi lơ lửng ở đáy chuẩn Apple */}
            <View style={[styles.bottomBar, { paddingBottom: bottomInset + 28 }]} pointerEvents="box-none">
              <TouchableOpacity
                style={[
                  styles.torchBtn,
                  torchEnabled ? styles.torchBtnOn : styles.torchBtnOff,
                ]}
                onPress={toggleTorch}
                activeOpacity={0.75}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons
                  name={torchEnabled ? 'flashlight' : 'flashlight-outline'}
                  size={24}
                  color={torchEnabled ? '#000000' : '#ffffff'}
                />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    position: 'relative',
  },
  floatingCloseBtn: {
    position: 'absolute',
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(30, 30, 30, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 30,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 6,
  },
  viewfinderCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  reticleBox: {
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 5,
    elevation: 6,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 5,
    borderLeftWidth: 5,
    borderTopLeftRadius: 28,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 5,
    borderRightWidth: 5,
    borderTopRightRadius: 28,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 5,
    borderLeftWidth: 5,
    borderBottomLeftRadius: 28,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 5,
    borderRightWidth: 5,
    borderBottomRightRadius: 28,
  },
  hintText: {
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 26,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  torchBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 7,
  },
  torchBtnOff: {
    backgroundColor: 'rgba(30, 30, 30, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  torchBtnOn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    backgroundColor: '#000000',
  },
  permIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#1c1c1e',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  permTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 10,
    textAlign: 'center',
  },
  permSub: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
    paddingHorizontal: 12,
  },
  grantBtn: {
    backgroundColor: '#007aff',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 14,
  },
  grantBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  dismissBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  dismissBtnText: {
    color: '#a1a1aa',
    fontSize: 14,
    fontWeight: '500',
  },
});
