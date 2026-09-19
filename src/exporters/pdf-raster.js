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
  const bg = isDark ? '#1a1a1f' : '#ffffff';
  const text = isDark ? '#f3f4f6' : '#1f2937';
  const border = isDark ? '#374151' : '#e5e7eb';
  const userBg = isDark ? '#262630' : '#f0f4ff';
  const botBg = isDark ? '#202026' : '#f9fafb';

  let messagesHtml = '';
  for (const m of conv.messages) {
    const isUser = m.role === 'user';
    const roleName = isUser ? 'You' : conv.model || 'Z.ai';
    messagesHtml += `
      <div style="margin-bottom: 20px; padding: 14px; border-radius: 8px; background: ${isUser ? userBg : botBg}; border: 1px solid ${border}; page-break-inside: avoid;">
        <div style="font-weight: bold; margin-bottom: 8px; color: ${isUser ? '#4f46e5' : '#059669'};">${sanitizeHtml(roleName)}</div>
        <div style="line-height: 1.6; font-size: 13px;">${m.html || sanitizeHtml(m.text || '')}</div>
      </div>
    `;
  }

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: ${bg}; color: ${text}; padding: 30px; width: 750px;">
      <h1 style="font-size: 22px; margin-bottom: 6px; border-bottom: 2px solid ${border}; padding-bottom: 10px;">${sanitizeHtml(conv.title)}</h1>
      <div style="font-size: 11px; color: #888; margin-bottom: 24px;">Model: ${sanitizeHtml(conv.model)} | Exported: ${new Date(conv.createdAt).toLocaleString()}</div>
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
  const { anonymizePii = false, theme = 'light', pageFormat = 'a4' } = options;
  const conv = anonymizePii ? anonymizeConversation(originalConversation) : originalConversation;

  const html = buildRenderHtml(conv, theme);
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  const opt = {
    margin: 10,
    filename: 'export.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: false },
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
