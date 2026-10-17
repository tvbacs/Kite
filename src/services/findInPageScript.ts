/**
 * Script tìm kiếm văn bản trong trang web (Ctrl + F / Find in page)
 * Tự động quét DOM, highlight kết quả bằng <mark> và cuộn tới vị trí kết quả.
 */

export const getFindInPageSearchScript = (query: string): string => {
  const escapedQuery = JSON.stringify(query);
  return `
(function() {
  try {
    const query = ${escapedQuery}.trim();

    // 1. Dọn dẹp các thẻ mark highlight cũ nếu có
    function clearHighlights() {
      const marks = document.querySelectorAll('mark.kite-find-highlight');
      marks.forEach(function(m) {
        const parent = m.parentNode;
        if (parent) {
          const textNode = document.createTextNode(m.textContent || '');
          parent.replaceChild(textNode, m);
          parent.normalize();
        }
      });
      window.__kiteFindMatches = [];
      window.__kiteFindIndex = -1;
    }

    clearHighlights();

    if (!query || query.length === 0) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'FIND_IN_PAGE_RESULT',
          total: 0,
          current: 0
        }));
      }
      return;
    }

    // 2. Tìm tất cả TextNode trong document body (bỏ qua script, style, textarea, input,...)
    const matches = [];
    const lowerQuery = query.toLowerCase();

    function shouldSkip(node) {
      if (!node || !node.parentElement) return true;
      const tag = node.parentElement.tagName ? node.parentElement.tagName.toLowerCase() : '';
      if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'textarea' || tag === 'input' || tag === 'select' || tag === 'mark') {
        return true;
      }
      if (node.parentElement.classList && node.parentElement.classList.contains('kite-find-highlight')) {
        return true;
      }
      return false;
    }

    // Duyệt cây DOM bằng TreeWalker để tối ưu hiệu năng
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          if (shouldSkip(node)) return NodeFilter.FILTER_REJECT;
          if (node.nodeValue && node.nodeValue.toLowerCase().indexOf(lowerQuery) !== -1) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        }
      },
      false
    );

    const nodesToReplace = [];
    let currentNode;
    while ((currentNode = walker.nextNode())) {
      nodesToReplace.push(currentNode);
    }

    // Thay thế các text nodes với thẻ <mark>
    nodesToReplace.forEach(function(node) {
      const parent = node.parentNode;
      if (!parent) return;

      const text = node.nodeValue || '';
      let remainingText = text;
      const frag = document.createDocumentFragment();

      while (remainingText.length > 0) {
        const idx = remainingText.toLowerCase().indexOf(lowerQuery);
        if (idx === -1) {
          frag.appendChild(document.createTextNode(remainingText));
          break;
        }

        if (idx > 0) {
          frag.appendChild(document.createTextNode(remainingText.substring(0, idx)));
        }

        const matchText = remainingText.substring(idx, idx + query.length);
        const mark = document.createElement('mark');
        mark.className = 'kite-find-highlight';
        mark.textContent = matchText;
        mark.style.backgroundColor = '#fff3a8';
        mark.style.color = '#111827';
        mark.style.padding = '1px 2px';
        mark.style.borderRadius = '2px';
        mark.style.outline = '1px solid rgba(0,0,0,0.15)';
        frag.appendChild(mark);
        matches.push(mark);

        remainingText = remainingText.substring(idx + query.length);
      }

      parent.replaceChild(frag, node);
    });

    window.__kiteFindMatches = matches;
    window.__kiteFindIndex = matches.length > 0 ? 0 : -1;

    // Highlight kết quả đầu tiên và cuộn đến đó
    if (matches.length > 0) {
      const first = matches[0];
      first.style.backgroundColor = '#ff9800';
      first.style.color = '#ffffff';
      first.style.outline = '2px solid #e65100';
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'FIND_IN_PAGE_RESULT',
        total: matches.length,
        current: matches.length > 0 ? 1 : 0
      }));
    }
  } catch (err) {
    console.error('FindInPage error:', err);
  }
})();
true;
`;
};

export const getFindInPageNextScript = (): string => `
(function() {
  try {
    const matches = window.__kiteFindMatches || [];
    if (!matches || matches.length === 0) return;

    const oldIndex = window.__kiteFindIndex;
    if (oldIndex >= 0 && matches[oldIndex]) {
      matches[oldIndex].style.backgroundColor = '#fff3a8';
      matches[oldIndex].style.color = '#111827';
      matches[oldIndex].style.outline = '1px solid rgba(0,0,0,0.15)';
    }

    let nextIndex = (oldIndex + 1) % matches.length;
    window.__kiteFindIndex = nextIndex;

    const current = matches[nextIndex];
    if (current) {
      current.style.backgroundColor = '#ff9800';
      current.style.color = '#ffffff';
      current.style.outline = '2px solid #e65100';
      current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'FIND_IN_PAGE_RESULT',
        total: matches.length,
        current: nextIndex + 1
      }));
    }
  } catch (err) {}
})();
true;
`;

export const getFindInPagePrevScript = (): string => `
(function() {
  try {
    const matches = window.__kiteFindMatches || [];
    if (!matches || matches.length === 0) return;

    const oldIndex = window.__kiteFindIndex;
    if (oldIndex >= 0 && matches[oldIndex]) {
      matches[oldIndex].style.backgroundColor = '#fff3a8';
      matches[oldIndex].style.color = '#111827';
      matches[oldIndex].style.outline = '1px solid rgba(0,0,0,0.15)';
    }

    let prevIndex = (oldIndex - 1 + matches.length) % matches.length;
    window.__kiteFindIndex = prevIndex;

    const current = matches[prevIndex];
    if (current) {
      current.style.backgroundColor = '#ff9800';
      current.style.color = '#ffffff';
      current.style.outline = '2px solid #e65100';
      current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'FIND_IN_PAGE_RESULT',
        total: matches.length,
        current: prevIndex + 1
      }));
    }
  } catch (err) {}
})();
true;
`;

export const getFindInPageClearScript = (): string => `
(function() {
  try {
    const marks = document.querySelectorAll('mark.kite-find-highlight');
    marks.forEach(function(m) {
      const parent = m.parentNode;
      if (parent) {
        const textNode = document.createTextNode(m.textContent || '');
        parent.replaceChild(textNode, m);
        parent.normalize();
      }
    });
    window.__kiteFindMatches = [];
    window.__kiteFindIndex = -1;

    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'FIND_IN_PAGE_RESULT',
        total: 0,
        current: 0
      }));
    }
  } catch (err) {}
})();
true;
`;
