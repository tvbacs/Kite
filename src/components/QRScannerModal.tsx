import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
  Vibration,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface QRScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScanUrl: (url: string) => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  visible,
  onClose,
  onScanUrl,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 16);

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

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (hasScanned || !data) return;
    setHasScanned(true);

    try {
      Vibration.vibrate(100);
    } catch (e) {}

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
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.sheet, { paddingBottom: bottomInset + 8 }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Thanh tay cầm kéo vuốt iOS */}
          <View style={styles.sheetDragHandle} />

          {/* Tiêu đề & Các nút điều khiển */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.qrIconBadge}>
                <Feather name="maximize" size={17} color="#007aff" />
              </View>
              <Text style={styles.headerTitle}>Quét mã QR</Text>
            </View>

            <View style={styles.headerActions}>
              {permission?.granted && (
                <TouchableOpacity
                  style={[styles.actionBtn, torchEnabled && styles.actionBtnActive]}
                  onPress={() => setTorchEnabled((prev) => !prev)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather
                    name={torchEnabled ? 'zap' : 'zap-off'}
                    size={17}
                    color={torchEnabled ? '#f59e0b' : '#a1a1aa'}
                  />
                </TouchableOpacity>
              )}

              {/* Nút đóng X ở góc trên bên phải - tách biệt hoàn toàn khỏi Camera để nhận chạm 100% */}
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={18} color="#a1a1aa" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Khung Camera hoặc Yêu cầu cấp quyền */}
          {!permission?.granted ? (
            <View style={styles.permissionBox}>
              <View style={styles.iconCircle}>
                <Feather name="camera-off" size={32} color="#71717a" />
              </View>
              <Text style={styles.permTitle}>Cần quyền sử dụng Camera</Text>
              <Text style={styles.permSub}>
                Kite cần quyền truy cập máy ảnh để quét mã QR và mở liên kết trang web nhanh chóng.
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
            <View style={styles.cameraWrapper}>
              {/* Khung ngắm Camera bo góc tinh tế */}
              <View style={styles.cameraFrame}>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  enableTorch={torchEnabled}
                  barcodeScannerSettings={{
                    barcodeTypes: ['qr'],
                  }}
                  onBarcodeScanned={hasScanned ? undefined : handleBarcodeScanned}
                />

                {/* Khung mục tiêu QR 4 góc (pointerEvents="none") */}
                <View style={styles.viewfinderOverlay} pointerEvents="none">
                  <View style={styles.viewfinderBox}>
                    <View style={[styles.corner, styles.cornerTL]} />
                    <View style={[styles.corner, styles.cornerTR]} />
                    <View style={[styles.corner, styles.cornerBL]} />
                    <View style={[styles.corner, styles.cornerBR]} />
                  </View>
                </View>
              </View>

              <Text style={styles.hintText}>
                Hướng camera vào mã QR để tự động nhận diện và mở trang web
              </Text>

              {/* Nút Đóng tiện lợi ở dưới đáy */}
              <TouchableOpacity
                style={styles.bottomCloseBtn}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={styles.bottomCloseText}>Đóng</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#18181b',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  sheetDragHandle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#3f3f46',
    alignSelf: 'center',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qrIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 122, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraWrapper: {
    alignItems: 'center',
  },
  cameraFrame: {
    width: '100%',
    height: 320,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#000000',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewfinderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewfinderBox: {
    width: 200,
    height: 200,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: '#007aff',
  },
  cornerTL: {
    top: -2,
    left: -2,
    borderTopWidth: 3.5,
    borderLeftWidth: 3.5,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: -2,
    right: -2,
    borderTopWidth: 3.5,
    borderRightWidth: 3.5,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 3.5,
    borderLeftWidth: 3.5,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 3.5,
    borderRightWidth: 3.5,
    borderBottomRightRadius: 12,
  },
  hintText: {
    color: '#a1a1aa',
    fontSize: 13,
    marginTop: 14,
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  bottomCloseBtn: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomCloseText: {
    color: '#e4e4e7',
    fontSize: 15,
    fontWeight: '600',
  },
  permissionBox: {
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  permTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  permSub: {
    fontSize: 14,
    color: '#a1a1aa',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  grantBtn: {
    backgroundColor: '#007aff',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 14,
    marginBottom: 10,
    width: '100%',
    alignItems: 'center',
  },
  grantBtnText: {
    color: '#ffffff',
    fontSize: 15,
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
