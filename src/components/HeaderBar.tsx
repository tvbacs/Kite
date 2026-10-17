import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

interface HeaderBarProps {
  inputUrl: string;
  isEditing: boolean;
  isLoading: boolean;
  progress: number;
  isSecure: boolean;
  shieldActive: boolean;
  blockedCount: number;
  onUrlChange: (text: string) => void;
  onSubmit: () => void;
  onFocus: () => void;
  onClear: () => void;
  onReload: () => void;
  onOpenShield: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  inputUrl,
  isEditing,
  isLoading,
  progress,
  isSecure,
  shieldActive,
  blockedCount,
  onUrlChange,
  onSubmit,
  onFocus,
  onClear,
  onReload,
  onOpenShield,
}) => {
  return (
    <View style={styles.container}>
      {/* Khung thanh địa chỉ tối giản, KHÔNG VIỀN */}
      <View style={styles.addressBar}>
        {/* Nút Khiên chặn quảng cáo */}
        <TouchableOpacity
          style={styles.shieldButton}
          onPress={onOpenShield}
          activeOpacity={0.7}
        >
          {shieldActive && (
            <View style={styles.shieldTagBadge}>
              <Text style={styles.shieldTagText}>On</Text>
            </View>
          )}
          <Feather
            name="shield"
            size={16}
            color={shieldActive ? '#09090b' : '#a1a1aa'}
          />
        </TouchableOpacity>

        {/* Khóa bảo mật HTTPS */}
        {isSecure && !isEditing && (
          <View style={styles.lockIcon}>
            <Feather name="lock" size={12} color="#71717a" />
          </View>
        )}

        {/* Ô nhập link / tìm kiếm */}
        <TextInput
          style={styles.input}
          value={inputUrl}
          onChangeText={onUrlChange}
          placeholder="Tìm kiếm hoặc nhập URL"
          placeholderTextColor="#71717a"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
          onFocus={onFocus}
          selectTextOnFocus
        />

        {/* Nút xóa nhanh / Tải lại */}
        {isEditing && inputUrl.length > 0 ? (
          <TouchableOpacity style={styles.actionBtn} onPress={onClear}>
            <Feather name="x" size={16} color="#71717a" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.actionBtn} onPress={onReload}>
            {isLoading ? (
              <ActivityIndicator size="small" color="#09090b" />
            ) : (
              <Feather name="rotate-cw" size={14} color="#71717a" />
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Thanh tiến trình tải trang siêu mỏng */}
      {isLoading && progress < 1 && (
        <View style={styles.progressBarTrack}>
          <View
            style={[styles.progressBarFill, { width: `${Math.max(progress * 100, 10)}%` }]}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addressBar: {
    height: 42,
    backgroundColor: '#f4f4f5',
    borderRadius: 21,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  shieldButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
    position: 'relative',
  },
  shieldTagBadge: {
    position: 'absolute',
    top: -2,
    left: 10,
    paddingHorizontal: 3.5,
    paddingVertical: 1,
    borderRadius: 3.5,
    borderWidth: 0,
    backgroundColor: '#007aff',
    zIndex: 2,
  },
  shieldTagText: {
    color: '#ffffff',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: -0.2,
    lineHeight: 8.5,
  },
  lockIcon: {
    marginRight: 6,
  },
  input: {
    flex: 1,
    color: '#09090b',
    fontSize: 14,
    paddingVertical: 0,
    fontFamily: 'System',
  },
  actionBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBarTrack: {
    height: 2,
    backgroundColor: '#f4f4f5',
    marginTop: 4,
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#09090b',
  },
});
