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
export function createPanel({ onExport, onPreview, onHistory, onClose, onThemeChange }) {
  const overlay = document.createElement('div');
  overlay.className = 'zaix-panel-overlay hidden';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Export Conversation');

  overlay.innerHTML = `
    <div class="zaix-panel">
      <!-- Header -->
      <div class="zaix-header">
        <div class="zaix-header-brand">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="var(--zaix-primary)">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
          </svg>
          <h2 class="zaix-title">Z.ai Chat Exporter</h2>
          <span class="zaix-badge">Ctrl+K</span>
        </div>
        <div class="zaix-header-actions">
          <button type="button" id="zaix-panel-theme-toggle" class="zaix-btn-pill" title="Toggle Theme (Light / Dark / Auto)">☀️ Light</button>
          <button type="button" class="zaix-close-btn" aria-label="Close dialog">&times;</button>
        </div>
      </div>

      <div class="zaix-body">
        <!-- Status Notification Banner -->
        <div class="zaix-status" aria-live="polite" style="display:none;"></div>

        <!-- Command Palette (Ctrl+K) -->
        <div id="zaix-command-palette" style="display:none; margin-bottom:10px; background:var(--zaix-surface); border:1px solid var(--zaix-primary); border-radius:6px; padding:8px;">
          <input type="text" id="zaix-palette-search" placeholder="Type a command or format (e.g. pdf, md, docx)..." class="zaix-input" style="width:100%;" />
          <div id="zaix-palette-results" style="margin-top:6px; display:flex; flex-direction:column; gap:4px; max-height:120px; overflow-y:auto; font-size:12px;"></div>
        </div>

        <!-- Live Stats Ribbon (Compact row) -->
        <div class="zaix-stats-ribbon">
          <div class="zaix-stat-item"><span class="zaix-stat-val" id="zaix-words">0</span><span class="zaix-stat-lbl">words</span></div>
          <div class="zaix-stat-item"><span class="zaix-stat-val" id="zaix-tokens">0</span><span class="zaix-stat-lbl">tokens</span></div>
          <div class="zaix-stat-item"><span class="zaix-stat-val" id="zaix-chars">0</span><span class="zaix-stat-lbl">chars</span></div>
          <div class="zaix-stat-item"><span class="zaix-stat-val" id="zaix-code">0</span><span class="zaix-stat-lbl">code</span></div>
          <div class="zaix-stat-item"><span class="zaix-stat-val" id="zaix-tables">0</span><span class="zaix-stat-lbl">tables</span></div>
          <div class="zaix-stat-item"><span class="zaix-stat-val" id="zaix-images">0</span><span class="zaix-stat-lbl">images</span></div>
        </div>

        <!-- Main Configuration Card -->
        <div class="zaix-card">
          <!-- Format & Engine Row -->
          <div class="zaix-form-row">
            <div class="zaix-form-group zaix-flex-1">
              <label class="zaix-label" for="zaix-format-select">Export Format</label>
              <select id="zaix-format-select" class="zaix-select">
                <option value="pdf">PDF Document (.pdf)</option>
                <option value="docx">Word Document (.docx)</option>
                <option value="md">Markdown (.md)</option>
                <option value="html">Web Page (.html)</option>
                <option value="txt">Plain Text (.txt)</option>
                <option value="json">Raw Data (.json)</option>
                <option value="png">Screenshot / Image (.png)</option>
                <option value="csv">Spreadsheet (.csv)</option>
              </select>
            </div>
            <div class="zaix-form-group zaix-flex-1" id="zaix-pdf-engine-group">
              <label class="zaix-label" for="zaix-pdf-engine-select">PDF Engine</label>
              <select id="zaix-pdf-engine-select" class="zaix-select">
                <option value="vector">Vector (Fast & Clean)</option>
                <option value="raster">Raster (Snapshot)</option>
              </select>
            </div>
            <div class="zaix-form-group zaix-flex-1" id="zaix-md-preset-group" style="display:none;">
              <label class="zaix-label" for="zaix-md-preset-select">Markdown Preset</label>
              <select id="zaix-md-preset-select" class="zaix-select">
                <option value="github">GitHub Flavored (GFM)</option>
                <option value="obsidian">Obsidian Callouts</option>
                <option value="notion">Notion Compatible</option>
              </select>
            </div>
          </div>

          <!-- Title Input -->
          <div class="zaix-form-group">
            <label class="zaix-label" for="zaix-title-input">Conversation Title</label>
            <input type="text" id="zaix-title-input" class="zaix-input" value="Z.ai Conversation" />
          </div>

          <!-- Message Range -->
          <div class="zaix-form-group">
            <label class="zaix-label" for="zaix-range-select">Message Range</label>
            <select id="zaix-range-select" class="zaix-select">
              <option value="all">All Messages in Thread</option>
              <option value="from_here">From Current View to End</option>
              <option value="custom">Custom Selection</option>
            </select>
          </div>

          <!-- Custom Message Checkbox List Container -->
          <div id="zaix-custom-messages-container" style="display:none; max-height:140px; overflow-y:auto; border:1px solid var(--zaix-border); border-radius:6px; padding:6px; background:var(--zaix-bg); flex-direction:column; gap:6px;">
          </div>
        </div>

        <!-- Collapsible Advanced Document Options -->
        <details class="zaix-details" id="zaix-advanced-details">
          <summary class="zaix-summary">
            <span>⚙️ Document Layout & Advanced Options</span>
            <span class="zaix-caret">▾</span>
          </summary>
          <div class="zaix-details-content">
            <!-- Filename Template -->
            <div class="zaix-form-group">
              <label class="zaix-label" for="zaix-filename-input">Filename Template</label>
              <input type="text" id="zaix-filename-input" class="zaix-input" value="{{title}}_{{date}}" />
            </div>

            <!-- Layout & Typography Controls for PDF/HTML/DOCX -->
            <div id="zaix-layout-controls" class="zaix-grid-3">
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
              <label class="zaix-label" for="zaix-theme-select">Document Theme</label>
              <select id="zaix-theme-select" class="zaix-select">
                <option value="light" selected>Light (Clean & Printable)</option>
                <option value="dark">Dark</option>
                <option value="auto">Auto (Match Z.ai theme)</option>
              </select>
            </div>

            <!-- Header / Footer Options -->
            <div class="zaix-grid-2">
              <div class="zaix-form-group">
                <label class="zaix-label" for="zaix-header-text">Header Text</label>
                <input type="text" id="zaix-header-text" class="zaix-input" placeholder="Optional header" />
              </div>
              <div class="zaix-form-group">
                <label class="zaix-label" for="zaix-footer-text">Footer Text</label>
                <input type="text" id="zaix-footer-text" class="zaix-input" placeholder="Optional footer" />
              </div>
            </div>

            <!-- Content Toggles (2-column grid) -->
            <div class="zaix-checkbox-grid">
              <label class="zaix-checkbox-label">
                <input type="checkbox" id="zaix-chk-toc" />
                <span>Table of Contents</span>
              </label>
              <label class="zaix-checkbox-label">
                <input type="checkbox" id="zaix-chk-thinking" checked />
                <span>Thinking & Reasoning</span>
              </label>
              <label class="zaix-checkbox-label">
                <input type="checkbox" id="zaix-chk-artifacts" checked />
                <span>Artifacts / Canvas</span>
              </label>
              <label class="zaix-checkbox-label">
                <input type="checkbox" id="zaix-chk-citations" checked />
                <span>Citations & Search</span>
              </label>
              <label class="zaix-checkbox-label">
                <input type="checkbox" id="zaix-chk-pii" />
                <span>Anonymize PII</span>
              </label>
              <label class="zaix-checkbox-label">
                <input type="checkbox" id="zaix-chk-history" checked />
                <span>Save to History</span>
              </label>
            </div>
          </div>
        </details>
      </div>

      <!-- Footer with Live Status Feedback -->
      <div class="zaix-footer">
        <div class="zaix-footer-status" id="zaix-footer-status" style="display:none;"></div>
        <div class="zaix-footer-actions">
          <button type="button" class="zaix-btn" id="zaix-btn-history">History</button>
          <button type="button" class="zaix-btn" id="zaix-btn-preview">Preview</button>
          <button type="button" class="zaix-btn zaix-btn-primary" id="zaix-btn-export">Export Now</button>
        </div>
      </div>
    </div>
  `;

  // DOM Elements
  const closeBtn = overlay.querySelector('.zaix-close-btn');
  const statusEl = overlay.querySelector('.zaix-status');
  const footerStatusEl = overlay.querySelector('#zaix-footer-status');
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
  const themeSelect = overlay.querySelector('#zaix-theme-select');
  const themeToggleBtn = overlay.querySelector('#zaix-panel-theme-toggle');

  let currentTheme = 'light';

  function updateThemeDisplay(theme) {
    currentTheme = theme;
    if (themeSelect) themeSelect.value = theme;
    if (themeToggleBtn) {
      if (theme === 'dark') {
        themeToggleBtn.textContent = '🌙 Dark';
        themeToggleBtn.setAttribute('title', 'Theme: Dark (Click to cycle)');
      } else if (theme === 'light') {
        themeToggleBtn.textContent = '☀️ Light';
        themeToggleBtn.setAttribute('title', 'Theme: Light (Click to cycle)');
      } else {
        themeToggleBtn.textContent = '⚙️ Auto';
        themeToggleBtn.setAttribute('title', 'Theme: Auto (Click to cycle)');
      }
    }
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const nextTheme =
        currentTheme === 'light' ? 'dark' : currentTheme === 'dark' ? 'auto' : 'light';
      updateThemeDisplay(nextTheme);
      if (typeof onThemeChange === 'function') {
        onThemeChange(nextTheme);
      }
    });
  }

  if (themeSelect) {
    themeSelect.addEventListener('change', () => {
      updateThemeDisplay(themeSelect.value);
      if (typeof onThemeChange === 'function') {
        onThemeChange(themeSelect.value);
      }
    });
  }

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
      if (footerStatusEl) footerStatusEl.style.display = 'none';
      return;
    }
    statusEl.innerHTML = '';
    if (footerStatusEl) footerStatusEl.innerHTML = '';

    const textSpan = document.createElement('span');
    textSpan.textContent = text;
    statusEl.appendChild(textSpan);

    if (footerStatusEl) {
      const footerSpan = document.createElement('span');
      footerSpan.textContent = text;
      footerStatusEl.appendChild(footerSpan);
    }

    if (isError) {
      statusEl.classList.add('error');
      if (footerStatusEl) {
        footerStatusEl.classList.add('error');
        footerStatusEl.classList.remove('success');
      }
      exportBtn.disabled = false;
      exportBtn.classList.remove('success');
      exportBtn.innerHTML = 'Export Now';

      // Optional Copy diagnostics button (Section 18 & 32)
      const copyDiagBtn = document.createElement('button');
      copyDiagBtn.type = 'button';
      copyDiagBtn.className = 'zaix-btn';
      copyDiagBtn.style.cssText = 'margin-left: 8px; padding: 2px 6px; font-size: 11px;';
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
      if (footerStatusEl) {
        footerStatusEl.appendChild(copyDiagBtn.cloneNode(true));
      }
    } else {
      statusEl.classList.remove('error');
      if (footerStatusEl) {
        footerStatusEl.classList.remove('error');
      }
      const lower = text.toLowerCase();
      if (lower.includes('complete') || lower.includes('success') || lower.includes('ready')) {
        if (footerStatusEl) footerStatusEl.classList.add('success');
        exportBtn.classList.add('success');
        exportBtn.innerHTML = '✓ Saved!';
      } else if (
        lower.includes('reading') ||
        lower.includes('formatting') ||
        lower.includes('generating') ||
        lower.includes('scraping') ||
        lower.includes('rendering')
      ) {
        exportBtn.disabled = true;
        exportBtn.innerHTML = '<span class="zaix-spinner"></span> Exporting...';
      }
    }
    statusEl.style.display = 'block';
    if (footerStatusEl) footerStatusEl.style.display = 'flex';
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
    getOptions,
    setTheme: updateThemeDisplay
  };
}
