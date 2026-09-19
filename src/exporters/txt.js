/**
 * @file txt.js
 * Clean plain-text conversation exporter.
 * Section 16.6 of the authoritative specification.
 */

import { generateFilename } from '../core/utils/filename.js';
import { anonymizeConversation } from './pii.js';

/**
 * Formats a conversation into plain text.
 * @param {import('../core/conversation-model.js').Conversation} originalConversation
 * @param {Object} options
 * @returns {Promise<{ blob: Blob, filename: string, mime: string, previewText: string }>}
 */
export async function exportConversation(originalConversation, options = {}) {
  const { anonymizePii = false } = options;
  const conv = anonymizePii ? anonymizeConversation(originalConversation) : originalConversation;

  const lines = [];
  lines.push('====================================================');
  lines.push(conv.title.toUpperCase());
  lines.push(`Model: ${conv.model}`);
  lines.push(`Date: ${new Date(conv.createdAt).toLocaleString()}`);
  lines.push('====================================================\n');

  for (const msg of conv.messages) {
    const isUser = msg.role === 'user';
    const label = isUser ? '[You]' : `[${conv.model || 'Z.ai'}]`;

    lines.push(label);

    if (Array.isArray(msg.blocks) && msg.blocks.length > 0) {
      for (const block of msg.blocks) {
        if (block.kind === 'code') {
          lines.push(`\n--- Code (${block.language || 'text'}) ---`);
          lines.push(block.code);
          lines.push('------------------------\n');
        } else if (block.kind === 'math') {
          lines.push(`[Formula: ${block.tex}]`);
        } else if (block.kind === 'thinking') {
          lines.push(`[Thinking: ${block.text}]`);
        } else if (block.kind === 'citation') {
          lines.push(`[Source: ${block.title} - ${block.url}]`);
        } else {
          const raw = block.text || block.html?.replace(/<[^>]*>/g, '') || '';
          lines.push(raw);
        }
      }
    } else {
      lines.push(msg.text || '');
    }

    lines.push('\n----------------------------------------------------\n');
  }

  const content = lines.join('\n');
  const mime = 'text/plain;charset=utf-8';
  const blob = new Blob([content], { type: mime });

  const filename = generateFilename({
    template: options.template,
    title: conv.title,
    format: 'txt',
    model: conv.model,
    timestamp: conv.createdAt
  });

  return {
    blob,
    filename,
    mime,
    previewText: content
  };
}
