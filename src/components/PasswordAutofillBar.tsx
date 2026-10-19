import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { SavedCredential } from './PasswordManagerSheet';

interface PasswordAutofillBarProps {
  credential: SavedCredential | null;
  onFill: (credential: SavedCredential) => void;
  onDismiss: () => void;
  bottomOffset?: number;
}

export const PasswordAutofillBar: React.FC<PasswordAutofillBarProps> = ({
  credential,
  onFill,
  onDismiss,
  bottomOffset = 65,
}) => {
  if (!credential) return null;

  return (
    <View style={[styles.container, { bottom: bottomOffset }]}>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.88}
        onPress={() => onFill(credential)}
      >
        <View style={styles.iconCircle}>
          <Feather name="key" size={15} color="#ffffff" />
        </View>

        <View style={styles.textContainer}>
          <View style={styles.topRow}>
            <Text style={styles.labelTitle}>Điền tài khoản đã lưu</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Keychain</Text>
            </View>
          </View>
          <Text style={styles.usernameText} numberOfLines={1}>
            {credential.username}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.closeBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          activeOpacity={0.7}
        >
          <Feather name="x" size={16} color="#71717a" />
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 999,
    elevation: 999,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1a73e8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  labelTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1a73e8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  badge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    marginLeft: 6,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#3b82f6',
  },
  usernameText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  closeBtn: {
    padding: 6,
    marginLeft: 8,
  },
});
