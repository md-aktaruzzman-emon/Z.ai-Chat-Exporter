/**
 * @file i18n.js
 * Internationalization wrapper with safe fallbacks.
 * Section 20 of the authoritative specification.
 */

const FALLBACK_STRINGS = {
  extName: 'Z.ai Chat Exporter',
  extDesc: 'Export Z.ai conversations to PDF, DOCX, Markdown, HTML, TXT, JSON, PNG, and CSV.',
  actionTitle: 'Z.ai Chat Exporter',
  commandOpenExporter: 'Open Z.ai Chat Exporter panel',
  btnExport: 'Export',
  btnPreview: 'Preview',
  btnHistory: 'History',
  btnClose: 'Close',
  btnCancel: 'Cancel',
  lblRange: 'Export Range',
  rangeAll: 'All Messages',
  rangeCustom: 'Custom Selection',
  rangeFromHere: 'From Selected to End',
  lblFormat: 'Format',
  lblPdfEngine: 'PDF Engine',
  lblMdPreset: 'Markdown Preset',
  lblTheme: 'Theme',
  lblIncludeThinking: 'Include Thinking & Reasoning',
  lblIncludeArtifacts: 'Include Artifacts / Canvas',
  lblIncludeCitations: 'Include Citations & Search',
  lblAnonymizePii: 'Anonymize PII (Emails, Keys, Tokens)',
  lblSaveHistory: 'Save to Local History',
  statusScraping: 'Scraping conversation...',
  statusRendering: 'Rendering export document...',
  statusSaving: 'Saving file...',
  statusComplete: 'Export complete!',
  statusStreaming: 'Waiting for assistant response to finish...',
  errLocateFailed: 'Could not locate chat messages on this page.',
  errNoConversation: 'No conversation found to export.',
  errStreamTimeout: 'Streaming timed out. Partial response captured.'
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
