/**
 * @file scraper.js
 * Comprehensive conversation scraper converting DOM into Conversation v2 schema.
 * Section 12 of the authoritative specification.
 */

import { locate, unvirtualize, waitForStreamEnd, ExportError } from './dom-engine.js';
import { createEmptyConversation, computeStats } from '../core/conversation-model.js';
import { sanitizeHtml } from '../core/sanitize.js';

/**
 * Classifies the role of a message bubble element.
 * @param {Element} el
 * @returns {'user'|'assistant'|'system'|'tool'}
 */
export function classifyRole(el) {
  // 1. data-role attribute
  const dataRole = el.getAttribute('data-role');
  if (dataRole) {
    const r = dataRole.toLowerCase();
    if (['user', 'assistant', 'system', 'tool'].includes(r)) {
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
  if (className.includes('assistant') || className.includes('bot') || className.includes('ai'))
    return 'assistant';
  if (className.includes('tool')) return 'tool';
  if (className.includes('system')) return 'system';

  // 4. Alignment / layout heuristics (User usually aligned right)
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

  return 'assistant';
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

  function processNode(node) {
    if (!node || node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();

    // 1. Thinking / Reasoning
    if (node.matches?.('[class*="think"], details[class*="reason"], .reasoning-block')) {
      if (includeThinking) {
        const text = node.textContent.trim();
        if (text) {
          blocks.push({ kind: 'thinking', text });
        }
      }
      return;
    }

    // 2. Tool Calls
    if (node.matches?.('[class*="tool-call"], [data-tool]')) {
      const tool =
        node.getAttribute('data-tool') ||
        node.querySelector('.tool-name')?.textContent.trim() ||
        'Tool';
      const inputJson = node.querySelector('.tool-input')?.textContent.trim() || '{}';
      const outputSummary = node.querySelector('.tool-output')?.textContent.trim() || '';
      blocks.push({ kind: 'toolCall', tool, inputJson, outputSummary });
      return;
    }

    // 3. Search Results block
    if (node.matches?.('.search-results-block, [class*="search-results"]')) {
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
      return;
    }

    // 4. Artifacts / Canvas / Code Editor
    if (node.matches?.('[class*="artifact"], [class*="canvas"], [class*="code-editor"]')) {
      if (includeArtifacts) {
        const title =
          node.getAttribute('data-title') ||
          node.querySelector('h4, h3')?.textContent.trim() ||
          'Artifact';
        blocks.push({ kind: 'artifact', title, html: sanitizeHtml(node.innerHTML) });
      }
      return;
    }

    // 5. Code block (PRE)
    if (tag === 'pre') {
      const codeEl = node.querySelector('code') || node;
      let language = 'text';
      const langMatch = (node.className + ' ' + codeEl.className).match(/language-([\w+-]+)/i);
      if (langMatch) {
        language = langMatch[1].toLowerCase();
      }
      const rawCode = codeEl.textContent || '';
      blocks.push({ kind: 'code', language, code: rawCode });
      return;
    }

    // 6. Math display
    if (
      node.matches?.('.katex-display, .math-block, [data-tex]') ||
      node.classList?.contains('katex-display')
    ) {
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
        return;
      }
    }

    // 7. Table
    if (tag === 'table') {
      blocks.push({ kind: 'table', html: sanitizeHtml(node.outerHTML) });
      return;
    }

    // 8. Image / Figure
    if (tag === 'figure' || tag === 'img') {
      const img = tag === 'img' ? node : node.querySelector('img');
      if (img) {
        const src = img.getAttribute('src') || '';
        const alt = img.getAttribute('alt') || 'Image';
        const width = img.width || undefined;
        const height = img.height || undefined;
        const dataUrl = src.startsWith('data:') ? src : undefined;
        blocks.push({ kind: 'image', src, dataUrl, alt, width, height });
        return;
      }
    }

    // 9. Headings
    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag[1], 10);
      blocks.push({ kind: 'heading', level, text: node.textContent.trim() });
      return;
    }

    // 10. List (UL, OL)
    if (tag === 'ul' || tag === 'ol') {
      blocks.push({ kind: 'list', ordered: tag === 'ol', html: sanitizeHtml(node.outerHTML) });
      return;
    }

    // 11. Quote (BLOCKQUOTE)
    if (tag === 'blockquote') {
      blocks.push({ kind: 'quote', html: sanitizeHtml(node.outerHTML) });
      return;
    }

    // 12. Paragraph
    if (tag === 'p') {
      // Check for inline math spans inside paragraph
      const mathSpans = node.querySelectorAll('.katex, [data-tex], .math');
      for (const m of mathSpans) {
        let tex = '';
        const annotation = m.querySelector('.katex-mathml annotation');
        if (annotation && annotation.textContent.trim()) {
          tex = annotation.textContent.trim();
        } else if (m.getAttribute('data-tex')) {
          tex = m.getAttribute('data-tex').trim();
        } else {
          tex = m.textContent.trim();
        }
        if (tex) {
          blocks.push({ kind: 'math', tex, displayMode: false });
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
      blocks.push({ kind: 'paragraph', html: sanitizeHtml(node.outerHTML) });
      return;
    }

    // If container element (div, section, article, etc.)
    const hasBlockChildren = Array.from(node.children).some((child) => {
      const cTag = child.tagName.toLowerCase();
      return (
        [
          'p',
          'pre',
          'table',
          'ul',
          'ol',
          'blockquote',
          'figure',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'details'
        ].includes(cTag) ||
        child.matches?.(
          '[class*="think"], [class*="artifact"], [class*="tool-call"], .search-results-block, .katex-display'
        )
      );
    });

    if (hasBlockChildren) {
      for (const child of node.children) {
        processNode(child);
      }
    } else {
      const text = node.textContent.trim();
      if (text) {
        blocks.push({ kind: 'paragraph', html: sanitizeHtml(node.outerHTML) });
      }
    }
  }

  const directChildren = Array.from(element.children);
  if (directChildren.length > 0) {
    for (const child of directChildren) {
      processNode(child);
    }
  } else {
    processNode(element);
  }

  if (blocks.length === 0 && element.textContent.trim()) {
    blocks.push({
      kind: 'paragraph',
      html: sanitizeHtml(element.innerHTML)
    });
  }

  return blocks;
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

  if (loc.threadContainer) {
    await unvirtualize(loc.threadContainer);
  }

  let isStreamingTimedOut = false;
  if (waitForStream) {
    const finished = await waitForStreamEnd(10000);
    if (!finished) {
      isStreamingTimedOut = true;
    }
  }

  const conversation = createEmptyConversation();
  conversation.title = loc.title;
  conversation.model = loc.modelBadge;
  conversation.theme = loc.theme;

  const messages = [];
  const bubbles = loc.messageBubbles;

  for (let idx = 0; idx < bubbles.length; idx++) {
    const bubble = bubbles[idx];
    const role = classifyRole(bubble);
    const rawHtml = bubble.innerHTML;
    const sanitizedHtml = sanitizeHtml(rawHtml);
    const rawText = bubble.textContent?.trim() || '';

    const blocks = parseBlocks(bubble, {
      includeThinking,
      includeArtifacts,
      includeCitations
    });

    const isLast = idx === bubbles.length - 1;
    messages.push({
      index: idx,
      role,
      html: sanitizedHtml,
      text: rawText,
      blocks,
      timestamp: Date.now(),
      streaming: isLast && isStreamingTimedOut
    });
  }

  // Filter messages based on range or selectedIndices
  let filteredMessages = messages;
  if (Array.isArray(selectedIndices) && selectedIndices.length > 0) {
    const indexSet = new Set(selectedIndices);
    filteredMessages = messages.filter((m) => indexSet.has(m.index));
  } else if (range && Array.isArray(range) && range.length === 2) {
    const [start, end] = range;
    filteredMessages = messages.slice(start, end + 1);
  }

  conversation.messages = filteredMessages;
  conversation.stats = computeStats(conversation);

  return conversation;
}
