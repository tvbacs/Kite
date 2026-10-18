import React from 'react';
import { View, Text, TouchableOpacity, Animated, Platform } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { styles } from '../styles/App.styles';
import { ShieldStats } from '../types/browser';
import { RegionSettings } from '../services/regionService';

interface WebTopBarProps {
  activeUrl: string | null;
  isEditing: boolean;
  isCurrentIncognito: boolean;
  appBg: string;
  stats: ShieldStats;
  regionSettings: RegionSettings;
  shieldBadgeMode: 'on' | 'vpn';
  shieldBadgeAnim: Animated.Value;
  onOpenShield: () => void;
  onOpenRegion: () => void;
  onOpenMenu: () => void;
  onTouchStart: (e: any) => void;
  onTouchMove: (e: any) => void;
  onTouchEnd: () => void;
}

const getDisplayDomain = (url: string | null): string => {
  if (!url) return '';
  try {
    let clean = url.trim();
    clean = clean.replace(/^(https?:\/\/)?(www\.)?/i, '');
    const domain = clean.split('/')[0].split('?')[0].split('#')[0];
    return domain.toLowerCase() || clean;
  } catch {
    return url;
  }
};

export const WebTopBar: React.FC<WebTopBarProps> = ({
  activeUrl,
  isEditing,
  isCurrentIncognito,
  appBg,
  stats,
  regionSettings,
  shieldBadgeMode,
  shieldBadgeAnim,
  onOpenShield,
  onOpenRegion,
  onOpenMenu,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}) => {
  const insets = useSafeAreaInsets();

  if (activeUrl === null || isEditing) {
    return null;
  }

  const handleShieldPress = () => {
    if (shieldBadgeMode === 'vpn' && regionSettings.enabled) {
      onOpenRegion();
    } else {
      onOpenShield();
    }
  };

  const handleShieldLongPress = () => {
    if (regionSettings.enabled) {
      onOpenRegion();
    } else {
      onOpenShield();
    }
  };

  return (
    <View
      style={[
        styles.webTopBar,
        {
          paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 20),
          backgroundColor: appBg,
          borderBottomColor: isCurrentIncognito ? '#2d2f31' : '#e4e4e7',
          zIndex: 999,
          elevation: 10,
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.webTopGreetingRow}>
        {/* Nút Khiên chặn quảng cáo bên trái: Luân phiên 'On' (xanh blue) và 'VPN' (xanh green) */}
        <TouchableOpacity
          style={styles.webTopShieldBtn}
          onPress={handleShieldPress}
          onLongPress={handleShieldLongPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          {(stats.isShieldActive || regionSettings.enabled) && (
            <Animated.View
              style={[
                styles.shieldTagBadge,
                {
                  backgroundColor:
                    shieldBadgeMode === 'vpn' && regionSettings.enabled
                      ? '#10b981' // Màu green cho VPN
                      : '#007aff', // Màu blue cho On
                  opacity: shieldBadgeAnim,
                  transform: [
                    {
                      scale: shieldBadgeAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.75, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text style={styles.shieldTagText}>
                {shieldBadgeMode === 'vpn' && regionSettings.enabled ? 'VPN' : 'On'}
              </Text>
            </Animated.View>
          )}
          <Feather
            name="shield"
            size={17}
            color={
              stats.isShieldActive || regionSettings.enabled
                ? isCurrentIncognito
                  ? '#e4e4e7'
                  : '#09090b'
                : '#a1a1aa'
            }
          />
        </TouchableOpacity>

        {/* Tên trang đang truy cập căn giữa */}
        <View
          style={{
            position: 'absolute',
            left: 54,
            right: 54,
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', maxWidth: '100%' }}>
            {activeUrl?.startsWith('https://') ? (
              <Feather
                name="lock"
                size={11}
                color={isCurrentIncognito ? '#9ca3af' : '#71717a'}
                style={{ marginRight: 4 }}
              />
            ) : (
              <Feather
                name="alert-triangle"
                size={11}
                color="#f59e0b"
                style={{ marginRight: 4 }}
              />
            )}
            <Text
              style={[
                styles.webTopGreetingText,
                {
                  color: isCurrentIncognito ? '#e4e4e7' : '#27272a',
                  fontWeight: '600',
                  fontSize: 13,
                },
              ]}
              numberOfLines={1}
            >
              {getDisplayDomain(activeUrl)}
            </Text>
          </View>
        </View>

        {/* Spacer để đẩy nút 3 chấm sang phải */}
        <View style={{ flex: 1 }} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} />

        {/* Nút 3 chấm mở Menu tiện ích bên phải */}
        <TouchableOpacity
          style={styles.webTopIconBtn}
          onPress={onOpenMenu}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <Feather
            name="more-horizontal"
            size={20}
            color={isCurrentIncognito ? '#e8eaed' : '#27272a'}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};
