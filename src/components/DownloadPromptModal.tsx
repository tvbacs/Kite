import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';

interface DownloadPromptModalProps {
  visible: boolean;
  fileName: string;
  downloadUrl: string;
  isDownloading?: boolean;
  onSaveToKite: () => void;
  onChooseLocation: () => void;
  onCancel: () => void;
}

export const DownloadPromptModal: React.FC<DownloadPromptModalProps> = ({
  visible,
  fileName,
  downloadUrl,
  isDownloading = false,
  onSaveToKite,
  onChooseLocation,
  onCancel,
}) => {
  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (['mp4', 'mov', 'mkv', 'avi'].includes(ext)) {
      return { icon: 'video', color: '#8b5cf6', bg: '#f3e8ff' };
    }
    if (['mp3', 'm4a', 'wav'].includes(ext)) {
      return { icon: 'music', color: '#ec4899', bg: '#fdf2f8' };
    }
    if (['jpg', 'png', 'jpeg', 'webp', 'gif'].includes(ext)) {
      return { icon: 'image', color: '#06b6d4', bg: '#ecfeff' };
    }
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx'].includes(ext)) {
      return { icon: 'file-text', color: '#ef4444', bg: '#fee2e2' };
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return { icon: 'archive', color: '#f59e0b', bg: '#fef3c7' };
    }
    return { icon: 'download', color: '#007aff', bg: '#eff6ff' };
  };

  const fileInfo = getFileIcon(fileName);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={isDownloading ? undefined : onCancel}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={isDownloading ? undefined : onCancel}
      >
        <TouchableOpacity
          style={styles.card}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Biểu tượng loại tệp */}
          <View style={[styles.iconCircle, { backgroundColor: fileInfo.bg }]}>
            {isDownloading ? (
              <ActivityIndicator size="small" color="#007aff" />
            ) : (
              <Feather name={fileInfo.icon as any} size={26} color={fileInfo.color} />
            )}
          </View>

          {/* Tiêu đề & Tên tệp */}
          <Text style={styles.title}>
            {isDownloading ? 'Đang tải tệp xuống...' : 'Tải xuống tệp'}
          </Text>
          <Text style={styles.fileName} numberOfLines={2}>
            {fileName}
          </Text>

          {isDownloading ? (
            <View style={styles.loadingBox}>
              <Text style={styles.loadingSub}>
                Vui lòng đợi trong giây lát, tệp đang được tải về...
              </Text>
            </View>
          ) : (
            <>
              {/* Các nút lựa chọn nơi lưu */}
              <View style={styles.buttonCol}>
                {/* 1. Lưu vào Kite */}
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={onSaveToKite}
                  activeOpacity={0.8}
                >
                  <Feather name="folder" size={17} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.primaryBtnText}>Lưu vào Kite (Tệp đã tải)</Text>
                </TouchableOpacity>

                {/* 2. Chọn nơi lưu (Mở hộp thoại Lưu vào Tệp / Lưu Video / Chia sẻ của iOS) */}
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={onChooseLocation}
                  activeOpacity={0.7}
                >
                  <Feather name="share" size={17} color="#007aff" style={{ marginRight: 8 }} />
                  <Text style={styles.secondaryBtnText}>Chọn nơi lưu... (Lưu vào Tệp / Ảnh)</Text>
                </TouchableOpacity>

                {/* 3. Nút Hủy */}
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={onCancel}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelBtnText}>Hủy bỏ</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
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
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#09090b',
    marginBottom: 6,
    textAlign: 'center',
  },
  fileName: {
    fontSize: 13.5,
    color: '#52525b',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 8,
    lineHeight: 18,
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  loadingSub: {
    fontSize: 13,
    color: '#71717a',
    textAlign: 'center',
  },
  buttonCol: {
    width: '100%',
    gap: 10,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007aff',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  primaryBtnText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#ffffff',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f6ff',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  secondaryBtnText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#007aff',
  },
  cancelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    color: '#71717a',
    fontWeight: '500',
  },
});
