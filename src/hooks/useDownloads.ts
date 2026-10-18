import { useState, useEffect } from 'react';
import { Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { File, Paths } from 'expo-file-system';
import {
  ActiveDownloadItem,
  DownloadedItem,
  STORAGE_DOWNLOADS_KEY,
} from '../components/DownloadSheet';
import { DownloadDestination } from '../components/DownloadPromptModal';
import { DetectedMedia, BrowserTab } from '../types/browser';

interface UseDownloadsProps {
  activeTabId: string;
  currentTab: BrowserTab | undefined;
  showToast: (msg: string) => void;
}

// Trích xuất tên file sạch và đầy đủ phần mở rộng từ URL
export function extractFileNameFromUrl(downloadUrl: string, fallbackTitle?: string): string {
  if (!downloadUrl) return 'tep_tai_ve';

  let cleanName = '';
  const paramMatch = downloadUrl.match(/[?&](?:filename|file|title|name)=([^&]+)/i);
  if (paramMatch && paramMatch[1]) {
    try {
      cleanName = decodeURIComponent(paramMatch[1]);
    } catch (e) {
      cleanName = paramMatch[1];
    }
  }

  if (!cleanName || cleanName.toLowerCase() === 'proxy') {
    const innerUrlMatch = downloadUrl.match(/[?&]url=([^&]+)/i);
    if (innerUrlMatch && innerUrlMatch[1]) {
      try {
        const decodedInner = decodeURIComponent(innerUrlMatch[1]);
        const innerName = decodedInner.split('/').pop()?.split('?')[0];
        if (innerName && innerName.length > 2 && innerName.includes('.')) {
          cleanName = innerName;
        }
      } catch (e) {}
    }
  }

  if (!cleanName) {
    cleanName = downloadUrl.split('/').pop()?.split('?')[0] || '';
  }

  try {
    cleanName = decodeURIComponent(cleanName);
  } catch (e) {}

  const isGeneric =
    !cleanName || ['proxy', 'download', 'index', 'api', 'media', 'stream'].includes(cleanName.toLowerCase());
  if (isGeneric) {
    const pageTitle = (fallbackTitle || 'Video')
      .replace(/[/\\?%*:|"<>]/g, '_')
      .replace(/\s+/g, '_')
      .trim();
    const ext =
      downloadUrl.toLowerCase().includes('type=audio') || downloadUrl.toLowerCase().includes('mp3')
        ? 'mp3'
        : 'mp4';
    cleanName = `${pageTitle}_${Date.now().toString().slice(-4)}.${ext}`;
  }

  // Đảm bảo luôn có đuôi mở rộng phù hợp nếu tên chưa có (ví dụ [VidSnap]..._720p)
  if (!cleanName.includes('.')) {
    const isAudio =
      downloadUrl.toLowerCase().includes('type=audio') || downloadUrl.toLowerCase().includes('mp3');
    cleanName = `${cleanName}.${isAudio ? 'mp3' : 'mp4'}`;
  }

  // Làm sạch các ký tự không hợp lệ cho file trên hệ thống
  cleanName = cleanName.replace(/[/\\?%*:|"<>]/g, '_').trim();
  return cleanName || `file_${Date.now()}.mp4`;
}

// Kiểm tra xem một URL có phải là link tải file/proxy media trực tiếp hay không
export function isDownloadableUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();

  // Bỏ qua schemes không hợp lệ, data uri, about:blank
  if (lower.startsWith('about:') || lower.startsWith('data:') || lower.startsWith('javascript:')) {
    return false;
  }

  // Bỏ qua search engines và các mạng xã hội chính thức xem trực tiếp
  if (
    lower.includes('google.') ||
    lower.includes('bing.com') ||
    lower.includes('duckduckgo.com') ||
    lower.includes('yahoo.com') ||
    lower.includes('youtube.com') ||
    lower.includes('bilibili.com') ||
    lower.includes('facebook.com') ||
    lower.includes('instagram.com') ||
    lower.includes('tiktok.com')
  ) {
    return false;
  }

  // 1. URLs kết thúc bằng hoặc có phần mở rộng tệp tải về
  const fileExtRegex = /\.(mp4|mov|avi|mkv|webm|mp3|wav|flac|m4a|aac|zip|rar|7z|tar|gz|pdf|apk|dmg|iso|ipa|exe|docx|xlsx|pptx)(\?|$|#)/i;
  if (fileExtRegex.test(lower)) {
    return true;
  }

  // 2. Các trang web download video / proxy tải video (như vidsnaps.vercel.app, savefrom, tikmate, snapsave, v.v.)
  if (
    (lower.includes('/api/proxy') || lower.includes('/api/download') || lower.includes('/dl/') || lower.includes('/download/')) &&
    (lower.includes('url=') || lower.includes('link=')) &&
    (lower.includes('filename=') || lower.includes('type=video') || lower.includes('type=audio'))
  ) {
    return true;
  }

  // 3. URLs chứa tham số filename hoặc attachment kết hợp với video/audio/download/proxy
  if (
    /[?&](?:filename|attachment)=/i.test(lower) &&
    (lower.includes('video') || lower.includes('mp4') || lower.includes('mp3') || lower.includes('download') || lower.includes('proxy'))
  ) {
    return true;
  }

  return false;
}

export function useDownloads({ activeTabId, currentTab, showToast }: UseDownloadsProps) {
  const [downloadSheetVisible, setDownloadSheetVisible] = useState<boolean>(false);
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownloadItem[]>([]);
  const [videoDownloadSheetVisible, setVideoDownloadSheetVisible] = useState<boolean>(false);
  const [detectedMediaByTab, setDetectedMediaByTab] = useState<Record<string, DetectedMedia[]>>({});
  const activeDetectedMedia = detectedMediaByTab[activeTabId] || [];

  const [downloadPrompt, setDownloadPrompt] = useState<{
    url: string;
    fileName: string;
    sourceDomain: string;
  } | null>(null);
  const [chooseLocationModalVisible, setChooseLocationModalVisible] = useState<boolean>(false);
  const [completedDownload, setCompletedDownload] = useState<{
    id: string;
    fileName: string;
    uri: string;
    destination: DownloadDestination;
  } | null>(null);

  // 1. Tự động ẩn thanh đề xuất tải xuống sau 7 giây
  useEffect(() => {
    if (downloadPrompt && !chooseLocationModalVisible) {
      const timer = setTimeout(() => {
        setDownloadPrompt(null);
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [downloadPrompt, chooseLocationModalVisible]);

  // 2. Tự động ẩn thanh thông báo tải xong sau 6 giây
  useEffect(() => {
    if (completedDownload) {
      const timer = setTimeout(() => {
        setCompletedDownload(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [completedDownload]);

  // 3. Tự động ẩn quy trình khi đổi tab
  useEffect(() => {
    setDownloadPrompt(null);
    setCompletedDownload(null);
    setChooseLocationModalVisible(false);
  }, [activeTabId]);

  // Nhận diện tệp tải về từ web
  const handleFileDownload = async ({ nativeEvent }: { nativeEvent: { downloadUrl: string } }) => {
    const { downloadUrl } = nativeEvent;
    if (!downloadUrl) return;

    const cleanName = extractFileNameFromUrl(downloadUrl, currentTab?.title);

    let sourceDomain = '';
    try {
      sourceDomain = new URL(downloadUrl).hostname.replace(/^www\./, '');
    } catch (e) {
      if (currentTab?.url) {
        try {
          sourceDomain = new URL(currentTab.url).hostname.replace(/^www\./, '');
        } catch (err) {}
      }
    }
    if (!sourceDomain) sourceDomain = 'Trang web';

    setCompletedDownload(null);
    setDownloadPrompt({
      url: downloadUrl,
      fileName: cleanName,
      sourceDomain,
    });
  };

  // Tải media từ sniffer video
  const handleDownloadMedia = (media: DetectedMedia) => {
    let ext = 'mp4';
    if (media.format === 'audio') ext = 'mp3';
    else if (media.format === 'webm') ext = 'webm';
    else if (media.format === 'mov') ext = 'mov';
    else if (media.format === 'm4v') ext = 'm4v';
    else if (media.format === 'mkv') ext = 'mkv';

    let cleanName = (media.title || currentTab?.title || 'Video')
      .replace(/\s*[-|–—]\s*(Filmove|DonghuaWorld|Xem Phim|Phim Mới|Bilibili|YouTube|Anime|Trang chủ).*$/i, '')
      .replace(/[/\\?%*:|"<>]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleanName || cleanName === 'Video' || cleanName === 'Video không tên') {
      cleanName = `Video_${Date.now()}`;
    }
    if (!cleanName.toLowerCase().endsWith(`.${ext}`)) {
      cleanName = `${cleanName}.${ext}`;
    }

    let sourceDomain = '';
    try {
      sourceDomain = new URL(media.url).hostname.replace(/^www\./, '');
    } catch (e) {
      if (currentTab?.url) {
        try {
          sourceDomain = new URL(currentTab.url).hostname.replace(/^www\./, '');
        } catch (err) {}
      }
    }
    if (!sourceDomain) sourceDomain = 'Trang web';

    setCompletedDownload(null);
    setDownloadPrompt({
      url: media.url,
      fileName: cleanName,
      sourceDomain,
    });
  };

  // Xác nhận tải file
  const handleConfirmDownload = async (destinationType: DownloadDestination) => {
    if (!downloadPrompt) return;
    const { url, fileName } = downloadPrompt;
    setChooseLocationModalVisible(false);
    setDownloadPrompt(null);
    setCompletedDownload(null);

    const taskId = `task-${Date.now()}`;
    const cleanFileName = fileName || `file_${Date.now()}`;

    const newTask: ActiveDownloadItem = {
      id: taskId,
      fileName: cleanFileName,
      url,
      progress: 0,
      bytesWritten: 0,
      totalBytes: 0,
      status: 'downloading',
    };
    setActiveDownloads((prev) => [newTask, ...prev]);

    try {
      const destination = new File(Paths.document, cleanFileName);
      const downloadedFile = await (File as any).downloadFileAsync(url, destination, {
        idempotent: true,
        onProgress: (p: any) => {
          setActiveDownloads((prev) =>
            prev.map((item) => {
              if (item.id !== taskId) return item;
              const total = p.totalBytes > 0 ? p.totalBytes : 0;
              const percent = total > 0 ? Math.round((p.bytesWritten / total) * 100) : 0;
              return {
                ...item,
                bytesWritten: p.bytesWritten,
                totalBytes: total,
                progress: percent,
              };
            })
          );
        },
      });

      const actualName = (downloadedFile as any)?.name || cleanFileName;
      setActiveDownloads((prev) => prev.filter((item) => item.id !== taskId));

      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}

      try {
        const stored = await AsyncStorage.getItem(STORAGE_DOWNLOADS_KEY);
        const list: DownloadedItem[] = stored ? JSON.parse(stored) : [];
        const newItem: DownloadedItem = {
          id: `dl-${Date.now()}`,
          fileName: actualName,
          uri: downloadedFile.uri,
          fileSize: downloadedFile.size || 0,
          timestamp: Date.now(),
          sourceUrl: url,
        };
        const updated = [newItem, ...list.filter((i) => i.uri !== downloadedFile.uri)];
        await AsyncStorage.setItem(STORAGE_DOWNLOADS_KEY, JSON.stringify(updated));
      } catch (e) {}

      setCompletedDownload({
        id: taskId,
        fileName: actualName,
        uri: downloadedFile.uri,
        destination: destinationType,
      });

      // Nếu người dùng chọn lưu vào Files: mở ngay Share Sheet để lưu vào Tệp hoặc Cuộn camera
      if (destinationType === 'files') {
        try {
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(downloadedFile.uri);
          }
        } catch (e) {}
      }
    } catch (e) {
      setActiveDownloads((prev) => prev.filter((item) => item.id !== taskId));
      showToast(`Tải thất bại: ${cleanFileName}`);
    }
  };

  // Mở tệp qua Share Sheet
  const handleOpenIn = async (uri: string) => {
    setCompletedDownload(null);
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri);
      } else {
        await Share.share({ url: uri });
      }
    } catch (e) {
      console.warn('Cannot open in / share:', e);
    }
  };

  // Tải file trực tiếp tức thì (dành cho VidSnap, link tải video/media)
  const handleStartDirectDownload = async (downloadUrl: string) => {
    if (!downloadUrl) return;
    const cleanFileName = extractFileNameFromUrl(downloadUrl, currentTab?.title);
    showToast(`Đang tải: ${cleanFileName}...`);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}

    const taskId = `dl-${Date.now()}`;
    const newTask: ActiveDownloadItem = {
      id: taskId,
      fileName: cleanFileName,
      url: downloadUrl,
      progress: 0,
      bytesWritten: 0,
      totalBytes: 0,
      status: 'downloading',
    };
    setActiveDownloads((prev) => [newTask, ...prev]);

    try {
      const destination = new File(Paths.document, cleanFileName);
      const downloadedFile = await (File as any).downloadFileAsync(downloadUrl, destination, {
        idempotent: true,
        onProgress: (p: any) => {
          setActiveDownloads((prev) =>
            prev.map((item) => {
              if (item.id !== taskId) return item;
              const total = p.totalBytes > 0 ? p.totalBytes : 0;
              const percent = total > 0 ? Math.round((p.bytesWritten / total) * 100) : 0;
              return {
                ...item,
                bytesWritten: p.bytesWritten,
                totalBytes: total,
                progress: percent,
              };
            })
          );
        },
      });

      setActiveDownloads((prev) => prev.filter((item) => item.id !== taskId));

      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}

      showToast(`Đã tải xong: ${cleanFileName}`);

      // Lưu vào danh sách tải xuống
      try {
        const stored = await AsyncStorage.getItem(STORAGE_DOWNLOADS_KEY);
        const list: DownloadedItem[] = stored ? JSON.parse(stored) : [];
        const newItem: DownloadedItem = {
          id: `dl-${Date.now()}`,
          fileName: cleanFileName,
          uri: downloadedFile.uri,
          fileSize: downloadedFile.size || 0,
          timestamp: Date.now(),
          sourceUrl: downloadUrl,
        };
        const updated = [newItem, ...list.filter((i) => i.uri !== downloadedFile.uri)];
        await AsyncStorage.setItem(STORAGE_DOWNLOADS_KEY, JSON.stringify(updated));
      } catch (e) {}

      // Mở ngay Share Sheet của iOS (để người dùng bấm "Lưu video" vào Cuộn camera hoặc Lưu vào Tệp)
      try {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(downloadedFile.uri);
        }
      } catch (e) {}
    } catch (e) {
      setActiveDownloads((prev) => prev.filter((item) => item.id !== taskId));
      showToast(`Tải thất bại: ${cleanFileName}`);
    }
  };

  const handleOpenDownloads = () => {
    setDownloadSheetVisible(true);
  };

  return {
    downloadSheetVisible,
    setDownloadSheetVisible,
    activeDownloads,
    setActiveDownloads,
    videoDownloadSheetVisible,
    setVideoDownloadSheetVisible,
    detectedMediaByTab,
    setDetectedMediaByTab,
    activeDetectedMedia,
    downloadPrompt,
    setDownloadPrompt,
    chooseLocationModalVisible,
    setChooseLocationModalVisible,
    completedDownload,
    setCompletedDownload,
    handleFileDownload,
    handleStartDirectDownload,
    handleDownloadMedia,
    handleConfirmDownload,
    handleOpenIn,
    handleOpenDownloads,
  };
}
