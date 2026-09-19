/**
 * @file offscreen.js
 * Offscreen document handling DOM-dependent rendering pipeline and IndexedDB.
 * Section 14 of the authoritative specification.
 */

import { EXPORTERS } from '../exporters/index.js';
import { openDB } from 'idb';

const DB_NAME = 'zaix';
const STORE_NAME = 'exports';
const MAX_HISTORY_ITEMS = 200;
const MAX_BLOB_STORE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Initializes and returns the IndexedDB database instance.
 */
async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('date', 'date');
        store.createIndex('format', 'format');
      }
    }
  });
}

/**
 * Saves an export entry to history with LRU eviction and size constraints.
 */
async function saveHistoryEntry(entry) {
  const db = await getDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  // If blob exceeds limit, do not store binary blob to preserve quota
  const processedEntry = { ...entry };
  if (processedEntry.blob && processedEntry.blob.size > MAX_BLOB_STORE_BYTES) {
    delete processedEntry.blob;
    processedEntry.hasStoredBlob = false;
  } else if (processedEntry.blob) {
    processedEntry.hasStoredBlob = true;
  }

  await store.put(processedEntry);

  // Evict oldest if exceeding 200 items
  const count = await store.count();
  if (count > MAX_HISTORY_ITEMS) {
    const index = store.index('date');
    let cursor = await index.openCursor();
    let toDelete = count - MAX_HISTORY_ITEMS;
    while (cursor && toDelete > 0) {
      await cursor.delete();
      toDelete--;
      cursor = await cursor.continue();
    }
  }

  await tx.done;
}

/**
 * Retrieves history entries.
 */
async function listHistory() {
  const db = await getDb();
  const all = await db.getAllFromIndex(STORE_NAME, 'date');
  // Return reversed (newest first) and without large binary blobs
  return all.reverse().map((item) => ({
    id: item.id,
    title: item.title,
    format: item.format,
    date: item.date,
    size: item.size,
    hasStoredBlob: !!item.hasStoredBlob
  }));
}

/**
 * Retrieves a single history entry (including blob if present).
 */
async function getHistoryEntry(id) {
  const db = await getDb();
  return db.get(STORE_NAME, id);
}

/**
 * Deletes a single history entry.
 */
async function deleteHistoryEntry(id) {
  const db = await getDb();
  return db.delete(STORE_NAME, id);
}

/**
 * Clears all history entries.
 */
async function clearHistory() {
  const db = await getDb();
  return db.clear(STORE_NAME);
}

// Runtime message dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;

  (async () => {
    try {
      switch (message.type) {
        case 'RENDER_EXPORT': {
          const { format, engine, preset, conversation, options } = message;
          const exporterDef = EXPORTERS[format];
          if (!exporterDef) {
            throw new Error(`UNSUPPORTED_FORMAT: No exporter registered for format '${format}'`);
          }

          // Lazy load the exporter module
          const exporterModule = await exporterDef.loader();
          const renderFn = exporterModule.exportConversation || exporterModule.default;
          if (typeof renderFn !== 'function') {
            throw new Error(
              `RENDER_FAILED: Exporter '${format}' does not export a valid render function`
            );
          }

          // Execute render in offscreen DOM environment
          const renderResult = await renderFn(conversation, {
            engine,
            preset,
            ...options
          });

          // If saveHistory is requested and opt-in
          if (options && options.saveHistory) {
            const entryId = `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            await saveHistoryEntry({
              id: entryId,
              title: conversation.title || 'Untitled',
              format,
              date: Date.now(),
              size: renderResult.blob ? renderResult.blob.size : 0,
              blob: renderResult.blob
            });
          }

          // Convert Blob to Data URL for message passing to service-worker/downloads
          let dataUrl = renderResult.dataUrl;
          if (!dataUrl && renderResult.blob instanceof Blob) {
            const reader = new FileReader();
            dataUrl = await new Promise((res, rej) => {
              reader.onloadend = () => res(reader.result);
              reader.onerror = rej;
              reader.readAsDataURL(renderResult.blob);
            });
          }

          return {
            ok: true,
            data: {
              mime: renderResult.mime || exporterDef.mime,
              filename: renderResult.filename,
              dataUrl,
              previewHtml: renderResult.previewHtml,
              previewText: renderResult.previewText
            }
          };
        }

        case 'HISTORY_SAVE': {
          await saveHistoryEntry(message.entry);
          return { ok: true };
        }

        case 'HISTORY_LIST': {
          const items = await listHistory();
          return { ok: true, data: items };
        }

        case 'HISTORY_GET': {
          const entry = await getHistoryEntry(message.id);
          return { ok: true, data: entry };
        }

        case 'HISTORY_DELETE': {
          await deleteHistoryEntry(message.id);
          return { ok: true };
        }

        case 'HISTORY_CLEAR': {
          await clearHistory();
          return { ok: true };
        }

        default:
          return {
            ok: false,
            error: { code: 'UNKNOWN_OFFSCREEN_MESSAGE', message: `Unhandled type: ${message.type}` }
          };
      }
    } catch (err) {
      console.error('[Offscreen] Error handling message:', err);
      return {
        ok: false,
        error: {
          code: err.code || 'RENDER_FAILED',
          message: err.message || 'Render failed in offscreen context'
        }
      };
    }
  })().then(sendResponse);

  return true; // Keep message channel open for async response
});
