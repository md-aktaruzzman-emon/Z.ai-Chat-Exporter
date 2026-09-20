/**
 * @file pdf-raster.js
 * Raster PDF generator using html2pdf.js / html2canvas in offscreen document.
 * Section 16.2 of the authoritative specification.
 */

import html2pdf from 'html2pdf.js';
import { generateFilename } from '../core/utils/filename.js';
import { sanitizeHtml } from '../core/sanitize.js';
import { anonymizeConversation } from './pii.js';

/**
 * Builds HTML markup for raster PDF rendering.
 */
function buildRenderHtml(conv, theme) {
  const isDark = theme === 'dark';
  const bg = isDark ? '#111827' : '#ffffff';
  const text = isDark ? '#f3f4f6' : '#1e293b';
  const border = isDark ? '#374151' : '#e2e8f0';
  const userBg = isDark ? '#1e1b4b' : '#f0f4ff';
  const botBg = isDark ? '#1f2937' : '#ffffff';
  const codeBg = isDark ? '#0f172a' : '#1e293b';
  const tableHeaderBg = isDark ? '#374151' : '#f1f5f9';

  let messagesHtml = '';
  for (const m of conv.messages) {
    const isUser = m.role === 'user';
    const roleName = isUser ? 'You' : conv.model || 'Z.ai Assistant';
    const bubbleBg = isUser ? userBg : botBg;
    const roleColor = isUser ? '#6366f1' : '#10b981';

    let contentHtml = '';
    if (Array.isArray(m.blocks) && m.blocks.length > 0) {
      for (const block of m.blocks) {
        if (block.kind === 'code') {
          contentHtml += `<pre style="background: ${codeBg}; color: #f8fafc; padding: 12px 14px; border-radius: 6px; font-family: Consolas, monospace; font-size: 12px; line-height: 1.5; margin: 10px 0; overflow-x: auto;"><code>${sanitizeHtml(block.code || '')}</code></pre>`;
        } else if (block.kind === 'math') {
          contentHtml += `<div style="font-family: serif; font-style: italic; padding: 8px 0; color: #6366f1; font-size: 14px;">$$ ${sanitizeHtml(block.tex || '')} $$</div>`;
        } else if (block.kind === 'thinking') {
          contentHtml += `<div style="margin: 8px 0; padding: 10px 14px; background: rgba(100,116,139,0.08); border-left: 3px solid #94a3b8; border-radius: 4px; font-size: 12px; color: #64748b; font-style: italic;"><strong>Thinking:</strong> ${sanitizeHtml(block.text || '')}</div>`;
        } else if (block.kind === 'table') {
          contentHtml += `<div style="overflow-x: auto; margin: 12px 0;">${block.html}</div>`;
        } else if (block.kind === 'image') {
          const src = block.dataUrl || block.src || '';
          contentHtml += `<div style="margin: 12px 0; text-align: center;"><img src="${src}" alt="${sanitizeHtml(block.alt || 'Image')}" style="max-width: 100%; height: auto; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" /></div>`;
        } else if (block.kind === 'quote') {
          contentHtml += `<blockquote style="border-left: 4px solid #6366f1; padding-left: 14px; margin: 10px 0; color: #64748b; font-style: italic;">${block.html || sanitizeHtml(block.text || '')}</blockquote>`;
        } else if (block.kind === 'heading') {
          const hSize = block.level === 1 ? '20px' : block.level === 2 ? '17px' : '15px';
          contentHtml += `<h${block.level || 2} style="font-size: ${hSize}; font-weight: bold; margin: 14px 0 6px 0; color: ${text};">${sanitizeHtml(block.text || '')}</h${block.level || 2}>`;
        } else if (block.kind === 'list') {
          contentHtml += `<div style="margin: 8px 0;">${block.html}</div>`;
        } else {
          contentHtml += block.html || `<p style="margin: 6px 0 10px 0; line-height: 1.6;">${sanitizeHtml(block.text || '')}</p>`;
        }
      }
    } else {
      contentHtml = m.html || `<p style="margin: 6px 0 10px 0; line-height: 1.6;">${sanitizeHtml(m.text || '')}</p>`;
    }

    messagesHtml += `
      <div style="margin-bottom: 22px; padding: 16px 18px; border-radius: 10px; background: ${bubbleBg}; border: 1px solid ${border}; page-break-inside: avoid;">
        <div style="font-weight: bold; font-size: 14px; margin-bottom: 8px; color: ${roleColor};">${sanitizeHtml(roleName)}</div>
        <div style="line-height: 1.6; font-size: 13.5px;" class="zaix-message-body">${contentHtml}</div>
      </div>
    `;
  }

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: ${bg}; color: ${text}; padding: 32px 36px; width: 750px; box-sizing: border-box;">
      <style>
        table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
        th, td { border: 1px solid ${border}; padding: 8px 10px; text-align: left; }
        th { background: ${tableHeaderBg}; font-weight: bold; }
        ul, ol { padding-left: 22px; margin: 8px 0; }
        li { margin-bottom: 4px; }
        p { margin: 6px 0 10px 0; line-height: 1.6; }
        h1, h2, h3, h4, h5, h6 { color: ${text}; margin: 12px 0 6px 0; }
        code { font-family: Consolas, monospace; font-size: 90%; background: rgba(100,116,139,0.12); padding: 2px 4px; border-radius: 3px; }
        pre code { background: none; padding: 0; }
        img, svg, canvas { max-width: 100%; height: auto; }
      </style>
      <div style="border-bottom: 2px solid ${border}; padding-bottom: 14px; margin-bottom: 24px;">
        <h1 style="font-size: 24px; font-weight: bold; margin: 0 0 6px 0; color: ${text};">${sanitizeHtml(conv.title)}</h1>
        <div style="font-size: 12px; color: #64748b;">Model: ${sanitizeHtml(conv.model)}  |  Exported: ${new Date(conv.createdAt).toLocaleString()}</div>
      </div>
      ${messagesHtml}
    </div>
  `;
}

/**
 * Exports conversation to Raster PDF via html2pdf.
 * @param {import('../core/conversation-model.js').Conversation} originalConversation
 * @param {Object} options
 * @returns {Promise<{ blob: Blob, filename: string, mime: string }>}
 */
export async function exportConversation(originalConversation, options = {}) {
  const { anonymizePii = false, theme = 'auto', pageFormat = 'a4' } = options;
  const conv = anonymizePii ? anonymizeConversation(originalConversation) : originalConversation;

  const resolvedTheme = theme === 'auto' || !theme ? conv.theme || 'light' : theme;
  const html = buildRenderHtml(conv, resolvedTheme);
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  const opt = {
    margin: 10,
    filename: 'export.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: pageFormat, orientation: 'portrait' }
  };

  try {
    const pdfBlob = await html2pdf().from(container).set(opt).output('blob');
    const filename = generateFilename({
      template: options.template,
      title: conv.title,
      format: 'pdf',
      model: conv.model,
      timestamp: conv.createdAt
    });

    return {
      blob: pdfBlob,
      filename,
      mime: 'application/pdf'
    };
  } finally {
    container.remove();
  }
}
