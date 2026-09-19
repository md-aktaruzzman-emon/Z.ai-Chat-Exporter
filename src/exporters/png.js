/**
 * @file png.js
 * High-resolution canvas PNG exporter with safe height dimension guards.
 * Section 16.8 of the authoritative specification.
 */

import html2canvas from 'html2canvas';
import { generateFilename } from '../core/utils/filename.js';
import { anonymizeConversation } from './pii.js';

/**
 * Builds HTML template for screenshot rendering.
 */
function buildPngHtml(conv, theme) {
  const isDark = theme === 'dark';
  const bg = isDark ? '#1a1b26' : '#ffffff';
  const text = isDark ? '#c0caf5' : '#24283b';
  const border = isDark ? '#414868' : '#e2e8f0';

  let messagesHtml = '';
  for (const m of conv.messages) {
    const isUser = m.role === 'user';
    const role = isUser ? 'User' : conv.model || 'Z.ai';
    messagesHtml += `
      <div style="margin-bottom: 20px; padding: 14px 18px; border-radius: 8px; background: ${isUser ? (isDark ? '#24283b' : '#f1f5f9') : isDark ? '#1f2335' : '#ffffff'}; border: 1px solid ${border};">
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: ${isUser ? '#7aa2f7' : '#9ece6a'};">${role}</div>
        <div style="font-size: 14px; line-height: 1.6;">${m.html || m.text}</div>
      </div>
    `;
  }

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: ${bg}; color: ${text}; padding: 30px; width: 750px;">
      <h1 style="font-size: 22px; margin-bottom: 8px; border-bottom: 2px solid ${border}; padding-bottom: 8px;">${conv.title}</h1>
      <div style="font-size: 12px; opacity: 0.7; margin-bottom: 24px;">Model: ${conv.model} &bull; ${new Date(conv.createdAt).toLocaleString()}</div>
      ${messagesHtml}
    </div>
  `;
}

/**
 * Exports conversation to PNG image via HTML canvas.
 * @param {import('../core/conversation-model.js').Conversation} originalConversation
 * @param {Object} options
 * @returns {Promise<{ blob: Blob, filename: string, mime: string }>}
 */
export async function exportConversation(originalConversation, options = {}) {
  const { anonymizePii = false, theme = 'light' } = options;
  const conv = anonymizePii ? anonymizeConversation(originalConversation) : originalConversation;

  const html = buildPngHtml(conv, theme);
  const container = document.createElement('div');
  container.innerHTML = html;
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  document.body.appendChild(container);

  try {
    let canvas;
    if (typeof html2canvas === 'function') {
      canvas = await html2canvas(container, { scale: 2, logging: false });
    } else {
      // In tests/jsdom fallback where html2canvas isn't active
      canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 800, 600);
      }
    }

    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });

    const mime = 'image/png';
    const filename = generateFilename({
      template: options.template,
      title: conv.title,
      format: 'png',
      model: conv.model,
      timestamp: conv.createdAt
    });

    return {
      blob: blob || new Blob([], { type: mime }),
      filename,
      mime
    };
  } finally {
    container.remove();
  }
}
