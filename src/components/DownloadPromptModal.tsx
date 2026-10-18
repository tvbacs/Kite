import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type DownloadDestination = 'files' | 'kite';

interface DownloadPromptModalProps {
  visible: boolean;
  fileName: string;
  downloadUrl?: string;
  onConfirm: (destination: DownloadDestination) => void;
  onClose: () => void;
}

export const DownloadPromptModal: React.FC<DownloadPromptModalProps> = ({
  visible,
  fileName,
  onConfirm,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 16);
  const [destination, setDestination] = useState<DownloadDestination>('files');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={[styles.sheetContainer, { paddingBottom: bottomInset }]}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header với tiêu đề và nút X đóng gọn gàng không viền */}
          <View style={styles.headerRow}>
            <Text style={styles.title}>Lưu tệp vào...</Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.6}
            >
              <Feather name="x" size={20} color="#71717a" />
            </TouchableOpacity>
          </View>

          {/* Dòng mô tả tệp */}
          <Text style={styles.descriptionText} numberOfLines={2}>
            Chọn vị trí bạn muốn lưu "{fileName}"
          </Text>

          {/* Hộp lựa chọn Files / Kite */}
          <View style={styles.optionsCard}>
            {/* Lựa chọn 1: Files */}
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => setDestination('files')}
              activeOpacity={0.7}
            >
              <View style={styles.iconBox}>
                <Feather name="folder" size={22} color="#007aff" />
              </View>
              <Text style={styles.optionLabel}>Files</Text>
              {destination === 'files' && (
                <Feather name="check" size={20} color="#007aff" />
              )}
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* Lựa chọn 2: Kite (Tệp đã tải) */}
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => setDestination('kite')}
              activeOpacity={0.7}
            >
              <View style={styles.iconBox}>
                <Feather name="download" size={22} color="#007aff" />
              </View>
              <Text style={styles.optionLabel}>Kite (Tệp đã tải)</Text>
              {destination === 'kite' && (
                <Feather name="check" size={20} color="#007aff" />
              )}
            </TouchableOpacity>
          </View>

          {/* Nút hành động Lưu lớn màu xanh */}
          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={() => onConfirm(destination)}
            activeOpacity={0.8}
          >
            <Text style={styles.confirmBtnText}>Lưu</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#f4f4f5',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 18,
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#09090b',
  },
  closeBtn: {
    position: 'absolute',
    right: 0,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  descriptionText: {
    fontSize: 14,
    color: '#3f3f46',
    lineHeight: 20,
    marginBottom: 16,
  },
  optionsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  iconBox: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionLabel: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '500',
    color: '#09090b',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e4e4e7',
    marginLeft: 56,
  },
  confirmBtn: {
    backgroundColor: '#007aff',
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#007aff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
