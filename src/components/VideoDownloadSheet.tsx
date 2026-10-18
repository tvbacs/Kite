import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { DetectedMedia } from '../types/browser';

interface VideoDownloadSheetProps {
  visible: boolean;
  onClose: () => void;
  mediaList: DetectedMedia[];
  onDownload: (media: DetectedMedia) => void;
  onShowToast?: (msg: string) => void;
}

export const VideoDownloadSheet: React.FC<VideoDownloadSheetProps> = ({
  visible,
  onClose,
  mediaList,
  onDownload,
  onShowToast,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 16);

  const getFormatBadge = (format: string) => {
    switch (format.toLowerCase()) {
      case 'webm':
        return { label: 'WEBM VIDEO', bg: '#f3e8ff', color: '#7c3aed', isRecommended: false };
      case 'audio':
        return { label: 'AUDIO MP3', bg: '#fdf2f8', color: '#db2777', isRecommended: false };
      case 'mov':
        return { label: 'QUICKTIME MOV', bg: '#e0f2fe', color: '#0284c7', isRecommended: false };
      case 'mkv':
        return { label: 'MKV VIDEO', bg: '#fef3c7', color: '#d97706', isRecommended: false };
      default:
        return { label: 'MP4 VIDEO', bg: '#dcfce7', color: '#16a34a', isRecommended: true };
    }
  };

  const getDomain = (url: string) => {
    try {
      const match = url.match(/^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:/\n?]+)/im);
      return match ? match[1] : '';
    } catch (e) {
      return '';
    }
  };

  const handleCopyLink = async (url: string) => {
    try {
      await Clipboard.setStringAsync(url);
      if (onShowToast) onShowToast('Đã sao chép liên kết video');
    } catch (e) {
      if (onShowToast) onShowToast('Lỗi khi sao chép liên kết');
    }
  };

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
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text style={styles.sheetTitle}>Tải video xuống</Text>
              <Text style={styles.sheetSubtitle}>
                Phát hiện {mediaList.length} video sẵn sàng tải về
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Feather name="x" size={18} color="#000000" />
            </TouchableOpacity>
          </View>

          {/* List Media */}
          <ScrollView
            style={styles.scrollList}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {mediaList.map((media, idx) => {
              const badge = getFormatBadge(media.format);
              const domain = getDomain(media.url);

              return (
                <View key={media.id || `${media.url}-${idx}`} style={styles.mediaCard}>
                  <View style={styles.cardTopRow}>
                    <View style={styles.mediaIconWrap}>
                      <Feather
                        name={media.format === 'audio' ? 'music' : 'play-circle'}
                        size={24}
                        color="#007aff"
                      />
                    </View>
                    <View style={styles.cardInfoCol}>
                      <Text style={styles.mediaTitle} numberOfLines={2}>
                        {media.title || 'Video'}
                      </Text>
                      <View style={styles.badgeRow}>
                        <View style={[styles.formatBadge, { backgroundColor: badge.bg }]}>
                          <Text style={[styles.formatBadgeText, { color: badge.color }]}>
                            {badge.label}
                          </Text>
                        </View>
                        {badge.isRecommended && (
                          <View style={[styles.formatBadge, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0', borderWidth: 1 }]}>
                            <Text style={[styles.formatBadgeText, { color: '#059669', fontWeight: '700' }]}>
                              ★ KHUYÊN DÙNG
                            </Text>
                          </View>
                        )}
                        {mediaList.length > 1 && (
                          <View style={[styles.formatBadge, { backgroundColor: '#f1f5f9' }]}>
                            <Text style={[styles.formatBadgeText, { color: '#475569' }]}>
                              BẢN {idx + 1}
                            </Text>
                          </View>
                        )}
                        {domain ? (
                          <Text style={styles.domainText} numberOfLines={1}>
                            • {domain}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>

                  {/* Action Buttons */}
                  <View style={styles.cardActionRow}>
                    <TouchableOpacity
                      style={styles.copyBtn}
                      onPress={() => handleCopyLink(media.url)}
                      activeOpacity={0.7}
                    >
                      <Feather name="copy" size={14} color="#71717a" style={{ marginRight: 6 }} />
                      <Text style={styles.copyBtnText}>Sao chép link</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.downloadBtn}
                      onPress={() => {
                        onClose();
                        onDownload(media);
                      }}
                      activeOpacity={0.8}
                    >
                      <Feather name="download" size={15} color="#ffffff" style={{ marginRight: 6 }} />
                      <Text style={styles.downloadBtnText}>Tải về máy</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>
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
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 18,
    paddingHorizontal: 20,
    maxHeight: '75%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f4f4f5',
  },
  headerLeft: {
    flex: 1,
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#09090b',
    letterSpacing: -0.2,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: '#71717a',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f4f4f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollList: {
    marginBottom: 10,
  },
  mediaCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  mediaIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardInfoCol: {
    flex: 1,
  },
  mediaTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    lineHeight: 19,
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  formatBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  formatBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  domainText: {
    fontSize: 11.5,
    color: '#64748b',
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  copyBtnText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#64748b',
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#007aff',
  },
  downloadBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
});
