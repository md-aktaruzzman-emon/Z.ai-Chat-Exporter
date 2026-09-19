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
import { triggerDownload } from '../core/utils/download.js';
import styles from './ui/styles.css?inline';
import { t } from '../core/utils/i18n.js';

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
      triggerDownload({
        data: entry.blob,
        filename: `${entry.title}.${entry.format}`
      });
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

  // Synchronize auto theme with current host theme
  const currentOptions = panelInstance.getOptions();
  if (currentOptions.theme === 'auto') {
    shadowRootHost.setAttribute('data-theme', detectTheme());
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

    const response = await chrome.runtime.sendMessage({
      type: 'EXPORT_REQUEST',
      format: options.format,
      engine: options.engine,
      preset: options.preset,
      conversation,
      options
    });

    if (response && response.ok) {
      panelInstance.setStatus(t('statusComplete'));
      setTimeout(() => {
        panelInstance.element.classList.add('hidden');
        panelInstance.setStatus('');
      }, 1500);
    } else {
      panelInstance.setStatus(response?.error?.message || 'Export failed', true, response?.error);
    }
  } catch (err) {
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
