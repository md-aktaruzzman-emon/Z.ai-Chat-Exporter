/**
 * @file html.js
 * Standalone UTF-8 HTML document exporter with embedded styles and zero external dependencies.
 * Section 16.5 of the authoritative specification.
 */

import { generateFilename } from '../core/utils/filename.js';
import { sanitizeHtml } from '../core/sanitize.js';
import { anonymizeConversation } from './pii.js';

/**
 * Builds standalone HTML with embedded styles.
 */
function buildStandaloneHtml(conv, theme) {
  const isDark = theme === 'dark';
  const bg = isDark ? '#111827' : '#f9fafb';
  const text = isDark ? '#f3f4f6' : '#111827';
  const border = isDark ? '#374151' : '#e5e7eb';
  const userBubble = isDark ? '#312e81' : '#eef2ff';
  const botBubble = isDark ? '#1f2937' : '#ffffff';

  let messagesHtml = '';
  for (const m of conv.messages) {
    const isUser = m.role === 'user';
    const roleName = isUser ? 'User' : conv.model || 'Z.ai Assistant';
    const bubbleBg = isUser ? userBubble : botBubble;

    let contentHtml = '';
    if (Array.isArray(m.blocks) && m.blocks.length > 0) {
      for (const block of m.blocks) {
        if (block.kind === 'code') {
          contentHtml += `<pre style="background:#1e1e2e; color:#cdd6f4; padding:12px; border-radius:6px; overflow-x:auto; font-size:13px;"><code>${block.code}</code></pre>`;
        } else if (block.kind === 'math') {
          contentHtml += `<div style="font-family:serif; font-style:italic; padding:8px 0; color:#4f46e5;">$$ ${block.tex} $$</div>`;
        } else if (block.kind === 'thinking') {
          contentHtml += `<details style="margin:8px 0; padding:8px 12px; background:rgba(0,0,0,0.05); border-radius:6px;"><summary style="cursor:pointer; color:#6b7280; font-size:12px;">Thinking Process</summary><div style="margin-top:6px; font-size:13px; color:#6b7280;">${block.text}</div></details>`;
        } else if (block.kind === 'table') {
          contentHtml += `<div style="overflow-x:auto; margin:10px 0;">${block.html}</div>`;
        } else if (block.kind === 'citation') {
          contentHtml += `<div style="font-size:12px; color:#2563eb; margin:4px 0;">🔗 <a href="${block.url}" target="_blank" style="color:inherit;">${block.title}</a> ${block.snippet ? `— <em>${block.snippet}</em>` : ''}</div>`;
        } else {
          contentHtml += block.html || `<p>${block.text}</p>`;
        }
      }
    } else {
      contentHtml = m.html || `<p>${m.text}</p>`;
    }

    messagesHtml += `
      <div style="margin-bottom: 24px; padding: 16px 20px; border-radius: 10px; background: ${bubbleBg}; border: 1px solid ${border};">
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: ${isUser ? '#4f46e5' : '#059669'};">${roleName}</div>
        <div style="font-size: 14px; line-height: 1.6;">${contentHtml}</div>
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
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: ${bg};
      color: ${text};
      margin: 0;
      padding: 40px 20px;
    }
    .container {
      max-width: 840px;
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
    }
    th, td {
      border: 1px solid ${border};
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background: rgba(0,0,0,0.04);
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
 * Exports conversation as a self-contained HTML document.
 * @param {import('../core/conversation-model.js').Conversation} originalConversation
 * @param {Object} options
 * @returns {Promise<{ blob: Blob, filename: string, mime: string, previewHtml: string }>}
 */
export async function exportConversation(originalConversation, options = {}) {
  const { anonymizePii = false, theme = 'light' } = options;
  const conv = anonymizePii ? anonymizeConversation(originalConversation) : originalConversation;

  const htmlContent = buildStandaloneHtml(conv, theme);
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
