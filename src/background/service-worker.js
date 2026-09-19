/**
 * @file service-worker.js
 * MV3 Background Service Worker: pure router and orchestrator.
 * Adheres strictly to Rule R2 (NO DOM ACCESS) and Section 13 & 24.
 */

const OFFSCREEN_URL = 'src/offscreen/offscreen.html';
let offscreenCreatingPromise = null;

/**
 * Ensures the offscreen document is alive using standard feature detection (Section R3).
 * Uses a creation lock promise to prevent concurrent duplicate document creation.
 */
async function ensureOffscreenDocument() {
  if (offscreenCreatingPromise) {
    await offscreenCreatingPromise;
    return;
  }

  // Check if offscreen document already exists
  let hasDoc = false;
  if (typeof chrome.offscreen?.hasDocument === 'function') {
    hasDoc = await chrome.offscreen.hasDocument();
  } else if (typeof chrome.runtime?.getContexts === 'function') {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)]
    });
    hasDoc = contexts.length > 0;
  }

  if (hasDoc) {
    return;
  }

  offscreenCreatingPromise = (async () => {
    try {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: ['DOM_PARSER', 'BLOBS', 'DOM_SCRAPING'],
        justification: 'Render local Z.ai conversation exports in a DOM-capable hidden document.'
      });
    } finally {
      offscreenCreatingPromise = null;
    }
  })();

  await offscreenCreatingPromise;
}

/**
 * Sends a message to the offscreen document with automatic retry if the document is initializing.
 * @param {Object} message
 * @param {number} [maxRetries=5]
 * @returns {Promise<any>}
 */
async function sendToOffscreenWithRetry(message, maxRetries = 5) {
  await ensureOffscreenDocument();
  let lastError = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await chrome.runtime.sendMessage({
        target: 'offscreen',
        ...message
      });
      if (res !== undefined) {
        return res;
      }
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 80 * (i + 1)));
  }
  if (lastError) throw lastError;
  throw new Error('OFFSCREEN_UNRESPONSIVE: Offscreen document did not respond in time');
}

/**
 * Displays temporary badge status on the extension action icon.
 * @param {'success'|'error'} status
 */
function setActionBadge(status) {
  if (status === 'success') {
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#16a34a' });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 2000);
  } else if (status === 'error') {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 5000);
  }
}

/**
 * Handles keyboard commands defined in manifest.
 */
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-exporter') {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (
      activeTab?.id &&
      activeTab.url &&
      (activeTab.url.includes('z.ai') || /https?:\/\/[a-z0-9-.]*z\.ai/i.test(activeTab.url))
    ) {
      chrome.tabs.sendMessage(activeTab.id, { type: 'OPEN_PANEL' }).catch(() => {});
    }
  }
});

/**
 * Setup optional context menus if permission is granted.
 */
async function setupContextMenus() {
  const hasPermission = await chrome.permissions.contains({ permissions: ['contextMenus'] });
  if (!hasPermission) return;

  const urlPatterns = ['https://chat.z.ai/*', 'https://z.ai/*', 'https://*.z.ai/*'];

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'zai-export-root',
      title: 'Export conversation',
      contexts: ['page'],
      documentUrlPatterns: urlPatterns
    });

    chrome.contextMenus.create({
      id: 'zai-export-pdf',
      parentId: 'zai-export-root',
      title: 'Export as PDF',
      contexts: ['page']
    });

    chrome.contextMenus.create({
      id: 'zai-export-md',
      parentId: 'zai-export-root',
      title: 'Export as Markdown',
      contexts: ['page']
    });

    chrome.contextMenus.create({
      id: 'zai-export-docx',
      parentId: 'zai-export-root',
      title: 'Export as DOCX',
      contexts: ['page']
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus().catch(console.error);
});

// React dynamically to optional contextMenus permission grant or revocation
chrome.permissions?.onAdded?.addListener((permissions) => {
  if (permissions.permissions?.includes('contextMenus')) {
    setupContextMenus().catch(console.error);
  }
});

chrome.permissions?.onRemoved?.addListener((permissions) => {
  if (permissions.permissions?.includes('contextMenus')) {
    chrome.contextMenus?.removeAll?.(() => {});
  }
});

chrome.contextMenus?.onClicked?.addListener(async (info, tab) => {
  if (!tab?.id) return;
  let format = 'md';
  if (info.menuItemId === 'zai-export-pdf') format = 'pdf';
  if (info.menuItemId === 'zai-export-docx') format = 'docx';

  chrome.tabs
    .sendMessage(tab.id, {
      type: 'TRIGGER_EXPORT_FORMAT',
      format
    })
    .catch(() => {});
});

/**
 * Primary runtime message router.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;

  // IMPORTANT: Do not intercept messages meant for the offscreen document
  const OFFSCREEN_TYPES = [
    'RENDER_EXPORT',
    'HISTORY_SAVE',
    'HISTORY_LIST',
    'HISTORY_GET',
    'HISTORY_DELETE',
    'HISTORY_CLEAR'
  ];
  if (message.target === 'offscreen' || OFFSCREEN_TYPES.includes(message.type)) {
    return false; // Let offscreen document handle it
  }

  const SERVICE_WORKER_TYPES = [
    'OPEN_PANEL',
    'EXPORT_PROGRESS',
    'EXPORT_REQUEST',
    'OPEN_PREVIEW',
    'OPEN_PREVIEW_REQUEST',
    'PROFILE_GET',
    'PROFILE_SAVE',
    'PROFILE_EXPORT',
    'PROFILE_IMPORT'
  ];
  if (!SERVICE_WORKER_TYPES.includes(message.type)) {
    return false; // Do not consume response channel for unknown messages
  }

  (async () => {
    try {
      switch (message.type) {
        case 'OPEN_PANEL': {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PANEL' }).catch(() => {});
          }
          return { ok: true };
        }

        case 'EXPORT_PROGRESS': {
          // Forward progress to active tab UI if available
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, message).catch(() => {});
          }
          return { ok: true };
        }

        case 'EXPORT_REQUEST': {
          const { format, engine, preset, conversation, options } = message;

          if (!conversation || !format) {
            throw new Error('INVALID_MESSAGE: Missing conversation or format parameters');
          }

          // Forward rendering request explicitly to offscreen document with retry
          const renderResponse = await sendToOffscreenWithRetry({
            type: 'RENDER_EXPORT',
            format,
            engine,
            preset,
            conversation,
            options
          });

          if (!renderResponse || !renderResponse.ok) {
            throw new Error(renderResponse?.error?.message || 'Offscreen rendering failed');
          }

          const { dataUrl, filename, mime } = renderResponse.data;

          let downloadId = null;
          try {
            // Trigger download from service worker if supported
            downloadId = await chrome.downloads.download({
              url: dataUrl,
              filename: filename || `conversation.${format}`,
              saveAs: true
            });
          } catch (downloadErr) {
            console.warn(
              '[ServiceWorker] chrome.downloads.download threw, delegating to content script DOM download:',
              downloadErr
            );
          }

          setActionBadge('success');

          return {
            ok: true,
            data: {
              downloadId,
              filename,
              mime,
              dataUrl
            }
          };
        }

        case 'OPEN_PREVIEW':
        case 'OPEN_PREVIEW_REQUEST': {
          return await sendToOffscreenWithRetry({
            type: 'RENDER_EXPORT',
            ...message
          });
        }

        case 'HISTORY_SAVE':
        case 'HISTORY_LIST':
        case 'HISTORY_GET':
        case 'HISTORY_DELETE':
        case 'HISTORY_CLEAR': {
          return await sendToOffscreenWithRetry(message);
        }

        case 'PROFILE_GET': {
          const res = await chrome.storage.local.get('zai_selector_profile');
          return { ok: true, data: res.zai_selector_profile || null };
        }

        case 'PROFILE_SAVE': {
          await chrome.storage.local.set({ zai_selector_profile: message.profile });
          return { ok: true };
        }

        case 'PROFILE_EXPORT': {
          const res = await chrome.storage.local.get('zai_selector_profile');
          const profile = res.zai_selector_profile || {
            schemaVersion: 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            host: 'chat.z.ai',
            manualOverrides: {}
          };
          return { ok: true, data: JSON.stringify(profile, null, 2) };
        }

        case 'PROFILE_IMPORT': {
          let profile = message.profile;
          if (typeof profile === 'string') {
            profile = JSON.parse(profile);
          }
          if (!profile || typeof profile !== 'object') {
            throw new Error('INVALID_PROFILE: Profile must be an object');
          }
          await chrome.storage.local.set({ zai_selector_profile: profile });
          return { ok: true, data: profile };
        }

        default:
          return false;
      }
    } catch (err) {
      console.error('[ServiceWorker] Error:', err);
      setActionBadge('error');
      return {
        ok: false,
        error: {
          code: err.code || 'ROUTER_ERROR',
          message: err.message || 'Service worker dispatch error'
        }
      };
    }
  })().then(sendResponse);

  return true; // Asynchronous message response
});
