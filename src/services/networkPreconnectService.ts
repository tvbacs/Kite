/**
 * Dịch vụ Preconnect & DNS Prefetch chuẩn Google Chrome Mobile
 * 
 * Cơ chế hoạt động:
 * 1. Khi người dùng bắt đầu gõ vào thanh địa chỉ (Omnibox), thuật toán phân tích
 *    dự đoán tên miền mục tiêu (từ lịch sử, bookmark hoặc công cụ tìm kiếm).
 * 2. Kích hoạt sớm DNS Resolution & TCP/TLS Handshake trong nền (HEAD request siêu nhẹ, không tải body).
 * 3. Bộ nhớ đệm DNS hệ thống và TLS Session Ticket được làm ấm trước (Pre-warm).
 * 4. Khi người dùng nhấn Enter hoặc chạm vào gợi ý, WebView kết nối ngay lập tức (tiết kiệm 50ms - 150ms).
 */

const preconnectedHosts = new Map<string, number>();
const PRECONNECT_CACHE_TTL_MS = 60 * 1000; // 60 giây không preconnect lại cùng 1 host

/**
 * Trích xuất hostname sạch từ URL hoặc chuỗi nhập
 */
export function extractCleanHostname(urlOrHost: string): string | null {
  if (!urlOrHost || typeof urlOrHost !== 'string') return null;
  const trimmed = urlOrHost.trim().toLowerCase();
  if (!trimmed) return null;

  try {
    let toParse = trimmed;
    if (!toParse.startsWith('http://') && !toParse.startsWith('https://')) {
      toParse = 'https://' + toParse;
    }
    const u = new URL(toParse);
    const host = u.hostname;
    // Bỏ qua localhost, IP nội bộ hoặc host không hợp lệ
    if (!host || host === 'localhost' || host === '127.0.0.1' || !host.includes('.')) {
      return null;
    }
    return host;
  } catch (e) {
    // Fallback regex đơn giản
    const match = trimmed.match(/^([a-z0-9-]+(\.[a-z0-9-]+)+)/i);
    return match ? match[1].toLowerCase() : null;
  }
}

/**
 * Kiểm tra chuỗi nhập có phải là tên miền hợp lệ có đuôi TLD (.com, .vn, .st, .net...)
 */
export function isLikelyDomain(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  const text = input.trim().toLowerCase();
  if (/\s/.test(text)) return false;
  const hostPart = text.replace(/^https?:\/\//i, '').split('/')[0].split('?')[0];
  if (hostPart.includes('.') && !hostPart.startsWith('.') && !hostPart.endsWith('.')) {
    const parts = hostPart.split('.');
    const tld = parts[parts.length - 1];
    if (tld && tld.length >= 2 && /^[a-z]+$/.test(tld)) {
      return true;
    }
  }
  return false;
}

/**
 * Âm thầm gửi prefetch DNS & kết nối trước TLS tới host mục tiêu
 */
export function preconnectTarget(targetUrlOrHost: string): void {
  const host = extractCleanHostname(targetUrlOrHost);
  if (!host) return;

  const now = Date.now();
  const lastTime = preconnectedHosts.get(host);
  if (lastTime && now - lastTime < PRECONNECT_CACHE_TTL_MS) {
    // Đã preconnect trong vòng 60 giây qua
    return;
  }
  preconnectedHosts.set(host, now);

  // Dọn dẹp cache cũ nếu danh sách quá lớn
  if (preconnectedHosts.size > 100) {
    for (const [h, t] of preconnectedHosts.entries()) {
      if (now - t > PRECONNECT_CACHE_TTL_MS) {
        preconnectedHosts.delete(h);
      }
    }
  }

  // Chạy ngầm trong microtask, không bao giờ ảnh hưởng đến luồng giao diện chính (Main UI Thread)
  setTimeout(() => {
    try {
      const controller = new AbortController();
      // Timeout an toàn 1.8s để tự giải phóng socket nếu server phản hồi chậm
      const timer = setTimeout(() => {
        try {
          controller.abort();
        } catch (e) {}
      }, 1800);

      fetch(`https://${host}/`, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'Accept': 'text/html,*/*',
          'User-Agent': 'Mozilla/5.0 (Mobile; KiteBrowser/1.0)',
        },
      })
        .then(() => {
          clearTimeout(timer);
        })
        .catch(() => {
          clearTimeout(timer);
          // Các lỗi mạng, CORS hay Abort đều bỏ qua âm thầm, mục đích chính là làm ấm DNS và TLS
        });
    } catch (e) {
      // Bỏ qua hoàn toàn
    }
  }, 0);
}
