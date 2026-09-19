/**
 * @file json.js
 * Full Conversation v2 structure JSON exporter.
 * Section 16.7 of the authoritative specification.
 */

import { generateFilename } from '../core/utils/filename.js';
import { anonymizeConversation } from './pii.js';

/**
 * Exports full Conversation v2 structure as formatted JSON.
 * @param {import('../core/conversation-model.js').Conversation} originalConversation
 * @param {Object} options
 * @returns {Promise<{ blob: Blob, filename: string, mime: string, previewText: string }>}
 */
export async function exportConversation(originalConversation, options = {}) {
  const { anonymizePii = false } = options;
  const conv = anonymizePii ? anonymizeConversation(originalConversation) : originalConversation;

  // Pretty printed with stable 2-space indentation
  const jsonContent = JSON.stringify(conv, null, 2);
  const mime = 'application/json;charset=utf-8';
  const blob = new Blob([jsonContent], { type: mime });

  const filename = generateFilename({
    template: options.template,
    title: conv.title,
    format: 'json',
    model: conv.model,
    timestamp: conv.createdAt
  });

  return {
    blob,
    filename,
    mime,
    previewText: jsonContent
  };
}
