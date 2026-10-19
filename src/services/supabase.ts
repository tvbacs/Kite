import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Bookmark, UserProfile } from '../types/browser';
import { HistoryItem } from '../components/HistorySheet';

export const SUPABASE_URL = 'https://ivwnjrugslrvsxssufco.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_dmBNfyolB_a4ynEhnXNGGw_dbwDq8ED';

/**
 * Supabase Client cấu hình riêng cho Kite Browser (React Native Expo)
 * Lưu trữ phiên đăng nhập bằng AsyncStorage để giữ trạng thái đăng nhập vĩnh viễn
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/* =========================================================================
 * 1. QUẢN LÝ TÀI KHOẢN & PHIÊN ĐĂNG NHẬP (AUTH)
 * ========================================================================= */

export async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user;
  } catch (e) {
    return null;
  }
}

/**
 * Lấy URL Google OAuth chính thức từ Supabase
 */
export async function getGoogleOAuthUrl(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'kite://auth-callback',
        skipBrowserRedirect: true,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
    if (error || !data?.url) {
      console.warn('Lỗi tạo Google OAuth URL từ Supabase:', error);
      return null;
    }
    return data.url;
  } catch (e) {
    console.warn('Lỗi gọi getGoogleOAuthUrl:', e);
    return null;
  }
}

function decodeJwtPayload(jwt: string): any {
  try {
    const part = jwt.split('.')[1];
    if (!part) return null;
    let b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const decoded = typeof atob === 'function' ? atob(b64) : '';
    if (!decoded) return null;
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      bytes[i] = decoded.charCodeAt(i);
    }
    const jsonStr = new TextDecoder('utf-8').decode(bytes);
    return JSON.parse(jsonStr);
  } catch (e) {
    try {
      const part = jwt.split('.')[1];
      if (!part) return null;
      let b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const decoded = typeof atob === 'function' ? atob(b64) : '';
      return JSON.parse(decoded);
    } catch (e2) {
      return null;
    }
  }
}

/**
 * Xử lý URL callback sau khi đăng nhập Google OAuth thành công
 */
export async function handleAuthCallbackUrl(url: string): Promise<UserProfile | null> {
  try {
    if (!url) return null;

    // 0. Nếu URL chứa thông báo lỗi OAuth (hết hạn, người dùng hủy,...)
    if (url.includes('error=')) {
      console.warn('OAuth callback returned error:', url);
      return null;
    }

    // 1. Trường hợp trả về mã PKCE (?code=...)
    if (url.includes('code=')) {
      const match = url.match(/[?&]code=([^&#]+)/);
      if (match && match[1]) {
        const code = decodeURIComponent(match[1]);
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error && data.session && data.user) {
          const user = data.user;
          const meta = user.user_metadata || {};
          return {
            id: user.id,
            isLoggedIn: true,
            name: meta.full_name || meta.name || user.email?.split('@')[0] || 'Người dùng',
            email: user.email || '',
            avatarUrl: meta.avatar_url || meta.picture || '',
          };
        }
      }
    }

    // 2. Trường hợp trả về Token trên URL Fragment (#access_token=...)
    if (url.includes('access_token=')) {
      const tokenMatch = url.match(/[#&?]access_token=([^&]+)/);
      const refreshMatch = url.match(/[#&?]refresh_token=([^&]+)/);

      if (tokenMatch && tokenMatch[1]) {
        const accessToken = decodeURIComponent(tokenMatch[1]);
        const refreshToken = refreshMatch && refreshMatch[1] ? decodeURIComponent(refreshMatch[1]) : '';

        // Lưu phiên đăng nhập ngầm vào Supabase AsyncStorage
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        }).catch(() => {});

        // Giải mã thông tin người dùng ngay lập tức từ JWT Payload
        const jwt = decodeJwtPayload(accessToken);
        if (jwt) {
          const meta = jwt.user_metadata || {};
          return {
            id: jwt.sub || jwt.email || '',
            isLoggedIn: true,
            name: meta.full_name || meta.name || jwt.email?.split('@')[0] || 'Người dùng',
            email: jwt.email || '',
            avatarUrl: meta.avatar_url || meta.picture || '',
          };
        }
      }
    }

    // 3. Fallback: Kiểm tra xem Supabase client đã có session ngầm chưa
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData && sessionData.session && sessionData.session.user) {
      const user = sessionData.session.user;
      const meta = user.user_metadata || {};
      return {
        id: user.id,
        isLoggedIn: true,
        name: meta.full_name || meta.name || user.email?.split('@')[0] || 'Người dùng',
        email: user.email || '',
        avatarUrl: meta.avatar_url || meta.picture || '',
      };
    }

    return null;
  } catch (e) {
    console.warn('Lỗi xử lý Auth Callback URL:', e);
    return null;
  }
}

export async function signOutSupabase() {
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.warn('Lỗi khi đăng xuất Supabase:', e);
  }
}

/* =========================================================================
 * 2. ĐỒNG BỘ DẤU TRANG & LỐI TẮT (BOOKMARKS)
 * ========================================================================= */

export async function fetchCloudBookmarks(userId: string, userEmail?: string): Promise<Bookmark[] | null> {
  try {
    let query = supabase.from('kite_bookmarks').select('*');
    if (userEmail && userId && userId !== userEmail) {
      query = query.or(`user_id.eq.${userId},user_id.eq.${userEmail}`);
    } else {
      query = query.eq('user_id', userId || userEmail);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error || !data) return null;

    return data.map((row) => ({
      id: row.id,
      title: row.title,
      url: row.url,
      icon: row.icon || undefined,
    }));
  } catch (e) {
    console.warn('Lỗi khi tải bookmarks từ Supabase:', e);
    return null;
  }
}

export async function syncCloudBookmarks(userId: string, localBookmarks: any[], userEmail?: string): Promise<boolean> {
  try {
    const effectiveUserId = userId || userEmail;
    if (!effectiveUserId) return false;
    if (!Array.isArray(localBookmarks) || localBookmarks.length === 0) return true;

    const rows = localBookmarks.map((b) => ({
      id: b.id,
      user_id: effectiveUserId,
      title: b.title,
      url: b.url,
      icon: b.icon || null,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('kite_bookmarks')
      .upsert(rows, { onConflict: 'id' });

    if (error) {
      console.warn('Lỗi upsert bookmarks lên Supabase:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Lỗi đồng bộ bookmarks lên Supabase:', e);
    return false;
  }
}

export async function deleteCloudBookmark(userId: string, bookmarkId: string, userEmail?: string): Promise<boolean> {
  try {
    let query = supabase.from('kite_bookmarks').delete().eq('id', bookmarkId);
    if (userEmail && userId && userId !== userEmail) {
      query = query.or(`user_id.eq.${userId},user_id.eq.${userEmail}`);
    } else {
      query = query.eq('user_id', userId || userEmail);
    }
    const { error } = await query;
    return !error;
  } catch (e) {
    return false;
  }
}

/* =========================================================================
 * 3. ĐỒNG BỘ LỊCH SỬ DUYỆT WEB (HISTORY)
 * ========================================================================= */

export async function fetchCloudHistory(userId: string, userEmail?: string, limit = 100): Promise<HistoryItem[] | null> {
  try {
    let query = supabase.from('kite_history').select('*');
    if (userEmail && userId && userId !== userEmail) {
      query = query.or(`user_id.eq.${userId},user_id.eq.${userEmail}`);
    } else {
      query = query.eq('user_id', userId || userEmail);
    }

    const { data, error } = await query.order('timestamp', { ascending: false }).limit(limit);

    if (error || !data) return null;

    return data.map((row) => ({
      id: row.id,
      title: row.title,
      url: row.url,
      timestamp: Number(row.timestamp),
    }));
  } catch (e) {
    console.warn('Lỗi khi tải lịch sử từ Supabase:', e);
    return null;
  }
}

export async function addCloudHistoryItem(userId: string, item: HistoryItem, userEmail?: string): Promise<boolean> {
  try {
    const effectiveUserId = userId || userEmail;
    if (!effectiveUserId) return false;

    const { error } = await supabase
      .from('kite_history')
      .upsert({
        id: item.id,
        user_id: effectiveUserId,
        title: item.title,
        url: item.url,
        timestamp: item.timestamp,
        visited_at: new Date(item.timestamp).toISOString(),
      }, { onConflict: 'id' });

    return !error;
  } catch (e) {
    return false;
  }
}

export async function clearCloudHistory(userId: string, userEmail?: string): Promise<boolean> {
  try {
    let query = supabase.from('kite_history').delete();
    if (userEmail && userId && userId !== userEmail) {
      query = query.or(`user_id.eq.${userId},user_id.eq.${userEmail}`);
    } else {
      query = query.eq('user_id', userId || userEmail);
    }
    const { error } = await query;
    return !error;
  } catch (e) {
    return false;
  }
}

/* =========================================================================
 * 4. ĐỒNG BỘ CÀI ĐẶT & CHỦ ĐỀ GIAO DIỆN (SETTINGS)
 * ========================================================================= */

export interface CloudUserSettings {
  themeId?: string;
  searchEngineId?: string;
  bgImageUrl?: string;
}

export async function fetchCloudSettings(userId: string, userEmail?: string): Promise<CloudUserSettings | null> {
  try {
    let query = supabase.from('kite_settings').select('*');
    if (userEmail && userId && userId !== userEmail) {
      query = query.or(`user_id.eq.${userId},user_id.eq.${userEmail}`);
    } else {
      query = query.eq('user_id', userId || userEmail);
    }

    const { data, error } = await query.limit(1).maybeSingle();

    if (error || !data) return null;

    return {
      themeId: data.theme_id,
      searchEngineId: data.search_engine_id,
      bgImageUrl: data.bg_image_url,
    };
  } catch (e) {
    return null;
  }
}

export async function saveCloudSettings(userId: string, settings: CloudUserSettings, userEmail?: string): Promise<boolean> {
  try {
    const effectiveUserId = userId || userEmail;
    if (!effectiveUserId) return false;

    const { error } = await supabase
      .from('kite_settings')
      .upsert({
        user_id: effectiveUserId,
        theme_id: settings.themeId,
        search_engine_id: settings.searchEngineId,
        bg_image_url: settings.bgImageUrl,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    return !error;
  } catch (e) {
    return false;
  }
}

/* =========================================================================
 * 5. PROFILE NGƯỜI DÙNG (PROFILES)
 * ========================================================================= */

export async function fetchCloudProfile(userId: string, userEmail?: string): Promise<UserProfile | null> {
  try {
    let query = supabase.from('kite_profiles').select('*');
    if (userEmail && userId && userId !== userEmail) {
      query = query.or(`id.eq.${userId},email.eq.${userEmail}`);
    } else {
      query = query.eq('id', userId || userEmail);
    }

    const { data, error } = await query.limit(1).maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      isLoggedIn: true,
      name: data.name,
      email: data.email,
      avatarUrl: data.avatar_url,
    };
  } catch (e) {
    return null;
  }
}

export async function upsertCloudProfile(userId: string, profile: UserProfile, userEmail?: string): Promise<boolean> {
  try {
    const effectiveUserId = userId || userEmail || profile.email;
    if (!effectiveUserId) return false;

    const { error } = await supabase
      .from('kite_profiles')
      .upsert({
        id: effectiveUserId,
        name: profile.name,
        email: profile.email,
        avatar_url: profile.avatarUrl,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    return !error;
  } catch (e) {
    return false;
  }
}

/* =========================================================================
 * 6. ĐỒNG BỘ TOÀN DIỆN HAI CHIỀU KHI ĐĂNG NHẬP (TWO-WAY CLOUD HYDRATION)
 * ========================================================================= */

export async function syncUserCloudData(
  profile: UserProfile,
  callbacks?: {
    onBookmarksLoaded?: (bookmarks: any[]) => void;
    onSettingsLoaded?: (settings: CloudUserSettings) => void;
  }
) {
  if (!profile.isLoggedIn || (!profile.id && !profile.email)) return;
  const userId = profile.id || profile.email!;
  const email = profile.email;

  // 1. Đồng bộ Profile lên Supabase kite_profiles
  try {
    await upsertCloudProfile(userId, profile, email);
  } catch (e) {}

  // 2. Đồng bộ Bookmarks hai chiều
  try {
    const bmKey = email ? `@kite_user_bookmarks_${email.toLowerCase()}` : '@kite_user_bookmarks';
    const localBmRaw = await AsyncStorage.getItem(bmKey);
    let localBm: any[] = localBmRaw ? JSON.parse(localBmRaw) : [];

    const cloudBm = await fetchCloudBookmarks(userId, email);
    if (cloudBm && cloudBm.length > 0) {
      // Cloud có bookmarks: Hợp nhất vào local
      const mergedMap = new Map<string, any>();
      cloudBm.forEach((b) => {
        if (b.url) {
          mergedMap.set(b.url.trim().toLowerCase(), {
            id: b.id,
            title: b.title,
            url: b.url,
            icon: b.icon,
            timestamp: Date.now(),
          });
        }
      });
      // Nếu local có bookmark mới mà cloud chưa có thì giữ lại
      if (Array.isArray(localBm)) {
        localBm.forEach((b) => {
          if (b.url && !mergedMap.has(b.url.trim().toLowerCase())) {
            mergedMap.set(b.url.trim().toLowerCase(), b);
          }
        });
      }
      const mergedList = Array.from(mergedMap.values());
      await AsyncStorage.setItem(bmKey, JSON.stringify(mergedList));
      await AsyncStorage.setItem('@kite_user_bookmarks', JSON.stringify(mergedList));
      callbacks?.onBookmarksLoaded?.(mergedList);

      // Nếu máy có thêm bookmark chưa có trên cloud -> Đẩy lên cloud
      if (mergedList.length > cloudBm.length) {
        syncCloudBookmarks(userId, mergedList, email).catch(() => {});
      }
    } else if (Array.isArray(localBm) && localBm.length > 0) {
      // Cloud chưa có gì nhưng local có bookmark: Tự động tải lên Supabase để lưu vĩnh viễn!
      syncCloudBookmarks(userId, localBm, email).catch(() => {});
    }
  } catch (e) {
    console.warn('Lỗi đồng bộ bookmarks:', e);
  }

  // 3. Đồng bộ Lịch sử hai chiều
  try {
    const histKey = email ? `@kite_browsing_history_${email.toLowerCase()}` : '@kite_browsing_history';
    const localHistRaw = await AsyncStorage.getItem(histKey);
    let localHist: HistoryItem[] = localHistRaw ? JSON.parse(localHistRaw) : [];

    const cloudHist = await fetchCloudHistory(userId, email, 100);
    if (cloudHist && cloudHist.length > 0) {
      const mergedHistMap = new Map<string, HistoryItem>();
      cloudHist.forEach((h) => {
        if (h.url) mergedHistMap.set(h.url.trim().toLowerCase(), h);
      });
      if (Array.isArray(localHist)) {
        localHist.forEach((h) => {
          if (h.url && !mergedHistMap.has(h.url.trim().toLowerCase())) {
            mergedHistMap.set(h.url.trim().toLowerCase(), h);
          }
        });
      }
      const mergedHistList = Array.from(mergedHistMap.values())
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, 200);
      await AsyncStorage.setItem(histKey, JSON.stringify(mergedHistList));
      await AsyncStorage.setItem('@kite_browsing_history', JSON.stringify(mergedHistList));
    } else if (Array.isArray(localHist) && localHist.length > 0) {
      // Đẩy lịch sử cục bộ gần nhất lên cloud
      const topItems = localHist.slice(0, 30);
      topItems.forEach((item) => {
        addCloudHistoryItem(userId, item, email).catch(() => {});
      });
    }
  } catch (e) {
    console.warn('Lỗi đồng bộ history:', e);
  }

  // 4. Đồng bộ Cài đặt (Theme, Search Engine, Wallpaper)
  try {
    const cloudSettings = await fetchCloudSettings(userId, email);
    if (cloudSettings) {
      if (cloudSettings.searchEngineId) {
        await AsyncStorage.setItem('@kite_search_engine', cloudSettings.searchEngineId);
      }
      if (cloudSettings.themeId && email) {
        await AsyncStorage.setItem(`@kite_theme_${email.toLowerCase()}`, cloudSettings.themeId);
        await AsyncStorage.setItem('@kite_theme', cloudSettings.themeId);
      }
      if (cloudSettings.bgImageUrl && email) {
        await AsyncStorage.setItem(`@kite_home_bg_${email.toLowerCase()}`, cloudSettings.bgImageUrl);
      }
      callbacks?.onSettingsLoaded?.(cloudSettings);
    } else {
      // Cloud chưa có settings -> lưu settings hiện tại của máy lên cloud
      const engine = await AsyncStorage.getItem('@kite_search_engine');
      const theme = email ? await AsyncStorage.getItem(`@kite_theme_${email.toLowerCase()}`) : null;
      const bg = email ? await AsyncStorage.getItem(`@kite_home_bg_${email.toLowerCase()}`) : null;
      saveCloudSettings(
        userId,
        {
          searchEngineId: engine || 'google',
          themeId: theme || 'light',
          bgImageUrl: bg || undefined,
        },
        email
      ).catch(() => {});
    }
  } catch (e) {
    console.warn('Lỗi đồng bộ settings:', e);
  }
}

