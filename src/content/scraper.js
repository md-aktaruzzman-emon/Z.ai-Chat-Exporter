/**
 * @file scraper.js
 * Comprehensive conversation scraper converting DOM into Conversation v2 schema.
 * Built with FullConversationCollector to handle virtualized DOM lists, lazy loading,
 * and bi-directional incremental scrolling without missing or duplicate messages.
 */

import { locate, unvirtualize, waitForStreamEnd, ExportError } from './dom-engine.js';
import { createEmptyConversation, computeStats } from '../core/conversation-model.js';
import { sanitizeHtml } from '../core/sanitize.js';

/**
 * Classifies the role of a message bubble element.
 * @param {Element} el
 * @returns {'user'|'assistant'|'system'|'tool'}
 */
export function classifyRole(el, index = 0) {
  if (!el) return index % 2 === 0 ? 'user' : 'assistant';

  // 1. data-role attribute or data-message-author-role or data-author
  const dataRole =
    el.getAttribute('data-role') ||
    el.getAttribute('data-message-author-role') ||
    el.getAttribute('data-author');
  if (dataRole) {
    const r = dataRole.toLowerCase();
    if (['user', 'human', 'assistant', 'bot', 'system', 'tool', 'ai'].includes(r)) {
      if (r === 'human') return 'user';
      if (r === 'bot' || r === 'ai') return 'assistant';
      return /** @type {'user'|'assistant'|'system'|'tool'} */ (r);
    }
  }

  // 2. Explicit role or aria attributes
  const roleAttr = el.getAttribute('role');
  if (roleAttr === 'user' || roleAttr === 'assistant') {
    return roleAttr;
  }

  // 3. Class name heuristics
  const className = (el.className || '').toString().toLowerCase();
  if (className.includes('user') || className.includes('human')) return 'user';
  if (
    className.includes('assistant') ||
    className.includes('bot') ||
    className.includes('ai') ||
    className.includes('agent')
  )
    return 'assistant';
  if (className.includes('tool')) return 'tool';
  if (className.includes('system')) return 'system';

  // 4. Check author badge, avatar, or name inside bubble
  const authorBadge = el.querySelector(
    '[class*="author" i], [class*="name" i], [class*="sender" i], [class*="user" i], [class*="avatar" i], img, svg'
  );
  if (authorBadge) {
    const badgeText = authorBadge.textContent?.trim().toLowerCase() || '';
    const badgeAlt = (
      authorBadge.getAttribute?.('alt') ||
      authorBadge.getAttribute?.('title') ||
      ''
    ).toLowerCase();
    const badgeClass = (authorBadge.className || '').toString().toLowerCase();

    if (
      badgeText === 'you' ||
      badgeText === 'user' ||
      badgeText === 'me' ||
      badgeAlt.includes('user') ||
      badgeClass.includes('user')
    ) {
      return 'user';
    }
    if (
      badgeText.includes('z.ai') ||
      badgeText.includes('assistant') ||
      badgeText.includes('ai') ||
      badgeAlt.includes('assistant') ||
      badgeAlt.includes('z.ai') ||
      badgeAlt.includes('bot') ||
      badgeClass.includes('assistant')
    ) {
      return 'assistant';
    }
  }

  // 5. Alignment / layout heuristics (User usually aligned right or flex-end)
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    try {
      const style = window.getComputedStyle(el);
      if (
        style.justifyContent === 'flex-end' ||
        style.alignSelf === 'flex-end' ||
        style.textAlign === 'right'
      ) {
        return 'user';
      }
    } catch {
      // ignore style reading errors
    }
  }

  // 6. Natural chat turn alternation fallback
  return index % 2 === 0 ? 'user' : 'assistant';
}

/**
 * Detects whether an element represents an uploaded file / attachment in Z.ai.
 * @param {Element} node
 * @returns {import('../core/conversation-model.js').AttachmentBlock|null}
 */
export function extractAttachmentBlock(node) {
  if (!node || node.nodeType !== 1) return null;

  const isAttachmentClass =
    node.matches?.(
      '[class*="attachment" i], [class*="file-item" i], [class*="file-card" i], [class*="uploaded-file" i], [data-file-name], [class*="file_" i]'
    ) ||
    node.getAttribute?.('data-testid')?.includes('attachment') ||
    node.getAttribute?.('data-testid')?.includes('file');

  const text = node.textContent?.trim() || '';
  const fileExtMatch = text.match(
    /\b([\w\s\-_().+]+\.(pdf|md|docx|doc|txt|png|jpg|jpeg|zip|py|js|json|csv))\b/i
  );

  if (
    isAttachmentClass ||
    (fileExtMatch &&
      (text.includes('MB') || text.includes('KB') || text.includes('PDF') || text.includes('File')) &&
      text.length < 250)
  ) {
    const fileName = fileExtMatch ? fileExtMatch[1].trim() : text.split('\n')[0].trim();
    const extMatch = fileName.match(/\.([a-z0-9]+)$/i);
    const ext = extMatch ? extMatch[1].toUpperCase() : 'FILE';

    const sizeMatch = text.match(/(\d+(?:\.\d+)?\s*(?:MB|KB|GB|B|bytes))\b/i);
    const sizeStr = sizeMatch ? sizeMatch[1].toUpperCase() : '';

    return {
      kind: 'attachment',
      name: fileName,
      ext,
      size: sizeStr,
      icon: ext === 'PDF' ? '📄' : ext === 'MD' ? '📝' : '📎'
    };
  }

  return null;
}

/**
 * Extracts blocks from a message element in DOM order, supporting all 14 block kinds.
 * Section 7 & 12 of the authoritative specification.
 * @param {Element} element
 * @param {Object} options
 * @returns {import('../core/conversation-model.js').Block[]}
 */
export function parseBlocks(element, options = {}) {
  const { includeThinking = true, includeArtifacts = true, includeCitations = true } = options;
  const blocks = [];

  function isBlockElement(node) {
    if (!node || node.nodeType !== 1) return false;
    const tag = node.tagName.toLowerCase();
    if (
      [
        'p',
        'pre',
        'table',
        'ul',
        'ol',
        'blockquote',
        'figure',
        'svg',
        'canvas',
        'img',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'hr',
        'details'
      ].includes(tag)
    ) {
      return true;
    }
    if (
      node.matches?.(
        'svg, canvas, img, .mermaid, [class*="diagram"], [class*="chart"], [class*="think"], details[class*="reason"], .reasoning-block, [class*="artifact"], [class*="canvas"], [class*="code-editor"], [class*="tool-call"], [data-tool], .search-results-block, [class*="search-results"], .katex-display, .math-block, [data-tex]'
      )
    ) {
      return true;
    }
    return false;
  }

  function processContainer(container) {
    if (!container) return;
    const childNodes = Array.from(container.childNodes);
    let inlineBuffer = [];

    function flushInlineBuffer() {
      if (inlineBuffer.length === 0) return;

      const wrapper = document.createElement('div');
      let textContent = '';
      for (const n of inlineBuffer) {
        wrapper.appendChild(n.cloneNode(true));
        const raw = n.nodeType === 3 ? n.textContent : n.textContent || '';
        if (raw) {
          if (
            textContent.length > 0 &&
            !/\s$/.test(textContent) &&
            !/^\s/.test(raw) &&
            !/^[,.:;!?')\]}]/.test(raw)
          ) {
            textContent += ' ';
          }
          textContent += raw;
        }
      }

      const trimmedText = textContent.trim();
      const hasContent = trimmedText.length > 0 || wrapper.querySelector('img, svg, canvas, br');

      if (hasContent) {
        if (trimmedText.includes('\n\n')) {
          const parts = trimmedText.split(/\n\s*\n/);
          for (const p of parts) {
            const pt = p.trim();
            if (pt) {
              blocks.push({
                kind: 'paragraph',
                text: pt,
                html: sanitizeHtml(pt.replace(/\n/g, '<br/>'))
              });
            }
          }
        } else {
          blocks.push({
            kind: 'paragraph',
            text: trimmedText,
            html: sanitizeHtml(wrapper.innerHTML)
          });
        }
      }
      inlineBuffer = [];
    }

    for (const node of childNodes) {
      if (node.nodeType === 3) {
        // Text node
        if (node.textContent.trim().length > 0 || inlineBuffer.length > 0) {
          inlineBuffer.push(node);
        }
      } else if (node.nodeType === 1) {
        const tag = node.tagName.toLowerCase();

        // 0. Attachment Card
        const attBlock = extractAttachmentBlock(node);
        if (attBlock) {
          flushInlineBuffer();
          blocks.push(attBlock);
          continue;
        }

        // 1. Thinking / Reasoning
        if (node.matches?.('[class*="think"], details[class*="reason"], .reasoning-block')) {
          flushInlineBuffer();
          if (includeThinking) {
            const text = node.textContent.trim();
            if (text) {
              blocks.push({ kind: 'thinking', text });
            }
          }
          continue;
        }

        // 2. Tool Calls
        if (node.matches?.('[class*="tool-call"], [data-tool]')) {
          flushInlineBuffer();
          const tool =
            node.getAttribute('data-tool') ||
            node.querySelector('.tool-name')?.textContent.trim() ||
            'Tool';
          const inputJson = node.querySelector('.tool-input')?.textContent.trim() || '{}';
          const outputSummary = node.querySelector('.tool-output')?.textContent.trim() || '';
          blocks.push({ kind: 'toolCall', tool, inputJson, outputSummary });
          continue;
        }

        // 3. Search Results block
        if (node.matches?.('.search-results-block, [class*="search-results"]')) {
          flushInlineBuffer();
          const query = node.getAttribute('data-query') || '';
          const items = [];
          const searchItems = node.querySelectorAll('.search-item, [class*="search-item"]');
          for (const item of searchItems) {
            const link = item.querySelector('a') || item;
            const title = link.textContent.trim();
            const url = link.getAttribute('href') || '';
            const snippet = item.querySelector('.snippet')?.textContent.trim() || '';
            items.push({ title, url, snippet });
            if (includeCitations && url) {
              blocks.push({ kind: 'citation', title, url, snippet });
            }
          }
          if (items.length > 0) {
            blocks.push({ kind: 'searchResult', query, results: items });
          }
          continue;
        }

        // 4. Artifacts / Canvas / Code Editor
        if (node.matches?.('[class*="artifact"], [class*="canvas"], [class*="code-editor"]')) {
          flushInlineBuffer();
          if (includeArtifacts) {
            const title =
              node.getAttribute('data-title') ||
              node.querySelector('h4, h3')?.textContent.trim() ||
              'Artifact';
            blocks.push({ kind: 'artifact', title, html: sanitizeHtml(node.innerHTML) });
          }
          continue;
        }

        // 5. Code block (PRE)
        if (tag === 'pre') {
          flushInlineBuffer();
          const codeEl = node.querySelector('code') || node;
          let language = 'text';
          const langMatch = (node.className + ' ' + codeEl.className).match(/language-([\w+-]+)/i);
          if (langMatch) {
            language = langMatch[1].toLowerCase();
          }
          const rawCode = codeEl.textContent || '';
          blocks.push({ kind: 'code', language, code: rawCode });
          continue;
        }

        // 6. Math display
        if (
          node.matches?.('.katex-display, .math-block, [data-tex]') ||
          node.classList?.contains('katex-display')
        ) {
          flushInlineBuffer();
          let tex = '';
          const annotation = node.querySelector('.katex-mathml annotation');
          if (annotation && annotation.textContent.trim()) {
            tex = annotation.textContent.trim();
          } else if (node.getAttribute('data-tex')) {
            tex = node.getAttribute('data-tex').trim();
          } else {
            tex = node.textContent.trim();
          }
          if (tex) {
            blocks.push({ kind: 'math', tex, displayMode: true });
            continue;
          }
        }

        // 7. Table with structured rows
        if (tag === 'table') {
          flushInlineBuffer();
          const trs = Array.from(node.querySelectorAll('tr'));
          const rows = trs.map((tr) => {
            return Array.from(tr.querySelectorAll('th, td')).map((cell) => ({
              text: cell.textContent.trim(),
              html: sanitizeHtml(cell.innerHTML),
              isHeader: cell.tagName.toLowerCase() === 'th',
              colspan: parseInt(cell.getAttribute('colspan') || '1', 10),
              rowspan: parseInt(cell.getAttribute('rowspan') || '1', 10)
            }));
          });
          blocks.push({
            kind: 'table',
            html: sanitizeHtml(node.outerHTML),
            rows
          });
          continue;
        }

        // 8. Canvas / Interactive Chart
        if (tag === 'canvas') {
          flushInlineBuffer();
          try {
            const dataUrl = node.toDataURL?.('image/png');
            if (dataUrl) {
              blocks.push({
                kind: 'image',
                src: dataUrl,
                dataUrl,
                alt: node.getAttribute('aria-label') || 'Chart / Canvas Drawing',
                width: node.width,
                height: node.height,
                aspectRatio: node.width / (node.height || 1)
              });
              continue;
            }
          } catch (err) {
            console.warn('[Scraper] Canvas capture error:', err);
          }
        }

        // 9. SVG / Mermaid Diagram / Visual Chart
        if (tag === 'svg' || node.matches?.('.mermaid, [class*="diagram"], [class*="chart"]')) {
          flushInlineBuffer();
          const svgEl = tag === 'svg' ? node : node.querySelector('svg');
          if (svgEl) {
            let svgStr = svgEl.outerHTML;
            if (!svgStr.includes('xmlns=')) {
              svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
            }
            const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svgStr)}`;
            const width = parseFloat(svgEl.getAttribute('width') || '0') || undefined;
            const height = parseFloat(svgEl.getAttribute('height') || '0') || undefined;
            blocks.push({
              kind: 'image',
              src: dataUrl,
              dataUrl,
              alt: svgEl.getAttribute('aria-label') || 'Diagram',
              width,
              height,
              aspectRatio: width && height ? width / height : undefined
            });
            continue;
          }
        }

        // 10. Image / Figure
        if (tag === 'figure' || tag === 'img') {
          flushInlineBuffer();
          const img = tag === 'img' ? node : node.querySelector('img');
          if (img) {
            const src = img.getAttribute('src') || '';
            const alt = img.getAttribute('alt') || 'Image';
            const width = img.width || undefined;
            const height = img.height || undefined;
            const dataUrl = src.startsWith('data:') ? src : undefined;
            blocks.push({ kind: 'image', src, dataUrl, alt, width, height });
            continue;
          }
        }

        // 11. Headings
        if (/^h[1-6]$/.test(tag)) {
          flushInlineBuffer();
          const level = parseInt(tag[1], 10);
          blocks.push({
            kind: 'heading',
            level,
            text: node.textContent.trim(),
            html: sanitizeHtml(node.innerHTML)
          });
          continue;
        }

        // 12. List (UL, OL) with individual items and depth support
        if (tag === 'ul' || tag === 'ol') {
          flushInlineBuffer();

          function extractListBlock(listNode, depth = 0) {
            const isOrd = listNode.tagName.toLowerCase() === 'ol';
            const lis = Array.from(listNode.querySelectorAll(':scope > li'));
            const items = [];
            const nestedListsToEmit = [];

            for (let idx = 0; idx < lis.length; idx++) {
              const li = lis[idx];
              const clone = li.cloneNode(true);
              const childLists = Array.from(clone.querySelectorAll(':scope > ul, :scope > ol'));
              childLists.forEach((n) => n.remove());

              items.push({
                text: clone.textContent.trim(),
                html: sanitizeHtml(clone.innerHTML),
                depth,
                ordered: isOrd,
                index: idx + 1
              });

              const directChildLists = Array.from(li.querySelectorAll(':scope > ul, :scope > ol'));
              for (const cl of directChildLists) {
                nestedListsToEmit.push(cl);
              }
            }

            blocks.push({
              kind: 'list',
              ordered: isOrd,
              html: sanitizeHtml(listNode.outerHTML),
              items:
                items.length > 0
                  ? items
                  : [{ text: listNode.textContent.trim(), html: sanitizeHtml(listNode.innerHTML), depth }]
            });

            for (const nl of nestedListsToEmit) {
              extractListBlock(nl, depth + 1);
            }
          }

          extractListBlock(node, 0);
          continue;
        }

        // 13. Quote (BLOCKQUOTE)
        if (tag === 'blockquote') {
          flushInlineBuffer();
          blocks.push({
            kind: 'quote',
            text: node.textContent.trim(),
            html: sanitizeHtml(node.outerHTML)
          });
          continue;
        }

        // 14. Paragraph
        if (tag === 'p') {
          flushInlineBuffer();

          const hasImg = node.querySelector('img, svg, canvas');
          if (hasImg && node.children.length === 1) {
            processContainer(node);
            continue;
          }

          const displayMathEl = node.querySelector('.katex-display, .math-block');
          if (displayMathEl && node.children.length === 1) {
            processContainer(node);
            continue;
          }

          const pText = node.textContent.trim();
          if (/^\$\$[\s\S]+\$\$$/.test(pText) || /^\\\[[\s\S]+\\\]$/.test(pText)) {
            const tex = pText.replace(/^\$\$|^\\\[|\$\$$|\\\]$/g, '').trim();
            if (tex) {
              blocks.push({ kind: 'math', tex, displayMode: true });
              continue;
            }
          }

          if (includeCitations) {
            const cites = node.querySelectorAll('a[class*="citation"], sup[class*="cite"]');
            for (const c of cites) {
              const href = c.getAttribute('href') || c.querySelector('a')?.getAttribute('href') || '';
              const title = c.textContent.trim();
              if (href) {
                blocks.push({ kind: 'citation', title, url: href });
              }
            }
          }

          blocks.push({
            kind: 'paragraph',
            text: pText,
            html: sanitizeHtml(node.outerHTML)
          });
          continue;
        }

        // Generic container node (div, section, article, etc.)
        if (isBlockElement(node) || Array.from(node.children).some(isBlockElement)) {
          flushInlineBuffer();
          processContainer(node);
        } else {
          inlineBuffer.push(node);
        }
      }
    }

    flushInlineBuffer();
  }

  processContainer(element);

  if (blocks.length === 0 && element.textContent.trim()) {
    blocks.push({
      kind: 'paragraph',
      text: element.textContent.trim(),
      html: sanitizeHtml(element.innerHTML)
    });
  }

  return blocks;
}

/**
 * Full Conversation Collector.
 * Performs bi-directional incremental scrolling, stable message fingerprinting,
 * in-memory message accumulation, and completeness validation for virtualized Z.ai chats.
 */
export class FullConversationCollector {
  constructor(options = {}) {
    this.options = options;
    this.collectedMap = new Map(); // id -> msgObj
    this.orderedIds = [];
  }

  /**
   * Generates a stable identity/fingerprint for a message bubble element.
   * @param {Element} bubble
   * @param {string} role
   * @returns {string}
   */
  getMessageIdentity(bubble, role) {
    if (!bubble) return `${role}:${Date.now()}:${Math.random()}`;

    // 1. Explicit DOM attributes
    const explicitId =
      bubble.getAttribute('data-message-id') ||
      bubble.getAttribute('data-id') ||
      bubble.getAttribute('id') ||
      bubble.getAttribute('data-key');
    if (explicitId && /^[\w\-:]{4,}$/.test(explicitId)) {
      return explicitId;
    }

    // 2. Content-based deterministic fingerprint
    const text = bubble.textContent?.trim() || '';
    const textLen = text.length;
    const startStr = text.substring(0, 45).replace(/\s+/g, ' ');
    const endStr = text.substring(Math.max(0, textLen - 45)).replace(/\s+/g, ' ');

    return `${role}:${textLen}:${startStr}:${endStr}`;
  }

  /**
   * Scrapes currently mounted bubbles in DOM and accumulates unique messages.
   * Preserves exact chronological conversation sequence via relative DOM positioning.
   * @returns {{ total: number, newCount: number, mounted: number }}
   */
  collectMountedBubbles(options = {}) {
    const loc = locate();
    const bubbles = loc.messageBubbles || [];
    let newCount = 0;

    const currentMountedIds = [];
    for (let idx = 0; idx < bubbles.length; idx++) {
      const bubble = bubbles[idx];
      const role = classifyRole(bubble, idx);
      const msgId = this.getMessageIdentity(bubble, role);
      currentMountedIds.push(msgId);
    }

    for (let idx = 0; idx < bubbles.length; idx++) {
      const bubble = bubbles[idx];
      const role = classifyRole(bubble, idx);
      const msgId = currentMountedIds[idx];

      if (!this.collectedMap.has(msgId)) {
        // Parse blocks immediately while element is mounted in DOM
        const blocks = parseBlocks(bubble, options);
        const rawHtml = bubble.innerHTML;
        const sanitizedHtml = sanitizeHtml(rawHtml);
        const rawText = bubble.textContent?.trim() || '';

        const msgObj = {
          id: msgId,
          role,
          html: sanitizedHtml,
          text: rawText,
          blocks,
          timestamp: Date.now()
        };

        this.collectedMap.set(msgId, msgObj);

        // Relative DOM sequence insertion
        let insertPos = -1;
        for (let j = idx + 1; j < currentMountedIds.length; j++) {
          const nextMountedId = currentMountedIds[j];
          const existingIdx = this.orderedIds.indexOf(nextMountedId);
          if (existingIdx !== -1) {
            insertPos = existingIdx;
            break;
          }
        }

        if (insertPos !== -1) {
          this.orderedIds.splice(insertPos, 0, msgId);
        } else {
          this.orderedIds.push(msgId);
        }

        newCount++;
      }
    }

    return { total: this.collectedMap.size, newCount, mounted: bubbles.length };
  }

  /**
   * Runs the full bi-directional incremental scrolling & accumulation loop.
   */
  async collectAll(container, options = {}) {
    const { maxScrollAttempts = 30, settleDelayMs = 250 } = options;

    // Initial scan
    this.collectMountedBubbles(options);

    if (!container || typeof container.scrollHeight !== 'number') {
      return this.getOrderedMessages();
    }

    const originalScrollTop = container.scrollTop;
    const isScrollable = container.scrollHeight > container.clientHeight;

    if (!isScrollable && typeof window !== 'undefined') {
      this.collectMountedBubbles(options);
      return this.getOrderedMessages();
    }

    // --- Upward Pass: Reach Oldest Message / Beginning ---
    let noProgressAttempts = 0;
    let attempts = 0;

    while (attempts < maxScrollAttempts && noProgressAttempts < 4) {
      attempts++;
      const currentTop = container.scrollTop;

      // Scroll up
      if (container === document.body || container === document.documentElement) {
        if (typeof window !== 'undefined') window.scrollBy(0, -600);
      } else {
        container.scrollTop = Math.max(0, container.scrollTop - Math.max(container.clientHeight * 0.85, 350));
      }
      container.dispatchEvent(new Event('scroll', { bubbles: true }));

      await new Promise((r) => setTimeout(r, settleDelayMs));

      const res = this.collectMountedBubbles(options);

      const isAtTop = container.scrollTop === 0;
      const scrollMoved = container.scrollTop !== currentTop;

      if (res.newCount > 0) {
        noProgressAttempts = 0;
      } else if (isAtTop || !scrollMoved) {
        noProgressAttempts++;
      }
    }

    // --- Downward Pass: Reach Newest Message / Ending ---
    noProgressAttempts = 0;
    attempts = 0;

    while (attempts < maxScrollAttempts && noProgressAttempts < 4) {
      attempts++;
      const currentTop = container.scrollTop;

      // Scroll down
      if (container === document.body || container === document.documentElement) {
        if (typeof window !== 'undefined') window.scrollBy(0, 600);
      } else {
        container.scrollTop = Math.min(
          container.scrollHeight,
          container.scrollTop + Math.max(container.clientHeight * 0.85, 350)
        );
      }
      container.dispatchEvent(new Event('scroll', { bubbles: true }));

      await new Promise((r) => setTimeout(r, settleDelayMs));

      const res = this.collectMountedBubbles(options);

      const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 10;
      const scrollMoved = container.scrollTop !== currentTop;

      if (res.newCount > 0) {
        noProgressAttempts = 0;
      } else if (isAtBottom || !scrollMoved) {
        noProgressAttempts++;
      }
    }

    // Restore user original scroll position
    try {
      container.scrollTop = originalScrollTop;
    } catch {
      // ignore
    }

    return this.getOrderedMessages();
  }

  /**
   * Returns accumulated messages array indexed in order.
   */
  getOrderedMessages() {
    const list = [];
    let idx = 0;
    for (const id of this.orderedIds) {
      const msg = this.collectedMap.get(id);
      if (msg) {
        list.push({
          ...msg,
          index: idx++
        });
      }
    }
    return list;
  }
}

/**
 * Scrapes the complete open conversation into a Conversation v2 model.
 *
 * @param {Object} options
 * @param {[number, number]|null} [options.range] - Start and end index range [start, end]
 * @param {number[]} [options.selectedIndices] - Array of specific selected message indices
 * @param {boolean} [options.includeThinking=true]
 * @param {boolean} [options.includeArtifacts=true]
 * @param {boolean} [options.includeCitations=true]
 * @param {boolean} [options.waitForStream=true]
 * @returns {Promise<import('../core/conversation-model.js').Conversation>}
 */
export async function scrapeConversation(options = {}) {
  const {
    range = null,
    selectedIndices = null,
    includeThinking = true,
    includeArtifacts = true,
    includeCitations = true,
    waitForStream = true
  } = options;

  const loc = locate();
  if (!loc.ok || loc.messageBubbles.length === 0) {
    throw new ExportError('LOCATE_FAILED', 'Could not find conversation messages in current DOM');
  }

  // Detect which message is visible in viewport before scrolling if 'from_here' is requested
  let fromHereStartIndex = 0;
  if (range === 'from_here' && typeof window !== 'undefined') {
    const vh = window.innerHeight || document.documentElement.clientHeight || 800;
    const idx = loc.messageBubbles.findIndex((b) => {
      const r = b.getBoundingClientRect();
      return r.bottom > 0 && r.top < vh;
    });
    if (idx !== -1) {
      fromHereStartIndex = idx;
    }
  }

  if (waitForStream) {
    await waitForStreamEnd(10000);
  }

  // Use FullConversationCollector to traverse virtualized DOM list & accumulate complete chat
  const collector = new FullConversationCollector(options);
  const rawMessages = await collector.collectAll(loc.threadContainer, {
    maxScrollAttempts: 30,
    settleDelayMs: 200,
    includeThinking,
    includeArtifacts,
    includeCitations
  });

  if (rawMessages.length === 0) {
    throw new ExportError('INCOMPLETE_EXTRACTION', 'Could not verify full conversation capture. Zero messages collected.');
  }

  // Completeness Metrics & Logging
  const userCount = rawMessages.filter((m) => m.role === 'user').length;
  const assistantCount = rawMessages.filter((m) => m.role === 'assistant').length;
  const firstPreview = rawMessages[0]?.text.substring(0, 45).replace(/\n/g, ' ') || '';
  const lastPreview = rawMessages[rawMessages.length - 1]?.text.substring(0, 45).replace(/\n/g, ' ') || '';

  console.log(`[ZAI EXPORT] Full collection complete: ${rawMessages.length} unique messages collected.`);
  console.log(`[ZAI EXPORT] User messages: ${userCount}, Assistant messages: ${assistantCount}`);
  console.log(`[ZAI EXPORT] First message: "${firstPreview}"`);
  console.log(`[ZAI EXPORT] Last message: "${lastPreview}"`);

  const conversation = createEmptyConversation();
  conversation.title = loc.title;
  conversation.model = loc.modelBadge;
  conversation.theme = loc.theme;

  // Filter messages based on range or selectedIndices
  let filteredMessages = rawMessages;
  if (Array.isArray(selectedIndices) && selectedIndices.length > 0) {
    const indexSet = new Set(selectedIndices);
    filteredMessages = rawMessages.filter((m) => indexSet.has(m.index));
  } else if (range === 'from_here') {
    filteredMessages = rawMessages.slice(fromHereStartIndex);
  } else if (range && Array.isArray(range) && range.length === 2) {
    const [start, end] = range;
    filteredMessages = rawMessages.slice(start, end + 1);
  }

  conversation.messages = filteredMessages;
  conversation.stats = computeStats(conversation);

  return conversation;
}
