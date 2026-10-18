import React from 'react';
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
import { PermissionType } from '../services/sitePermissionsStorage';

export interface PermissionRequestPayload {
  permissionType: PermissionType | 'camera_and_mic';
  domain: string;
  requestId: string;
}

interface PermissionPromptModalProps {
  visible: boolean;
  request: PermissionRequestPayload | null;
  onAllow: () => void;
  onBlock: () => void;
  onDismiss: () => void;
}

export const PermissionPromptModal: React.FC<PermissionPromptModalProps> = ({
  visible,
  request,
  onAllow,
  onBlock,
  onDismiss,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 16);

  if (!request) return null;

  const getPermissionMeta = (type: string) => {
    switch (type) {
      case 'location':
        return {
          icon: 'map-pin',
          title: 'Truy cập Vị trí',
          desc: 'muốn biết vị trí địa lý của bạn để cung cấp nội dung phù hợp theo khu vực.',
        };
      case 'camera':
        return {
          icon: 'video',
          title: 'Sử dụng Máy ảnh',
          desc: 'muốn sử dụng máy ảnh (Camera) của bạn để chụp ảnh hoặc quét dữ liệu.',
        };
      case 'microphone':
        return {
          icon: 'mic',
          title: 'Sử dụng Micrô',
          desc: 'muốn sử dụng micrô của bạn để ghi âm hoặc tìm kiếm bằng giọng nói.',
        };
      case 'camera_and_mic':
        return {
          icon: 'video',
          title: 'Máy ảnh & Micrô',
          desc: 'muốn sử dụng máy ảnh và micrô của bạn để thực hiện cuộc gọi hoặc quay video.',
        };
      case 'notifications':
        return {
          icon: 'bell',
          title: 'Gửi Thông báo',
          desc: 'muốn gửi thông báo cập nhật và tin tức mới cho bạn.',
        };
      case 'downloads':
        return {
          icon: 'download',
          title: 'Tự động tải xuống',
          desc: 'muốn tự động tải tệp tin về thiết bị của bạn.',
        };
      default:
        return {
          icon: 'shield',
          title: 'Yêu cầu quyền truy cập',
          desc: 'muốn yêu cầu cấp quyền trên thiết bị của bạn.',
        };
    }
  };

  const meta = getPermissionMeta(request.permissionType);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View style={[styles.dialogCard, { paddingBottom: 20 }]}>
          {/* Header Icon tròn xanh */}
          <View style={styles.iconCircle}>
            <Feather name={meta.icon as any} size={24} color="#007aff" />
          </View>

          {/* Tên miền trang web */}
          <View style={styles.domainBadge}>
            <Feather name="globe" size={13} color="#71717a" style={{ marginRight: 5 }} />
            <Text style={styles.domainText} numberOfLines={1}>
              {request.domain}
            </Text>
          </View>

          {/* Tiêu đề quyền */}
          <Text style={styles.titleText}>{meta.title}</Text>

          {/* Nội dung mô tả */}
          <Text style={styles.bodyText}>
            <Text style={{ fontWeight: '700', color: '#09090b' }}>{request.domain}</Text>{' '}
            {meta.desc}
          </Text>

          <Text style={styles.helperText}>
            Bạn có thể thay đổi quyền này bất kỳ lúc nào trong Cài đặt quyền trang web.
          </Text>

          {/* Hai nút hành động: Chặn & Cho phép */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.blockBtn}
              onPress={onBlock}
              activeOpacity={0.7}
            >
              <Text style={styles.blockBtnText}>Chặn</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.allowBtn}
              onPress={onAllow}
              activeOpacity={0.7}
            >
              <Text style={styles.allowBtnText}>Cho phép</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingTop: 24,
    paddingHorizontal: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 8,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  domainBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4f4f5',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    marginBottom: 10,
    maxWidth: '90%',
  },
  domainText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3f3f46',
  },
  titleText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#09090b',
    marginBottom: 8,
    textAlign: 'center',
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#52525b',
    textAlign: 'center',
    marginBottom: 10,
  },
  helperText: {
    fontSize: 11.5,
    lineHeight: 16,
    color: '#a1a1aa',
    textAlign: 'center',
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  blockBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#f4f4f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  blockBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#52525b',
  },
  allowBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#007aff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  allowBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
});
