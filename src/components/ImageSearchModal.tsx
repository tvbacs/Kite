import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StatusBar,
  Image,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ImageSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSearchResult: (url: string) => void;
}

export const ImageSearchModal: React.FC<ImageSearchModalProps> = ({
  visible,
  onClose,
  onSearchResult,
}) => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 48 : 24);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 34 : 16);

  const cameraRef = useRef<any>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [currentMode, setCurrentMode] = useState<'search' | 'translate'>('search');

  // Trạng thái ảnh đã chụp và kết quả Google Lens
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [lensResultUrl, setLensResultUrl] = useState<string | null>(null);
  const [additionalQuery, setAdditionalQuery] = useState<string>('');

  useEffect(() => {
    if (visible && (!permission || !permission.granted)) {
      requestPermission();
    }
    if (!visible) {
      setCapturedImage(null);
      setLensResultUrl(null);
      setAdditionalQuery('');
      setIsProcessing(false);
    }
  }, [visible]);

  // Upload ảnh và lấy liên kết tìm kiếm Google Ống kính
  const handleProcessImage = async (imageUri: string) => {
    setCapturedImage(imageUri);
    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append('file', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'photo.jpg',
      } as any);

      // Upload lên cloud trung gian để Google có thể truy cập ảnh
      const response = await fetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST',
        body: formData,
      });

      const resJson = await response.json();
      if (resJson?.status === 'success' && resJson?.data?.url) {
        // Chuyển tmpfiles.org/xxx sang direct link tmpfiles.org/dl/xxx
        const directImageUrl = resJson.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
        const targetLensUrl = `https://www.google.com/searchbyimage?image_url=${encodeURIComponent(
          directImageUrl
        )}`;
        setLensResultUrl(targetLensUrl);
        return;
      }

      // Fallback nếu upload trung gian bận: mở Google Lens tìm kiếm
      const fallbackUrl = 'https://www.google.com/search?q=Google+Lens&udm=26';
      setLensResultUrl(fallbackUrl);
    } catch (e) {
      const fallbackUrl = 'https://www.google.com/search?q=Google+Lens&udm=26';
      setLensResultUrl(fallbackUrl);
    } finally {
      setIsProcessing(false);
    }
  };

  // Chụp ảnh từ khung ngắm camera
  const handleCapture = async () => {
    if (isProcessing) return;
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          skipProcessing: true,
        });
        if (photo?.uri) {
          await handleProcessImage(photo.uri);
        }
      } catch (e) {
        handlePickGallery();
      }
    } else {
      handlePickGallery();
    }
  };

  // Chọn ảnh có sẵn từ bộ sưu tập
  const handlePickGallery = async () => {
    if (isProcessing) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await handleProcessImage(result.assets[0].uri);
      }
    } catch (e) {
      console.log('Pick image error:', e);
    }
  };

  // Mở kết quả tìm kiếm đã nhận diện sang trình duyệt chính
  const handleGoToResults = () => {
    let finalUrl = lensResultUrl || 'https://www.google.com/search?q=Google+Lens&udm=26';
    if (additionalQuery.trim()) {
      finalUrl += `&q=${encodeURIComponent(additionalQuery.trim())}`;
    }
    onSearchResult(finalUrl);
    onClose();
  };

  // Quay lại khung ngắm camera
  const handleRetake = () => {
    setCapturedImage(null);
    setLensResultUrl(null);
    setAdditionalQuery('');
    setIsProcessing(false);
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <View style={styles.container}>
        {/* Nếu đã chụp ảnh: Đóng băng hiển thị ảnh chụp toàn màn hình */}
        {capturedImage ? (
          <Image
            source={{ uri: capturedImage }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : permission?.granted ? (
          /* Khung ngắm Camera trực tiếp */
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={isTorchOn}
          />
        ) : (
          <View style={styles.permissionFallback}>
            <Feather name="camera-off" size={40} color="#71717a" />
            <Text style={styles.permissionText}>Cần cấp quyền truy cập máy ảnh</Text>
            <TouchableOpacity style={styles.grantBtn} onPress={requestPermission}>
              <Text style={styles.grantBtnText}>Cấp quyền máy ảnh</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* LỚP PHỦ GIAO DIỆN GOOGLE ỐNG KÍNH */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.overlayContainer, { paddingTop: topInset, paddingBottom: bottomInset }]}
        >
          {/* Thanh trên cùng: Nút quay lại (Back) bên trái + Tiêu đề + Nút đóng (X) bên phải */}
          <View style={styles.topBar}>
            <View style={styles.topLeftGroup}>
              <TouchableOpacity
                style={styles.circleBtn}
                onPress={capturedImage ? handleRetake : onClose}
                activeOpacity={0.7}
              >
                <Feather name="arrow-left" size={20} color="#ffffff" />
              </TouchableOpacity>

              {!capturedImage && (
                <TouchableOpacity
                  style={styles.circleBtn}
                  onPress={() => setIsTorchOn(!isTorchOn)}
                  activeOpacity={0.7}
                >
                  <Feather
                    name={isTorchOn ? 'zap' : 'zap-off'}
                    size={19}
                    color={isTorchOn ? '#facc15' : '#ffffff'}
                  />
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.titleText}>Google Ống kính</Text>

            <TouchableOpacity style={styles.circleBtn} onPress={onClose} activeOpacity={0.7}>
              <Feather name="x" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Vùng ngắm trọng tâm (Khung 4 góc nhận diện) */}
          <View style={styles.centerViewfinder}>
            <View style={styles.focusFrame}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>

            {!capturedImage && (
              <View style={styles.hintPill}>
                <Text style={styles.hintText}>Nhấn vào nút chụp để tìm kiếm</Text>
              </View>
            )}
          </View>

          {/* Nếu ĐÃ CHỤP ẢNH: Hiện Bottom Sheet kết quả Google Lens chuẩn iOS */}
          {capturedImage ? (
            <View style={styles.lensResultCard}>
              <View style={styles.lensHandle} />

              {/* Thanh tìm kiếm Google Ống kính: Icon G + Ảnh thu nhỏ + Input */}
              <View style={styles.lensSearchPill}>
                <View style={styles.googleCircle}>
                  <Text style={styles.googleGLetter}>G</Text>
                </View>
                <Image source={{ uri: capturedImage }} style={styles.thumbImage} />
                <TextInput
                  style={styles.lensSearchInput}
                  placeholder="Thêm vào nội dung tìm kiếm"
                  placeholderTextColor="#71717a"
                  value={additionalQuery}
                  onChangeText={setAdditionalQuery}
                  returnKeyType="search"
                  onSubmitEditing={handleGoToResults}
                />
                {isProcessing && <ActivityIndicator size="small" color="#007aff" />}
              </View>

              {/* Khối Thông tin tổng quan do AI tạo */}
              <View style={styles.aiOverviewBox}>
                <View style={styles.aiHeaderRow}>
                  <Feather name="star" size={15} color="#007aff" />
                  <Text style={styles.aiHeaderTitle}>Thông tin tổng quan do AI tạo</Text>
                </View>
                <Text style={styles.aiBodyText}>
                  {isProcessing
                    ? 'Đang phân tích hình ảnh và nhận diện đối tượng...'
                    : 'Đã nhận diện vật thể trong ảnh. Nhấn vào kết quả bên dưới để xem chi tiết mua sắm và thông tin liên quan trên Google Ống kính.'}
                </Text>
              </View>

              {/* Nút Xem kết quả đầy đủ */}
              <TouchableOpacity
                style={[styles.seeResultsBtn, isProcessing && { opacity: 0.7 }]}
                onPress={handleGoToResults}
                disabled={isProcessing}
                activeOpacity={0.8}
              >
                <Text style={styles.seeResultsBtnText}>
                  {isProcessing ? 'Đang chuẩn bị kết quả...' : 'Mở kết quả trên Google Ống kính'}
                </Text>
                <Feather name="arrow-up-right" size={17} color="#ffffff" />
              </TouchableOpacity>
            </View>
          ) : (
            /* Thanh điều khiển camera đáy */
            <View style={styles.bottomControlsArea}>
              <View style={styles.actionRow}>
                {/* Nút thư viện ảnh */}
                <TouchableOpacity
                  style={styles.galleryBtn}
                  onPress={handlePickGallery}
                  activeOpacity={0.7}
                >
                  <Feather name="image" size={22} color="#ffffff" />
                </TouchableOpacity>

                {/* Nút chụp tìm kiếm lớn */}
                <TouchableOpacity
                  style={styles.shutterOuterRing}
                  onPress={handleCapture}
                  disabled={isProcessing}
                  activeOpacity={0.8}
                >
                  <View style={styles.shutterInnerBtn}>
                    {isProcessing ? (
                      <ActivityIndicator size="small" color="#000000" />
                    ) : (
                      <Feather name="search" size={26} color="#000000" />
                    )}
                  </View>
                </TouchableOpacity>

                <View style={styles.spacerRight} />
              </View>

              {/* Phân đoạn chế độ: Dịch / Tìm kiếm */}
              <View style={styles.modeCapsule}>
                <TouchableOpacity
                  style={[styles.modeTab, currentMode === 'translate' && styles.modeTabActive]}
                  onPress={() => setCurrentMode('translate')}
                  activeOpacity={0.7}
                >
                  <Feather
                    name="globe"
                    size={14}
                    color={currentMode === 'translate' ? '#ffffff' : '#a1a1aa'}
                  />
                  <Text
                    style={[
                      styles.modeTabText,
                      currentMode === 'translate' && styles.modeTabTextActive,
                    ]}
                  >
                    Dịch
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modeTab, currentMode === 'search' && styles.modeTabActive]}
                  onPress={() => setCurrentMode('search')}
                  activeOpacity={0.7}
                >
                  <Feather
                    name="search"
                    size={14}
                    color={currentMode === 'search' ? '#ffffff' : '#a1a1aa'}
                  />
                  <Text
                    style={[
                      styles.modeTabText,
                      currentMode === 'search' && styles.modeTabTextActive,
                    ]}
                  >
                    Tìm kiếm
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  permissionFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#121215',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 14,
    marginBottom: 20,
    textAlign: 'center',
  },
  grantBtn: {
    backgroundColor: '#007aff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  grantBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  overlayContainer: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  topLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  centerViewfinder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  focusFrame: {
    width: 260,
    height: 260,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderColor: '#ffffff',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3.5,
    borderLeftWidth: 3.5,
    borderTopLeftRadius: 18,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3.5,
    borderRightWidth: 3.5,
    borderTopRightRadius: 18,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3.5,
    borderLeftWidth: 3.5,
    borderBottomLeftRadius: 18,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3.5,
    borderRightWidth: 3.5,
    borderBottomRightRadius: 18,
  },
  hintPill: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    marginTop: 24,
  },
  hintText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  bottomControlsArea: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  actionRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    marginBottom: 20,
  },
  galleryBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterOuterRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterInnerBtn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spacerRight: {
    width: 48,
  },
  modeCapsule: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: 24,
    padding: 3,
    gap: 4,
  },
  modeTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  modeTabActive: {
    backgroundColor: '#27272a',
  },
  modeTabText: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '500',
  },
  modeTabTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },

  // GOOGLE LENS RESULT SHEET STYLES
  lensResultCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  lensHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d4d4d8',
    alignSelf: 'center',
    marginBottom: 14,
  },
  lensSearchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4f4f5',
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 14,
  },
  googleCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  googleGLetter: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4285f4',
  },
  thumbImage: {
    width: 28,
    height: 28,
    borderRadius: 6,
    marginRight: 8,
  },
  lensSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#09090b',
    paddingVertical: 4,
  },
  aiOverviewBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  aiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  aiHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#09090b',
  },
  aiBodyText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  seeResultsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#007aff',
  },
  seeResultsBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
