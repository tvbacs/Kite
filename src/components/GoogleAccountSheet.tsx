import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
  StatusBar,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UserProfile } from '../types/browser';

interface GoogleAccountSheetProps {
  visible: boolean;
  onClose: () => void;
  userProfile: UserProfile;
  allAccounts?: UserProfile[];
  onSelectAccount?: (account: UserProfile) => void;
  onOpenUrl: (url: string) => void;
  onPickAvatar?: () => void;
}

interface AccountOptionItem {
  id: string;
  title: string;
  subtitle: string;
  iconName: string;
  iconType: 'feather' | 'material';
  iconColor: string;
  iconBg: string;
  url: string;
}

const ACCOUNT_OPTIONS: AccountOptionItem[] = [
  {
    id: 'personal_info',
    title: 'Thông tin cá nhân',
    subtitle: 'Tên, email, điện thoại, địa chỉ',
    iconName: 'card-account-details-outline',
    iconType: 'material',
    iconColor: '#137333',
    iconBg: '#e6f4ea',
    url: 'https://myaccount.google.com/personal-info',
  },
  {
    id: 'security',
    title: 'Bảo mật và đăng nhập',
    subtitle: 'Sự kiện bảo mật gần đây, Trình quản lý mật khẩu, Kiểm tra bảo mật',
    iconName: 'lock',
    iconType: 'feather',
    iconColor: '#1a73e8',
    iconBg: '#e8f0fe',
    url: 'https://myaccount.google.com/security',
  },
  {
    id: 'passwords',
    title: 'Mật khẩu Google',
    subtitle: 'Thay đổi mật khẩu hoặc cập nhật cài đặt đăng nhập',
    iconName: 'form-textbox-password',
    iconType: 'material',
    iconColor: '#0288d1',
    iconBg: '#e1f5fe',
    url: 'https://myaccount.google.com/signinoptions/password',
  },
  {
    id: 'connections',
    title: 'Các ứng dụng được liên kết',
    subtitle: 'Các ứng dụng bạn đã liên kết và chế độ kiểm soát việc chia sẻ dữ liệu',
    iconName: 'hubspot',
    iconType: 'material',
    iconColor: '#1a73e8',
    iconBg: '#e8f0fe',
    url: 'https://myaccount.google.com/connections',
  },
  {
    id: 'data_privacy',
    title: 'Dữ liệu và quyền riêng tư',
    subtitle: 'Cài đặt nhật ký, ứng dụng và dịch vụ, xoá dữ liệu',
    iconName: 'toggle-switch-outline',
    iconType: 'material',
    iconColor: '#e8710a',
    iconBg: '#feefe3',
    url: 'https://myaccount.google.com/data-and-privacy',
  },
  {
    id: 'people_sharing',
    title: 'Mọi người và chia sẻ',
    subtitle: 'Danh bạ, người dùng bị chặn, chia sẻ vị trí, hồ sơ',
    iconName: 'account-group-outline',
    iconType: 'material',
    iconColor: '#d93025',
    iconBg: '#fce8e6',
    url: 'https://myaccount.google.com/people-and-sharing',
  },
  {
    id: 'family',
    title: 'Gia đình',
    subtitle: 'Thành viên, chia sẻ, chế độ kiểm soát',
    iconName: 'home-heart',
    iconType: 'material',
    iconColor: '#e91e63',
    iconBg: '#fce8e6',
    url: 'https://myaccount.google.com/family/details',
  },
  {
    id: 'payments',
    title: 'Thanh toán và gói thuê bao',
    subtitle: 'Phương thức thanh toán, giao dịch mua, gói thuê bao',
    iconName: 'credit-card',
    iconType: 'feather',
    iconColor: '#00897b',
    iconBg: '#e0f2f1',
    url: 'https://myaccount.google.com/payments-and-subscriptions',
  },
];

export const GoogleAccountSheet: React.FC<GoogleAccountSheetProps> = ({
  visible,
  onClose,
  userProfile,
  allAccounts = [],
  onSelectAccount,
  onOpenUrl,
  onPickAvatar,
}) => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 44 : 20);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 34 : 16);

  const [isAccountsExpanded, setIsAccountsExpanded] = useState<boolean>(false);

  const isRealGooglePhoto = (url?: string) => {
    if (!url) return false;
    return (
      url.includes('googleusercontent.com/a/') ||
      url.includes('googleusercontent.com/a-/') ||
      url.includes('googleusercontent.com/ogw/')
    );
  };

  const getAvatarLetter = () => {
    if (userProfile.email?.toLowerCase().includes('vietbac')) return 'V';
    if (userProfile.name) {
      const trimmed = userProfile.name.trim();
      if (trimmed.toLowerCase().includes('việt bắc')) return 'V';
      const words = trimmed.split(/\s+/);
      const lastWord = words[words.length - 1];
      if (lastWord) return lastWord.charAt(0).toUpperCase();
    }
    if (userProfile.email) {
      return userProfile.email.charAt(0).toUpperCase();
    }
    return 'G';
  };

  const handleOpenOption = (url: string) => {
    onClose();
    onOpenUrl(url);
  };

  const handleOpenSupport = () => {
    onClose();
    onOpenUrl('https://support.google.com/accounts');
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#f0f4f9" />
      <View style={[styles.container, { paddingTop: topInset, paddingBottom: bottomInset }]}>
        {/* 1. THANH TIÊU ĐỀ TRÊN CÙNG: [X] - Tài khoản Google - [?] */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.circleBtn}
            onPress={onClose}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="x" size={20} color="#3c4043" />
          </TouchableOpacity>

          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitleText}>
              Tài khoản <Text style={styles.headerTitleBold}>Google</Text>
            </Text>
          </View>

          {/* Nút ? chuyển trực tiếp sang trang support của Google */}
          <TouchableOpacity
            style={styles.circleBtn}
            onPress={handleOpenSupport}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="help-circle" size={20} color="#3c4043" />
          </TouchableOpacity>
        </View>

        {/* 2. NỘI DUNG CUỘN CHỨA CÁC THẺ QUẢN LÝ */}
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
        >
          {/* THẺ HỒ SƠ TÀI KHOẢN ĐANG ĐĂNG NHẬP (CHUẨN HÌNH 1) */}
          <View style={styles.profileCard}>
            <View style={styles.profileRow}>
              {/* Avatar kèm nút chỉnh sửa ảnh */}
              <TouchableOpacity
                onPress={onPickAvatar}
                activeOpacity={0.8}
                style={styles.avatarWrapper}
              >
                {userProfile.avatarUrl && isRealGooglePhoto(userProfile.avatarUrl) ? (
                  <Image source={{ uri: userProfile.avatarUrl }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarLetter}>{getAvatarLetter()}</Text>
                  </View>
                )}
                <View style={styles.avatarEditBadge}>
                  <Feather name="edit-2" size={10} color="#3c4043" />
                </View>
              </TouchableOpacity>

              {/* Tên & Email */}
              <View style={styles.profileInfoCol}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {userProfile.name || 'Người dùng Google'}
                </Text>
                <Text style={styles.profileEmail} numberOfLines={1}>
                  {userProfile.email || 'Chưa đăng nhập'}
                </Text>
              </View>

              {/* Nút dropdown chuyển đổi tài khoản (nếu có nhiều nick) */}
              {allAccounts && allAccounts.length > 1 && (
                <TouchableOpacity
                  style={styles.switchDropdownBtn}
                  onPress={() => setIsAccountsExpanded(!isAccountsExpanded)}
                  activeOpacity={0.7}
                >
                  <Feather
                    name={isAccountsExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color="#5f6368"
                  />
                </TouchableOpacity>
              )}
            </View>

            {/* Danh sách các tài khoản khác khi bấm mở dropdown */}
            {isAccountsExpanded && allAccounts && (
              <View style={styles.accountDropdownList}>
                <View style={styles.dropdownDivider} />
                <Text style={styles.dropdownHeader}>Chuyển sang tài khoản khác:</Text>
                {allAccounts.map((acc) => {
                  const isActive = acc.email?.toLowerCase() === userProfile.email?.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={acc.email || acc.name}
                      style={[
                        styles.dropdownItem,
                        isActive && styles.dropdownItemActive,
                      ]}
                      onPress={() => {
                        if (!isActive && onSelectAccount) {
                          onSelectAccount(acc);
                          setIsAccountsExpanded(false);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.dropdownAvatarCircle}>
                        {acc.avatarUrl && isRealGooglePhoto(acc.avatarUrl) ? (
                          <Image source={{ uri: acc.avatarUrl }} style={styles.dropdownAvatarImg} />
                        ) : (
                          <Text style={styles.dropdownAvatarText}>
                            {(acc.email || 'G').charAt(0).toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.dropdownName} numberOfLines={1}>
                          {acc.name || acc.email}
                        </Text>
                        <Text style={styles.dropdownEmail} numberOfLines={1}>
                          {acc.email}
                        </Text>
                      </View>
                      {isActive && <Feather name="check" size={16} color="#007aff" />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* DANH SÁCH CÁC THẺ TÙY CHỌN TÀI KHOẢN GOOGLE CHUẨN GOOGLE ACCOUNT APP */}
          {ACCOUNT_OPTIONS.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.optionCard}
              onPress={() => handleOpenOption(item.url)}
              activeOpacity={0.65}
            >
              <View style={[styles.optionIconBox, { backgroundColor: item.iconBg }]}>
                {item.iconType === 'feather' ? (
                  <Feather name={item.iconName as any} size={20} color={item.iconColor} />
                ) : (
                  <MaterialCommunityIcons
                    name={item.iconName as any}
                    size={22}
                    color={item.iconColor}
                  />
                )}
              </View>

              <View style={styles.optionTextCol}>
                <Text style={styles.optionTitle}>{item.title}</Text>
                <Text style={styles.optionSubtitle}>{item.subtitle}</Text>
              </View>
            </TouchableOpacity>
          ))}

          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f9',
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#f0f4f9',
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  headerTitleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleText: {
    fontSize: 18,
    color: '#1f1f1f',
    fontWeight: '400',
  },
  headerTitleBold: {
    fontWeight: '700',
    color: '#1f1f1f',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  profileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 14,
  },
  avatarImg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#e8eaed',
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#8e24aa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    fontSize: 22,
    fontWeight: '600',
    color: '#ffffff',
  },
  avatarEditBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#f0f4f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  profileInfoCol: {
    flex: 1,
  },
  profileName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1f1f1f',
    marginBottom: 3,
  },
  profileEmail: {
    fontSize: 13.5,
    color: '#5f6368',
  },
  switchDropdownBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f3f4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountDropdownList: {
    marginTop: 12,
    paddingTop: 8,
  },
  dropdownDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e8eaed',
    marginBottom: 10,
  },
  dropdownHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#70757a',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  dropdownItemActive: {
    backgroundColor: '#f8f9fa',
  },
  dropdownAvatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#e8eaed',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    overflow: 'hidden',
  },
  dropdownAvatarImg: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  dropdownAvatarText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f1f1f',
  },
  dropdownName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f1f1f',
  },
  dropdownEmail: {
    fontSize: 12,
    color: '#5f6368',
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  optionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  optionTextCol: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15.5,
    fontWeight: '600',
    color: '#1f1f1f',
    marginBottom: 3,
  },
  optionSubtitle: {
    fontSize: 12.5,
    color: '#5f6368',
    lineHeight: 16,
  },
});
