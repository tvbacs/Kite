import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
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

/**
 * Script phát hiện trang Passkey/Biometric của Google và tự động chuyển sang "Thử cách khác"
 * Được inject tự động để khắc phục lỗi không thể kích hoạt vân tay/Passkey trong WebView
 */
const PASSKEY_BYPASS_SCRIPT = `
(function() {
  if (window.__kitePasskeyWatcher) return;
  window.__kitePasskeyWatcher = true;

  function tryBypassPasskey() {
    try {
      var body = document.body;
      if (!body) return;
      var text = (body.innerText || body.textContent || '').toLowerCase();

      // Kiểm tra xem có phải màn hình khoá đăng nhập / Passkey / Biometrics không
      var isPasskey =
        text.includes('kho\u00E1 \u0111\u0103ng nh\u1EADp') ||
        text.includes('kh\u00F3a \u0111\u0103ng nh\u1EADp') ||
        text.includes('s\u1EED d\u1EE5ng kho\u00E1') ||
        text.includes('s\u1EED d\u1EE5ng kh\u00F3a') ||
        text.includes('passkey') ||
        text.includes('use your passkey') ||
        text.includes('kho\u00E1 truy c\u1EADp') ||
        text.includes('kh\u00F3a truy c\u1EADp') ||
        document.querySelector('[data-challengetype="63"]') !== null ||
        document.querySelector('[data-challengetype="62"]') !== null ||
        document.querySelector('[data-challengetype="60"]') !== null;

      if (isPasskey) {
        // Tìm các phần tử có chứa "Thử cách khác" hoặc "Try another way"
        var candidates = Array.from(document.querySelectorAll('a, button, [role="button"], [role="link"], span, div'));
        var tryAnotherBtn = candidates.find(function(el) {
          var t = (el.innerText || el.textContent || '').toLowerCase().trim();
          return t === 'th\u1EED c\u00E1ch kh\u00E1c' ||
                 t === 'th\u1EED ph\u01B0\u01A1ng th\u1EE9c kh\u00E1c' ||
                 t.includes('c\u00E1ch kh\u00E1c') ||
                 t.includes('ph\u01B0\u01A1ng th\u1EE9c kh\u00E1c') ||
                 t.includes('try another') ||
                 t.includes('another way');
        });

        if (tryAnotherBtn) {
          tryAnotherBtn.click();
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PASSKEY_BYPASS_CLICKED' }));
          }
        } else {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PASSKEY_PAGE_DETECTED' }));
          }
        }
      }
    } catch(e) {}
  }

  // Chạy ngay lập tức
  tryBypassPasskey();

  // Bắt sự kiện khi Google gọi WebAuthn navigator.credentials.get
  try {
    if (navigator.credentials && navigator.credentials.get) {
      var origGet = navigator.credentials.get;
      navigator.credentials.get = function(options) {
        tryBypassPasskey();
        return origGet.apply(navigator.credentials, arguments);
      };
    }
  } catch(e) {}

  // Lặp kiểm tra định kỳ trong 15s để xử lý Single Page Application transitions
  var poll = setInterval(tryBypassPasskey, 600);
  setTimeout(function() { clearInterval(poll); }, 15000);

  // MutationObserver để bắt kịp ngay khi DOM thay đổi
  try {
    var obs = new MutationObserver(function() {
      tryBypassPasskey();
    });
    obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
  } catch(e) {}
  true;
})();
`;

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
    const [isPasskeyScreen, setIsPasskeyScreen] = useState<boolean>(false);
    const handledCallbackRef = useRef<boolean>(false);

    // Chuẩn bị URL OAuth mới khi mở Sheet
    useEffect(() => {
      if (visible) {
        handledCallbackRef.current = false;
        setIsLoading(true);
        setDisplayHost('accounts.google.com');
        setIsPasskeyScreen(false);

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
                injectedJavaScript={PASSKEY_BYPASS_SCRIPT}
                onLoadStart={() => setIsLoading(true)}
                onNavigationStateChange={(navState) => {
                  setCanGoBack(navState.canGoBack);
                  // Reset passkey indicator khi điều hướng sang trang mới
                  setIsPasskeyScreen(false);
                  try {
                    if (navState.url) {
                      const lower = navState.url.toLowerCase();
                      if (lower.includes('supabase.co') || lower.includes('google')) {
                        setDisplayHost('accounts.google.com');
                      } else {
                        const parsed = new URL(navState.url);
                        setDisplayHost(parsed.hostname.replace(/^www\./, '') || 'accounts.google.com');
                      }
                    }
                  } catch (e) {
                    setDisplayHost('accounts.google.com');
                  }

                  if (navState.url && isOAuthCallback(navState.url)) {
                    handleOAuthCallback(navState.url);
                  }
                }}
                onLoadEnd={() => {
                  setIsLoading(false);
                  // Inject passkey bypass script mỗi khi trang tải xong
                  try {
                    webViewRef.current?.injectJavaScript(PASSKEY_BYPASS_SCRIPT);
                  } catch (e) {}
                }}
                onMessage={(event) => {
                  try {
                    const data = JSON.parse(event.nativeEvent.data);
                    if (data.type === 'PASSKEY_PAGE_DETECTED') {
                      // Trang passkey phát hiện nhưng chưa tìm thấy nút "Thử cách khác" tự động
                      // → hiện overlay button để người dùng biết
                      setIsPasskeyScreen(true);
                    } else if (data.type === 'PASSKEY_BYPASS_CLICKED') {
                      // Đã auto-click thành công, ẩn overlay
                      setIsPasskeyScreen(false);
                    }
                  } catch (e) {}
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

              {/* Overlay nút "Thử cách khác" khi phát hiện màn hình Passkey/Biometric */}
              {isPasskeyScreen && (
                <View style={styles.passkeyOverlay}>
                  <View style={styles.passkeyCard}>
                    <Text style={styles.passkeyTitle}>🔐 Đăng nhập bằng khoá</Text>
                    <Text style={styles.passkeyDesc}>
                      Trình duyệt Kite không hỗ trợ xác thực sinh trắc học qua WebView.{'\n'}
                      Nhấn nút bên dưới để chọn phương thức đăng nhập khác.
                    </Text>
                    <TouchableOpacity
                      style={styles.tryAnotherBtn}
                      activeOpacity={0.8}
                      onPress={() => {
                        setIsPasskeyScreen(false);
                        try {
                          // Thử inject lại và tìm nút "Thử cách khác"
                          const manualScript = `
                            (function() {
                              var allEls = Array.from(document.querySelectorAll('a, button, [role="link"], [role="button"]'));
                              var btn = allEls.find(function(el) {
                                var txt = (el.textContent || el.innerText || '').toLowerCase().trim();
                                return txt.includes('c\u00E1ch kh\u00E1c') || txt.includes('try another') || txt.includes('another way');
                              });
                              if (btn) { btn.click(); }
                              else { history.back(); }
                              true;
                            })();
                          `;
                          webViewRef.current?.injectJavaScript(manualScript);
                        } catch (e) {}
                      }}
                    >
                      <Text style={styles.tryAnotherBtnText}>Thử cách khác</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
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
    paddingHorizontal: 12,
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
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f1f3f4',
    borderRadius: 18,
    overflow: 'hidden',
  },
  hostText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#202124',
    letterSpacing: -0.2,
    textAlign: 'center',
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
  passkeyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  passkeyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 24,
    marginHorizontal: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 16,
  },
  passkeyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#202124',
    marginBottom: 10,
    textAlign: 'center',
  },
  passkeyDesc: {
    fontSize: 13.5,
    color: '#5f6368',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  tryAnotherBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#1a73e8',
  },
  tryAnotherBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
});
