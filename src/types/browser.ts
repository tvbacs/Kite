export interface TabFrozenState {
  scrollX: number;
  scrollY: number;
  formInputs: Record<string, string>;
  capturedAt: number;
}

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  isIncognito?: boolean;
  isDesktop?: boolean;
  isSleeping?: boolean;
  lastActiveAt?: number;
  frozenState?: TabFrozenState;
  snapshotUri?: string;
  isReaderMode?: boolean;
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
  isLoggedIn: boolean;
  name?: string;
  email?: string;
  avatarUrl?: string;
}
