import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Keyboard,
  Animated,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';

interface FindInPageBarProps {
  visible: boolean;
  totalMatches: number;
  currentMatch: number;
  onSearch: (query: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  topInset?: number;
  isIncognito?: boolean;
}

export const FindInPageBar: React.FC<FindInPageBarProps> = ({
  visible,
  totalMatches,
  currentMatch,
  onSearch,
  onNext,
  onPrev,
  onClose,
  topInset = 44,
  isIncognito = false,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);
  const slideAnim = useRef(new Animated.Value(-60)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
      }).start();
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    } else {
      Animated.timing(slideAnim, {
        toValue: -70,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        setQuery('');
      });
    }
  }, [visible]);

  if (!visible) return null;

  const bg = isIncognito ? '#27272a' : '#ffffff';
  const textCol = isIncognito ? '#f4f4f5' : '#18181b';
  const subCol = isIncognito ? '#a1a1aa' : '#71717a';
  const borderCol = isIncognito ? '#3f3f46' : '#e4e4e7';
  const iconCol = isIncognito ? '#e4e4e7' : '#27272a';

  const handleChangeText = (text: string) => {
    setQuery(text);
    onSearch(text);
  };

  const handleClear = () => {
    setQuery('');
    onSearch('');
  };

  const handleDismiss = () => {
    Keyboard.dismiss();
    onClose();
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: topInset + (Platform.OS === 'ios' ? 44 : 50),
          backgroundColor: bg,
          borderColor: borderCol,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <Feather name="search" size={17} color={subCol} style={styles.searchIcon} />

      <TextInput
        ref={inputRef}
        style={[styles.input, { color: textCol }]}
        placeholder="Tìm trong trang..."
        placeholderTextColor={subCol}
        value={query}
        onChangeText={handleChangeText}
        returnKeyType="search"
        onSubmitEditing={onNext}
        autoCapitalize="none"
        autoCorrect={false}
        selectTextOnFocus
      />

      {/* Nút xóa nhanh khi đã nhập chữ */}
      {query.length > 0 && (
        <TouchableOpacity
          onPress={handleClear}
          style={styles.actionBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <Feather name="x-circle" size={16} color={subCol} />
        </TouchableOpacity>
      )}

      {/* Bộ đếm kết quả tìm kiếm */}
      {query.trim().length > 0 && (
        <View style={styles.counterBadge}>
          <Text style={[styles.counterText, { color: totalMatches > 0 ? textCol : '#ef4444' }]}>
            {totalMatches > 0 ? `${currentMatch}/${totalMatches}` : '0/0'}
          </Text>
        </View>
      )}

      {/* Nút Kết quả trước */}
      <TouchableOpacity
        onPress={onPrev}
        style={[styles.actionBtn, totalMatches === 0 && styles.disabledBtn]}
        disabled={totalMatches === 0}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.7}
      >
        <Feather
          name="chevron-up"
          size={20}
          color={totalMatches > 0 ? iconCol : isIncognito ? '#52525b' : '#d4d4d8'}
        />
      </TouchableOpacity>

      {/* Nút Kết quả tiếp theo */}
      <TouchableOpacity
        onPress={onNext}
        style={[styles.actionBtn, totalMatches === 0 && styles.disabledBtn]}
        disabled={totalMatches === 0}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.7}
      >
        <Feather
          name="chevron-down"
          size={20}
          color={totalMatches > 0 ? iconCol : isIncognito ? '#52525b' : '#d4d4d8'}
        />
      </TouchableOpacity>

      <View style={[styles.verticalDivider, { backgroundColor: borderCol }]} />

      {/* Nút Đóng */}
      <TouchableOpacity
        onPress={handleDismiss}
        style={styles.closeBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.7}
      >
        <Feather name="x" size={19} color={iconCol} />
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14.5,
    paddingVertical: 0,
    height: '100%',
  },
  actionBtn: {
    padding: 5,
    marginLeft: 4,
  },
  disabledBtn: {
    opacity: 0.5,
  },
  counterBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(125, 125, 125, 0.12)',
    marginRight: 4,
  },
  counterText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  verticalDivider: {
    width: 1,
    height: 20,
    marginHorizontal: 6,
  },
  closeBtn: {
    padding: 5,
  },
});
