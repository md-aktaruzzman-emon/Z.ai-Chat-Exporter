/**
 * @file html.js
 * Standalone UTF-8 HTML document exporter with embedded styles, offline KaTeX, and zero external dependencies.
 * Section 16.5 of the authoritative specification.
 */

import { generateFilename } from '../core/utils/filename.js';
import { sanitizeHtml, isSafeUrl } from '../core/sanitize.js';
import { anonymizeConversation } from './pii.js';
import { renderMathToHtml } from '../core/math-renderer.js';
import { KATEX_CSS } from '../core/katex-css.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Builds standalone HTML with embedded styles, local KaTeX math, and responsive layouts.
 */
function buildStandaloneHtml(conv, theme) {
  const isDark = theme === 'dark';
  const bg = isDark ? '#111827' : '#f9fafb';
  const text = isDark ? '#f3f4f6' : '#111827';
  const border = isDark ? '#374151' : '#e5e7eb';
  const userBubble = isDark ? '#312e81' : '#eef2ff';
  const botBubble = isDark ? '#1f2937' : '#ffffff';
  const codeBg = isDark ? '#0f172a' : '#1e1e2e';

  let messagesHtml = '';
  for (const m of conv.messages) {
    const isUser = m.role === 'user';
    const roleName = isUser ? 'User' : conv.model || 'Z.ai Assistant';
    const bubbleBg = isUser ? userBubble : botBubble;

    let contentHtml = '';
    if (Array.isArray(m.blocks) && m.blocks.length > 0) {
      for (const block of m.blocks) {
        if (block.kind === 'code') {
          contentHtml += `<pre style="background:${codeBg}; color:#cdd6f4; padding:14px; border-radius:8px; overflow-x:auto; font-size:13px; line-height:1.5; font-family:Consolas, Monaco, 'Courier New', monospace;"><code>${escapeHtml(block.code)}</code></pre>`;
        } else if (block.kind === 'math') {
          // Render math formulas locally (zero external network / zero raw $$)
          const mathHtml = renderMathToHtml(block.tex, block.displayMode);
          contentHtml += `<div style="padding:10px 0; text-align:${block.displayMode ? 'center' : 'left'}; color:#4f46e5; margin:6px 0;" class="zaix-math">${mathHtml}</div>`;
        } else if (block.kind === 'heading') {
          const hSize = block.level === 1 ? '22px' : block.level === 2 ? '18px' : '16px';
          contentHtml += `<h${block.level || 2} style="font-size:${hSize}; font-weight:700; margin:16px 0 8px 0; color:${text};">${escapeHtml(block.text || '')}</h${block.level || 2}>`;
        } else if (block.kind === 'list') {
          contentHtml += `<div style="margin:10px 0;">${block.html}</div>`;
        } else if (block.kind === 'quote') {
          contentHtml += `<blockquote style="border-left:4px solid #4f46e5; padding-left:16px; margin:12px 0; color:#6b7280; font-style:italic;">${block.html || escapeHtml(block.text || '')}</blockquote>`;
        } else if (block.kind === 'image') {
          const src = block.dataUrl || block.src || '';
          contentHtml += `<div style="margin:14px 0; text-align:center;"><img src="${src}" alt="${escapeHtml(block.alt || 'Image')}" style="max-width:100%; height:auto; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.1);" />${block.caption ? `<div style="font-size:12px; color:#6b7280; margin-top:4px;">${escapeHtml(block.caption)}</div>` : ''}</div>`;
        } else if (block.kind === 'thinking') {
          contentHtml += `<details style="margin:10px 0; padding:10px 14px; background:rgba(100,116,139,0.08); border-radius:6px; border-left:3px solid #94a3b8;"><summary style="cursor:pointer; font-weight:600; color:#64748b; font-size:13px;">Thinking Process</summary><div style="margin-top:8px; font-size:13px; color:#64748b; line-height:1.5;">${escapeHtml(block.text)}</div></details>`;
        } else if (block.kind === 'table') {
          contentHtml += `<div style="overflow-x:auto; margin:14px 0;">${block.html}</div>`;
        } else if (block.kind === 'citation') {
          const safeHref = isSafeUrl(block.url) ? block.url : '#';
          contentHtml += `<div style="font-size:12px; color:#2563eb; margin:6px 0;">🔗 <a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="color:inherit; text-decoration:underline;">${escapeHtml(block.title)}</a> ${block.snippet ? `— <em>${escapeHtml(block.snippet)}</em>` : ''}</div>`;
        } else if (block.kind === 'artifact') {
          contentHtml += `<div style="margin:14px 0; padding:12px 16px; border:1px solid ${border}; border-radius:8px; background:rgba(0,0,0,0.02);"><div style="font-weight:600; font-size:13px; color:#64748b; margin-bottom:6px;">📦 ${escapeHtml(block.title || 'Artifact')}</div><div>${block.html}</div></div>`;
        } else {
          contentHtml += block.html || `<p>${escapeHtml(block.text)}</p>`;
        }
      }
    } else {
      contentHtml = m.html || `<p>${escapeHtml(m.text)}</p>`;
    }

    messagesHtml += `
      <div style="margin-bottom: 24px; padding: 18px 22px; border-radius: 12px; background: ${bubbleBg}; border: 1px solid ${border};">
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: ${isUser ? '#4f46e5' : '#059669'};">${roleName}</div>
        <div style="font-size: 14.5px; line-height: 1.6;">${contentHtml}</div>
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${sanitizeHtml(conv.title)}</title>
  <style>
    ${KATEX_CSS}
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans Bengali", Kalpurush, Roboto, Helvetica, Arial, sans-serif;
      background-color: ${bg};
      color: ${text};
      margin: 0;
      padding: 40px 20px;
    }
    .container {
      max-width: 860px;
      margin: 0 auto;
    }
    header {
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 1px solid ${border};
    }
    h1 {
      font-size: 26px;
      margin: 0 0 8px 0;
    }
    .meta {
      font-size: 13px;
      color: #6b7280;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0;
      font-size: 13.5px;
    }
    th, td {
      border: 1px solid ${border};
      padding: 9px 12px;
      text-align: left;
    }
    th {
      background: rgba(0,0,0,0.04);
      font-weight: 600;
    }
    ul, ol {
      padding-left: 24px;
      margin: 10px 0;
    }
    li {
      margin-bottom: 4px;
    }
    p {
      margin: 6px 0 10px 0;
      line-height: 1.6;
    }
    img, svg, canvas {
      max-width: 100%;
      height: auto;
    }
    @media print {
      body { background: white; color: black; padding: 0; }
      .container { max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${sanitizeHtml(conv.title)}</h1>
      <div class="meta">Model: ${sanitizeHtml(conv.model)} &bull; Exported: ${new Date(conv.createdAt).toLocaleString()}</div>
    </header>
    <main>
      ${messagesHtml}
    </main>
  </div>
</body>
</html>`;
}

/**
 * Exports conversation as a self-contained HTML document with embedded KaTeX CSS.
 * @param {import('../core/conversation-model.js').Conversation} originalConversation
 * @param {Object} options
 * @returns {Promise<{ blob: Blob, filename: string, mime: string, previewHtml: string }>}
 */
export async function exportConversation(originalConversation, options = {}) {
  const { anonymizePii = false, theme = 'auto' } = options;
  const conv = anonymizePii ? anonymizeConversation(originalConversation) : originalConversation;

  const resolvedTheme = theme === 'auto' || !theme ? conv.theme || 'light' : theme;
  const htmlContent = buildStandaloneHtml(conv, resolvedTheme);
  const mime = 'text/html;charset=utf-8';
  const blob = new Blob([htmlContent], { type: mime });

  const filename = generateFilename({
    template: options.template,
    title: conv.title,
    format: 'html',
    model: conv.model,
    timestamp: conv.createdAt
  });

  return {
    blob,
    filename,
    mime,
    previewHtml: htmlContent
  };
}
