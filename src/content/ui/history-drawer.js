/**
 * @file history-drawer.js
 * In-page history drawer connecting to local IndexedDB.
 * Section 17 of the authoritative specification.
 */

/**
 * Creates the local history drawer overlay.
 * @param {Object} props
 * @param {Function} props.onClose - Close handler
 * @param {Function} props.onReDownload - Triggers re-download of stored export
 * @returns {{
 *   element: HTMLElement,
 *   open: () => Promise<void>,
 *   close: () => void
 * }}
 */
export function createHistoryDrawer({ onClose, onReDownload }) {
  const overlay = document.createElement('div');
  overlay.className = 'zaix-panel-overlay hidden';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Export History');

  overlay.innerHTML = `
    <div class="zaix-panel" style="width: 520px; max-width: 95vw; height: 75vh;">
      <div class="zaix-header">
        <h2 class="zaix-title">Export History (Local IndexedDB)</h2>
        <button type="button" class="zaix-close-btn" aria-label="Close history">&times;</button>
      </div>

      <div class="zaix-body" id="zaix-history-list" style="padding: 14px 18px; gap: 10px;">
        <div style="color: var(--zaix-muted); text-align: center; padding: 20px;">Loading history...</div>
      </div>

      <div class="zaix-footer" style="justify-content: space-between;">
        <button type="button" class="zaix-btn" id="zaix-clear-history-btn" style="color: #dc2626;">Clear All History</button>
        <button type="button" class="zaix-btn zaix-btn-primary" id="zaix-close-history-btn">Done</button>
      </div>
    </div>
  `;

  const closeBtn = overlay.querySelector('.zaix-close-btn');
  const footerCloseBtn = overlay.querySelector('#zaix-close-history-btn');
  const clearBtn = overlay.querySelector('#zaix-clear-history-btn');
  const listContainer = overlay.querySelector('#zaix-history-list');

  function close() {
    overlay.classList.add('hidden');
    if (typeof onClose === 'function') onClose();
  }

  closeBtn.addEventListener('click', close);
  footerCloseBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  async function loadHistory() {
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'HISTORY_LIST' });
      if (!resp || !resp.ok || !Array.isArray(resp.data) || resp.data.length === 0) {
        listContainer.innerHTML = `<div style="color: var(--zaix-muted); text-align: center; padding: 30px;">No saved export history found.</div>`;
        return;
      }

      listContainer.innerHTML = '';
      for (const item of resp.data) {
        const itemEl = document.createElement('div');
        itemEl.style.cssText = `
          border: 1px solid var(--zaix-border);
          border-radius: 6px;
          padding: 10px 12px;
          background: var(--zaix-surface);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        `;

        const dateStr = new Date(item.date).toLocaleString();
        itemEl.innerHTML = `
          <div style="flex: 1; min-width: 0;">
            <div class="zaix-hist-title" style="font-weight: 600; font-size: 13px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;"></div>
            <div style="font-size: 11px; color: var(--zaix-muted);">${item.format.toUpperCase()} &bull; ${dateStr} &bull; ${(item.size / 1024).toFixed(1)} KB</div>
          </div>
          <div style="display: flex; gap: 6px;">
            ${item.hasStoredBlob ? `<button type="button" class="zaix-btn zaix-redownload-btn" data-id="${item.id}" style="padding: 4px 8px; font-size: 12px;">Save</button>` : ''}
            <button type="button" class="zaix-btn zaix-delete-hist-btn" data-id="${item.id}" style="padding: 4px 8px; font-size: 12px; color: #dc2626;">&times;</button>
          </div>
        `;
        itemEl.querySelector('.zaix-hist-title').textContent = item.title || 'Untitled';

        const deleteBtn = itemEl.querySelector('.zaix-delete-hist-btn');
        deleteBtn.addEventListener('click', async () => {
          await chrome.runtime.sendMessage({ type: 'HISTORY_DELETE', id: item.id });
          loadHistory();
        });

        const redownloadBtn = itemEl.querySelector('.zaix-redownload-btn');
        if (redownloadBtn) {
          redownloadBtn.addEventListener('click', async () => {
            const entryResp = await chrome.runtime.sendMessage({
              type: 'HISTORY_GET',
              id: item.id
            });
            if (entryResp?.ok && entryResp.data?.blob) {
              if (typeof onReDownload === 'function') {
                onReDownload(entryResp.data);
              }
            }
          });
        }

        listContainer.appendChild(itemEl);
      }
    } catch (err) {
      listContainer.innerHTML = `<div style="color: #dc2626; text-align: center; padding: 20px;">Failed to load history: ${err.message}</div>`;
    }
  }

  clearBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all export history?')) {
      await chrome.runtime.sendMessage({ type: 'HISTORY_CLEAR' });
      loadHistory();
    }
  });

  async function open() {
    overlay.classList.remove('hidden');
    await loadHistory();
  }

  return {
    element: overlay,
    open,
    close
  };
}
