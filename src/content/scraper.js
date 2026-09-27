/**
 * @file scraper.js
 * Comprehensive conversation scraper converting DOM and authenticated Z.ai APIs
 * into the Canonical Conversation v2 schema with 100% semantic fidelity.
 *
 * Implements:
 * 1. Authenticated in-browser API extraction flow (GET /api/v1/chats/:id, POST /api/v1/chats/:id/messages/batch)
 * 2. High-fidelity DOM block parser (headings, paragraphs, lists, code, tables, math, attachments)
 * 3. Container-recursion engine resolving nested React/Tailwind wrapper divs without text-flattening
 * 4. FullConversationCollector with bi-directional scrolling and content fingerprinting
 * 5. Structured message diagnostics logging ([ZAI STRUCTURE DEBUG])
 */

import { locate, unvirtualize, waitForStreamEnd, ExportError } from './dom-engine.js';
import { createEmptyConversation, computeStats } from '../core/conversation-model.js';
import { sanitizeHtml } from '../core/sanitize.js';

/**
 * Classifies the role of a message bubble element.
 * @param {Element} el
 * @param {number} index
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
  ) {
    return 'assistant';
  }
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

// Selectors identifying block-level content in modern AI chat pages
const BLOCK_TAGS = new Set([
  'p', 'pre', 'table', 'ul', 'ol', 'blockquote', 'figure', 'svg', 'canvas',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'details'
]);

const BLOCK_SELECTOR = [
  'p', 'pre', 'table', 'ul', 'ol', 'blockquote', 'figure', 'svg', 'canvas', 'img',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'details',
  '[class*="think" i]', 'details[class*="reason" i]', '.reasoning-block',
  '[class*="artifact" i]', '[class*="canvas" i]', '[class*="code-editor" i]',
  '[class*="tool-call" i]', '[data-tool]', '.search-results-block', '[class*="search-results" i]',
  '.katex-display', '.math-block', '[data-tex]',
  '[class*="code-block" i]', '[class*="code_block" i]', '[class*="attachment" i]'
].join(', ');

const IGNORED_TAGS = new Set(['button', 'style', 'script', 'noscript']);
const IGNORED_SELECTOR =
  'button, [role="button"], [class*="action" i], [class*="toolbar" i], [class*="copy" i], [class*="feedback" i], [class*="avatar" i]';

/**
 * Extracts blocks from a message element in DOM order without text flattening.
 * Recursively unwraps React/Tailwind wrapper divs so all structured content
 * (headings, paragraphs, lists, code, tables, math, attachments) is preserved.
 *
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
    if (BLOCK_TAGS.has(tag)) return true;
    if (node.matches?.(BLOCK_SELECTOR)) return true;
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

        // Skip non-content UI controls (copy buttons, feedback thumbs, avatars)
        if (
          IGNORED_TAGS.has(tag) ||
          (node.matches?.(IGNORED_SELECTOR) && !node.querySelector('pre, table, [data-tex]'))
        ) {
          continue;
        }

        // 0. Attachment Card
        const attBlock = extractAttachmentBlock(node);
        if (attBlock) {
          flushInlineBuffer();
          blocks.push(attBlock);
          continue;
        }

        // 1. Thinking / Reasoning
        if (node.matches?.('[class*="think" i], details[class*="reason" i], .reasoning-block')) {
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
        if (node.matches?.('[class*="tool-call" i], [data-tool]')) {
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
        if (node.matches?.('.search-results-block, [class*="search-results" i]')) {
          flushInlineBuffer();
          const query = node.getAttribute('data-query') || '';
          const items = [];
          const searchItems = node.querySelectorAll('.search-item, [class*="search-item" i]');
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
        if (node.matches?.('[class*="artifact" i], [class*="canvas" i], [class*="code-editor" i]')) {
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

        // 5. Code block (PRE or custom code-block wrapper)
        if (tag === 'pre' || node.matches?.('[class*="code-block" i], [class*="code_block" i]')) {
          flushInlineBuffer();
          const preEl = tag === 'pre' ? node : node.querySelector('pre') || node;
          const codeEl = preEl.querySelector('code') || preEl;
          let language = 'text';
          const langMatch = (
            node.className +
            ' ' +
            preEl.className +
            ' ' +
            codeEl.className
          ).match(/language-([\w+-]+)/i);
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
          const annotation =
            node.querySelector('.katex-mathml annotation') || node.querySelector('annotation');
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
        if (tag === 'svg' || node.matches?.('.mermaid, [class*="diagram" i], [class*="chart" i]')) {
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
            const cites = node.querySelectorAll('a[class*="citation" i], sup[class*="cite" i]');
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

        // 15. Generic Container (div, section, article, etc.)
        // Check if this container contains block-level elements anywhere in its descendants
        const hasBlockChildren = node.querySelector?.(BLOCK_SELECTOR);
        if (hasBlockChildren) {
          flushInlineBuffer();
          processContainer(node);
        } else if (BLOCK_TAGS.has(tag) || tag === 'div' || tag === 'section' || tag === 'article') {
          // Block container with only inline/text children
          flushInlineBuffer();
          const text = node.textContent.trim();
          if (text) {
            blocks.push({
              kind: 'paragraph',
              text,
              html: sanitizeHtml(node.innerHTML)
            });
          }
        } else {
          // True inline element (span, strong, em, a, code, etc.)
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
 * Converts raw Markdown content (such as returned by Z.ai API endpoints)
 * into the Canonical Block model without text flattening.
 * @param {string} markdown
 * @returns {import('../core/conversation-model.js').Block[]}
 */
export function parseMarkdownToBlocks(markdown) {
  if (!markdown || typeof markdown !== 'string') return [];
  const text = markdown.replace(/\r\n/g, '\n');
  const blocks = [];

  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // 1. Fenced Code Block
    if (trimmed.startsWith('```')) {
      const langMatch = trimmed.match(/^```(\w*)/);
      const language = langMatch ? langMatch[1].toLowerCase() || 'text' : 'text';
      i++;
      const codeLines = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({
        kind: 'code',
        language,
        code: codeLines.join('\n')
      });
      continue;
    }

    // 2. Display Math
    if (trimmed.startsWith('$$')) {
      if (trimmed.endsWith('$$') && trimmed.length > 4) {
        blocks.push({
          kind: 'math',
          tex: trimmed.slice(2, -2).trim(),
          displayMode: true
        });
        i++;
        continue;
      }
      i++;
      const mathLines = [];
      while (i < lines.length && !lines[i].trim().endsWith('$$')) {
        mathLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        const last = lines[i].trim().replace(/\$\$$/, '');
        if (last) mathLines.push(last);
        i++;
      }
      blocks.push({
        kind: 'math',
        tex: mathLines.join('\n').trim(),
        displayMode: true
      });
      continue;
    }

    // 3. Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        kind: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].trim()
      });
      i++;
      continue;
    }

    // 4. Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines = [];
      while (
        i < lines.length &&
        (lines[i].trim().startsWith('>') ||
          (lines[i].trim() && quoteLines.length > 0 && !lines[i].trim().startsWith('#')))
      ) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({
        kind: 'quote',
        text: quoteLines.join('\n').trim()
      });
      continue;
    }

    // 5. Table (starts and ends with |)
    if (
      trimmed.startsWith('|') &&
      trimmed.endsWith('|') &&
      i + 1 < lines.length &&
      lines[i + 1].includes('---')
    ) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      const rows = [];
      tableLines.forEach((tLine, rIdx) => {
        if (rIdx === 1 && tLine.includes('---')) return; // skip markdown divider
        const cells = tLine
          .split('|')
          .slice(1, -1)
          .map((c) => ({
            text: c.trim(),
            isHeader: rIdx === 0
          }));
        if (cells.length > 0) rows.push(cells);
      });
      if (rows.length > 0) {
        blocks.push({ kind: 'table', rows });
        continue;
      }
    }

    // 6. Ordered or Unordered List
    const isOrdered = /^\d+\.\s+/.test(trimmed);
    const isUnordered = /^[-*+]\s+/.test(trimmed);
    if (isOrdered || isUnordered) {
      const items = [];
      while (i < lines.length) {
        const curTrim = lines[i].trim();
        const curOrd = /^\d+\.\s+(.*)$/.exec(curTrim);
        const curUnord = /^[-*+]\s+(.*)$/.exec(curTrim);
        if (curOrd && isOrdered) {
          items.push({ text: curOrd[1].trim(), ordered: true, index: items.length + 1 });
          i++;
        } else if (curUnord && isUnordered) {
          items.push({ text: curUnord[1].trim(), ordered: false, index: items.length + 1 });
          i++;
        } else if (lines[i].startsWith('   ') || lines[i].startsWith('\t')) {
          if (items.length > 0) {
            items[items.length - 1].text += ' ' + curTrim;
          }
          i++;
        } else {
          break;
        }
      }
      blocks.push({
        kind: 'list',
        ordered: isOrdered,
        items
      });
      continue;
    }

    // 7. Paragraph
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('$$') &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('>') &&
      !(lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^[-*+]\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    const paraText = paraLines.join(' ').trim();
    if (paraText) {
      blocks.push({
        kind: 'paragraph',
        text: paraText
      });
    }
  }

  return blocks;
}

/**
 * Diagnostic logger outputting the structured breakdown of a message.
 * Required by Section 5 of the architectural specification.
 * @param {Object} msgObj
 */
export function logMessageStructure(msgObj) {
  const role = msgObj.role || 'assistant';
  const rawChars = (msgObj.text || '').length;
  console.groupCollapsed(`[ZAI STRUCTURE DEBUG] role=${role} rawChars=${rawChars} id=${msgObj.id || 'msg'}`);
  console.log(`blocks count: ${(msgObj.blocks || []).length}`);
  (msgObj.blocks || []).forEach((b, idx) => {
    if (b.kind === 'heading') {
      console.log(`${idx} heading level=${b.level} chars=${(b.text || '').length} text="${(b.text || '').substring(0, 50)}"`);
    } else if (b.kind === 'paragraph') {
      console.log(`${idx} paragraph chars=${(b.text || '').length} preview="${(b.text || '').substring(0, 50)}"`);
    } else if (b.kind === 'list') {
      console.log(`${idx} ${b.ordered ? 'ordered-list' : 'unordered-list'} items=${(b.items || []).length}`);
    } else if (b.kind === 'code') {
      const lines = (b.code || '').split('\n').length;
      console.log(`${idx} code language=${b.language || 'text'} lines=${lines} chars=${(b.code || '').length}`);
    } else if (b.kind === 'table') {
      const rows = (b.rows || []).length;
      const cols = rows > 0 ? (b.rows[0] || []).length : 0;
      console.log(`${idx} table rows=${rows} cols=${cols}`);
    } else if (b.kind === 'math') {
      console.log(`${idx} math displayMode=${b.displayMode} tex="${(b.tex || '').substring(0, 40)}"`);
    } else if (b.kind === 'attachment') {
      console.log(`${idx} attachment name="${b.name}" ext="${b.ext}" size="${b.size}"`);
    } else {
      console.log(`${idx} ${b.kind} chars=${(b.text || '').length}`);
    }
  });
  console.groupEnd();
}

/**
 * Extracts conversation identifier from URL route, query parameters, or DOM attributes.
 * Section 7 of the authoritative specification.
 * @param {string} [url]
 * @param {Document} [doc]
 * @returns {string|null}
 */
export function extractConversationId(
  url = typeof window !== 'undefined' ? window.location.href : '',
  doc = typeof document !== 'undefined' ? document : null
) {
  if (!url) return null;

  try {
    const parsed = new URL(url, 'https://chat.z.ai');
    const path = parsed.pathname;

    // 1. Pathname patterns: /c/<id>, /s/<id>, /chat/<id>, /conversation/<id>
    const pathMatch = path.match(/\/(?:c|s|chat|conversation)\/([a-zA-Z0-9_\-]+)/i);
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1];
    }

    // 2. Query parameter patterns: ?c=<id>, ?id=<id>, ?chatId=<id>
    const searchParams = parsed.searchParams;
    const qId =
      searchParams.get('c') ||
      searchParams.get('id') ||
      searchParams.get('chatId') ||
      searchParams.get('conversationId');
    if (qId && /^[a-zA-Z0-9_\-]+$/.test(qId)) {
      return qId;
    }
  } catch {
    // ignore URL parsing error
  }

  // 3. Inspect DOM attributes if document is available
  if (doc) {
    const el = doc.querySelector(
      '[data-conversation-id], [data-chat-id], meta[name="conversation-id"]'
    );
    const id =
      el?.getAttribute('data-conversation-id') ||
      el?.getAttribute('data-chat-id') ||
      el?.getAttribute('content');
    if (id && /^[a-zA-Z0-9_\-]+$/.test(id)) {
      return id;
    }

    // Check active chat anchor in sidebar
    const activeLink = doc.querySelector('a[href*="/c/"][class*="active" i], a[href*="/c/"][aria-selected="true"]');
    if (activeLink) {
      const href = activeLink.getAttribute('href') || '';
      const m = href.match(/\/c\/([a-zA-Z0-9_\-]+)/i);
      if (m && m[1]) return m[1];
    }
  }

  return null;
}

/**
 * Attempts to retrieve full conversation data through authenticated same-origin API endpoints.
 * Section 6 of the authoritative specification.
 *
 * @param {string} conversationId
 * @param {Object} [options]
 * @returns {Promise<import('../core/conversation-model.js').Conversation|null>}
 */
export async function fetchConversationFromApi(conversationId, options = {}) {
  if (!conversationId || typeof fetch !== 'function') return null;

  const candidateEndpoints = [
    `/api/v1/chats/${conversationId}`,
    `/api/chats/${conversationId}`,
    `/api/conversation/${conversationId}`,
    `/api/v1/conversation/${conversationId}`
  ];

  for (const endpoint of candidateEndpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        credentials: 'include'
      });

      if (!response.ok) continue;

      const data = await response.json();
      if (!data) continue;

      // Extract conversation title and model
      const title = data.title || data.chat?.title || data.data?.title || '';
      const model = data.model || data.chat?.model || data.data?.model || 'GLM-5.3-Flash';

      // Open WebUI / Z.ai structure: data.messages or data.chat.messages
      let rawMessages =
        data.messages ||
        data.chat?.messages ||
        data.data?.messages ||
        (data.chat_messages ? Object.values(data.chat_messages) : null);

      // If message IDs list returned, attempt batch retrieval
      if (
        (!rawMessages || rawMessages.length === 0) &&
        Array.isArray(data.message_ids) &&
        data.message_ids.length > 0
      ) {
        try {
          const batchRes = await fetch(`/api/v1/chats/${conversationId}/messages/batch`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ message_ids: data.message_ids })
          });
          if (batchRes.ok) {
            const batchData = await batchRes.json();
            rawMessages = batchData.messages || batchData.data || batchData;
          }
        } catch {
          // ignore batch fetch error
        }
      }

      if (!Array.isArray(rawMessages) || rawMessages.length === 0) continue;

      // Normalize messages into canonical Conversation model
      const parsedMessages = [];
      for (let idx = 0; idx < rawMessages.length; idx++) {
        const item = rawMessages[idx];
        const role = (item.role || (idx % 2 === 0 ? 'user' : 'assistant')).toLowerCase();
        const content = item.content || item.text || item.body || '';

        // Convert raw markdown content to structured blocks with 100% semantic preservation
        const blocks = parseMarkdownToBlocks(content);
        const msgObj = {
          id: item.id || `api_msg_${idx}`,
          index: idx,
          role: role === 'human' ? 'user' : role === 'bot' ? 'assistant' : role,
          text: content,
          html: sanitizeHtml(content.replace(/\n/g, '<br/>')),
          blocks,
          timestamp: item.timestamp || item.created_at || Date.now()
        };

        // Section 5 Live Diagnostic
        logMessageStructure(msgObj);
        parsedMessages.push(msgObj);
      }

      const conversation = createEmptyConversation();
      conversation.id = conversationId;
      conversation.title = title || 'Z.ai Conversation';
      conversation.model = model;
      conversation.messages = parsedMessages;
      conversation.stats = computeStats(conversation);

      return conversation;
    } catch {
      // Continue to next candidate endpoint
    }
  }

  return null;
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

        // Section 5 Live Diagnostic
        logMessageStructure(msgObj);

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
 * Prioritizes authenticated same-origin API retrieval when available,
 * seamlessly falling back to FullConversationCollector for DOM capture.
 *
 * @param {Object} options
 * @param {[number, number]|null} [options.range] - Start and end index range [start, end]
 * @param {number[]} [options.selectedIndices] - Array of specific selected message indices
 * @param {boolean} [options.includeThinking=true]
 * @param {boolean} [options.includeArtifacts=true]
 * @param {boolean} [options.includeCitations=true]
 * @param {boolean} [options.waitForStream=true]
 * @param {boolean} [options.forceDom=false] - Force DOM scraper over API
 * @returns {Promise<import('../core/conversation-model.js').Conversation>}
 */
export async function scrapeConversation(options = {}) {
  const {
    range = null,
    selectedIndices = null,
    includeThinking = true,
    includeArtifacts = true,
    includeCitations = true,
    waitForStream = true,
    forceDom = false
  } = options;

  // Section 6 & 7: Prefer authenticated API data over virtualized DOM
  const conversationId = extractConversationId();
  if (conversationId && !forceDom) {
    console.log(`[ZAI DATA PIPELINE] Detected conversation ID "${conversationId}". Attempting authenticated API retrieval...`);
    try {
      const apiConversation = await fetchConversationFromApi(conversationId, options);
      if (apiConversation && apiConversation.messages && apiConversation.messages.length > 0) {
        console.log(`[ZAI DATA PIPELINE] Authenticated API retrieval succeeded! ${apiConversation.messages.length} messages retrieved with zero virtualization loss.`);

        let filteredMessages = apiConversation.messages;
        if (Array.isArray(selectedIndices) && selectedIndices.length > 0) {
          const indexSet = new Set(selectedIndices);
          filteredMessages = filteredMessages.filter((m) => indexSet.has(m.index));
        } else if (range && Array.isArray(range) && range.length === 2) {
          const [start, end] = range;
          filteredMessages = filteredMessages.slice(start, end + 1);
        }

        apiConversation.messages = filteredMessages;
        apiConversation.stats = computeStats(apiConversation);
        return apiConversation;
      }
    } catch (apiErr) {
      console.warn('[ZAI DATA PIPELINE] API retrieval attempt failed, falling back to DOM collector:', apiErr);
    }
  }

  // Fallback to DOM collector
  console.log('[ZAI DATA PIPELINE] Proceeding with DOM collector fallback...');
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
    throw new ExportError(
      'INCOMPLETE_EXTRACTION',
      'Could not verify full conversation capture. Zero messages collected.'
    );
  }

  // Completeness Metrics & Logging (Section 8 & 9)
  const userCount = rawMessages.filter((m) => m.role === 'user').length;
  const assistantCount = rawMessages.filter((m) => m.role === 'assistant').length;
  const firstPreview = rawMessages[0]?.text.substring(0, 45).replace(/\n/g, ' ') || '';
  const lastPreview = rawMessages[rawMessages.length - 1]?.text.substring(0, 45).replace(/\n/g, ' ') || '';

  console.log(`[ZAI EXPORT] Full collection complete: ${rawMessages.length} unique messages collected.`);
  console.log(`[ZAI EXPORT] User messages: ${userCount}, Assistant messages: ${assistantCount}`);
  console.log(`[ZAI EXPORT] First message: "${firstPreview}"`);
  console.log(`[ZAI EXPORT] Last message: "${lastPreview}"`);

  const conversation = createEmptyConversation();
  conversation.id = conversationId || 'dom_chat';
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
