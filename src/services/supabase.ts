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

export async function fetchCloudBookmarks(userId: string): Promise<Bookmark[] | null> {
  try {
    const { data, error } = await supabase
      .from('kite_bookmarks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

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

export async function syncCloudBookmarks(userId: string, localBookmarks: Bookmark[]): Promise<boolean> {
  try {
    if (localBookmarks.length === 0) return true;

    const rows = localBookmarks.map((b) => ({
      id: b.id,
      user_id: userId,
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

export async function deleteCloudBookmark(userId: string, bookmarkId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('kite_bookmarks')
      .delete()
      .eq('user_id', userId)
      .eq('id', bookmarkId);

    return !error;
  } catch (e) {
    return false;
  }
}

/* =========================================================================
 * 3. ĐỒNG BỘ LỊCH SỬ DUYỆT WEB (HISTORY)
 * ========================================================================= */

export async function fetchCloudHistory(userId: string, limit = 100): Promise<HistoryItem[] | null> {
  try {
    const { data, error } = await supabase
      .from('kite_history')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(limit);

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

export async function addCloudHistoryItem(userId: string, item: HistoryItem): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('kite_history')
      .upsert({
        id: item.id,
        user_id: userId,
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

export async function clearCloudHistory(userId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('kite_history')
      .delete()
      .eq('user_id', userId);

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

export async function fetchCloudSettings(userId: string): Promise<CloudUserSettings | null> {
  try {
    const { data, error } = await supabase
      .from('kite_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

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

export async function saveCloudSettings(userId: string, settings: CloudUserSettings): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('kite_settings')
      .upsert({
        user_id: userId,
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

export async function fetchCloudProfile(userId: string): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from('kite_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      isLoggedIn: true,
      name: data.name,
      email: data.email,
      avatarUrl: data.avatar_url,
    };
  } catch (e) {
    return null;
  }
}

export async function upsertCloudProfile(userId: string, profile: UserProfile): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('kite_profiles')
      .upsert({
        id: userId,
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
