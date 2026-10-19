export interface TabFrozenState {
  scrollX: number;
  scrollY: number;
  formInputs: Record<string, string>;
  capturedAt: number;
}

/**
 * Kiểm tra xem tab có được phép lưu trữ bền vững (lịch sử, mật khẩu, khôi phục tab qua session restore) hay không.
 * Chuẩn Chrome: Tab ẩn danh là OTR (Off-the-record profile), sống tạm trong RAM, KHÔNG BAO GIỜ lưu xuống đĩa.
 */
export const isPersistable = (tab?: { isIncognito?: boolean } | null): boolean => {
  return !tab?.isIncognito;
};

export interface BrowserTab {
  id: string;
  url: string;
  initialUrl?: string;
  title: string;
  isIncognito?: boolean;
  isDesktop?: boolean;
  isSleeping?: boolean;
  lastActiveAt?: number;
  frozenState?: TabFrozenState;
  snapshotUri?: string;
  isReaderMode?: boolean;
  originalUrlBeforeTranslate?: string;
  isTranslated?: boolean;
  isLoading?: boolean;
  isOffline?: boolean;
  offlineUrl?: string;
  isNavigatingFromHome?: boolean;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  icon?: string;
}

export type DataSaverMode = 'off' | 'block_images' | 'compress_images';

export interface ShieldStats {
  blockedAds: number;
  blockedPopups: number;
  blockedOverlays: number;
  isShieldActive: boolean;
  aggressiveMode: boolean;
  isDataSaverActive?: boolean;
  dataSaverMode?: DataSaverMode;
  isKeepAwakeActive?: boolean;
  isReaderMode?: boolean;
}

export interface SearchEngine {
  id: 'google' | 'bing' | 'duckduckgo' | 'yahoo';
  name: string;
  searchUrl: string;
  logoUrl: string;
  logoWidth: number;
  logoHeight: number;
}

export interface UserProfile {
  id?: string;
  isLoggedIn: boolean;
  name?: string;
  email?: string;
  avatarUrl?: string;
}

export interface DetectedMedia {
  id: string;
  url: string;
  title: string;
  format: 'mp4' | 'm3u8' | 'webm' | 'mov' | 'm4v' | 'mkv' | 'audio' | 'video';
  sizeBytes?: number;
  quality?: string;
  tabId?: string;
  detectedAt?: number;
}

export interface SavedCredential {
  id: string;
  website: string;
  username: string;
  password?: string;
  updatedAt: number;
  notes?: string;
}


