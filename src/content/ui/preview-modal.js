/**
 * @file preview-modal.js
 * Modal dialog displaying real-time rendered export preview.
 * Section 18 of the authoritative specification.
 */

/**
 * Creates the preview modal.
 * @param {Object} props
 * @param {Function} props.onClose - Close handler
 * @returns {{
 *   element: HTMLElement,
 *   show: (data: { title: string, format: string, previewHtml?: string, previewText?: string }) => void,
 *   close: () => void
 * }}
 */
export function createPreviewModal({ onClose }) {
  const overlay = document.createElement('div');
  overlay.className = 'zaix-panel-overlay hidden';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Export Preview');

  overlay.innerHTML = `
    <div class="zaix-panel" style="width: 700px; max-width: 95vw; height: 80vh;">
      <div class="zaix-header">
        <h2 class="zaix-title" id="zaix-preview-title">Document Preview</h2>
        <button type="button" class="zaix-close-btn" aria-label="Close preview">&times;</button>
      </div>

      <div class="zaix-body" style="padding: 0; display: flex; flex-direction: column;">
        <div id="zaix-preview-content" style="flex: 1; overflow: auto; padding: 20px; font-family: monospace; font-size: 13px; white-space: pre-wrap; background: var(--zaix-surface);">
        </div>
      </div>

      <div class="zaix-footer">
        <button type="button" class="zaix-btn zaix-btn-primary" id="zaix-preview-close-btn">Close Preview</button>
      </div>
    </div>
  `;

  const closeBtn = overlay.querySelector('.zaix-close-btn');
  const footerCloseBtn = overlay.querySelector('#zaix-preview-close-btn');
  const previewContent = overlay.querySelector('#zaix-preview-content');
  const titleEl = overlay.querySelector('#zaix-preview-title');

  function close() {
    overlay.classList.add('hidden');
    if (typeof onClose === 'function') onClose();
  }

  closeBtn.addEventListener('click', close);
  footerCloseBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  });

  function show({ title, format, previewHtml, previewText }) {
    titleEl.textContent = `Preview (${format.toUpperCase()}) - ${title || 'Untitled'}`;
    if (previewHtml) {
      previewContent.style.whiteSpace = 'normal';
      previewContent.style.fontFamily = 'inherit';
      previewContent.innerHTML = previewHtml;
    } else {
      previewContent.style.whiteSpace = 'pre-wrap';
      previewContent.style.fontFamily = 'monospace';
      previewContent.textContent = previewText || '(No preview available for this binary format)';
    }
    overlay.classList.remove('hidden');
  }

  return {
    element: overlay,
    show,
    close
  };
}
