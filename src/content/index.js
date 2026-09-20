/**
 * @file index.js
 * Content script bootstrap injecting closed Shadow DOM UI into chat.z.ai.
 */

import { onThreadChange, isStreaming, detectTheme } from './dom-engine.js';
import { scrapeConversation } from './scraper.js';
import { createFloatingButton } from './ui/floating-button.js';
import { createPanel } from './ui/panel.js';
import { createPreviewModal } from './ui/preview-modal.js';
import { createHistoryDrawer } from './ui/history-drawer.js';
import styles from './ui/styles.css?inline';
import { t } from '../core/utils/i18n.js';

/**
 * DOM-anchor-based download safe for content script context.
 * Does NOT use chrome.downloads (unavailable in content scripts).
 * @param {string} url - Object URL or data URL
 * @param {string} filename
 * @param {boolean} [shouldRevoke=false] - true if url is a blob: URL that needs revoking
 */
function contentScriptDownload(url, filename, shouldRevoke = false) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'export';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (shouldRevoke) {
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    }, 60000);
  }
}

let shadowRootHost = null;
let shadowRoot = null;
let panelInstance = null;
let previewModalInstance = null;
let historyDrawerInstance = null;
let fabElement = null;

/**
 * Initializes or re-binds the extension closed Shadow DOM container.
 */
function initContainer() {
  if (document.getElementById('zaix-extension-root')) {
    return;
  }

  shadowRootHost = document.createElement('div');
  shadowRootHost.id = 'zaix-extension-root';
  shadowRootHost.style.position = 'fixed';
  shadowRootHost.style.zIndex = '2147483647';

  // Apply active page theme to container
  const activeTheme = detectTheme();
  shadowRootHost.setAttribute('data-theme', activeTheme);

  // Strict closed Shadow DOM as required by Section 5 & 18
  shadowRoot = shadowRootHost.attachShadow({ mode: 'closed' });

  // Inject styles into shadow DOM
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  shadowRoot.appendChild(styleEl);

  // Create Preview Modal
  previewModalInstance = createPreviewModal({
    onClose: () => {}
  });
  shadowRoot.appendChild(previewModalInstance.element);

  // Create History Drawer
  historyDrawerInstance = createHistoryDrawer({
    onClose: () => {},
    onReDownload: (entry) => {
      if (entry.blob instanceof Blob) {
        contentScriptDownload(
          URL.createObjectURL(entry.blob),
          `${entry.title}.${entry.format}`,
          true
        );
      }
    }
  });
  shadowRoot.appendChild(historyDrawerInstance.element);

  // Create Panel
  panelInstance = createPanel({
    onExport: handleExport,
    onPreview: handlePreview,
    onHistory: handleHistory,
    onThemeChange: (theme) => {
      const resolved = theme === 'auto' ? detectTheme() : theme;
      shadowRootHost.setAttribute('data-theme', resolved);
    },
    onClose: () => {
      panelInstance.element.classList.add('hidden');
    }
  });
  shadowRoot.appendChild(panelInstance.element);

  // Create FAB
  fabElement = createFloatingButton({
    onClick: () => {
      openPanel();
    }
  });
  shadowRoot.appendChild(fabElement);

  document.documentElement.appendChild(shadowRootHost);
}

/**
 * Opens the export panel and refreshes live stats.
 */
async function openPanel() {
  if (!panelInstance) return;
  panelInstance.element.classList.remove('hidden');

  // Synchronize theme with current selection
  const currentOptions = panelInstance.getOptions();
  if (currentOptions.theme === 'auto') {
    shadowRootHost.setAttribute('data-theme', detectTheme());
  } else {
    shadowRootHost.setAttribute('data-theme', currentOptions.theme || 'light');
  }

  try {
    const isBusy = isStreaming();
    panelInstance.setStreaming(isBusy);

    const conv = await scrapeConversation({ waitForStream: false });
    panelInstance.setConversationData(conv);
  } catch (err) {
    panelInstance.setStatus(err.message || t('errLocateFailed'), true, {
      code: err.code || 'LOCATE_FAILED',
      message: err.message
    });
  }
}

let isExporting = false;
let isPreviewing = false;

/**
 * Executes export through background service worker.
 */
async function handleExport(options) {
  if (isExporting) return;
  isExporting = true;
  try {
    panelInstance.setStatus(t('statusScraping'));

    const conversation = await scrapeConversation({
      range: options.range,
      selectedIndices: options.selectedIndices,
      includeThinking: options.includeThinking,
      includeArtifacts: options.includeArtifacts,
      includeCitations: options.includeCitations
    });

    if (options.title) {
      conversation.title = options.title;
    }

    panelInstance.setStatus(t('statusRendering'));

    let response = null;
    try {
      // Give the offscreen document up to 30s — creation + heavy PDF rendering can take 10-15s
      response = await Promise.race([
        chrome.runtime.sendMessage({
          type: 'EXPORT_REQUEST',
          format: options.format,
          engine: options.engine,
          preset: options.preset,
          conversation,
          options
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('BACKGROUND_TIMEOUT')), 30000))
      ]);
    } catch (bgErr) {
      // Extension was reloaded while this page was open — the old content script
      // can no longer communicate with the new service worker. Tell the user to refresh.
      if (bgErr?.message?.includes('Extension context invalidated')) {
        panelInstance.setStatus(
          '⚠️ Extension was updated. Please refresh this page, then try again.',
          true
        );
        isExporting = false;
        return;
      }
      console.warn(
        '[Z.ai Exporter] Background export unavailable or timed out, executing direct in-page export:',
        bgErr
      );
    }

    if (response && response.ok) {
      // Background offscreen succeeded — service worker already triggered chrome.downloads
      // If download didn't fire (no downloadId) fall back to DOM anchor
      if (!response.data?.downloadId && response.data?.dataUrl) {
        contentScriptDownload(response.data.dataUrl, response.data.filename);
      }

      panelInstance.setStatus(t('statusComplete'));
      setTimeout(() => {
        panelInstance.element.classList.add('hidden');
        panelInstance.setStatus('');
      }, 1500);
    } else {
      // In-page direct rendering fallback (content script context — must NOT use chrome.downloads)
      panelInstance.setStatus('Generating file...');
      const { EXPORTERS } = await import('../exporters/index.js');
      const exporterDef = EXPORTERS[options.format];
      if (!exporterDef) {
        throw new Error(`Unsupported format: ${options.format}`);
      }

      const exporterModule = await exporterDef.loader(options.engine);
      const renderFn = exporterModule.exportConversation || exporterModule.default;
      const renderResult = await renderFn(conversation, options);

      // Direct DOM anchor download — no chrome.downloads (not available in content scripts)
      const blob = renderResult.blob;
      const filename = renderResult.filename;
      if (blob instanceof Blob) {
        contentScriptDownload(URL.createObjectURL(blob), filename, true);
      } else if (typeof renderResult.dataUrl === 'string') {
        contentScriptDownload(renderResult.dataUrl, filename, false);
      } else {
        throw new Error('EXPORT_FAILED: Exporter returned neither a Blob nor a dataUrl');
      }

      panelInstance.setStatus(t('statusComplete'));
      setTimeout(() => {
        panelInstance.element.classList.add('hidden');
        panelInstance.setStatus('');
      }, 1500);
    }
  } catch (err) {
    if (err?.message?.includes('Extension context invalidated')) {
      panelInstance.setStatus(
        '⚠️ Extension was updated. Please refresh this page to continue exporting.',
        true
      );
      return;
    }
    console.error('[Z.ai Exporter] Export failed:', err);
    panelInstance.setStatus(err.message || 'Export error', true, {
      code: err.code || 'EXPORT_ERROR',
      message: err.message
    });
  } finally {
    isExporting = false;
  }
}

/**
 * Handles preview modal invocation.
 */
async function handlePreview(options) {
  if (isPreviewing) return;
  isPreviewing = true;
  try {
    panelInstance.setStatus('Generating preview...');
    const conversation = await scrapeConversation({
      range: options.range,
      selectedIndices: options.selectedIndices,
      includeThinking: options.includeThinking,
      includeArtifacts: options.includeArtifacts,
      includeCitations: options.includeCitations
    });

    const response = await chrome.runtime.sendMessage({
      type: 'OPEN_PREVIEW_REQUEST',
      format: options.format,
      engine: options.engine,
      preset: options.preset,
      conversation,
      options
    });

    panelInstance.setStatus('');
    if (response?.ok) {
      previewModalInstance.show({
        title: conversation.title,
        format: options.format,
        previewHtml: response.data.previewHtml,
        previewText: response.data.previewText
      });
    } else {
      panelInstance.setStatus(response?.error?.message || 'Preview generation failed', true);
    }
  } catch (err) {
    if (err?.message?.includes('Extension context invalidated')) {
      panelInstance.setStatus(
        '⚠️ Extension was updated. Please refresh this page, then try again.',
        true
      );
      return;
    }
    panelInstance.setStatus(err.message || 'Preview error', true);
  } finally {
    isPreviewing = false;
  }
}

/**
 * Handles history drawer invocation.
 */
async function handleHistory() {
  if (historyDrawerInstance) {
    await historyDrawerInstance.open();
  }
}

// Listen for messages from background (e.g. keyboard command Alt+Shift+E)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'OPEN_PANEL') {
    openPanel();
  } else if (msg?.type === 'TRIGGER_EXPORT_FORMAT') {
    openPanel().then(() => {
      if (panelInstance) {
        const opts = panelInstance.getOptions();
        opts.format = msg.format;
        handleExport(opts);
      }
    });
  }
});

// Bootstrap
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initContainer);
} else {
  initContainer();
}

// SPA Navigation & DOM Mutation watcher
onThreadChange(() => {
  // Re-verify UI is attached and update stats if panel is open
  if (!document.getElementById('zaix-extension-root')) {
    initContainer();
  } else if (panelInstance && !panelInstance.element.classList.contains('hidden')) {
    // If panel is currently visible, refresh conversation data to avoid stale data across SPA navigation
    scrapeConversation({ waitForStream: false })
      .then((c) => {
        if (panelInstance && !panelInstance.element.classList.contains('hidden')) {
          panelInstance.setConversationData(c);
        }
      })
      .catch(() => {});
  }
});
