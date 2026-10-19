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
  Dimensions,
  Animated,
  PanResponder,
  Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

interface ImageSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSearchResult: (url: string) => void;
  initialImageUri?: string | null;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const COLLAPSED_HEIGHT = Math.round(SCREEN_HEIGHT * 0.58);
const EXPANDED_HEIGHT = Math.round(SCREEN_HEIGHT * 0.90);

export const ImageSearchModal: React.FC<ImageSearchModalProps> = ({
  visible,
  onClose,
  onSearchResult,
  initialImageUri,
}) => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 48 : 24);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 34 : 16);

  const cameraRef = useRef<any>(null);
  const webViewRef = useRef<WebView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isWebLoading, setIsWebLoading] = useState<boolean>(true);
  const [currentMode, setCurrentMode] = useState<'search' | 'translate'>('search');

  // Trạng thái ảnh đã chụp và kết quả Google Lens
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [lensResultUrl, setLensResultUrl] = useState<string | null>(null);

  // Chiều cao kéo trượt Bottom Sheet kết quả (chuẩn Google Lens Chrome)
  const sheetHeightAnim = useRef(new Animated.Value(COLLAPSED_HEIGHT)).current;
  const isExpandedRef = useRef<boolean>(false);

  useEffect(() => {
    if (visible) {
      if (initialImageUri) {
        handleProcessImage(initialImageUri);
      } else if (!permission || !permission.granted) {
        requestPermission();
      }
    } else {
      setCapturedImage(null);
      setLensResultUrl(null);
      setIsProcessing(false);
      setIsWebLoading(true);
      isExpandedRef.current = false;
      sheetHeightAnim.setValue(COLLAPSED_HEIGHT);
    }
  }, [visible, initialImageUri]);

  // Upload ảnh và tạo URL Google Lens chuyên biệt
  const handleProcessImage = async (imageUri: string, modeOverride?: 'search' | 'translate') => {
    setCapturedImage(imageUri);
    setIsProcessing(true);
    setIsWebLoading(true);
    setLensResultUrl(null);

    // Kéo bottom sheet lên vị trí mặc định 58%
    isExpandedRef.current = false;
    Animated.spring(sheetHeightAnim, {
      toValue: COLLAPSED_HEIGHT,
      useNativeDriver: false,
      bounciness: 4,
    }).start();

    const mode = modeOverride || currentMode;
    const modeParam = mode === 'translate' ? '&lns_mode=tr' : '&lns_mode=un';

    try {
      const formData = new FormData();
      formData.append('file', {
        uri: imageUri,
        type: 'image/jpeg',
        name: 'lens_photo.jpg',
      } as any);

      // Upload lên cloud trung gian để server Google Lens có thể nạp ảnh trực tiếp
      const response = await fetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST',
        body: formData,
      });

      const resJson = await response.json();
      if (resJson?.status === 'success' && resJson?.data?.url) {
        // Chuyển tmpfiles.org/xxx sang direct image link tmpfiles.org/dl/xxx
        const directImageUrl = resJson.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
        const targetLensUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(
          directImageUrl
        )}${modeParam}`;
        setLensResultUrl(targetLensUrl);
        return;
      }

      // Fallback nếu server trung gian chậm: mở Google Lens mobile web
      const fallbackUrl = `https://www.google.com/search?q=Google+Lens&udm=26${modeParam}`;
      setLensResultUrl(fallbackUrl);
    } catch (e) {
      const fallbackUrl = `https://www.google.com/search?q=Google+Lens&udm=26${modeParam}`;
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
          quality: 0.85,
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

  // Chọn ảnh có sẵn từ thư viện ảnh
  const handlePickGallery = async () => {
    if (isProcessing) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await handleProcessImage(result.assets[0].uri);
      }
    } catch (e) {
      console.log('Pick image error:', e);
    }
  };

  // Quay lại chụp lại ảnh mới
  const handleRetake = () => {
    setCapturedImage(null);
    setLensResultUrl(null);
    setIsProcessing(false);
    setIsWebLoading(true);
    isExpandedRef.current = false;
    sheetHeightAnim.setValue(COLLAPSED_HEIGHT);
  };

  // Chuyển đổi giữa chế độ Mở rộng (90%) và Thu nhỏ (58%)
  const toggleSheetExpand = () => {
    const target = isExpandedRef.current ? COLLAPSED_HEIGHT : EXPANDED_HEIGHT;
    Animated.spring(sheetHeightAnim, {
      toValue: target,
      useNativeDriver: false,
      bounciness: 4,
    }).start();
    isExpandedRef.current = !isExpandedRef.current;
  };

  // Cử chỉ vuốt tay mượt mà trên thanh kéo của Bottom Sheet
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 4,
      onPanResponderMove: (_, gestureState) => {
        const base = isExpandedRef.current ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
        const newH = base - gestureState.dy;
        if (newH >= COLLAPSED_HEIGHT * 0.75 && newH <= EXPANDED_HEIGHT + 20) {
          sheetHeightAnim.setValue(newH);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -35) {
          // Vuốt lên -> mở rộng toàn màn hình
          Animated.spring(sheetHeightAnim, {
            toValue: EXPANDED_HEIGHT,
            useNativeDriver: false,
            bounciness: 4,
          }).start();
          isExpandedRef.current = true;
        } else if (gestureState.dy > 35) {
          // Vuốt xuống -> thu nhỏ về nửa màn hình
          Animated.spring(sheetHeightAnim, {
            toValue: COLLAPSED_HEIGHT,
            useNativeDriver: false,
            bounciness: 4,
          }).start();
          isExpandedRef.current = false;
        } else {
          // Trả về vị trí hiện tại
          Animated.spring(sheetHeightAnim, {
            toValue: isExpandedRef.current ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT,
            useNativeDriver: false,
            bounciness: 4,
          }).start();
        }
      },
    })
  ).current;

  // Hiển thị menu tùy chọn 3 chấm
  const handleShowOptionsMenu = () => {
    Alert.alert(
      'Google Ống kính',
      'Tìm kiếm những gì bạn thấy bằng máy ảnh thông minh. Nhận diện đồ vật, trích xuất văn bản và dịch trực tiếp.',
      [
        { text: 'Đóng', style: 'cancel' }
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={capturedImage ? handleRetake : onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <View style={styles.container}>
        {/* NỀN: ẢNH CHỤP TOÀN MÀN HÌNH HOẶC CAMERA TRỰC TIẾP */}
        {capturedImage ? (
          <Image
            source={{ uri: capturedImage }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : permission?.granted ? (
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

        {/* LỚP PHỦ GIAO DIỆN CHÍNH (TOP BAR, KHUNG NGẮM, VÀ NÚT CHỨC NĂNG) */}
        <View
          style={[styles.overlayContainer, { paddingTop: topInset, paddingBottom: bottomInset }]}
          pointerEvents="box-none"
        >
          {/* 1. THANH TRÊN CÙNG (TOP BAR) CHUẨN GOOGLE LENS IOS */}
          <View style={styles.topBar}>
            <View style={styles.topLeftGroup}>
              {capturedImage ? (
                /* Nút quay lại khi đang xem kết quả ảnh chụp */
                <TouchableOpacity
                  style={styles.circleBtn}
                  onPress={handleRetake}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="arrow-left" size={20} color="#ffffff" />
                </TouchableOpacity>
              ) : (
                /* Cụm 3 chấm + Đèn flash khi đang mở camera */
                <>
                  <TouchableOpacity
                    style={styles.circleBtn}
                    onPress={handleShowOptionsMenu}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="more-horizontal" size={19} color="#ffffff" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.circleBtn}
                    onPress={() => setIsTorchOn(!isTorchOn)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather
                      name={isTorchOn ? 'zap' : 'zap-off'}
                      size={18}
                      color={isTorchOn ? '#facc15' : '#ffffff'}
                    />
                  </TouchableOpacity>
                </>
              )}
            </View>

            <Text style={styles.titleText}>Google Ống kính</Text>

            <TouchableOpacity
              style={styles.circleBtn}
              onPress={onClose}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="x" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* 2. KHUNG NGẮM TRỌNG TÂM (4 GÓC NHẬN DIỆN VẬT THỂ) */}
          <View
            style={[
              styles.centerViewfinder,
              capturedImage && styles.centerViewfinderCaptured,
            ]}
            pointerEvents="none"
          >
            <View style={styles.focusFrame}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>

            {!capturedImage && (
              <View style={styles.hintPill}>
                <Text style={styles.hintText}>
                  {currentMode === 'translate'
                    ? 'Trỏ vào văn bản để dịch'
                    : 'Nhấn vào nút chụp để tìm kiếm'}
                </Text>
              </View>
            )}
          </View>

          {/* 3. NÚT DỊCH (文A) NỔI TRÊN ẢNH KHI ĐÃ CHỤP (CHUẨN SCREENSHOT 2) */}
          {capturedImage && (
            <View style={styles.floatingActionRow} pointerEvents="box-none">
              <TouchableOpacity
                style={[
                  styles.floatingTranslateBtn,
                  currentMode === 'translate' && styles.floatingTranslateBtnActive,
                ]}
                onPress={() => {
                  const nextMode = currentMode === 'translate' ? 'search' : 'translate';
                  setCurrentMode(nextMode);
                  handleProcessImage(capturedImage, nextMode);
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.floatingTranslateGlyph,
                    currentMode === 'translate' && { color: '#007aff' },
                  ]}
                >
                  文A
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 4. THANH ĐIỀU KHIỂN ĐÁY CAMERA (KHI CHƯA CHỤP ẢNH) */}
          {!capturedImage && (
            <View style={styles.bottomControlsArea}>
              <View style={styles.actionRow}>
                {/* Nút thư viện ảnh (Bộ sưu tập) */}
                <TouchableOpacity
                  style={styles.galleryBtn}
                  onPress={handlePickGallery}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="image" size={22} color="#ffffff" />
                </TouchableOpacity>

                {/* Nút chụp tìm kiếm lớn (hình tròn trắng + kính lúp đen) */}
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
                      <Feather name="search" size={25} color="#000000" />
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
                  <Text
                    style={[
                      styles.modeGlyph,
                      currentMode === 'translate' && styles.modeGlyphActive,
                    ]}
                  >
                    文A
                  </Text>
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
        </View>

        {/* 5. BOTTOM SHEET KẾT QUẢ GOOGLE LENS TÍCH HỢP (CHUẨN CHROME IOS TRONG HÌNH 2 & 3) */}
        {capturedImage && (
          <Animated.View
            style={[
              styles.lensBottomSheet,
              {
                height: sheetHeightAnim,
                paddingBottom: bottomInset,
              },
            ]}
          >
            {/* Thanh tay cầm kéo trượt mượt mà */}
            <View {...panResponder.panHandlers} style={styles.sheetHandleZone}>
              <TouchableOpacity
                onPress={toggleSheetExpand}
                activeOpacity={0.7}
                style={styles.handleTouch}
              >
                <View style={styles.lensHandle} />
              </TouchableOpacity>
            </View>

            {/* Khung nội dung Google Lens tích hợp: Trình duyệt kết quả trực tiếp */}
            <View style={styles.sheetContentContainer}>
              {/* Trạng thái đang tải / phân tích hình ảnh */}
              {(isProcessing || (isWebLoading && !lensResultUrl)) && (
                <View style={styles.loadingContainer}>
                  <View style={styles.lensIconRing}>
                    <MaterialCommunityIcons name="google-lens" size={36} color="#007aff" />
                  </View>
                  <Text style={styles.loadingTitle}>Đang phân tích hình ảnh...</Text>
                  <Text style={styles.loadingSubtitle}>
                    Google Ống kính đang nhận diện đối tượng và tìm kiếm liên quan
                  </Text>
                  <ActivityIndicator size="small" color="#007aff" style={{ marginTop: 16 }} />
                </View>
              )}

              {/* WebView hiển thị trực tiếp trang kết quả Google Lens Mobile chuẩn */}
              {lensResultUrl && (
                <WebView
                  ref={webViewRef}
                  source={{ uri: lensResultUrl }}
                  style={styles.lensWebView}
                  userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  allowsInlineMediaPlayback={true}
                  onLoadStart={() => setIsWebLoading(true)}
                  onLoadEnd={() => setIsWebLoading(false)}
                  onShouldStartLoadWithRequest={(request) => {
                    const { url } = request;
                    if (!url) return false;

                    // Giữ các trang tìm kiếm, bộ lọc, thẻ hình ảnh của Google Lens bên trong sheet
                    const isInternalLens =
                      url.includes('lens.google.com') ||
                      url.includes('google.com/search') ||
                      url.includes('google.vn/search') ||
                      url.includes('google.com/imgres') ||
                      url.includes('accounts.google.') ||
                      url.includes('gstatic.com') ||
                      url.startsWith('about:');

                    if (isInternalLens) {
                      return true;
                    }

                    // Khi người dùng bấm vào một kết quả cụ thể (YouTube, eBay, Alibaba, website...)
                    // Tự động mở ngay liên kết đó trong tab trình duyệt Kite chính!
                    onSearchResult(url);
                    onClose();
                    return false;
                  }}
                />
              )}
            </View>
          </Animated.View>
        )}
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
    zIndex: 10,
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
    fontWeight: '700',
    textAlign: 'center',
  },
  centerViewfinder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerViewfinderCaptured: {
    flex: 0,
    height: '35%',
    marginTop: 20,
  },
  focusFrame: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 34,
    height: 34,
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
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 22,
    marginTop: 24,
  },
  hintText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  floatingActionRow: {
    position: 'absolute',
    right: 18,
    top: '36%',
    zIndex: 20,
  },
  floatingTranslateBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
  },
  floatingTranslateBtnActive: {
    backgroundColor: '#e8f0fe',
  },
  floatingTranslateGlyph: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1a73e8',
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
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
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
  modeGlyph: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '700',
  },
  modeGlyphActive: {
    color: '#ffffff',
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

  // BOTTOM SHEET KẾT QUẢ GOOGLE LENS (CHUẨN CHROME IOS)
  lensBottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 16,
    overflow: 'hidden',
    zIndex: 30,
  },
  sheetHandleZone: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#ffffff',
  },
  handleTouch: {
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  lensHandle: {
    width: 38,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: '#dadce0',
  },
  sheetContentContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#ffffff',
  },
  lensIconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  loadingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#09090b',
    marginBottom: 6,
    textAlign: 'center',
  },
  loadingSubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
  },
  lensWebView: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
});
