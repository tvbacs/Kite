import React, { useState, useRef, useEffect, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Animated,
  StatusBar,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile } from '../types/browser';
import {
  getGoogleOAuthUrl,
  handleAuthCallbackUrl,
  syncUserCloudData,
} from '../services/supabase';
import {
  isOAuthCallback,
  STORAGE_USER_PROFILE_KEY,
  STORAGE_SAVED_ACCOUNTS_KEY,
} from '../hooks/useAuthProfile';

const FALLBACK_OAUTH_URL =
  'https://ivwnjrugslrvsxssufco.supabase.co/auth/v1/authorize?provider=google&redirect_to=kite%3A%2F%2Fauth-callback&prompt=select_account';

const MOBILE_USER_AGENT =
  Platform.OS === 'ios'
    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
    : 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36';

interface GoogleAuthSheetProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (profile: UserProfile) => void;
  showToast: (msg: string) => void;
}

/**
 * Bottom Sheet đăng nhập Google chuẩn Google Chrome trên iOS.
 * Không mở trang mới, không làm bẩn danh sách thẻ (tabs),
 * hỗ trợ chọn tài khoản, Face ID / Passkey và tự động đóng sheet khi hoàn tất.
 */
export const GoogleAuthSheet = memo<GoogleAuthSheetProps>(
  ({ visible, onClose, onSuccess, showToast }) => {
    const insets = useSafeAreaInsets();
    const webViewRef = useRef<WebView>(null);
    const [authUrl, setAuthUrl] = useState<string>(FALLBACK_OAUTH_URL);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [canGoBack, setCanGoBack] = useState<boolean>(false);
    const [displayHost, setDisplayHost] = useState<string>('accounts.google.com');
    const handledCallbackRef = useRef<boolean>(false);

    // Chuẩn bị URL OAuth mới khi mở Sheet
    useEffect(() => {
      if (visible) {
        handledCallbackRef.current = false;
        setIsLoading(true);
        setDisplayHost('accounts.google.com');

        getGoogleOAuthUrl().then((url) => {
          if (url) {
            setAuthUrl(url);
          } else {
            setAuthUrl(FALLBACK_OAUTH_URL);
          }
        });
      }
    }, [visible]);

    const handleOAuthCallback = async (callbackUrl: string) => {
      if (handledCallbackRef.current) return;
      handledCallbackRef.current = true;
      setIsLoading(true);

      try {
        if (callbackUrl.includes('error=')) {
          showToast('Đăng nhập Google bị gián đoạn, vui lòng thử lại.');
          onClose();
          return;
        }

        const profile = await handleAuthCallbackUrl(callbackUrl);
        if (profile && profile.isLoggedIn) {
          // Lưu phiên người dùng hiện tại
          await AsyncStorage.setItem(STORAGE_USER_PROFILE_KEY, JSON.stringify(profile));

          // Thêm tài khoản vào danh sách tài khoản đã lưu
          if (profile.email) {
            try {
              const res = await AsyncStorage.getItem(STORAGE_SAVED_ACCOUNTS_KEY);
              let list: UserProfile[] = [];
              if (res) {
                try {
                  list = JSON.parse(res);
                } catch (e) {}
              }
              if (!Array.isArray(list)) list = [];
              const idx = list.findIndex(
                (a) => a.email?.toLowerCase() === profile.email?.toLowerCase()
              );
              if (idx !== -1) {
                list[idx] = profile;
              } else {
                list.push(profile);
              }
              await AsyncStorage.setItem(STORAGE_SAVED_ACCOUNTS_KEY, JSON.stringify(list));
            } catch (eAcc) {}
          }

          // Kích hoạt đồng bộ đám mây và đợi nạp đầy đủ dữ liệu trước khi chuyển giao diện
          try {
            await syncUserCloudData(profile);
          } catch (eSync) {}

          showToast(`Đăng nhập Google thành công! (${profile.name || profile.email})`);
          onSuccess(profile);
          onClose();
        } else {
          showToast('Không lấy được thông tin tài khoản Google. Vui lòng thử lại.');
          onClose();
        }
      } catch (err) {
        showToast('Đã xảy ra sự cố khi đăng nhập Google.');
        onClose();
      }
    };

    if (!visible) return null;

    return (
      <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        statusBarTranslucent={true}
        onRequestClose={onClose}
      >
        <View style={styles.backdrop}>
          <TouchableOpacity
            style={styles.backdropTouch}
            activeOpacity={1}
            onPress={onClose}
          />
          <View
            style={[
              styles.sheetContainer,
              {
                marginTop: Math.max(insets.top + 10, Platform.OS === 'ios' ? 44 : 32),
                paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
              },
            ]}
          >
            {/* Thanh Header chuẩn Chrome (Nút X bên trái, Host ở giữa, Reload bên phải) */}
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.circleBtn}
                onPress={onClose}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="x" size={18} color="#202124" />
              </TouchableOpacity>

              <View style={styles.hostContainer}>
                <Feather name="lock" size={12} color="#10b981" style={{ marginRight: 6 }} />
                <Text style={styles.hostText} numberOfLines={1}>
                  {displayHost}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.circleBtn}
                onPress={() => webViewRef.current?.reload()}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="rotate-cw" size={16} color="#202124" />
              </TouchableOpacity>
            </View>

            {/* Thanh tiến trình tải màu xanh Google */}
            {isLoading && (
              <View style={styles.progressBarContainer}>
                <View style={styles.progressBar} />
              </View>
            )}

            {/* Trình duyệt WebView riêng biệt cho Google Auth */}
            <View style={styles.webviewWrapper}>
              <WebView
                ref={webViewRef}
                source={{ uri: authUrl }}
                userAgent={MOBILE_USER_AGENT}
                incognito={false}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                sharedCookiesEnabled={true}
                thirdPartyCookiesEnabled={true}
                originWhitelist={['*']}
                onLoadStart={() => setIsLoading(true)}
                onLoadEnd={() => setIsLoading(false)}
                onNavigationStateChange={(navState) => {
                  setCanGoBack(navState.canGoBack);
                  try {
                    if (navState.url) {
                      const parsed = new URL(navState.url);
                      setDisplayHost(parsed.hostname || 'accounts.google.com');
                    }
                  } catch (e) {}

                  if (navState.url && isOAuthCallback(navState.url)) {
                    handleOAuthCallback(navState.url);
                  }
                }}
                onShouldStartLoadWithRequest={(request) => {
                  const reqUrl = request.url || '';

                  // Bắt callback hoàn tất xác thực trả về cho Kite
                  if (isOAuthCallback(reqUrl) || reqUrl.startsWith('kite://')) {
                    handleOAuthCallback(reqUrl);
                    return false;
                  }

                  // Tự động bypass SetSID nếu gặp phải
                  if (reqUrl.includes('/setsid') || reqUrl.includes('/accounts/setsid')) {
                    try {
                      const parsed = new URL(reqUrl);
                      let cont = parsed.searchParams.get('continue');
                      if (cont) {
                        try {
                          while (cont && (cont.includes('%3A') || cont.includes('%2F'))) {
                            const dec = decodeURIComponent(cont);
                            if (dec === cont) break;
                            cont = dec;
                          }
                        } catch (eDec) {}

                        if (cont && (isOAuthCallback(cont) || cont.startsWith('kite://'))) {
                          handleOAuthCallback(cont);
                          return false;
                        }
                      }
                    } catch (eSetSid) {}
                  }

                  return true;
                }}
                onHttpError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  if (
                    nativeEvent.statusCode === 400 &&
                    nativeEvent.url &&
                    nativeEvent.url.toLowerCase().includes('/setsid')
                  ) {
                    try {
                      const parsed = new URL(nativeEvent.url);
                      let cont = parsed.searchParams.get('continue');
                      if (cont) {
                        try {
                          while (cont && (cont.includes('%3A') || cont.includes('%2F'))) {
                            const dec = decodeURIComponent(cont);
                            if (dec === cont) break;
                            cont = dec;
                          }
                        } catch (eDec) {}

                        if (cont && (isOAuthCallback(cont) || cont.startsWith('kite://'))) {
                          handleOAuthCallback(cont);
                          return;
                        }
                      }
                    } catch (eErr) {}
                  }
                }}
                style={styles.webview}
              />
            </View>

            {/* Thanh điều hướng dưới cùng chuẩn Chrome: Nút quay lại '<' và nút làm mới */}
            <View style={styles.bottomBar}>
              <TouchableOpacity
                style={[styles.circleBtn, !canGoBack && styles.disabledBtn]}
                onPress={() => {
                  if (canGoBack) webViewRef.current?.goBack();
                }}
                disabled={!canGoBack}
                activeOpacity={0.7}
              >
                <Feather
                  name="chevron-left"
                  size={20}
                  color={canGoBack ? '#202124' : '#bdc1c6'}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.doneButton}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={styles.doneButtonText}>Xong</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheetContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 24,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#ffffff',
  },
  circleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f3f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: {
    backgroundColor: '#f8f9fa',
  },
  hostContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  hostText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#202124',
    letterSpacing: -0.2,
  },
  progressBarContainer: {
    height: 2.5,
    backgroundColor: '#e8f0fe',
    width: '100%',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    width: '60%',
    backgroundColor: '#1a73e8',
  },
  webviewWrapper: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  webview: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  bottomBar: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#ffffff',
  },
  doneButton: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#f1f3f4',
  },
  doneButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a73e8',
  },
});
