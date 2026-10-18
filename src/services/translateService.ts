/**
 * Dịch vụ Dịch trang web toàn diện In-Place (DOM TreeWalker) cho Kite Browser
 * - Giữ nguyên 100% URL gốc của website (không đổi thành *.translate.goog)
 * - Không tải lại (reload) trang web, không làm gián đoạn video/stream đang xem
 * - Tự động dịch các nội dung mới xuất hiện khi cuộn trang (Infinite Scroll / Dynamic SPA)
 * - Khôi phục ngôn ngữ gốc tức thì trong 0ms khi người dùng yêu cầu
 */

export interface TranslateItem {
  id: string;
  text: string;
}

export interface TranslatedUpdate {
  id: string;
  text: string;
}

// Bộ nhớ đệm dịch thuật in-memory để tái sử dụng ngay lập tức các cụm từ phổ biến (Menu, Trang chủ,...)
const translationCache = new Map<string, string>();
const MAX_CACHE_SIZE = 2500;

const DELIMITER = '\n===KITE===\n';

/**
 * Dịch một nhóm các chuỗi văn bản sang ngôn ngữ đích (mặc định 'vi') thông qua Google Translate API
 */
export const translateItemsBatch = async (
  items: TranslateItem[],
  targetLang: string = 'vi'
): Promise<TranslatedUpdate[]> => {
  if (!items || items.length === 0) return [];

  const results: TranslatedUpdate[] = [];
  const uncachedItems: TranslateItem[] = [];

  // 1. Kiểm tra cache trước để tiết kiệm network
  for (const item of items) {
    const trimmed = item.text.trim();
    if (translationCache.has(trimmed)) {
      const cached = translationCache.get(trimmed)!;
      // Khôi phục khoảng trắng đầu/cuối của node ban đầu
      const leadingSpace = item.text.match(/^\s*/)?.[0] || '';
      const trailingSpace = item.text.match(/\s*$/)?.[0] || '';
      results.push({ id: item.id, text: leadingSpace + cached + trailingSpace });
    } else {
      uncachedItems.push(item);
    }
  }

  if (uncachedItems.length === 0) {
    return results;
  }

  // 2. Chia các phần tử chưa cache thành các chunk nhỏ (tối đa 30 cụm từ hoặc 2.500 ký tự)
  const chunks: TranslateItem[][] = [];
  let curChunk: TranslateItem[] = [];
  let curLen = 0;

  for (const item of uncachedItems) {
    const itemLen = item.text.length;
    if (curChunk.length >= 30 || (curLen + itemLen > 2500 && curChunk.length > 0)) {
      chunks.push(curChunk);
      curChunk = [];
      curLen = 0;
    }
    curChunk.push(item);
    curLen += itemLen;
  }
  if (curChunk.length > 0) chunks.push(curChunk);

  // 3. Thực thi dịch từng chunk
  for (const chunk of chunks) {
    try {
      // Làm sạch xuống dòng nội bộ của từng cụm từ để tránh xung đột với delimiter
      const sanitizedTexts = chunk.map((it) => it.text.replace(/\r\n|\r|\n/g, ' ').trim());
      const combined = sanitizedTexts.join(DELIMITER);

      const apiUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(
        combined
      )}`;

      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok) {
        throw new Error(`Translate API error: ${response.status}`);
      }

      const json = await response.json();
      let fullTranslated = '';

      if (Array.isArray(json) && Array.isArray(json[0])) {
        fullTranslated = json[0].map((seg: any) => seg[0] || '').join('');
      }

      // Tách kết quả dựa trên delimiter
      const parts = fullTranslated
        .split(/(?:={2,}KITE={2,}|\\u003d\\u003d\\u003dKITE\\u003d\\u003d\\u003d)/i)
        .map((p) => p.trim());

      for (let i = 0; i < chunk.length; i++) {
        const origItem = chunk[i];
        const trimmedOrig = origItem.text.trim();
        const translatedPart = parts[i] || trimmedOrig;

        // Lưu vào cache
        if (translationCache.size < MAX_CACHE_SIZE) {
          translationCache.set(trimmedOrig, translatedPart);
        }

        const leadingSpace = origItem.text.match(/^\s*/)?.[0] || '';
        const trailingSpace = origItem.text.match(/\s*$/)?.[0] || '';
        results.push({
          id: origItem.id,
          text: leadingSpace + translatedPart + trailingSpace,
        });
      }
    } catch (e) {
      // Fallback giữ nguyên bản gốc nếu lỗi kết nối
      for (const origItem of chunk) {
        results.push({ id: origItem.id, text: origItem.text });
      }
    }
  }

  return results;
};

/**
 * Tạo mã JavaScript can thiệp DOM thông qua TreeWalker để trích xuất và thay thế văn bản trực tiếp trên trang
 */
export const getDomTranslationScript = (tabId: string): string => {
  return `
    (function() {
      try {
        if (window.__kiteIsTranslating) return;
        window.__kiteIsTranslating = true;
        window.__kiteIsTranslated = true;

        if (!window.__kiteNodeRegistry) {
          window.__kiteNodeRegistry = new Map();
        }

        // 1. Dùng TreeWalker duyệt tất cả các Node.TEXT_NODE hợp lệ
        var walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: function(node) {
              var parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;
              var tag = parent.tagName;
              if (/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|CODE|PRE|SVG|MATH|CANVAS|IFRAME)$/i.test(tag)) {
                return NodeFilter.FILTER_REJECT;
              }
              if (parent.closest && parent.closest('[translate="no"], .notranslate')) {
                return NodeFilter.FILTER_REJECT;
              }
              var val = (node.nodeValue || '').trim();
              if (!val || val.length < 2 || /^[\\d\\s.,:;!?\\-_#@/\\\\()\\[\\]{}|*+~\`^&%$€£¥]+$/.test(val)) {
                return NodeFilter.FILTER_SKIP;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );

        var pendingNodes = [];
        var node;
        var nodeIdCounter = window.__kiteNodeCounter || 0;

        while ((node = walker.nextNode())) {
          if (typeof node.__kite_orig_text === 'undefined') {
            node.__kite_orig_text = node.nodeValue;
          }
          if (!node.__kite_id) {
            nodeIdCounter++;
            node.__kite_id = 'kn_' + nodeIdCounter;
          }
          window.__kiteNodeRegistry.set(node.__kite_id, node);
          pendingNodes.push({ id: node.__kite_id, text: node.nodeValue });
        }
        window.__kiteNodeCounter = nodeIdCounter;

        if (pendingNodes.length === 0) {
          window.__kiteIsTranslating = false;
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'KITE_TRANSLATE_DONE',
              tabId: "${tabId}",
              count: 0
            }));
          }
          return;
        }

        // 2. Gom thành các batch gửi về React Native (khoảng 35 nodes hoặc 2500 ký tự)
        var batches = [];
        var curBatch = [];
        var curLen = 0;

        for (var i = 0; i < pendingNodes.length; i++) {
          var item = pendingNodes[i];
          var itemLen = item.text.length;
          if (curBatch.length >= 35 || (curLen + itemLen > 2500 && curBatch.length > 0)) {
            batches.push(curBatch);
            curBatch = [];
            curLen = 0;
          }
          curBatch.push(item);
          curLen += itemLen;
        }
        if (curBatch.length > 0) batches.push(curBatch);

        window.__kitePendingBatches = batches.length;
        window.__kiteTotalTranslatedCount = (window.__kiteTotalTranslatedCount || 0) + pendingNodes.length;

        // 3. Hàm nhận bản dịch từ React Native và áp dụng trực tiếp vào DOM
        window.__kiteApplyBatchTranslation = function(batchIndex, updates) {
          if (!Array.isArray(updates)) return;
          for (var u = 0; u < updates.length; u++) {
            var up = updates[u];
            if (up && up.id) {
              var n = window.__kiteNodeRegistry.get(up.id);
              if (n && typeof up.text === 'string' && up.text.length > 0) {
                n.nodeValue = up.text;
              }
            }
          }
          window.__kitePendingBatches--;
          if (window.__kitePendingBatches <= 0) {
            window.__kiteIsTranslating = false;
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'KITE_TRANSLATE_DONE',
                tabId: "${tabId}",
                count: window.__kiteTotalTranslatedCount
              }));
            }
          }
        };

        // 4. Gửi các batch qua React Native Bridge
        for (var b = 0; b < batches.length; b++) {
          (function(bIdx) {
            setTimeout(function() {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'KITE_TRANSLATE_BATCH',
                  tabId: "${tabId}",
                  batchIndex: bIdx,
                  totalBatches: batches.length,
                  items: batches[bIdx]
                }));
              }
            }, bIdx * 50);
          })(b);
        }

        // 5. Cài đặt MutationObserver để dịch tự động nội dung mới khi cuộn trang (Infinite Scroll / Dynamic SPA)
        if (!window.__kiteObserverInstalled) {
          window.__kiteObserverInstalled = true;
          var debounceTimer = null;

          var obs = new MutationObserver(function(mutations) {
            if (!window.__kiteIsTranslated) return;
            var hasNewNodes = false;
            for (var m = 0; m < mutations.length; m++) {
              if (mutations[m].addedNodes && mutations[m].addedNodes.length > 0) {
                hasNewNodes = true;
                break;
              }
            }
            if (!hasNewNodes) return;

            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function() {
              if (!window.__kiteIsTranslated || window.__kiteIsTranslating) return;
              window.__kiteTranslateDynamicNodes();
            }, 800);
          });

          obs.observe(document.body, { childList: true, subtree: true });

          window.__kiteTranslateDynamicNodes = function() {
            var dynWalker = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_TEXT,
              {
                acceptNode: function(node) {
                  if (typeof node.__kite_orig_text !== 'undefined') return NodeFilter.FILTER_SKIP;
                  var parent = node.parentElement;
                  if (!parent) return NodeFilter.FILTER_REJECT;
                  if (/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|CODE|PRE|SVG|MATH|CANVAS|IFRAME)$/i.test(parent.tagName)) {
                    return NodeFilter.FILTER_REJECT;
                  }
                  var val = (node.nodeValue || '').trim();
                  if (!val || val.length < 2 || /^[\\d\\s.,:;!?\\-_#@/\\\\()\\[\\]{}|*+~\`^&%$€£¥]+$/.test(val)) {
                    return NodeFilter.FILTER_SKIP;
                  }
                  return NodeFilter.FILTER_ACCEPT;
                }
              }
            );

            var newItems = [];
            var dNode;
            var c = window.__kiteNodeCounter || 0;
            while ((dNode = dynWalker.nextNode())) {
              dNode.__kite_orig_text = dNode.nodeValue;
              c++;
              dNode.__kite_id = 'kn_' + c;
              window.__kiteNodeRegistry.set(dNode.__kite_id, dNode);
              newItems.push({ id: dNode.__kite_id, text: dNode.nodeValue });
            }
            window.__kiteNodeCounter = c;

            if (newItems.length > 0) {
              var dynBatches = [];
              var dBatch = [];
              var dLen = 0;
              for (var k = 0; k < newItems.length; k++) {
                var it = newItems[k];
                if (dBatch.length >= 35 || (dLen + it.text.length > 2500 && dBatch.length > 0)) {
                  dynBatches.push(dBatch);
                  dBatch = [];
                  dLen = 0;
                }
                dBatch.push(it);
                dLen += it.text.length;
              }
              if (dBatch.length > 0) dynBatches.push(dBatch);

              window.__kitePendingBatches = (window.__kitePendingBatches || 0) + dynBatches.length;
              for (var db = 0; db < dynBatches.length; db++) {
                (function(bIndex) {
                  setTimeout(function() {
                    if (window.ReactNativeWebView) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'KITE_TRANSLATE_BATCH',
                        tabId: "${tabId}",
                        batchIndex: bIndex + 1000,
                        totalBatches: dynBatches.length,
                        items: dynBatches[bIndex]
                      }));
                    }
                  }, bIndex * 50);
                })(db);
              }
            }
          };
        }
      } catch (err) {}
    })();
    true;
  `;
};

/**
 * Khôi phục lại 100% nội dung gốc trong 0ms (không cần mạng, không tải lại trang)
 */
export const getRestoreOriginalScript = (): string => {
  return `
    (function() {
      try {
        window.__kiteIsTranslated = false;
        window.__kiteIsTranslating = false;
        if (window.__kiteNodeRegistry) {
          window.__kiteNodeRegistry.forEach(function(node) {
            if (node && typeof node.__kite_orig_text === 'string') {
              node.nodeValue = node.__kite_orig_text;
            }
          });
        }
      } catch (e) {}
    })();
    true;
  `;
};

// Kiểm tra xem một URL có phải là trang đang được dịch bởi Google Translate hay không (hỗ trợ tương thích ngược)
export const isGoogleTranslateUrl = (url?: string | null): boolean => {
  if (!url) return false;
  return (
    url.includes('translate.google.com/translate') ||
    url.includes('.translate.goog')
  );
};

// Trích xuất lại URL trang web ban đầu từ URL của Google Translate (nếu còn sót lại từ session cũ)
export const getOriginalUrlFromTranslateUrl = (url: string, fallback?: string): string => {
  if (!url) return fallback || '';
  try {
    const uMatch = url.match(/[?&]u=([^&#]+)/i);
    if (uMatch && uMatch[1]) {
      return decodeURIComponent(uMatch[1]);
    }
    const googMatch = url.match(/^https?:\/\/([^.]+)\.translate\.goog(.*)$/i);
    if (googMatch) {
      const rawDomain = googMatch[1];
      const cleanDomain = rawDomain
        .replace(/--/g, '__HYPHEN__')
        .replace(/-/g, '.')
        .replace(/__HYPHEN__/g, '-');
      let path = googMatch[2] || '';
      path = path.replace(/([?&])_x_tr_[^&=]+=[^&]*/g, '$1');
      path = path.replace(/[?&]$/, '').replace(/\\?&/, '?');
      return `https://${cleanDomain}${path}`;
    }
  } catch (e) {}
  return fallback || url;
};
