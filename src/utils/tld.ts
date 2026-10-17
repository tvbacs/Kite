/**
 * Bộ phân giải tên miền chuẩn xử lý hoàn hảo các tên miền cấp cao kép (.com.vn, .edu.vn, .co.uk...)
 * Chạy thuần JavaScript, nhẹ, siêu nhanh và không phụ thuộc package ngoài gây lỗi Metro Bundler.
 */

const TWO_PART_TLDS = new Set([
  // Việt Nam
  'com.vn',
  'net.vn',
  'org.vn',
  'edu.vn',
  'gov.vn',
  'int.vn',
  'ac.vn',
  'biz.vn',
  'info.vn',
  'pro.vn',
  'name.vn',
  // Quốc tế phổ biến
  'co.uk',
  'org.uk',
  'me.uk',
  'ltd.uk',
  'plc.uk',
  'net.uk',
  'co.jp',
  'ne.jp',
  'or.jp',
  'ac.jp',
  'go.jp',
  'com.au',
  'net.au',
  'org.au',
  'edu.au',
  'com.sg',
  'edu.sg',
  'gov.sg',
  'com.tw',
  'org.tw',
  'edu.tw',
  'com.hk',
  'edu.hk',
  'gov.hk',
  'co.kr',
  'ne.kr',
  'or.kr',
  'co.id',
  'web.id',
  'ac.id',
  'com.my',
  'net.my',
  'org.my',
  'com.ph',
  'net.ph',
  'org.ph',
  'com.br',
  'net.br',
  'org.br',
  'co.za',
  'net.za',
  'org.za',
]);

/**
 * Trích xuất hostname từ chuỗi URL
 */
export function getHostname(urlStr: string): string {
  try {
    if (!urlStr) return '';
    const cleanUrl =
      urlStr.startsWith('http://') || urlStr.startsWith('https://')
        ? urlStr
        : `https://${urlStr}`;
    const u = new URL(cleanUrl);
    return u.hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Lấy tên miền gốc (ví dụ: phim.abc.com.vn -> abc.com.vn, sub.donghuaworld.com -> donghuaworld.com)
 */
export function getDomain(urlStr: string): string {
  const host = getHostname(urlStr);
  if (!host) return '';
  const parts = host.split('.');
  if (parts.length <= 2) return host;

  // Kiểm tra nếu 2 phần cuối là đuôi kép (như com.vn)
  const lastTwo = parts.slice(-2).join('.');
  if (TWO_PART_TLDS.has(lastTwo)) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

/**
 * Lấy nhãn chính của tên miền (bỏ các đuôi TLD) để so khớp từ khóa nhà cái
 * ví dụ: phim.abc.com.vn -> abc, hi88vn.com -> hi88vn
 */
export function getDomainWithoutSuffix(urlStr: string): string {
  const domain = getDomain(urlStr);
  if (!domain) return '';
  const parts = domain.split('.');
  return parts[0] || '';
}
