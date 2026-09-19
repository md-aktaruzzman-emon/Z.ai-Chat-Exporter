/**
 * @file i18n.js
 * Internationalization wrapper with safe fallbacks.
 * Section 20 of the authoritative specification.
 */

const FALLBACK_STRINGS = {
  extName: 'Z.ai Chat Exporter',
  extDesc:
    'Export Z.ai conversations to PDF, Word (DOCX), Markdown, HTML, Plain Text, JSON, PNG, and CSV with zero external network requests.',
  actionTitle: 'Z.ai Chat Exporter',
  commandOpenExporter: 'Open Z.ai Chat Exporter panel',
  btnExport: 'Export Now',
  btnPreview: 'Preview Document',
  btnHistory: 'Export History',
  btnClose: 'Close',
  btnCancel: 'Cancel',
  lblRange: 'Message Range',
  rangeAll: 'All Messages in Thread',
  rangeCustom: 'Select Specific Messages...',
  rangeFromHere: 'From Current View to End',
  lblFormat: 'Export Format',
  lblPdfEngine: 'PDF Rendering Engine',
  lblMdPreset: 'Markdown Flavor / Preset',
  lblTheme: 'Document Theme',
  lblIncludeThinking: 'Include Thinking & Reasoning blocks',
  lblIncludeArtifacts: 'Include Artifacts & Interactive Canvas',
  lblIncludeCitations: 'Include Citations & Web Sources',
  lblAnonymizePii: 'Redact Personal Data (Emails, API Keys, Tokens)',
  lblSaveHistory: 'Save export to local offline history',
  statusScraping: 'Reading conversation messages from page...',
  statusRendering: 'Formatting and generating document...',
  statusSaving: 'Preparing download...',
  statusComplete: 'Export successful! Your document is ready.',
  statusStreaming: 'Waiting for AI response to finish generating...',
  errLocateFailed:
    'Could not detect chat messages on this page. Please open a conversation and try again.',
  errNoConversation: 'No conversation messages found to export.',
  errStreamTimeout: 'AI response took longer than expected. Partial conversation captured.'
};

/**
 * Retrieves a localized message using chrome.i18n.getMessage() with fallback.
 * @param {string} key
 * @param {string|string[]} [substitutions]
 * @returns {string}
 */
export function t(key, substitutions) {
  if (
    typeof chrome !== 'undefined' &&
    chrome.i18n &&
    typeof chrome.i18n.getMessage === 'function'
  ) {
    const msg = chrome.i18n.getMessage(key, substitutions);
    if (msg) return msg;
  }
  return FALLBACK_STRINGS[key] || key;
}
