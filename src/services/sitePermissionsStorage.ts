import AsyncStorage from '@react-native-async-storage/async-storage';

export type PermissionStatus = 'ask' | 'allow' | 'block';
export type PermissionType =
  | 'location'
  | 'camera'
  | 'microphone'
  | 'notifications'
  | 'popups'
  | 'downloads';

export interface SitePermissionSettings {
  location: PermissionStatus;
  camera: PermissionStatus;
  microphone: PermissionStatus;
  notifications: PermissionStatus;
  popups: 'block' | 'allow';
  downloads: PermissionStatus;
  updatedAt: number;
}

export const DEFAULT_SITE_PERMISSIONS: SitePermissionSettings = {
  location: 'ask',
  camera: 'ask',
  microphone: 'ask',
  notifications: 'ask',
  popups: 'block',
  downloads: 'ask',
  updatedAt: Date.now(),
};

export const STORAGE_SITE_PERMISSIONS_KEY = '@kite_site_permissions_v1';

/**
 * Lấy cài đặt quyền của một trang web (theo hostname/domain)
 */
export const getSitePermissions = async (
  domain: string
): Promise<SitePermissionSettings> => {
  if (!domain) return { ...DEFAULT_SITE_PERMISSIONS };
  try {
    const cleanDomain = domain.toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    const raw = await AsyncStorage.getItem(STORAGE_SITE_PERMISSIONS_KEY);
    if (raw) {
      const all: Record<string, SitePermissionSettings> = JSON.parse(raw);
      if (all[cleanDomain]) {
        return { ...DEFAULT_SITE_PERMISSIONS, ...all[cleanDomain] };
      }
    }
  } catch (e) {
    console.warn('Error reading site permissions:', e);
  }
  return { ...DEFAULT_SITE_PERMISSIONS };
};

/**
 * Lưu một quyền cụ thể cho một trang web
 */
export const setSitePermission = async (
  domain: string,
  type: PermissionType,
  status: PermissionStatus
): Promise<SitePermissionSettings> => {
  const cleanDomain = domain.toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  try {
    const raw = await AsyncStorage.getItem(STORAGE_SITE_PERMISSIONS_KEY);
    const all: Record<string, SitePermissionSettings> = raw ? JSON.parse(raw) : {};
    const current = all[cleanDomain] || { ...DEFAULT_SITE_PERMISSIONS };
    current[type] = status as any;
    current.updatedAt = Date.now();
    all[cleanDomain] = current;
    await AsyncStorage.setItem(STORAGE_SITE_PERMISSIONS_KEY, JSON.stringify(all));
    return current;
  } catch (e) {
    console.warn('Error saving site permission:', e);
    return { ...DEFAULT_SITE_PERMISSIONS };
  }
};

/**
 * Đặt lại toàn bộ quyền của một trang web về mặc định
 */
export const resetSitePermissions = async (domain: string): Promise<void> => {
  if (!domain) return;
  const cleanDomain = domain.toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  try {
    const raw = await AsyncStorage.getItem(STORAGE_SITE_PERMISSIONS_KEY);
    if (raw) {
      const all: Record<string, SitePermissionSettings> = JSON.parse(raw);
      if (all[cleanDomain]) {
        delete all[cleanDomain];
        await AsyncStorage.setItem(STORAGE_SITE_PERMISSIONS_KEY, JSON.stringify(all));
      }
    }
  } catch (e) {
    console.warn('Error resetting site permissions:', e);
  }
};
