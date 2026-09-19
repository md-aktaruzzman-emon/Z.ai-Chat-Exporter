/**
 * @file panel.js
 * Main Export Control Panel injected in closed Shadow DOM.
 * Section 18 of the authoritative specification.
 */

import { t } from '../../core/utils/i18n.js';

/**
 * Creates the export panel component.
 * @param {Object} props
 * @param {Function} props.onExport - Triggers export with selected options
 * @param {Function} props.onPreview - Triggers preview modal
 * @param {Function} props.onHistory - Opens history drawer
 * @param {Function} props.onClose - Closes the panel
 * @returns {{
 *   element: HTMLElement,
 *   updateStats: (stats: Object) => void,
 *   setConversationData: (conv: Object) => void,
 *   setStatus: (status: string, isError?: boolean, diagnostics?: Object) => void,
 *   setStreaming: (isStreaming: boolean) => void,
 *   getOptions: () => Object
 * }}
 */
export function createPanel({ onExport, onPreview, onHistory, onClose }) {
  const overlay = document.createElement('div');
  overlay.className = 'zaix-panel-overlay hidden';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Export Conversation');

  overlay.innerHTML = `
    <div class="zaix-panel">
      <div class="zaix-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <h2 class="zaix-title">Z.ai Chat Exporter</h2>
          <span style="font-size:11px; background:var(--zaix-surface); padding:2px 6px; border-radius:4px; border:1px solid var(--zaix-border); color:var(--zaix-muted);">Ctrl+K for palette</span>
        </div>
        <button type="button" class="zaix-close-btn" aria-label="Close dialog">&times;</button>
      </div>

      <div class="zaix-body">
        <!-- Status Notification Live Region -->
        <div class="zaix-status" aria-live="polite" style="display:none;"></div>

        <!-- Command Palette (Ctrl+K) -->
        <div id="zaix-command-palette" style="display:none; margin-bottom:10px; background:var(--zaix-surface); border:1px solid var(--zaix-primary); border-radius:6px; padding:8px;">
          <input type="text" id="zaix-palette-search" placeholder="Type a command or format (e.g. pdf, md, docx)..." class="zaix-input" style="width:100%;" />
          <div id="zaix-palette-results" style="margin-top:6px; display:flex; flex-direction:column; gap:4px; max-height:120px; overflow-y:auto; font-size:12px;"></div>
        </div>

        <!-- Live Stats Box -->
        <div class="zaix-stats-box">
          <div>
            <div class="zaix-stat-val" id="zaix-words">0</div>
            <div class="zaix-stat-lbl">Words</div>
          </div>
          <div>
            <div class="zaix-stat-val" id="zaix-tokens">0</div>
            <div class="zaix-stat-lbl">Est. Tokens</div>
          </div>
          <div>
            <div class="zaix-stat-val" id="zaix-chars">0</div>
            <div class="zaix-stat-lbl">Characters</div>
          </div>
          <div>
            <div class="zaix-stat-val" id="zaix-code">0</div>
            <div class="zaix-stat-lbl">Code Blocks</div>
          </div>
          <div>
            <div class="zaix-stat-val" id="zaix-tables">0</div>
            <div class="zaix-stat-lbl">Tables</div>
          </div>
          <div>
            <div class="zaix-stat-val" id="zaix-images">0</div>
            <div class="zaix-stat-lbl">Images</div>
          </div>
        </div>

        <!-- Title and Filename Input -->
        <div class="zaix-form-group">
          <label class="zaix-label" for="zaix-title-input">Conversation Title</label>
          <input type="text" id="zaix-title-input" class="zaix-input" value="Z.ai Conversation" />
        </div>

        <div class="zaix-form-group">
          <label class="zaix-label" for="zaix-filename-input">Filename Template</label>
          <input type="text" id="zaix-filename-input" class="zaix-input" value="{{title}}_{{date}}" />
        </div>

        <!-- Range Selection -->
        <div class="zaix-form-group">
          <label class="zaix-label" for="zaix-range-select">Message Range</label>
          <select id="zaix-range-select" class="zaix-select">
            <option value="all">All Messages</option>
            <option value="from_here">From Current View to End</option>
            <option value="custom">Custom Selection</option>
          </select>
        </div>

        <!-- Custom Message Checkbox List Container -->
        <div id="zaix-custom-messages-container" style="display:none; max-height:140px; overflow-y:auto; border:1px solid var(--zaix-border); border-radius:6px; padding:6px; background:var(--zaix-surface); flex-direction:column; gap:6px;">
        </div>

        <!-- Export Format -->
        <div class="zaix-form-group">
          <label class="zaix-label" for="zaix-format-select">Export Format</label>
          <select id="zaix-format-select" class="zaix-select">
            <option value="pdf">PDF (.pdf)</option>
            <option value="md">Markdown (.md)</option>
            <option value="docx">Word Document (.docx)</option>
            <option value="html">Web Page (.html)</option>
            <option value="txt">Plain Text (.txt)</option>
            <option value="json">Raw Data (.json)</option>
            <option value="png">Screenshot / Image (.png)</option>
            <option value="csv">Spreadsheet (.csv)</option>
          </select>
        </div>

        <!-- Format Sub-Options -->
        <div class="zaix-form-group" id="zaix-pdf-engine-group">
          <label class="zaix-label" for="zaix-pdf-engine-select">PDF Engine</label>
          <select id="zaix-pdf-engine-select" class="zaix-select">
            <option value="vector">Vector / Selectable Text (Fast & Clean)</option>
            <option value="raster">Raster / Pixel-Perfect DOM Snapshot</option>
          </select>
        </div>

        <div class="zaix-form-group" id="zaix-md-preset-group" style="display:none;">
          <label class="zaix-label" for="zaix-md-preset-select">Markdown Preset</label>
          <select id="zaix-md-preset-select" class="zaix-select">
            <option value="github">GitHub Flavored Markdown (GFM)</option>
            <option value="obsidian">Obsidian (Wikilinks & Callouts)</option>
            <option value="notion">Notion Compatible</option>
          </select>
        </div>

        <!-- Layout & Typography Controls for PDF/HTML/DOCX -->
        <div id="zaix-layout-controls" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px;">
          <div class="zaix-form-group">
            <label class="zaix-label" for="zaix-page-format-select">Page Format</label>
            <select id="zaix-page-format-select" class="zaix-select">
              <option value="a4">A4</option>
              <option value="letter">Letter</option>
              <option value="legal">Legal</option>
            </select>
          </div>
          <div class="zaix-form-group">
            <label class="zaix-label" for="zaix-margin-select">Margin</label>
            <select id="zaix-margin-select" class="zaix-select">
              <option value="normal">Normal</option>
              <option value="narrow">Narrow</option>
              <option value="wide">Wide</option>
            </select>
          </div>
          <div class="zaix-form-group">
            <label class="zaix-label" for="zaix-font-size-select">Font Size</label>
            <select id="zaix-font-size-select" class="zaix-select">
              <option value="9">9 pt</option>
              <option value="10" selected>10 pt</option>
              <option value="11">11 pt</option>
              <option value="12">12 pt</option>
            </select>
          </div>
        </div>

        <div class="zaix-form-group">
          <label class="zaix-label" for="zaix-theme-select">Theme</label>
          <select id="zaix-theme-select" class="zaix-select">
            <option value="auto">Auto (Match Z.ai theme)</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        <!-- Header / Footer Options -->
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
          <div class="zaix-form-group">
            <label class="zaix-label" for="zaix-header-text">Header Text</label>
            <input type="text" id="zaix-header-text" class="zaix-input" placeholder="Optional header" />
          </div>
          <div class="zaix-form-group">
            <label class="zaix-label" for="zaix-footer-text">Footer Text</label>
            <input type="text" id="zaix-footer-text" class="zaix-input" placeholder="Optional footer" />
          </div>
        </div>

        <!-- Content Toggles -->
        <label class="zaix-checkbox-label">
          <input type="checkbox" id="zaix-chk-toc" />
          <span>Include Table of Contents (TOC)</span>
        </label>

        <label class="zaix-checkbox-label">
          <input type="checkbox" id="zaix-chk-thinking" checked />
          <span>Include Thinking & Reasoning</span>
        </label>

        <label class="zaix-checkbox-label">
          <input type="checkbox" id="zaix-chk-artifacts" checked />
          <span>Include Artifacts / Canvas</span>
        </label>

        <label class="zaix-checkbox-label">
          <input type="checkbox" id="zaix-chk-citations" checked />
          <span>Include Citations & Search Results</span>
        </label>

        <label class="zaix-checkbox-label">
          <input type="checkbox" id="zaix-chk-pii" />
          <span>Anonymize PII (Emails, Keys, Tokens)</span>
        </label>

        <label class="zaix-checkbox-label">
          <input type="checkbox" id="zaix-chk-history" checked />
          <span>Save to Local History</span>
        </label>
      </div>

      <div class="zaix-footer">
        <button type="button" class="zaix-btn" id="zaix-btn-history">History</button>
        <button type="button" class="zaix-btn" id="zaix-btn-preview">Preview</button>
        <button type="button" class="zaix-btn zaix-btn-primary" id="zaix-btn-export">Export Now</button>
      </div>
    </div>
  `;

  // DOM Elements
  const closeBtn = overlay.querySelector('.zaix-close-btn');
  const statusEl = overlay.querySelector('.zaix-status');
  const titleInput = overlay.querySelector('#zaix-title-input');
  const filenameInput = overlay.querySelector('#zaix-filename-input');
  const formatSelect = overlay.querySelector('#zaix-format-select');
  const rangeSelect = overlay.querySelector('#zaix-range-select');
  const customMessagesContainer = overlay.querySelector('#zaix-custom-messages-container');
  const pdfEngineGroup = overlay.querySelector('#zaix-pdf-engine-group');
  const mdPresetGroup = overlay.querySelector('#zaix-md-preset-group');
  const layoutControls = overlay.querySelector('#zaix-layout-controls');
  const exportBtn = overlay.querySelector('#zaix-btn-export');
  const previewBtn = overlay.querySelector('#zaix-btn-preview');
  const historyBtn = overlay.querySelector('#zaix-btn-history');

  // Command Palette Elements
  const commandPalette = overlay.querySelector('#zaix-command-palette');
  const paletteSearch = overlay.querySelector('#zaix-palette-search');
  const paletteResults = overlay.querySelector('#zaix-palette-results');

  const COMMANDS = [
    {
      label: 'Export as PDF',
      action: () => {
        formatSelect.value = 'pdf';
        formatSelect.dispatchEvent(new Event('change'));
        exportBtn.click();
      }
    },
    {
      label: 'Export as Markdown (GitHub)',
      action: () => {
        formatSelect.value = 'md';
        overlay.querySelector('#zaix-md-preset-select').value = 'github';
        formatSelect.dispatchEvent(new Event('change'));
        exportBtn.click();
      }
    },
    {
      label: 'Export as Markdown (Obsidian)',
      action: () => {
        formatSelect.value = 'md';
        overlay.querySelector('#zaix-md-preset-select').value = 'obsidian';
        formatSelect.dispatchEvent(new Event('change'));
        exportBtn.click();
      }
    },
    {
      label: 'Export as DOCX',
      action: () => {
        formatSelect.value = 'docx';
        formatSelect.dispatchEvent(new Event('change'));
        exportBtn.click();
      }
    },
    {
      label: 'Export as JSON',
      action: () => {
        formatSelect.value = 'json';
        formatSelect.dispatchEvent(new Event('change'));
        exportBtn.click();
      }
    },
    {
      label: 'Export as TXT',
      action: () => {
        formatSelect.value = 'txt';
        formatSelect.dispatchEvent(new Event('change'));
        exportBtn.click();
      }
    },
    {
      label: 'Export as CSV',
      action: () => {
        formatSelect.value = 'csv';
        formatSelect.dispatchEvent(new Event('change'));
        exportBtn.click();
      }
    },
    {
      label: 'Toggle PII Anonymization',
      action: () => {
        const chk = overlay.querySelector('#zaix-chk-pii');
        chk.checked = !chk.checked;
      }
    },
    {
      label: 'Open Preview',
      action: () => {
        previewBtn.click();
      }
    },
    {
      label: 'Open History',
      action: () => {
        historyBtn.click();
      }
    }
  ];

  function renderPaletteResults(filter = '') {
    paletteResults.innerHTML = '';
    const filtered = COMMANDS.filter((c) => c.label.toLowerCase().includes(filter.toLowerCase()));
    filtered.forEach((cmd) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'zaix-btn';
      item.style.cssText = 'text-align:left; padding:6px 10px; width:100%; border-radius:4px;';
      item.textContent = cmd.label;
      item.addEventListener('click', () => {
        cmd.action();
        commandPalette.style.display = 'none';
      });
      paletteResults.appendChild(item);
    });
  }

  paletteSearch.addEventListener('input', (e) => {
    renderPaletteResults(e.target.value);
  });

  // Format selection changes
  formatSelect.addEventListener('change', () => {
    const val = formatSelect.value;
    pdfEngineGroup.style.display = val === 'pdf' ? 'flex' : 'none';
    mdPresetGroup.style.display = val === 'md' ? 'flex' : 'none';
    layoutControls.style.display = ['pdf', 'html', 'docx'].includes(val) ? 'grid' : 'none';
  });

  // Range selection changes
  rangeSelect.addEventListener('change', () => {
    customMessagesContainer.style.display = rangeSelect.value === 'custom' ? 'flex' : 'none';
  });

  // Event handlers
  closeBtn.addEventListener('click', onClose);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) onClose();
  });

  exportBtn.addEventListener('click', () => {
    if (typeof onExport === 'function') {
      onExport(getOptions());
    }
  });

  previewBtn.addEventListener('click', () => {
    if (typeof onPreview === 'function') {
      onPreview(getOptions());
    }
  });

  historyBtn.addEventListener('click', () => {
    if (typeof onHistory === 'function') {
      onHistory();
    }
  });

  // Keyboard accessibility: Escape and Ctrl+K (Section 36)
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (commandPalette.style.display !== 'none') {
        commandPalette.style.display = 'none';
      } else {
        onClose();
      }
      e.stopPropagation();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      e.stopPropagation();
      const isVisible = commandPalette.style.display !== 'none';
      commandPalette.style.display = isVisible ? 'none' : 'block';
      if (!isVisible) {
        paletteSearch.value = '';
        renderPaletteResults('');
        paletteSearch.focus();
      }
    }
  });

  function getSelectedMessageIndices() {
    if (rangeSelect.value !== 'custom') return null;
    const checkboxes = customMessagesContainer.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checkboxes).map((cb) => parseInt(cb.getAttribute('data-index'), 10));
  }

  function getOptions() {
    return {
      title: titleInput.value.trim() || 'Z.ai Conversation',
      template: filenameInput.value.trim(),
      range: rangeSelect.value,
      selectedIndices: getSelectedMessageIndices(),
      format: formatSelect.value,
      engine: overlay.querySelector('#zaix-pdf-engine-select').value,
      preset: overlay.querySelector('#zaix-md-preset-select').value,
      theme: overlay.querySelector('#zaix-theme-select').value,
      pageFormat: overlay.querySelector('#zaix-page-format-select').value,
      margin: overlay.querySelector('#zaix-margin-select').value,
      fontSize: parseInt(overlay.querySelector('#zaix-font-size-select').value, 10),
      includeToc: overlay.querySelector('#zaix-chk-toc').checked,
      headerText: overlay.querySelector('#zaix-header-text').value.trim(),
      footerText: overlay.querySelector('#zaix-footer-text').value.trim(),
      includeThinking: overlay.querySelector('#zaix-chk-thinking').checked,
      includeArtifacts: overlay.querySelector('#zaix-chk-artifacts').checked,
      includeCitations: overlay.querySelector('#zaix-chk-citations').checked,
      anonymizePii: overlay.querySelector('#zaix-chk-pii').checked,
      saveHistory: overlay.querySelector('#zaix-chk-history').checked
    };
  }

  function updateStats(stats) {
    if (!stats) return;
    overlay.querySelector('#zaix-words').textContent = (stats.words || 0).toLocaleString();
    overlay.querySelector('#zaix-tokens').textContent = (stats.tokensEst || 0).toLocaleString();
    overlay.querySelector('#zaix-chars').textContent = (stats.chars || 0).toLocaleString();
    overlay.querySelector('#zaix-code').textContent = (stats.codeBlocks || 0).toLocaleString();
    overlay.querySelector('#zaix-tables').textContent = (stats.tables || 0).toLocaleString();
    overlay.querySelector('#zaix-images').textContent = (stats.images || 0).toLocaleString();
  }

  function setConversationData(conv) {
    if (!conv) return;
    if (conv.title) {
      titleInput.value = conv.title;
    }
    if (conv.stats) {
      updateStats(conv.stats);
    }
    if (Array.isArray(conv.messages)) {
      customMessagesContainer.innerHTML = '';
      conv.messages.forEach((m) => {
        const row = document.createElement('label');
        row.className = 'zaix-checkbox-label';
        row.style.fontSize = '12px';
        const snippet = (m.text || '').substring(0, 60);

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.setAttribute('data-index', String(m.index));
        cb.checked = true;

        const textSpan = document.createElement('span');
        const strong = document.createElement('strong');
        strong.textContent = `#${m.index + 1} (${m.role}): `;
        textSpan.appendChild(strong);
        textSpan.appendChild(document.createTextNode(`${snippet}...`));

        row.appendChild(cb);
        row.appendChild(textSpan);
        customMessagesContainer.appendChild(row);
      });
    }
  }

  function setStatus(text, isError = false, diagnostics = null) {
    if (!text) {
      statusEl.style.display = 'none';
      return;
    }
    statusEl.innerHTML = '';

    const textSpan = document.createElement('span');
    textSpan.textContent = text;
    statusEl.appendChild(textSpan);

    if (isError) {
      statusEl.classList.add('error');
      // Optional Copy diagnostics button (Section 18 & 32)
      const copyDiagBtn = document.createElement('button');
      copyDiagBtn.type = 'button';
      copyDiagBtn.className = 'zaix-btn';
      copyDiagBtn.style.cssText = 'margin-left: 10px; padding: 2px 6px; font-size: 11px;';
      copyDiagBtn.textContent = 'Copy diagnostics';
      copyDiagBtn.addEventListener('click', () => {
        const diagInfo = {
          extensionVersion: '2.0.0',
          host: typeof window !== 'undefined' ? window.location?.host : 'unknown',
          format: formatSelect.value,
          diagnostics: diagnostics || { message: text }
        };
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(JSON.stringify(diagInfo, null, 2));
          copyDiagBtn.textContent = 'Copied!';
        } else {
          console.info('[Z.ai Diagnostics]', diagInfo);
          copyDiagBtn.textContent = 'Logged to console';
        }
        setTimeout(() => {
          copyDiagBtn.textContent = 'Copy diagnostics';
        }, 2000);
      });
      statusEl.appendChild(copyDiagBtn);
    } else {
      statusEl.classList.remove('error');
    }
    statusEl.style.display = 'block';
  }

  function setStreaming(streaming) {
    if (streaming) {
      exportBtn.disabled = true;
      setStatus(t('statusStreaming'));
    } else {
      exportBtn.disabled = false;
      setStatus('');
    }
  }

  return {
    element: overlay,
    updateStats,
    setConversationData,
    setStatus,
    setStreaming,
    getOptions
  };
}
