/**
 * @file csv.js
 * Message-by-message CSV exporter with strict RFC 4180 quoting.
 * Section 16.9 of the authoritative specification.
 */

import { generateFilename } from '../core/utils/filename.js';
import { anonymizeConversation } from './pii.js';

/**
 * Escapes a cell value for CSV (RFC 4180 compliant).
 * @param {string|number|boolean} value
 * @returns {string}
 */
function escapeCsv(value) {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Exports conversation messages to CSV.
 * @param {import('../core/conversation-model.js').Conversation} originalConversation
 * @param {Object} options
 * @returns {Promise<{ blob: Blob, filename: string, mime: string, previewText: string }>}
 */
export async function exportConversation(originalConversation, options = {}) {
  const { anonymizePii = false } = options;
  const conv = anonymizePii ? anonymizeConversation(originalConversation) : originalConversation;

  const headers = [
    'index',
    'role',
    'timestamp',
    'text',
    'wordCount',
    'charCount',
    'hasCode',
    'hasMath',
    'hasTable',
    'hasImage',
    'citationCount'
  ];

  const rows = [headers.join(',')];

  for (const msg of conv.messages) {
    const text = msg.text || '';
    const charCount = text.length;
    const words = text.trim().match(/\S+/g);
    const wordCount = words ? words.length : 0;

    let hasCode = false;
    let hasMath = false;
    let hasTable = false;
    let hasImage = false;
    let citationCount = 0;

    if (Array.isArray(msg.blocks)) {
      for (const b of msg.blocks) {
        if (b.kind === 'code') hasCode = true;
        if (b.kind === 'math') hasMath = true;
        if (b.kind === 'table') hasTable = true;
        if (b.kind === 'image') hasImage = true;
        if (b.kind === 'citation') citationCount++;
      }
    }

    const row = [
      escapeCsv(msg.index),
      escapeCsv(msg.role),
      escapeCsv(msg.timestamp || conv.createdAt),
      escapeCsv(text),
      escapeCsv(wordCount),
      escapeCsv(charCount),
      escapeCsv(hasCode),
      escapeCsv(hasMath),
      escapeCsv(hasTable),
      escapeCsv(hasImage),
      escapeCsv(citationCount)
    ];

    rows.push(row.join(','));
  }

  // Prepend UTF-8 BOM so Excel opens UTF-8 text correctly
  const csvContent = '\uFEFF' + rows.join('\r\n');
  const mime = 'text/csv;charset=utf-8';
  const blob = new Blob([csvContent], { type: mime });

  const filename = generateFilename({
    template: options.template,
    title: conv.title,
    format: 'csv',
    model: conv.model,
    timestamp: conv.createdAt
  });

  return {
    blob,
    filename,
    mime,
    previewText: rows.slice(0, 10).join('\n')
  };
}
