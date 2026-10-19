import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';

interface PasswordSavePromptModalProps {
  visible: boolean;
  website: string;
  username: string;
  isUpdate?: boolean;
  onSave: () => void;
  onDismiss: () => void;
}

export const PasswordSavePromptModal: React.FC<PasswordSavePromptModalProps> = ({
  visible,
  website,
  username,
  isUpdate = false,
  onSave,
  onDismiss,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onDismiss}
      >
        <TouchableOpacity
          style={styles.card}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header với Icon Google Key */}
          <View style={styles.headerRow}>
            <View style={[styles.keyIconBox, isUpdate && { backgroundColor: '#fef3c7' }]}>
              <Feather name="key" size={18} color={isUpdate ? '#d97706' : '#1a73e8'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {isUpdate ? 'Cập nhật mật khẩu vào Kite?' : 'Lưu mật khẩu vào Kite?'}
              </Text>
              <Text style={styles.subTitle}>
                {isUpdate ? 'Mật khẩu mới sẽ được bảo vệ trong Apple Keychain' : 'Được bảo vệ bằng Apple Keychain'}
              </Text>
            </View>
          </View>

          {/* Chi tiết tài khoản */}
          <View style={styles.accountBox}>
            <View style={styles.accountRow}>
              <Text style={styles.accountLabel}>Trang web:</Text>
              <Text style={styles.accountValue} numberOfLines={1}>{website}</Text>
            </View>
            <View style={styles.accountRow}>
              <Text style={styles.accountLabel}>Tài khoản:</Text>
              <Text style={styles.accountValue} numberOfLines={1}>{username}</Text>
            </View>
          </View>

          {/* Các nút hành động */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.dismissBtn}
              onPress={onDismiss}
              activeOpacity={0.7}
            >
              <Text style={styles.dismissBtnText}>Không phải bây giờ</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, isUpdate && { backgroundColor: '#d97706' }]}
              onPress={onSave}
              activeOpacity={0.8}
            >
              <Text style={styles.saveBtnText}>{isUpdate ? 'Cập nhật' : 'Lưu'}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    width: '100%',
    maxWidth: 380,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  keyIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e8f0fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  title: {
    fontSize: 16.5,
    fontWeight: '700',
    color: '#1f1f1f',
    marginBottom: 2,
  },
  subTitle: {
    fontSize: 12.5,
    color: '#5f6368',
  },
  accountBox: {
    backgroundColor: '#f8fafd',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e8eaed',
    marginBottom: 20,
    gap: 8,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountLabel: {
    fontSize: 13,
    color: '#747775',
  },
  accountValue: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1f1f1f',
    maxWidth: '65%',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
  },
  dismissBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  dismissBtnText: {
    fontSize: 14,
    color: '#5f6368',
    fontWeight: '500',
  },
  saveBtn: {
    backgroundColor: '#1a73e8',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  saveBtnText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
});
