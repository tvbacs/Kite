/**
 * Script tìm kiếm văn bản trong trang web (Ctrl + F / Find in page)
 * Tự động quét DOM, highlight kết quả bằng <mark> và cuộn NGAY LẬP TỨC tới vị trí kết quả khi nhấn mũi tên.
 */

export const getFindInPageSearchScript = (query: string): string => {
  const escapedQuery = JSON.stringify(query);
  return `
(function() {
  try {
    const query = ${escapedQuery}.trim();

    function scrollToMatch(el) {
      if (!el) return;

      // 1. Thử API WebKit scrollIntoViewIfNeeded trước (rất mượt và chuẩn xác trên iOS)
      if (typeof el.scrollIntoViewIfNeeded === 'function') {
        try {
          el.scrollIntoViewIfNeeded(true);
        } catch (e) {}
      } else {
        try {
          el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
        } catch (e) {
          try { el.scrollIntoView(true); } catch (e2) {}
        }
      }

      // 2. Tính toán toạ độ bù trừ chính xác (tránh bị thanh tìm kiếm trên đỉnh hoặc bàn phím dưới đáy che)
      try {
        const rect = el.getBoundingClientRect();
        const scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
        const windowH = window.innerHeight || document.documentElement.clientHeight || 600;

        const targetY = scrollY + rect.top - Math.max(120, Math.floor(windowH * 0.35));
        const targetX = scrollX + rect.left - 40;

        window.scrollTo(Math.max(0, targetX), Math.max(0, targetY));
        if (document.scrollingElement) {
          document.scrollingElement.scrollTop = Math.max(0, targetY);
        }
        if (document.body) {
          document.body.scrollTop = Math.max(0, targetY);
        }
      } catch (err) {}
    }

    function setActiveHighlight(el) {
      if (!el) return;
      el.style.backgroundColor = '#ff6b00';
      el.style.color = '#ffffff';
      el.style.outline = '3px solid #ff6b00';
      el.style.boxShadow = '0 0 10px rgba(255, 107, 0, 0.9)';
      el.style.zIndex = '9999';
    }

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
        mark.style.display = 'inline-block';
        mark.style.backgroundColor = '#fff3a8';
        mark.style.color = '#111827';
        mark.style.padding = '1px 2px';
        mark.style.borderRadius = '3px';
        mark.style.outline = '1px solid rgba(0,0,0,0.18)';
        mark.style.scrollMargin = '150px 0';
        frag.appendChild(mark);
        matches.push(mark);

        remainingText = remainingText.substring(idx + query.length);
      }

      parent.replaceChild(frag, node);
    });

    window.__kiteFindMatches = matches;
    window.__kiteFindIndex = matches.length > 0 ? 0 : -1;

    // Highlight kết quả đầu tiên và cuộn NGAY ĐẾN ĐÓ
    if (matches.length > 0) {
      const first = matches[0];
      setActiveHighlight(first);
      scrollToMatch(first);
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

    function scrollToMatch(el) {
      if (!el) return;

      if (typeof el.scrollIntoViewIfNeeded === 'function') {
        try {
          el.scrollIntoViewIfNeeded(true);
        } catch (e) {}
      } else {
        try {
          el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
        } catch (e) {
          try { el.scrollIntoView(true); } catch (e2) {}
        }
      }

      try {
        const rect = el.getBoundingClientRect();
        const scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
        const windowH = window.innerHeight || document.documentElement.clientHeight || 600;

        const targetY = scrollY + rect.top - Math.max(120, Math.floor(windowH * 0.35));
        const targetX = scrollX + rect.left - 40;

        window.scrollTo(Math.max(0, targetX), Math.max(0, targetY));
        if (document.scrollingElement) {
          document.scrollingElement.scrollTop = Math.max(0, targetY);
        }
        if (document.body) {
          document.body.scrollTop = Math.max(0, targetY);
        }
      } catch (err) {}
    }

    const oldIndex = window.__kiteFindIndex;
    if (oldIndex >= 0 && matches[oldIndex]) {
      const prev = matches[oldIndex];
      prev.style.backgroundColor = '#fff3a8';
      prev.style.color = '#111827';
      prev.style.outline = '1px solid rgba(0,0,0,0.18)';
      prev.style.boxShadow = 'none';
      prev.style.zIndex = 'auto';
    }

    let nextIndex = (oldIndex + 1) % matches.length;
    window.__kiteFindIndex = nextIndex;

    const current = matches[nextIndex];
    if (current) {
      current.style.backgroundColor = '#ff6b00';
      current.style.color = '#ffffff';
      current.style.outline = '3px solid #ff6b00';
      current.style.boxShadow = '0 0 10px rgba(255, 107, 0, 0.9)';
      current.style.zIndex = '9999';

      // Cuộn NGAY LẬP TỨC tới kết quả
      scrollToMatch(current);
    }

    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'FIND_IN_PAGE_RESULT',
        total: matches.length,
        current: nextIndex + 1
      }));
    }
  } catch (err) {
    console.error('FindInPage next error:', err);
  }
})();
true;
`;

export const getFindInPagePrevScript = (): string => `
(function() {
  try {
    const matches = window.__kiteFindMatches || [];
    if (!matches || matches.length === 0) return;

    function scrollToMatch(el) {
      if (!el) return;

      if (typeof el.scrollIntoViewIfNeeded === 'function') {
        try {
          el.scrollIntoViewIfNeeded(true);
        } catch (e) {}
      } else {
        try {
          el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
        } catch (e) {
          try { el.scrollIntoView(true); } catch (e2) {}
        }
      }

      try {
        const rect = el.getBoundingClientRect();
        const scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
        const windowH = window.innerHeight || document.documentElement.clientHeight || 600;

        const targetY = scrollY + rect.top - Math.max(120, Math.floor(windowH * 0.35));
        const targetX = scrollX + rect.left - 40;

        window.scrollTo(Math.max(0, targetX), Math.max(0, targetY));
        if (document.scrollingElement) {
          document.scrollingElement.scrollTop = Math.max(0, targetY);
        }
        if (document.body) {
          document.body.scrollTop = Math.max(0, targetY);
        }
      } catch (err) {}
    }

    const oldIndex = window.__kiteFindIndex;
    if (oldIndex >= 0 && matches[oldIndex]) {
      const prev = matches[oldIndex];
      prev.style.backgroundColor = '#fff3a8';
      prev.style.color = '#111827';
      prev.style.outline = '1px solid rgba(0,0,0,0.18)';
      prev.style.boxShadow = 'none';
      prev.style.zIndex = 'auto';
    }

    let prevIndex = (oldIndex - 1 + matches.length) % matches.length;
    window.__kiteFindIndex = prevIndex;

    const current = matches[prevIndex];
    if (current) {
      current.style.backgroundColor = '#ff6b00';
      current.style.color = '#ffffff';
      current.style.outline = '3px solid #ff6b00';
      current.style.boxShadow = '0 0 10px rgba(255, 107, 0, 0.9)';
      current.style.zIndex = '9999';

      // Cuộn NGAY LẬP TỨC tới kết quả
      scrollToMatch(current);
    }

    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'FIND_IN_PAGE_RESULT',
        total: matches.length,
        current: prevIndex + 1
      }));
    }
  } catch (err) {
    console.error('FindInPage prev error:', err);
  }
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
