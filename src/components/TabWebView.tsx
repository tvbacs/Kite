import React, { useMemo, useRef, useEffect, memo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { BrowserTab } from '../types/browser';
import {
  getRestoreTabStateScript,
  PAUSE_BACKGROUND_MEDIA_SCRIPT,
  RESUME_ACTIVE_MEDIA_SCRIPT,
} from '../services/antiAdScript';

interface TabWebViewProps {
  tab: BrowserTab;
  isTabActive: boolean;
  onRegisterRef: (tabId: string, ref: any) => void;
  onRegisterContainerRef: (tabId: string, ref: any) => void;
  injectedBefore?: string;
  injectedAfter?: string;
  userAgent?: string;
  onMessage: (event: any, tabId?: string) => void;
  onShouldStartLoadWithRequest: (event: any) => boolean;
  onNavigationStateChange: (tabId: string, navState: any) => void;
  onLoadStart: (tabId: string, event?: any) => void;
  onLoadProgress: (tabId: string, event: any) => void;
  onLoadEnd: (tabId: string, event?: any) => void;
  onError: (tabId: string, event: any) => void;
  onHttpError: (tabId: string) => void;
  onFileDownload?: (event: any) => void;
}

export const TabWebView = memo<TabWebViewProps>(
  ({
    tab,
    isTabActive,
    onRegisterRef,
    onRegisterContainerRef,
    injectedBefore,
    injectedAfter,
    userAgent,
    onMessage,
    onShouldStartLoadWithRequest,
    onNavigationStateChange,
    onLoadStart,
    onLoadProgress,
    onLoadEnd,
    onError,
    onHttpError,
    onFileDownload,
  }) => {
    const localRef = useRef<any>(null);

    // Khởi tạo source ổn định từ URL của tab để không bao giờ bị nạp lại trắng trang khi điều hướng trong trang
    const initialSourceUrl = useRef(tab.url || tab.initialUrl);
    if (!initialSourceUrl.current && (tab.url || tab.initialUrl)) {
      initialSourceUrl.current = tab.url || tab.initialUrl;
    }
    useEffect(() => {
      if (tab.url && tab.url !== initialSourceUrl.current) {
        initialSourceUrl.current = tab.url;
      }
    }, [tab.url]);

    const effectiveInitialUrl = tab.url || tab.initialUrl || initialSourceUrl.current || 'about:blank';
    const webViewSource = useMemo(
      () => ({ uri: effectiveInitialUrl }),
      [effectiveInitialUrl]
    );

    const isDark = Boolean(tab.isIncognito);
    const bgColor = isDark ? '#202124' : '#ffffff';

    // Tối ưu tab nền chuẩn Chrome: Tạm dừng và khóa âm thanh khi tab ở chế độ nền, phục hồi khi mở lại
    useEffect(() => {
      if (!localRef.current) return;
      try {
        if (!isTabActive) {
          localRef.current.injectJavaScript(PAUSE_BACKGROUND_MEDIA_SCRIPT);
          const t1 = setTimeout(() => {
            localRef.current?.injectJavaScript(PAUSE_BACKGROUND_MEDIA_SCRIPT);
          }, 500);
          const t2 = setTimeout(() => {
            localRef.current?.injectJavaScript(PAUSE_BACKGROUND_MEDIA_SCRIPT);
          }, 1500);
          return () => {
            clearTimeout(t1);
            clearTimeout(t2);
          };
        } else {
          localRef.current.injectJavaScript(RESUME_ACTIVE_MEDIA_SCRIPT);
        }
      } catch (e) {}
    }, [isTabActive]);

    const activeStateBeforeScript = useMemo(
      () => `window.__kite_tab_is_background = ${!isTabActive}; true;\n`,
      [isTabActive]
    );
    const combinedInjectedBefore = useMemo(
      () => activeStateBeforeScript + (injectedBefore || ''),
      [activeStateBeforeScript, injectedBefore]
    );

    const handleMessage = (event: any) => {
      onMessage(event, tab.id);
    };

    const handleNavigationStateChange = (navState: any) => {
      onNavigationStateChange(tab.id, navState);
    };

    const handleLoadStart = (event?: any) => {
      onLoadStart(tab.id, event);
    };

    const handleLoadProgress = (event: any) => {
      onLoadProgress(tab.id, event);
    };

    const handleLoadEnd = (event?: any) => {
      onLoadEnd(tab.id, event);

      // Phục hồi vị trí cuộn trang và form inputs nếu có
      if (tab.frozenState && localRef.current) {
        try {
          localRef.current.injectJavaScript(getRestoreTabStateScript(tab.frozenState));
        } catch (e) {}
      }

      // Khóa và dừng toàn bộ âm thanh nếu trang vừa tải xong trong chế độ nền
      if (!isTabActive && localRef.current) {
        try {
          localRef.current.injectJavaScript(PAUSE_BACKGROUND_MEDIA_SCRIPT);
        } catch (e) {}
      }
    };

    const handleError = (event: any) => {
      onError(tab.id, event);
    };

    const handleHttpError = () => {
      onHttpError(tab.id);
    };

    return (
      <View
        ref={(ref) => onRegisterContainerRef(tab.id, ref)}
        collapsable={false}
        style={[
          styles.container,
          { backgroundColor: bgColor },
          (!isTabActive || tab.isOffline) && styles.inactiveContainer,
        ]}
        pointerEvents={isTabActive && !tab.isOffline ? 'auto' : 'none'}
      >
        <WebView
          ref={(ref) => {
            localRef.current = ref;
            onRegisterRef(tab.id, ref);
          }}
          originWhitelist={['*']}
          source={webViewSource}
          style={[
            styles.webView,
            { backgroundColor: Platform.OS === 'ios' ? 'transparent' : bgColor },
          ]}
          containerStyle={{
            backgroundColor: Platform.OS === 'ios' ? 'transparent' : bgColor,
          }}
          opaque={Platform.OS !== 'ios'}
          androidLayerType="hardware"
          incognito={Boolean(tab.isIncognito)}
          mediaCapturePermissionGrantType="grant"
          injectedJavaScriptBeforeContentLoadedForMainFrameOnly={true}
          injectedJavaScriptForMainFrameOnly={true}
          injectedJavaScriptBeforeContentLoaded={combinedInjectedBefore}
          injectedJavaScript={injectedAfter}
          onMessage={handleMessage}
          onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
          onNavigationStateChange={handleNavigationStateChange}
          onLoadStart={handleLoadStart}
          onLoadProgress={handleLoadProgress}
          onLoadEnd={handleLoadEnd}
          onError={handleError}
          onHttpError={handleHttpError}
          renderError={() => (
            <View
              style={[
                styles.webView,
                { backgroundColor: bgColor },
              ]}
            />
          )}
          onFileDownload={onFileDownload}
          allowsBackForwardNavigationGestures={true}
          javaScriptEnabled
          domStorageEnabled
          databaseEnabled={true}
          cacheEnabled={true}
          cacheMode="LOAD_DEFAULT"
          mixedContentMode="compatibility"
          overScrollMode="never"
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          allowsInlineMediaPlayback
          allowsPictureInPictureMediaPlayback
          allowsFullscreenVideo
          fraudulentWebsiteWarningEnabled={false}
          mediaPlaybackRequiresUserAction={!isTabActive}
          javaScriptCanOpenWindowsAutomatically={false}
          setSupportMultipleWindows={false}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          userAgent={userAgent}
        />

      </View>
    );
  },
  (prev, next) => {
    return (
      prev.tab.id === next.tab.id &&
      prev.isTabActive === next.isTabActive &&
      prev.tab.isOffline === next.tab.isOffline &&
      prev.tab.initialUrl === next.tab.initialUrl &&
      prev.tab.isDesktop === next.tab.isDesktop &&
      prev.tab.isIncognito === next.tab.isIncognito &&
      prev.tab.isReaderMode === next.tab.isReaderMode &&
      prev.userAgent === next.userAgent &&
      prev.injectedBefore === next.injectedBefore &&
      prev.injectedAfter === next.injectedAfter
    );
  }
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    zIndex: 1,
  },
  inactiveContainer: {
    opacity: 0,
    zIndex: -1,
    transform: [{ translateX: 999999 }],
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
