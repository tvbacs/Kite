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
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
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
  const pendingUnlockActionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (visible) {
      setActiveMode(isIncognito ? 'incognito' : 'normal');
    } else {
      setIsPinUnlocking(false);
      pendingUnlockActionRef.current = null;
    }
  }, [visible, isIncognito]);

  const normalTabs = tabs.filter((t) => !t.isIncognito);
  const incognitoTabs = tabs.filter((t) => !!t.isIncognito);
  const currentDisplayedTabs = activeMode === 'normal' ? normalTabs : incognitoTabs;

  const handleSwitchToIncognito = () => {
    if (activeMode === 'incognito') return;
    if (incognitoPin && !isIncognitoUnlocked) {
      pendingUnlockActionRef.current = () => {
        setActiveMode('incognito');
      };
      setIsPinUnlocking(true);
    } else {
      setActiveMode('incognito');
    }
  };

  const handleSwitchToNormal = () => {
    if (activeMode === 'normal') return;
    setActiveMode('normal');
  };

  const handleCardPress = (tab: BrowserTab) => {
    if (tab.isIncognito && incognitoPin && !isIncognitoUnlocked) {
      pendingUnlockActionRef.current = () => {
        onSelectTab(tab.id);
        onClose();
      };
      setIsPinUnlocking(true);
    } else {
      onSelectTab(tab.id);
      onClose();
    }
  };

  const handleCreateIncognitoTab = () => {
    if (incognitoPin && !isIncognitoUnlocked) {
      pendingUnlockActionRef.current = () => {
        onNewTab(true);
        onClose();
      };
      setIsPinUnlocking(true);
    } else {
      onNewTab(true);
      onClose();
    }
  };

  const handleAddTabPress = () => {
    if (activeMode === 'incognito') {
      handleCreateIncognitoTab();
    } else {
      onNewTab(false);
      onClose();
    }
  };

  const handleDonePress = () => {
    const currentTab = tabs.find((t) => t.id === activeTabId);
    if (activeMode === 'normal') {
      // Đang ở chế độ tab thường: luôn đóng về tab thường, không bao giờ để nhảy sang tab ẩn danh
      if (currentTab && !currentTab.isIncognito) {
        onClose();
        return;
      }
      if (normalTabs.length > 0) {
        const target = normalTabs.slice().sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0))[0] || normalTabs[0];
        onSelectTab(target.id);
        onClose();
      } else {
        onNewTab(false);
        onClose();
      }
    } else {
      // Đang ở chế độ tab ẩn danh:
      if (currentTab && currentTab.isIncognito) {
        onClose();
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
      animationType="slide"
      transparent={true}
      presentationStyle="overFullScreen"
      onRequestClose={handleDonePress}
    >
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* Giao diện màu sáng hiện đại, thanh lịch (Light Theme) theo yêu cầu của bạn */}
      <View style={styles.container}>
        <BlurView intensity={90} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />

        {/* THANH ĐIỀU HƯỚNG TRÊN CÙNG */}
        <View style={[styles.topNav, { paddingTop: topInset, height: 54 + topInset }]}>
          {/* Nút đóng / quay lại bên trái */}
          <TouchableOpacity
            style={styles.circleBtn}
            onPress={handleDonePress}
            activeOpacity={0.7}
          >
            <Feather name="arrow-left" size={20} color="#09090b" />
          </TouchableOpacity>

          {/* Phân đoạn giữa: Ẩn danh qua TRÁI, Tab thường qua PHẢI */}
          <View style={styles.centerSegment}>
            {/* 1. Nút Thẻ ẩn danh (Con mắt gạch chéo) - Bên TRÁI */}
            <TouchableOpacity
              style={[
                styles.segmentBtn,
                activeMode === 'incognito' && styles.segmentBtnActiveDark,
              ]}
              onPress={handleSwitchToIncognito}
              activeOpacity={0.7}
            >
              <Feather
                name="eye-off"
                size={17}
                color={activeMode === 'incognito' ? '#ffffff' : '#71717a'}
              />
              {/* Khi ĐÃ NHẤN QUA tab ẩn danh: Hiển thị rõ số lượng tab ẩn danh */}
              {activeMode === 'incognito' && (
                <Text
                  style={[
                    styles.segmentBtnText,
                    { color: '#ffffff', marginLeft: 5, fontSize: 13, fontWeight: '700' },
                  ]}
                >
                  {incognitoTabs.length}
                </Text>
              )}
            </TouchableOpacity>

            {/* 2. Nút Thẻ bình thường - Bên PHẢI */}
            <TouchableOpacity
              style={[
                styles.segmentBtn,
                activeMode === 'normal' && styles.segmentBtnActive,
              ]}
              onPress={handleSwitchToNormal}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.segmentBtnText,
                  activeMode === 'normal' && styles.segmentBtnTextActive,
                ]}
              >
                {normalTabs.length}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Nút 3 chấm mở Menu Tùy chọn thẻ */}
          <TouchableOpacity
            style={styles.circleBtn}
            onPress={() => setMenuVisible(true)}
            activeOpacity={0.7}
          >
            <Feather name="more-horizontal" size={20} color="#09090b" />
          </TouchableOpacity>
        </View>

        {/* DANH SÁCH THẺ HOẶC TRẠNG THÁI TRỐNG */}
        {currentDisplayedTabs.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyIconBox}>
              <Feather
                name={activeMode === 'incognito' ? 'eye-off' : 'layers'}
                size={36}
                color="#71717a"
              />
            </View>
            <Text style={styles.emptyTitle}>
              {activeMode === 'incognito'
                ? 'Chế độ duyệt web ẩn danh'
                : 'Chưa có thẻ nào'}
            </Text>
            <Text style={styles.emptySub}>
              {activeMode === 'incognito'
                ? 'Các thẻ ẩn danh sẽ không lưu lại lịch sử duyệt web, cookie hay dữ liệu trang web của bạn.'
                : 'Bấm nút [+] bên dưới để mở thẻ mới.'}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.gridScroll}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.gridRow}>
              {currentDisplayedTabs.map((tab) => {
                const isActive = tab.id === activeTabId;
                const faviconUrl = tab.url
                  ? `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(tab.url)}`
                  : null;

                return (
                  <TouchableOpacity
                    key={tab.id}
                    style={[styles.tabCard, isActive && styles.activeTabCard]}
                    onPress={() => handleCardPress(tab)}
                    activeOpacity={0.8}
                  >
                    {/* Header của từng thẻ Tab */}
                    <View style={styles.cardTopHeader}>
                      <View style={styles.cardTitleArea}>
                        {faviconUrl ? (
                          <Image source={{ uri: faviconUrl }} style={styles.tabFavicon} />
                        ) : (
                          <Feather name="globe" size={13} color="#09090b" />
                        )}
                        <Text style={styles.tabCardTitle} numberOfLines={1}>
                          {tab.title || 'Thẻ mới'}
                        </Text>
                      </View>

                      {/* Huy hiệu đánh dấu thẻ đang kích hoạt hoặc đang ngủ */}
                      {isActive ? (
                        <View style={styles.activeDot} />
                      ) : tab.isSleeping ? (
                        <View style={styles.sleepingBadge}>
                          <Feather name="moon" size={11} color="#0284c7" />
                        </View>
                      ) : null}

                      <TouchableOpacity
                        style={styles.cardCloseBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={(e) => {
                          e.stopPropagation();
                          onCloseTab(tab.id);
                        }}
                        activeOpacity={0.6}
                      >
                        <Feather name="x" size={14} color="#71717a" />
                      </TouchableOpacity>
                    </View>

                    {/* Vùng xem trước nội dung thẻ: Hiển thị ảnh snapshot tĩnh dạng Image, KHÔNG render mini WebView */}
                    {tab.snapshotUri ? (
                      <View style={styles.cardSnapshotContainer}>
                        <Image
                          source={{ uri: tab.snapshotUri }}
                          style={styles.cardSnapshotImage}
                          resizeMode="cover"
                        />
                      </View>
                    ) : (
                      <View style={styles.cardPreviewBody}>
                        <View style={styles.cardEmptyIconCircle}>
                          <Feather name="globe" size={24} color="#a1a1aa" />
                        </View>
                        <Text style={styles.previewDomainText} numberOfLines={2}>
                          {tab.url
                            ? tab.url.replace('https://', '').replace('http://', '')
                            : 'Trang trống'}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* THANH ĐIỀU HƯỚNG ĐÁY */}
        <View style={[styles.bottomNav, { paddingBottom: bottomInset }]}>
          <View style={styles.bottomPlaceholder} />

          {/* Nút dấu [+] ở giữa */}
          <TouchableOpacity
            style={styles.addTabCenterBtn}
            onPress={handleAddTabPress}
            activeOpacity={0.7}
          >
            <Feather name="plus" size={24} color="#09090b" />
          </TouchableOpacity>

          {/* Nút 'Xong' ở bên phải */}
          <TouchableOpacity style={styles.doneBtn} onPress={handleDonePress} activeOpacity={0.7}>
            <Text style={styles.doneBtnText}>Xong</Text>
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
                  {canRestoreClosedTab && (
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
                      <Text style={styles.actionRowTitle}>Đóng mọi thẻ</Text>
                      <Text style={styles.actionRowSub}>
                        Đóng toàn bộ thẻ đang mở và tạo thẻ mới
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
                      <Text style={styles.actionRowTitle}>Đóng các thẻ khác</Text>
                      <Text style={styles.actionRowSub}>
                        Chỉ giữ lại thẻ hiện tại bạn đang xem
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
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f4f4f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e4e4e7',
    borderRadius: 18,
    padding: 3,
    gap: 4,
  },
  segmentBtn: {
    height: 30,
    minWidth: 42,
    borderRadius: 15,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 4,
  },
  segmentBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentBtnActiveDark: {
    backgroundColor: '#09090b',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#71717a',
  },
  segmentBtnTextActive: {
    color: '#09090b',
  },
  incognitoCountBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#71717a',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  incognitoCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
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
  tabCard: {
    width: '48%',
    height: 220,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  activeTabCard: {
    borderWidth: 1.8,
    borderColor: '#09090b',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#09090b',
    marginRight: 6,
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
  doneBtn: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#f4f4f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#09090b',
    fontSize: 14,
    fontWeight: '700',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: theme.colors.sheetBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
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
    fontWeight: '700',
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
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  actionTextCol: {
    flex: 1,
    marginRight: 12,
  },
  actionRowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#09090b',
    marginBottom: 2,
  },
  actionRowSub: {
    fontSize: 11,
    color: '#71717a',
  },
  actionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e4e4e7',
    marginLeft: 16,
  },
});
