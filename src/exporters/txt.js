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
    const hasBlocks =
      Array.isArray(msg.blocks) &&
      msg.blocks.some((b) => {
        if (b.kind === 'paragraph' || b.kind === 'heading' || b.kind === 'quote') {
          return (
            (b.text && b.text.trim()) || (b.runs && b.runs.length > 0) || (b.html && b.html.trim())
          );
        }
        if (b.kind === 'code') return b.code && b.code.trim();
        if (b.kind === 'table') return b.rows && b.rows.length > 0;
        if (b.kind === 'list') return b.items && b.items.length > 0;
        if (b.kind === 'image') return b.src || b.dataUrl;
        if (b.kind === 'attachment') return b.name;
        if (b.kind === 'divider') return true;
        if (b.kind === 'thinking') return b.text && b.text.trim();
        return true;
      });
    const hasText = Boolean(msg.text && msg.text.trim());
    if (!hasBlocks && !hasText) {
      continue;
    }

    const isUser = msg.role === 'user';
    const label = isUser ? '[You]' : `[${conv.model || 'Z.ai'}]`;

    lines.push(label);

    if (Array.isArray(msg.blocks) && msg.blocks.length > 0) {
      for (const block of msg.blocks) {
        if (block.kind === 'code') {
          lines.push(`\n--- Code (${block.language || 'text'}) ---`);
          lines.push(block.code || '');
          lines.push('------------------------\n');
        } else if (block.kind === 'math') {
          lines.push(`[Formula: ${block.tex || ''}]`);
        } else if (block.kind === 'thinking') {
          lines.push(`[Thinking: ${block.text || ''}]`);
        } else if (block.kind === 'citation') {
          lines.push(`[Source: ${block.title || 'Source'} - ${block.url || ''}]`);
        } else if (block.kind === 'heading') {
          const prefix = '#'.repeat(Math.min(6, Math.max(1, block.level || 2)));
          lines.push(`\n${prefix} ${block.text || ''}\n`);
        } else if (block.kind === 'list') {
          if (Array.isArray(block.items) && block.items.length > 0) {
            for (let i = 0; i < block.items.length; i++) {
              const it = block.items[i];
              const bullet = block.ordered ? `${i + 1}. ` : '• ';
              const indent = '  '.repeat(it.depth || 0);
              lines.push(`${indent}${bullet}${it.text || it.html?.replace(/<[^>]*>/g, '') || ''}`);
            }
          } else {
            lines.push(block.text || block.html?.replace(/<[^>]*>/g, '') || '');
          }
        } else if (block.kind === 'table') {
          if (Array.isArray(block.rows) && block.rows.length > 0) {
            lines.push('');
            for (let rIdx = 0; rIdx < block.rows.length; rIdx++) {
              const row = block.rows[rIdx];
              const rowText = (Array.isArray(row) ? row : [])
                .map((cell) => (typeof cell === 'string' ? cell.trim() : cell.text?.trim() || ''))
                .join(' | ');
              lines.push(`| ${rowText} |`);
              if (rIdx === 0) {
                const separator = (Array.isArray(row) ? row : []).map(() => '---').join(' | ');
                lines.push(`| ${separator} |`);
              }
            }
            lines.push('');
          } else {
            lines.push(block.text || block.html?.replace(/<[^>]*>/g, '') || '');
          }
        } else if (block.kind === 'quote') {
          const qText = block.text || block.html?.replace(/<[^>]*>/g, '') || '';
          lines.push(
            qText
              .split('\n')
              .map((l) => `> ${l}`)
              .join('\n')
          );
        } else if (block.kind === 'divider') {
          lines.push('\n---\n');
        } else if (block.kind === 'attachment') {
          const sizePart = block.size ? ` (${block.size})` : '';
          lines.push(`[Attachment: ${block.name || 'file'}${sizePart}]`);
        } else if (block.kind === 'image') {
          lines.push(`[Image: ${block.alt || 'Visual Diagram'}]`);
        } else if (block.kind === 'toolCall') {
          lines.push(`[Tool: ${block.tool || 'tool'}]`);
        } else if (block.kind === 'artifact') {
          lines.push(`[Artifact: ${block.title || 'artifact'}]`);
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
  const mime = 'text/plain';
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
