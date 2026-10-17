import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text, Platform } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface BottomBarProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onPressSearch: () => void;
  onSearchByImage: () => void;
  onOpenTabs: () => void;
  onNewTab?: () => void;
  tabCount: number;
  currentUrl?: string;
  placeholder?: string;
  hasBgImage?: boolean;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  isIncognito?: boolean;
  isReaderMode?: boolean;
  onToggleReaderMode?: () => void;
}

export const BottomBar: React.FC<BottomBarProps> = ({
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onPressSearch,
  onSearchByImage,
  onOpenTabs,
  onNewTab,
  tabCount,
  currentUrl,
  placeholder,
  hasBgImage,
  isBookmarked,
  onToggleBookmark,
  isIncognito,
  isReaderMode,
  onToggleReaderMode,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 10);

  // Lấy tên miền ngắn gọn hiển thị khi đang duyệt web thực tế
  const getDisplayDomain = (url: string) => {
    try {
      if (!url) return '';
      const domainMatch = url.match(/^(?:https?:\/\/)?(?:www\.)?([^\/\?#]+)/i);
      return domainMatch ? domainMatch[1] : url;
    } catch {
      return url;
    }
  };

  const isBrowsing = !!currentUrl;
  const displayDomain = isBrowsing ? getDisplayDomain(currentUrl) : '';
  const isSecure = currentUrl?.startsWith('https://');

  const iconColor = isIncognito ? '#e8eaed' : '#09090b';
  const disabledColor = isIncognito ? '#5f6368' : '#a1a1aa';
  const subIconColor = isIncognito ? '#9aa0a6' : '#71717a';
  const barBg = isIncognito
    ? '#202124'
    : hasBgImage
    ? 'rgba(255, 255, 255, 0.75)'
    : '#ffffff';
  const borderCol = isIncognito
    ? '#2d2f31'
    : hasBgImage
    ? 'rgba(255, 255, 255, 0.35)'
    : '#e4e4e7';
  const pillBg = isIncognito
    ? '#2d2f31'
    : hasBgImage
    ? 'rgba(255, 255, 255, 0.88)'
    : '#f4f4f5';

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: bottomInset,
          backgroundColor: barBg,
          borderTopColor: borderCol,
        },
      ]}
    >
      {/* 1. NÚT QUAY LẠI (BACK) */}
      <TouchableOpacity
        style={[styles.navBtn, !canGoBack && styles.btnDisabled]}
        onPress={onGoBack}
        disabled={!canGoBack}
        activeOpacity={0.6}
      >
        <Feather
          name="chevron-left"
          size={24}
          color={canGoBack ? iconColor : disabledColor}
        />
      </TouchableOpacity>

      {/* 2. NÚT TIẾN TỚI (FORWARD): Ban đầu ẩn đi, chỉ khi nhấn nút back (canGoForward = true) mới xuất hiện */}
      {canGoForward && (
        <TouchableOpacity
          style={styles.navBtn}
          onPress={onGoForward}
          activeOpacity={0.6}
        >
          <Feather
            name="chevron-right"
            size={24}
            color={iconColor}
          />
        </TouchableOpacity>
      )}

      {/* 3. Ô TÌM KIẾM Ở GIỮA (SEARCH PILL TỐI GIẢN) */}
      <TouchableOpacity
        style={[
          styles.searchPill,
          { backgroundColor: pillBg },
        ]}
        onPress={onPressSearch}
        activeOpacity={0.8}
      >
        {isBrowsing && isSecure ? (
          <Feather name="lock" size={13} color={subIconColor} style={styles.pillIcon} />
        ) : (
          <Feather name="search" size={16} color={subIconColor} style={styles.pillIcon} />
        )}

        <Text
          style={[
            styles.searchPillText,
            { color: isBrowsing ? iconColor : subIconColor },
            isBrowsing && styles.searchPillTextActive,
          ]}
          numberOfLines={1}
        >
          {isBrowsing
            ? displayDomain
            : placeholder || 'Tìm hoặc nhập tên trang web...'}
        </Text>

        {/* Nút lưu Dấu trang (Bookmark) khi đang xem web */}
        {isBrowsing && onToggleBookmark && (
          <TouchableOpacity
            style={styles.pillActionBtn}
            onPress={(e) => {
              e.stopPropagation();
              onToggleBookmark();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            activeOpacity={0.7}
          >
            <Feather
              name="bookmark"
              size={17}
              color={isBookmarked ? '#18181b' : subIconColor}
            />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* 4. NÚT TẠO THẺ MỚI NHANH (+) */}
      {onNewTab && (
        <TouchableOpacity
          style={styles.navBtn}
          onPress={onNewTab}
          activeOpacity={0.6}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        >
          <Feather name="plus" size={21} color={iconColor} />
        </TouchableOpacity>
      )}

      {/* 5. NÚT QUẢN LÝ THẺ (TAB) - Ô VUÔNG HIỆN SỐ THẺ NHƯ CŨ */}
      <TouchableOpacity
        style={styles.navBtn}
        onPress={onOpenTabs}
        activeOpacity={0.6}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      >
        <View style={[styles.tabBadgeBox, isIncognito && { borderColor: iconColor }]}>
          <Text style={[styles.tabCountText, isIncognito && { color: iconColor }]}>
            {tabCount > 99 ? '99+' : tabCount}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 4,
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.3,
  },
  searchPill: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginHorizontal: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  pillIcon: {
    marginRight: 8,
  },
  searchPillText: {
    flex: 1,
    fontSize: 14,
    color: '#71717a',
  },
  searchPillTextActive: {
    color: '#09090b',
    fontWeight: '600',
  },
  pillActionBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBadgeBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.8,
    borderColor: '#09090b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabCountText: {
    color: '#09090b',
    fontSize: 11,
    fontWeight: '700',
  },
});
