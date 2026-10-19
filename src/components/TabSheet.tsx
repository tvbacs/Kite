import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
  StatusBar,
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import * as Haptics from 'expo-haptics';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as LocalAuthentication from 'expo-local-authentication';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrowserTab } from '../types/browser';
import { PinModal } from './PinModal';
import { theme } from '../constants/theme';

interface TabSheetProps {
  visible: boolean;
  onClose: () => void;
  tabs: BrowserTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: (isIncognito?: boolean) => void;
  onClearBrowsingData?: () => void;
  onCloseAllTabs?: (isIncognito?: boolean) => void;
  onCloseOtherTabs?: (keepId: string) => void;
  incognitoPin?: string | null;
  isIncognitoUnlocked?: boolean;
  onRequestIncognitoUnlock?: (onSuccess: () => void) => void;
  onUnlockSuccess?: () => void;
  canRestoreClosedTab?: boolean;
  onRestoreClosedTab?: () => void;
  onFreezeBackgroundTabs?: () => void;
  isIncognito?: boolean;
}

interface TabCardItemProps {
  tab: BrowserTab;
  isActive: boolean;
  onPress: () => void;
  onClose: (tabId: string) => void;
  failedSnapshot: boolean;
  onSnapshotError: (tabId: string) => void;
}

const TabCardItem: React.FC<TabCardItemProps> = React.memo(({
  tab,
  isActive,
  onPress,
  onClose,
  failedSnapshot,
  onSnapshotError,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const isClosingRef = useRef(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [tab.snapshotUri]);

  const handleClose = () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}

    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.75,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose(tab.id);
    });
  };

  const faviconUrl = tab.url
    ? `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(tab.url)}`
    : null;

  return (
    <Animated.View
      style={[
        styles.tabCardWrapper,
        {
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <TouchableOpacity
        style={[
          styles.tabCard,
          tab.isIncognito && styles.tabCardDark,
          isActive && (tab.isIncognito ? styles.activeTabCardDark : styles.activeTabCard),
        ]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        {/* Header của từng thẻ Tab */}
        <View style={[styles.cardTopHeader, tab.isIncognito && styles.cardTopHeaderDark]}>
          <View style={styles.cardTitleArea}>
            {tab.isLoading && tab.url ? (
              <ActivityIndicator
                size="small"
                color={tab.isIncognito ? "#93c5fd" : "#007aff"}
                style={{ marginRight: 6, width: 14, height: 14 }}
              />
            ) : faviconUrl ? (
              <Image source={{ uri: faviconUrl }} style={styles.tabFavicon} />
            ) : (
              <Feather
                name={tab.isIncognito ? "eye-off" : "globe"}
                size={13}
                color={tab.isIncognito ? "#a1a1aa" : "#09090b"}
              />
            )}
            <Text
              style={[styles.tabCardTitle, tab.isIncognito && styles.tabCardTitleDark]}
              numberOfLines={1}
            >
              {tab.isLoading && tab.url
                ? (tab.title ? `${tab.title}` : 'Đang tải...')
                : (tab.title || (tab.isIncognito ? 'Thẻ ẩn danh mới' : 'Thẻ mới'))}
            </Text>
          </View>

          {/* Huy hiệu đánh dấu thẻ đang kích hoạt hoặc đang ngủ */}
          {isActive ? (
            <View style={[styles.activeDot, tab.isIncognito && styles.activeDotDark]} />
          ) : tab.isSleeping ? (
            <View style={[styles.sleepingBadge, tab.isIncognito && styles.sleepingBadgeDark]}>
              <Feather name="moon" size={11} color={tab.isIncognito ? "#93c5fd" : "#0284c7"} />
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.cardCloseBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={(e) => {
              e.stopPropagation();
              handleClose();
            }}
            activeOpacity={0.6}
          >
            <Feather name="x" size={14} color={tab.isIncognito ? "#a1a1aa" : "#71717a"} />
          </TouchableOpacity>
        </View>

        {/* VÙNG XEM TRƯỚC NỘI DUNG THẺ:
            ƯU TIÊN 1: Luôn hiển thị ngay tức thì 0ms ảnh snapshot đã chụp của trang web!
            Các tác vụ tải ngầm diễn ra sau và báo hiệu qua spinner nhỏ trên thanh tiêu đề,
            người dùng vào màn hình tab lập tức thấy ngay toàn bộ thumbnail các trang. */}
        {Boolean(tab.snapshotUri && !failedSnapshot && !imageError) ? (
          <View style={[styles.cardSnapshotContainer, tab.isIncognito && { backgroundColor: '#18181b' }]}>
            <Image
              source={{ uri: tab.snapshotUri }}
              style={styles.cardSnapshotImage}
              resizeMode="cover"
              onError={() => {
                setImageError(true);
                onSnapshotError(tab.id);
              }}
            />
          </View>
        ) : !tab.url ? (
          /* Thẻ mới: Hiển thị preview giao diện thu nhỏ Google & lối tắt (tab thường) hoặc giao diện tối ẩn danh */
          tab.isIncognito ? (
            <View style={styles.miniIncognitoContainer}>
              <View style={styles.miniIncognitoIconBox}>
                <Feather name="eye-off" size={24} color="#e4e4e7" />
              </View>
              <Text style={styles.miniIncognitoTitle}>Thẻ ẩn danh mới</Text>
              <Text style={styles.miniIncognitoSub} numberOfLines={2}>
                Kite không lưu lịch sử hay dữ liệu duyệt web
              </Text>
            </View>
          ) : (
            <View style={styles.miniHomeContainer}>
              <View style={styles.miniGoogleBox}>
                <Text style={styles.miniGoogleG}>G</Text>
                <Text style={styles.miniGoogleO1}>o</Text>
                <Text style={styles.miniGoogleO2}>o</Text>
                <Text style={styles.miniGoogleG2}>g</Text>
                <Text style={styles.miniGoogleL}>l</Text>
                <Text style={styles.miniGoogleE}>e</Text>
              </View>
              <View style={styles.miniSearchInput}>
                <Feather name="search" size={9} color="#9ca3af" style={{ marginRight: 4 }} />
                <Text style={styles.miniSearchPlaceholder} numberOfLines={1}>
                  Tìm trên Google...
                </Text>
              </View>
              <View style={styles.miniShortcutsRow}>
                <View style={[styles.miniShortcutTile, { backgroundColor: '#10b981' }]}>
                  <Feather name="film" size={9} color="#ffffff" />
                </View>
                <View style={[styles.miniShortcutTile, { backgroundColor: '#3b82f6' }]}>
                  <Feather name="globe" size={9} color="#ffffff" />
                </View>
                <View style={[styles.miniShortcutTile, { backgroundColor: '#f59e0b' }]}>
                  <Feather name="play" size={9} color="#ffffff" />
                </View>
                <View style={[styles.miniShortcutTile, { backgroundColor: '#ef4444' }]}>
                  <Feather name="video" size={9} color="#ffffff" />
                </View>
              </View>
            </View>
          )
        ) : (
          <View style={[styles.cardPreviewBody, tab.isIncognito && styles.cardPreviewBodyDark]}>
            <View style={[styles.cardEmptyIconCircle, tab.isIncognito && { backgroundColor: '#27272a' }]}>
              <Feather
                name={tab.isIncognito ? "eye-off" : "globe"}
                size={24}
                color={tab.isIncognito ? "#e4e4e7" : "#007aff"}
              />
            </View>
            <Text style={[styles.previewDomainText, tab.isIncognito && { color: '#a1a1aa' }]} numberOfLines={2}>
              {tab.url.replace('https://', '').replace('http://', '').split('/')[0]}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.isActive === nextProps.isActive &&
    prevProps.failedSnapshot === nextProps.failedSnapshot &&
    prevProps.tab.id === nextProps.tab.id &&
    prevProps.tab.url === nextProps.tab.url &&
    prevProps.tab.title === nextProps.tab.title &&
    prevProps.tab.isLoading === nextProps.tab.isLoading &&
    prevProps.tab.isSleeping === nextProps.tab.isSleeping &&
    prevProps.tab.snapshotUri === nextProps.tab.snapshotUri
  );
});

export const TabSheet: React.FC<TabSheetProps> = ({
  visible,
  onClose,
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onClearBrowsingData,
  onCloseAllTabs,
  onCloseOtherTabs,
  incognitoPin,
  isIncognitoUnlocked,
  onRequestIncognitoUnlock,
  onUnlockSuccess,
  canRestoreClosedTab,
  onRestoreClosedTab,
  onFreezeBackgroundTabs,
  isIncognito,
}) => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 48 : 24);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 34 : 16);

  const [menuVisible, setMenuVisible] = useState<boolean>(false);
  const [activeMode, setActiveMode] = useState<'normal' | 'incognito'>(
    isIncognito ? 'incognito' : 'normal'
  );
  const [isPinUnlocking, setIsPinUnlocking] = useState<boolean>(false);
  const [failedSnapshotIds, setFailedSnapshotIds] = useState<{ [tabId: string]: boolean }>({});
  const pendingUnlockActionRef = useRef<(() => void) | null>(null);
  const prevVisibleRef = useRef<boolean>(visible);

  const scrollViewRef = useRef<ScrollView>(null);
  const shouldScrollToEndRef = useRef<boolean>(true);

  const scrollToLastTab = (animated: boolean = false) => {
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd({ animated });
    });
  };

  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      setActiveMode(isIncognito ? 'incognito' : 'normal');
      setFailedSnapshotIds({});
      shouldScrollToEndRef.current = true;
      // Tự động cuộn đến tab cuối cùng ngay khi mở màn hình danh sách tab
      const t1 = setTimeout(() => {
        scrollToLastTab(false);
      }, 50);
      const t2 = setTimeout(() => {
        scrollToLastTab(false);
      }, 200);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    } else if (!visible) {
      setIsPinUnlocking(false);
      pendingUnlockActionRef.current = null;
    }
    prevVisibleRef.current = visible;
  }, [visible, isIncognito]);

  const normalTabs = tabs.filter((t) => !t.isIncognito);
  const incognitoTabs = tabs.filter((t) => !!t.isIncognito);
  const currentDisplayedTabs = activeMode === 'normal' ? normalTabs : incognitoTabs;
  const showIncognitoPrivacyLock =
    activeMode === 'incognito' &&
    incognitoTabs.length > 0 &&
    !isIncognitoUnlocked;

  // Khi chuyển đổi giữa chế độ thường và ẩn danh, tự động cuộn xuống cuối danh sách
  useEffect(() => {
    if (visible) {
      shouldScrollToEndRef.current = true;
      const t = setTimeout(() => {
        scrollToLastTab(false);
      }, 60);
      return () => clearTimeout(t);
    }
  }, [activeMode, visible]);

  // Nếu có thêm tab mới (ví dụ khôi phục tab vừa đóng), cuộn mượt xuống tab cuối
  const prevTabsLengthRef = useRef<number>(currentDisplayedTabs.length);
  useEffect(() => {
    if (visible && currentDisplayedTabs.length > prevTabsLengthRef.current) {
      shouldScrollToEndRef.current = true;
      const t = setTimeout(() => {
        scrollToLastTab(true);
      }, 100);
      return () => clearTimeout(t);
    }
    prevTabsLengthRef.current = currentDisplayedTabs.length;
  }, [currentDisplayedTabs.length, visible]);

  const handleSwitchToIncognito = () => {
    if (activeMode === 'incognito') return;
    setActiveMode('incognito');
  };

  const handleSwitchToNormal = () => {
    if (activeMode === 'normal') return;
    setActiveMode('normal');
  };

  const handleContinueIncognito = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (hasHardware && isEnrolled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Mở khóa các thẻ ẩn danh',
          fallbackLabel: incognitoPin ? 'Sử dụng mã PIN' : undefined,
          cancelLabel: 'Hủy',
        });

        if (result.success) {
          onUnlockSuccess?.();
          return;
        }
      }
    } catch (err) {
      console.warn('Biometric auth error', err);
    }

    if (incognitoPin) {
      pendingUnlockActionRef.current = () => {
        onUnlockSuccess?.();
      };
      setIsPinUnlocking(true);
    } else {
      onUnlockSuccess?.();
    }
  };

  const handleCloseAllIncognito = () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (e) {}
    onCloseAllTabs?.(true);
    setActiveMode('normal');
  };

  const handleCardPress = (tab: BrowserTab) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}

    if (tab.isIncognito && incognitoPin && !isIncognitoUnlocked) {
      pendingUnlockActionRef.current = () => {
        onSelectTab(tab.id);
      };
      setIsPinUnlocking(true);
    } else {
      onSelectTab(tab.id);
    }
  };

  const handleCreateIncognitoTab = async () => {
    if (incognitoPin && !isIncognitoUnlocked) {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (hasHardware && isEnrolled) {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Mở khóa để mở thẻ ẩn danh mới',
            fallbackLabel: 'Sử dụng mã PIN',
            cancelLabel: 'Hủy',
          });
          if (result.success) {
            onUnlockSuccess?.();
            onClose();
            onNewTab(true);
            return;
          }
        }
      } catch (e) {}

      pendingUnlockActionRef.current = () => {
        onUnlockSuccess?.();
        onClose();
        onNewTab(true);
      };
      setIsPinUnlocking(true);
    } else {
      onUnlockSuccess?.();
      onClose();
      onNewTab(true);
    }
  };

  const handleAddTabPress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    if (activeMode === 'incognito') {
      handleCreateIncognitoTab();
    } else {
      onClose();
      onNewTab(false);
    }
  };

  const handleBackPress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    onClose();
  };

  const handleDonePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    onClose();

    const currentTab = tabs.find((t) => t.id === activeTabId);
    if (activeMode === 'normal') {
      // Đang ở chế độ tab thường: luôn đóng về tab thường, không bao giờ để nhảy sang tab ẩn danh
      if (currentTab && !currentTab.isIncognito) {
        return;
      }
      if (normalTabs.length > 0) {
        const target = normalTabs.slice().sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0))[0] || normalTabs[0];
        onSelectTab(target.id);
      } else {
        onNewTab(false);
      }
    } else {
      // Đang ở chế độ tab ẩn danh:
      if (currentTab && currentTab.isIncognito) {
        return;
      }
      if (incognitoTabs.length > 0) {
        const target = incognitoTabs.slice().sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0))[0] || incognitoTabs[0];
        handleCardPress(target);
      } else {
        handleCreateIncognitoTab();
      }
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={true}
      presentationStyle="overFullScreen"
      onRequestClose={handleBackPress}
    >
      {visible && (
        <StatusBar
          barStyle={activeMode === 'incognito' ? 'light-content' : 'dark-content'}
          translucent
          backgroundColor="transparent"
        />
      )}

      <View style={[styles.container, activeMode === 'incognito' && styles.containerDark]}>
        <BlurView
          intensity={90}
          tint={activeMode === 'incognito' ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* THANH ĐIỀU HƯỚNG TRÊN CÙNG */}
        <View
          style={[
            styles.topNav,
            { paddingTop: topInset, height: 54 + topInset },
            activeMode === 'incognito' && styles.topNavDark,
          ]}
        >
          {/* Nút đóng / quay lại bên trái */}
          <TouchableOpacity
            style={[styles.circleBtn, activeMode === 'incognito' && styles.circleBtnDark]}
            onPress={handleBackPress}
            activeOpacity={0.7}
          >
            <Feather
              name="arrow-left"
              size={20}
              color={activeMode === 'incognito' ? '#f4f4f5' : '#09090b'}
            />
          </TouchableOpacity>

          {/* Phân đoạn giữa: Ẩn danh qua TRÁI, Tab thường qua PHẢI */}
          <View
            style={[
              styles.centerSegment,
              activeMode === 'incognito' && styles.centerSegmentDark,
            ]}
          >
            {/* 1. Nút Thẻ ẩn danh (Mũ + Kính Incognito) - Bên TRÁI */}
            <TouchableOpacity
              style={[
                styles.segmentBtn,
                activeMode === 'incognito' && styles.segmentBtnActiveIncognito,
              ]}
              onPress={handleSwitchToIncognito}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="incognito"
                size={21}
                color={activeMode === 'incognito' ? '#09090b' : '#a1a1aa'}
              />
            </TouchableOpacity>

            {/* 2. Nút Thẻ bình thường - Bên PHẢI */}
            <TouchableOpacity
              style={[
                styles.segmentBtn,
                activeMode === 'normal' && styles.segmentBtnActiveNormal,
              ]}
              onPress={handleSwitchToNormal}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.tabCounterBox,
                  activeMode === 'normal'
                    ? styles.tabCounterBoxActive
                    : activeMode === 'incognito'
                    ? styles.tabCounterBoxDark
                    : styles.tabCounterBoxInactive,
                ]}
              >
                <Text
                  style={[
                    styles.tabCounterText,
                    activeMode === 'normal'
                      ? styles.tabCounterTextActive
                      : activeMode === 'incognito'
                      ? styles.tabCounterTextDark
                      : styles.tabCounterTextInactive,
                  ]}
                >
                  {normalTabs.length > 99 ? '99+' : normalTabs.length}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Nút 3 chấm mở Menu Tùy chọn thẻ */}
          <TouchableOpacity
            style={[styles.circleBtn, activeMode === 'incognito' && styles.circleBtnDark]}
            onPress={() => setMenuVisible(true)}
            activeOpacity={0.7}
          >
            <Feather
              name="more-horizontal"
              size={20}
              color={activeMode === 'incognito' ? '#f4f4f5' : '#09090b'}
            />
          </TouchableOpacity>
        </View>

        {/* MÀN HÌNH KHÓA RIÊNG TƯ ẨN DANH HOẶC DANH SÁCH THẺ HOẶC TRẠNG THÁI TRỐNG */}
        {showIncognitoPrivacyLock ? (
          <View style={styles.incognitoPrivacyContainer}>
            <View style={styles.incognitoPrivacyEmblemBox}>
              <MaterialCommunityIcons name="incognito" size={76} color="#ffffff" />
            </View>

            <TouchableOpacity
              style={styles.incognitoPrivacyContinueBtn}
              onPress={handleContinueIncognito}
              activeOpacity={0.85}
            >
              <Text style={styles.incognitoPrivacyContinueText}>Tiếp tục ở chế độ ẩn danh</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.incognitoPrivacyCloseAllBtn}
              onPress={handleCloseAllIncognito}
              activeOpacity={0.7}
            >
              <Text style={styles.incognitoPrivacyCloseAllText}>Đóng các thẻ Ẩn danh</Text>
            </TouchableOpacity>
          </View>
        ) : currentDisplayedTabs.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <View
              style={[
                styles.emptyIconBox,
                activeMode === 'incognito' && { backgroundColor: '#27272a' },
              ]}
            >
              <MaterialCommunityIcons
                name={activeMode === 'incognito' ? 'incognito' : 'layers'}
                size={36}
                color={activeMode === 'incognito' ? '#a1a1aa' : '#71717a'}
              />
            </View>
            <Text
              style={[
                styles.emptyTitle,
                activeMode === 'incognito' && { color: '#f4f4f5' },
              ]}
            >
              {activeMode === 'incognito'
                ? 'Chế độ duyệt web ẩn danh'
                : 'Chưa có thẻ nào'}
            </Text>
            <Text
              style={[
                styles.emptySub,
                activeMode === 'incognito' && { color: '#a1a1aa' },
              ]}
            >
              {activeMode === 'incognito'
                ? 'Các thẻ ẩn danh sẽ không lưu lại lịch sử duyệt web, cookie hay dữ liệu trang web của bạn.'
                : 'Bấm nút [+] bên dưới để mở thẻ mới.'}
            </Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollViewRef}
            style={styles.gridScroll}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={(_w, h) => {
              if (shouldScrollToEndRef.current && h > 0) {
                shouldScrollToEndRef.current = false;
                scrollToLastTab(false);
              }
            }}
          >
            <View style={styles.gridRow}>
              {currentDisplayedTabs.map((tab) => (
                <TabCardItem
                  key={tab.id}
                  tab={tab}
                  isActive={tab.id === activeTabId}
                  onPress={() => handleCardPress(tab)}
                  onClose={onCloseTab}
                  failedSnapshot={Boolean(failedSnapshotIds[tab.id])}
                  onSnapshotError={(id) => {
                    setFailedSnapshotIds((prev) => ({ ...prev, [id]: true }));
                  }}
                />
              ))}
            </View>
          </ScrollView>
        )}

        {/* THANH ĐIỀU HƯỚNG ĐÁY */}
        <View
          style={[
            styles.bottomNav,
            { paddingBottom: bottomInset },
            activeMode === 'incognito' && styles.bottomNavDark,
          ]}
        >
          <View style={styles.bottomPlaceholder} />

          {/* Nút dấu [+] ở giữa (Trong chế độ ẩn danh: hình tròn trắng với icon đen chuẩn Chrome iOS) */}
          <TouchableOpacity
            style={[
              styles.addTabCenterBtn,
              activeMode === 'incognito' && styles.addTabCenterBtnDark,
            ]}
            onPress={handleAddTabPress}
            activeOpacity={0.7}
          >
            <Feather
              name="plus"
              size={24}
              color="#09090b"
            />
          </TouchableOpacity>

          {/* Nút 'Xong' ở bên phải */}
          <TouchableOpacity
            style={[
              styles.doneBtn,
              activeMode === 'incognito' && styles.doneBtnDark,
            ]}
            onPress={handleDonePress}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.doneBtnText,
                activeMode === 'incognito' && styles.doneBtnTextDark,
              ]}
            >
              Xong
            </Text>
          </TouchableOpacity>
        </View>

        {/* MENU TÙY CHỌN TỪ NÚT 3 CHẤM (DÙNG VIEW OVERLAY THAY VÌ MODAL ĐỂ TRÁNH LỖI ĐƠ TRÊN IOS) */}
        {menuVisible && (
          <View style={[StyleSheet.absoluteFill, { zIndex: 999 }]}>
            <TouchableOpacity
              style={styles.menuBackdrop}
              activeOpacity={1}
              onPress={() => setMenuVisible(false)}
            >
              <TouchableOpacity
                style={[styles.menuSheet, { paddingBottom: Math.max(bottomInset, 24) }]}
                activeOpacity={1}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={styles.menuDragHandle} />

                <View style={styles.menuHeaderRow}>
                  <Text style={styles.menuTitle}>Tùy chọn thẻ</Text>
                  <TouchableOpacity
                    style={styles.menuCloseBtn}
                    onPress={() => setMenuVisible(false)}
                  >
                    <Feather name="x" size={16} color="#71717a" />
                  </TouchableOpacity>
                </View>

                {/* KHUNG DUY NHẤT VỚI DIVIDER HORIZONTAL */}
                <View style={styles.actionFrame}>
                  {canRestoreClosedTab && activeMode === 'normal' && (
                    <>
                      <TouchableOpacity
                        style={styles.actionRow}
                        onPress={() => {
                          setMenuVisible(false);
                          onRestoreClosedTab?.();
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.actionTextCol}>
                          <Text style={styles.actionRowTitle}>Khôi phục thẻ vừa đóng</Text>
                          <Text style={styles.actionRowSub}>
                            Mở lại thẻ bạn vừa đóng gần đây nhất
                          </Text>
                        </View>
                        <Feather name="rotate-ccw" size={18} color="#09090b" />
                      </TouchableOpacity>

                      <View style={styles.actionDivider} />
                    </>
                  )}

                  {/* Đóng băng các thẻ nền để giải phóng RAM */}
                  {onFreezeBackgroundTabs && (
                    <>
                      <TouchableOpacity
                        style={styles.actionRow}
                        onPress={() => {
                          setMenuVisible(false);
                          onFreezeBackgroundTabs();
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.actionTextCol}>
                          <Text style={styles.actionRowTitle}>Đóng băng các thẻ nền</Text>
                          <Text style={styles.actionRowSub}>
                            Giải phóng RAM ngay lập tức, lưu nguyên vị trí đọc
                          </Text>
                        </View>
                        <Feather name="cpu" size={18} color="#09090b" />
                      </TouchableOpacity>

                      <View style={styles.actionDivider} />
                    </>
                  )}

                  {/* 1. Xóa dữ liệu duyệt web */}
                  <TouchableOpacity
                    style={styles.actionRow}
                    onPress={() => {
                      setMenuVisible(false);
                      onClearBrowsingData?.();
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.actionTextCol}>
                      <Text style={styles.actionRowTitle}>Xóa dữ liệu duyệt web</Text>
                      <Text style={styles.actionRowSub}>
                        Xóa toàn bộ lịch sử và bộ đếm quảng cáo
                      </Text>
                    </View>
                    <Feather name="trash-2" size={18} color="#09090b" />
                  </TouchableOpacity>

                  <View style={styles.actionDivider} />

                  {/* 2. Đóng mọi thẻ */}
                  <TouchableOpacity
                    style={styles.actionRow}
                    onPress={() => {
                      setMenuVisible(false);
                      onCloseAllTabs?.(activeMode === 'incognito');
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.actionTextCol}>
                      <Text style={styles.actionRowTitle}>
                        {activeMode === 'incognito' ? 'Đóng mọi thẻ ẩn danh' : 'Đóng mọi thẻ thường'}
                      </Text>
                      <Text style={styles.actionRowSub}>
                        {activeMode === 'incognito'
                          ? 'Đóng toàn bộ các thẻ ẩn danh đang mở'
                          : 'Đóng toàn bộ thẻ thường đang mở và tạo thẻ mới'}
                      </Text>
                    </View>
                    <Feather name="x-circle" size={18} color="#09090b" />
                  </TouchableOpacity>

                  <View style={styles.actionDivider} />

                  {/* 3. Đóng các thẻ khác (trừ thẻ đang active) */}
                  <TouchableOpacity
                    style={styles.actionRow}
                    onPress={() => {
                      setMenuVisible(false);
                      onCloseOtherTabs?.(activeTabId);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.actionTextCol}>
                      <Text style={styles.actionRowTitle}>
                        {activeMode === 'incognito' ? 'Đóng các thẻ ẩn danh khác' : 'Đóng các thẻ khác'}
                      </Text>
                      <Text style={styles.actionRowSub}>
                        {activeMode === 'incognito'
                          ? 'Chỉ giữ lại thẻ ẩn danh hiện tại bạn đang xem'
                          : 'Chỉ giữ lại thẻ thường hiện tại bạn đang xem'}
                      </Text>
                    </View>
                    <Feather name="minus-circle" size={18} color="#09090b" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          </View>
        )}

        {/* Khóa mã PIN trực tiếp bên trong TabSheet - Loại bỏ 100% lỗi Modal chồng Modal làm đơ iOS */}
        {isPinUnlocking && (
          <PinModal
            visible={true}
            inline={true}
            mode="unlock"
            currentPin={incognitoPin || null}
            onClose={() => {
              setIsPinUnlocking(false);
              pendingUnlockActionRef.current = null;
            }}
            onSuccessUnlock={() => {
              setIsPinUnlocking(false);
              onUnlockSuccess?.();
              if (pendingUnlockActionRef.current) {
                const act = pendingUnlockActionRef.current;
                pendingUnlockActionRef.current = null;
                act();
              }
            }}
            onSavePin={() => {}}
            onDisablePin={() => {}}
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f4f6',
  },
  containerDark: {
    backgroundColor: '#09090b',
  },
  topNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e4e4e7',
    zIndex: 10,
    elevation: 4,
  },
  topNavDark: {
    backgroundColor: 'rgba(18, 18, 20, 0.95)',
    borderBottomColor: '#27272a',
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f4f4f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleBtnDark: {
    backgroundColor: '#27272a',
  },
  centerSegmentDark: {
    backgroundColor: '#27272a',
  },
  centerSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e4e4e7',
    borderRadius: 20,
    padding: 3,
    gap: 4,
  },
  segmentBtn: {
    height: 32,
    minWidth: 46,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  segmentBtnActiveIncognito: {
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentBtnActiveNormal: {
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabCounterBox: {
    minWidth: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  tabCounterBoxActive: {
    borderColor: '#09090b',
  },
  tabCounterBoxInactive: {
    borderColor: '#71717a',
  },
  tabCounterBoxDark: {
    borderColor: '#a1a1aa',
  },
  tabCounterText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tabCounterTextActive: {
    color: '#09090b',
  },
  tabCounterTextInactive: {
    color: '#71717a',
  },
  tabCounterTextDark: {
    color: '#f4f4f5',
  },
  incognitoPrivacyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  incognitoPrivacyEmblemBox: {
    width: 108,
    height: 108,
    borderRadius: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 52,
  },
  incognitoPrivacyContinueBtn: {
    width: '100%',
    maxWidth: 320,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 20,
  },
  incognitoPrivacyContinueText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  incognitoPrivacyCloseAllBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  incognitoPrivacyCloseAllText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 36,
  },
  emptyIconBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#e4e4e7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#09090b',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    color: '#71717a',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 0,
  },
  gridScroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  gridContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 24,
  },
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tabCardWrapper: {
    width: '48%',
    height: 224,
  },
  tabCard: {
    width: '100%',
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  tabCardDark: {
    backgroundColor: '#18181b',
    borderColor: '#27272a',
  },
  activeTabCard: {
    borderWidth: 2.5,
    borderColor: '#007aff',
    shadowColor: '#007aff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 5,
  },
  activeTabCardDark: {
    borderWidth: 2.5,
    borderColor: '#38bdf8',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#007aff',
    marginRight: 6,
  },
  activeDotDark: {
    backgroundColor: '#38bdf8',
  },
  sleepingBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  sleepingBadgeDark: {
    backgroundColor: '#1e293b',
  },
  cardTopHeader: {
    height: 38,
    backgroundColor: '#edf4fe',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dbeafe',
  },
  cardTopHeaderDark: {
    backgroundColor: '#202124',
    borderBottomColor: '#27272a',
  },
  cardTitleArea: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 6,
    gap: 6,
  },
  tabFavicon: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  tabCardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#09090b',
    flex: 1,
  },
  tabCardTitleDark: {
    color: '#f4f4f5',
  },
  cardCloseBtn: {
    padding: 4,
  },
  cardPreviewBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#ffffff',
  },
  cardPreviewBodyDark: {
    backgroundColor: '#18181b',
  },
  miniIncognitoContainer: {
    flex: 1,
    backgroundColor: '#18181b',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  miniIncognitoIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  miniIncognitoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f4f4f5',
    marginBottom: 4,
  },
  miniIncognitoSub: {
    fontSize: 10,
    color: '#71717a',
    textAlign: 'center',
    lineHeight: 14,
  },
  cardSnapshotContainer: {
    flex: 1,
    backgroundColor: '#f4f4f5',
    overflow: 'hidden',
  },
  cardSnapshotImage: {
    width: '100%',
    height: '100%',
  },
  cardEmptyIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f4f4f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  previewDomainText: {
    fontSize: 12,
    color: '#71717a',
    textAlign: 'center',
    lineHeight: 18,
  },
  miniHomeContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  miniGoogleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  miniGoogleG: { fontSize: 17, fontWeight: '800', color: '#4285F4' },
  miniGoogleO1: { fontSize: 17, fontWeight: '800', color: '#EA4335' },
  miniGoogleO2: { fontSize: 17, fontWeight: '800', color: '#FBBC05' },
  miniGoogleG2: { fontSize: 17, fontWeight: '800', color: '#4285F4' },
  miniGoogleL: { fontSize: 17, fontWeight: '800', color: '#34A853' },
  miniGoogleE: { fontSize: 17, fontWeight: '800', color: '#EA4335' },
  miniSearchInput: {
    width: '100%',
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  miniSearchPlaceholder: {
    fontSize: 9,
    color: '#94a3b8',
    flex: 1,
  },
  miniShortcutsRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  miniShortcutTile: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomNav: {
    paddingTop: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e4e4e7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 10,
    elevation: 4,
  },
  bottomNavDark: {
    backgroundColor: 'rgba(18, 18, 20, 0.95)',
    borderTopColor: '#27272a',
  },
  bottomPlaceholder: {
    width: 64,
  },
  addTabCenterBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f4f4f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addTabCenterBtnDark: {
    backgroundColor: '#ffffff',
  },
  doneBtn: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#f4f4f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneBtnDark: {
    backgroundColor: '#27272a',
  },
  doneBtnText: {
    color: '#09090b',
    fontSize: 14,
    fontWeight: '700',
  },
  doneBtnTextDark: {
    color: '#f4f4f5',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: theme.colors.sheetBackground,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
  },
  menuDragHandle: {
    width: 38,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#d4d4d8',
    alignSelf: 'center',
    marginBottom: 14,
  },
  menuHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  menuTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#09090b',
  },
  menuCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionFrame: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 14,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16.5,
    paddingHorizontal: 18,
  },
  actionTextCol: {
    flex: 1,
    marginRight: 12,
  },
  actionRowTitle: {
    fontSize: 15.5,
    fontWeight: '400',
    color: '#09090b',
    marginBottom: 2,
  },
  actionRowSub: {
    fontSize: 12,
    color: '#71717a',
  },
  actionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e4e4e7',
    marginLeft: 18,
  },
});
