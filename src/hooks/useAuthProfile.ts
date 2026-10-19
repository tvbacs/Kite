import { useState, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile, BrowserTab } from '../types/browser';
import { supabase, handleAuthCallbackUrl, upsertCloudProfile } from '../services/supabase';

export const STORAGE_PIN_KEY = '@kite_incognito_pin';
export const STORAGE_SYNC_ACCOUNTS_KEY = '@kite_sync_all_accounts';
export const STORAGE_USER_PROFILE_KEY = '@kite_user_profile';
export const STORAGE_SAVED_ACCOUNTS_KEY = '@kite_saved_accounts';

/**
 * Kiểm tra xem một URL có phải là OAuth Callback trả về cho CHÍNH TRÌNH DUYỆT KITE không.
 */
export const isOAuthCallback = (url: string | null | undefined): boolean => {
  if (!url) return false;
  const lower = url.trim().toLowerCase();

  // 0. TUYỆT ĐỐI KHÔNG coi trang khởi tạo / yêu cầu đăng nhập là Callback!
  // URL khởi tạo đăng nhập (/auth/v1/authorize) luôn có redirect_to chứa chuỗi "auth-callback" trong query param!
  if (
    lower.includes('/auth/v1/authorize') ||
    lower.includes('prompt=select_account') ||
    lower.includes('accounts.google.com') ||
    lower.includes('myaccount.google.com') ||
    lower.includes('oauth2.googleapis.com')
  ) {
    return false;
  }

  // 1. Callback trả về Custom Scheme của Kite:
  if (lower.startsWith('kite://')) {
    return true;
  }

  // 2. Callback trả về localhost dev:
  if (
    lower.startsWith('http://localhost:3000') ||
    lower.startsWith('http://127.0.0.1:3000') ||
    lower.startsWith('https://localhost:3000')
  ) {
    return true;
  }

  // 3. Callback trả về Supabase sau khi Google xác thực xong (phải là endpoint callback hoặc chứa token/code):
  if (
    lower.includes('ivwnjrugslrvsxssufco.supabase.co/auth/v1/callback') ||
    (lower.includes('ivwnjrugslrvsxssufco.supabase.co') &&
      (lower.includes('#access_token=') || lower.includes('&access_token=') || lower.includes('?code=') || lower.includes('&code=')))
  ) {
    return true;
  }

  return false;
};

interface UseAuthProfileProps {
  showToast: (msg: string) => void;
}

export function useAuthProfile({ showToast }: UseAuthProfileProps) {
  // Trạng thái tài khoản người dùng
  const [userProfile, setUserProfile] = useState<UserProfile>({
    isLoggedIn: false,
    name: '',
    email: '',
    avatarUrl: '',
  });
  const userProfileRef = useRef<UserProfile>(userProfile);

  // Trạng thái đồng bộ toàn bộ tài khoản
  const [syncAllAccounts, setSyncAllAccounts] = useState<boolean>(false);
  const syncAllAccountsRef = useRef<boolean>(false);
  const profileTabsRef = useRef<
    Record<string, { tabs: BrowserTab[]; activeTabId: string; isIncognito: boolean }>
  >({});
  const processedOAuthUrlsRef = useRef<Set<string>>(new Set());

  // Chế độ duyệt web Ẩn danh & mã PIN
  const [incognitoPin, setIncognitoPin] = useState<string | null>(null);
  const [isIncognitoUnlocked, setIsIncognitoUnlocked] = useState<boolean>(false);
  const [pinModalVisible, setPinModalVisible] = useState<boolean>(false);
  const [pinModalMode, setPinModalMode] = useState<'unlock' | 'setup' | 'manage'>('unlock');
  const pendingIncognitoActionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    syncAllAccountsRef.current = syncAllAccounts;
  }, [syncAllAccounts]);

  useEffect(() => {
    userProfileRef.current = userProfile;
  }, [userProfile]);

  // Load PIN lúc khởi động
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_PIN_KEY).then((pin) => {
      if (pin) {
        setIncognitoPin(pin);
      }
    });
  }, []);

  // Yêu cầu xác thực mã PIN trước khi vào Thẻ ẩn danh
  const requestIncognitoAccess = (action: () => void) => {
    if (!incognitoPin || isIncognitoUnlocked) {
      action();
    } else {
      pendingIncognitoActionRef.current = action;
      setPinModalMode('unlock');
      setPinModalVisible(true);
    }
  };

  const handleSavePin = (newPin: string) => {
    setIncognitoPin(newPin);
    setIsIncognitoUnlocked(true);
    AsyncStorage.setItem(STORAGE_PIN_KEY, newPin);
    showToast('Đã thiết lập mã PIN bảo vệ thẻ ẩn danh');
  };

  const handleDisablePin = () => {
    setIncognitoPin(null);
    setIsIncognitoUnlocked(false);
    AsyncStorage.removeItem(STORAGE_PIN_KEY);
    showToast('Đã tắt mã PIN thẻ ẩn danh');
  };

  const handleSuccessUnlock = () => {
    setIsIncognitoUnlocked(true);
    if (pendingIncognitoActionRef.current) {
      const act = pendingIncognitoActionRef.current;
      pendingIncognitoActionRef.current = null;
      act();
    }
  };

  const handleOpenPinSettings = () => {
    if (incognitoPin) {
      setPinModalMode('manage');
    } else {
      setPinModalMode('setup');
    }
    setPinModalVisible(true);
  };

  // Bật/tắt đồng bộ toàn bộ tài khoản
  const handleToggleSyncAccounts = async (val: boolean) => {
    setSyncAllAccounts(val);
    syncAllAccountsRef.current = val;
    await AsyncStorage.setItem(STORAGE_SYNC_ACCOUNTS_KEY, JSON.stringify(val));
    showToast(
      val
        ? 'Đã bật đồng bộ toàn bộ tài khoản'
        : 'Đã tắt đồng bộ (Dữ liệu tài khoản riêng biệt)'
    );
  };

  // Cập nhật profile
  const handleUpdateProfile = (p: UserProfile) => {
    setUserProfile(p);
    userProfileRef.current = p;
    if (p.isLoggedIn && p.email) {
      AsyncStorage.setItem(STORAGE_USER_PROFILE_KEY, JSON.stringify(p));
    } else {
      AsyncStorage.removeItem(STORAGE_USER_PROFILE_KEY);
    }
  };

  return {
    userProfile,
    setUserProfile,
    userProfileRef,
    syncAllAccounts,
    setSyncAllAccounts,
    syncAllAccountsRef,
    profileTabsRef,
    processedOAuthUrlsRef,
    incognitoPin,
    setIncognitoPin,
    isIncognitoUnlocked,
    setIsIncognitoUnlocked,
    pinModalVisible,
    setPinModalVisible,
    pinModalMode,
    setPinModalMode,
    pendingIncognitoActionRef,
    requestIncognitoAccess,
    handleSavePin,
    handleDisablePin,
    handleSuccessUnlock,
    handleOpenPinSettings,
    handleToggleSyncAccounts,
    handleUpdateProfile,
  };
}
