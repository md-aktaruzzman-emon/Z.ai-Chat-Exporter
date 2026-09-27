/**
 * @file panel.js
 * Main Export Control Panel injected in closed Shadow DOM.
 * Includes Selective Turn Export, Markdown Clipboard Copy, and Command Palette.
 * Section 18 of the authoritative specification.
 */

import { t } from '../../core/utils/i18n.js';
import * as markdownExporter from '../../exporters/markdown.js';

/**
 * Creates the export panel component.
 * @param {Object} props
 * @param {Function} props.onExport - Triggers export with selected options
 * @param {Function} props.onPreview - Triggers preview modal
 * @param {Function} props.onHistory - Opens history drawer
 * @param {Function} props.onClose - Closes the panel
 * @param {Function} [props.onThemeChange] - Handles theme changes
 * @returns {{
 *   element: HTMLElement,
 *   updateStats: (stats: Object) => void,
 *   setConversationData: (conv: Object) => void,
 *   setStatus: (status: string, isError?: boolean, diagnostics?: Object) => void,
 *   setStreaming: (isStreaming: boolean) => void,
 *   getOptions: () => Object,
 *   setTheme: (theme: string) => void
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
          <svg viewBox="0 0 48 48" width="22" height="22" fill="none" style="border-radius:6px; flex-shrink:0;">
            <defs>
              <linearGradient id="panelLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#4F46E5" />
                <stop offset="100%" stop-color="#06B6D4" />
              </linearGradient>
            </defs>
            <rect width="48" height="48" rx="12" fill="url(#panelLogoGrad)" />
            <path d="M12 15C12 12.7909 13.7909 11 16 11H32C34.2091 11 36 12.7909 36 15V27C36 29.2091 34.2091 31 32 31H20L14 36V31H16C13.7909 31 12 29.2091 12 27V15Z" fill="rgba(15, 23, 42, 0.3)" />
            <path d="M17 17.5H31L20.5 28.5H31" stroke="#FFFFFF" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M29 14L34 14M34 14V19M34 14L26 22" stroke="#38BDF8" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
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

          <!-- Message Range Selection -->
          <div class="zaix-form-group">
            <label class="zaix-label" for="zaix-range-select">Message Range</label>
            <select id="zaix-range-select" class="zaix-select">
              <option value="all">All Messages in Thread</option>
              <option value="from_here">From Current View to End</option>
              <option value="custom">Custom Selective Turns</option>
            </select>
          </div>

          <!-- Custom Message Selective Turns Section -->
          <div id="zaix-custom-messages-section" style="display:none; flex-direction:column; gap:6px; margin-top:8px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap;">
              <input type="text" id="zaix-turn-filter" placeholder="🔍 Filter turns by keyword..." class="zaix-input" style="flex:1; min-width:130px; padding:4px 8px; font-size:11.5px;" />
              <div style="display:flex; gap:4px;">
                <button type="button" id="zaix-btn-select-all" class="zaix-btn-pill" style="font-size:10.5px; padding:2px 6px;">All</button>
                <button type="button" id="zaix-btn-select-none" class="zaix-btn-pill" style="font-size:10.5px; padding:2px 6px;">None</button>
                <button type="button" id="zaix-btn-select-user" class="zaix-btn-pill" style="font-size:10.5px; padding:2px 6px;">👤 User</button>
                <button type="button" id="zaix-btn-select-ai" class="zaix-btn-pill" style="font-size:10.5px; padding:2px 6px;">🤖 AI</button>
              </div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--zaix-muted); padding:0 2px;">
              <span id="zaix-turn-counter">Selected 0 of 0 messages</span>
            </div>
            <div id="zaix-custom-messages-container" style="max-height:140px; overflow-y:auto; border:1px solid var(--zaix-border); border-radius:6px; padding:6px; background:var(--zaix-surface); display:flex; flex-direction:column; gap:4px;">
            </div>
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

      <!-- Footer with Live Status Feedback & Quick Actions -->
      <div class="zaix-footer">
        <div class="zaix-footer-status" id="zaix-footer-status" style="display:none;"></div>
        <div class="zaix-footer-actions">
          <button type="button" class="zaix-btn" id="zaix-btn-copy-md" title="Copy clean formatted Markdown to clipboard">📋 Copy MD</button>
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

  const customMessagesSection = overlay.querySelector('#zaix-custom-messages-section');
  const customMessagesContainer = overlay.querySelector('#zaix-custom-messages-container');
  const turnFilterInput = overlay.querySelector('#zaix-turn-filter');
  const turnCounterEl = overlay.querySelector('#zaix-turn-counter');
  const btnSelectAll = overlay.querySelector('#zaix-btn-select-all');
  const btnSelectNone = overlay.querySelector('#zaix-btn-select-none');
  const btnSelectUser = overlay.querySelector('#zaix-btn-select-user');
  const btnSelectAi = overlay.querySelector('#zaix-btn-select-ai');

  const pdfEngineGroup = overlay.querySelector('#zaix-pdf-engine-group');
  const mdPresetGroup = overlay.querySelector('#zaix-md-preset-group');
  const layoutControls = overlay.querySelector('#zaix-layout-controls');
  const exportBtn = overlay.querySelector('#zaix-btn-export');
  const previewBtn = overlay.querySelector('#zaix-btn-preview');
  const historyBtn = overlay.querySelector('#zaix-btn-history');
  const copyMdBtn = overlay.querySelector('#zaix-btn-copy-md');
  const themeSelect = overlay.querySelector('#zaix-theme-select');
  const themeToggleBtn = overlay.querySelector('#zaix-panel-theme-toggle');

  let currentTheme = 'light';
  let activeConversation = null;

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
      label: 'Export as PDF Document',
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
      label: 'Copy Clean Markdown to Clipboard',
      action: () => {
        if (copyMdBtn) copyMdBtn.click();
      }
    },
    {
      label: 'Export as Word DOCX',
      action: () => {
        formatSelect.value = 'docx';
        formatSelect.dispatchEvent(new Event('change'));
        exportBtn.click();
      }
    },
    {
      label: 'Export as Raw JSON Data',
      action: () => {
        formatSelect.value = 'json';
        formatSelect.dispatchEvent(new Event('change'));
        exportBtn.click();
      }
    },
    {
      label: 'Toggle Theme (Light / Dark)',
      action: () => {
        if (themeToggleBtn) themeToggleBtn.click();
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
    customMessagesSection.style.display = rangeSelect.value === 'custom' ? 'flex' : 'none';
  });

  function updateTurnCounter() {
    const total = customMessagesContainer.querySelectorAll('.zaix-turn-row').length;
    const checked = customMessagesContainer.querySelectorAll('.zaix-turn-cb:checked').length;
    if (turnCounterEl) {
      turnCounterEl.textContent = `Selected ${checked} of ${total} message${total === 1 ? '' : 's'}`;
    }
  }

  // Selective Turn Controls
  if (btnSelectAll) {
    btnSelectAll.addEventListener('click', () => {
      customMessagesContainer.querySelectorAll('.zaix-turn-cb').forEach((cb) => (cb.checked = true));
      updateTurnCounter();
    });
  }

  if (btnSelectNone) {
    btnSelectNone.addEventListener('click', () => {
      customMessagesContainer.querySelectorAll('.zaix-turn-cb').forEach((cb) => (cb.checked = false));
      updateTurnCounter();
    });
  }

  if (btnSelectUser) {
    btnSelectUser.addEventListener('click', () => {
      customMessagesContainer.querySelectorAll('.zaix-turn-row').forEach((row) => {
        const isUser = row.getAttribute('data-role') === 'user';
        const cb = row.querySelector('.zaix-turn-cb');
        if (cb) cb.checked = isUser;
      });
      updateTurnCounter();
    });
  }

  if (btnSelectAi) {
    btnSelectAi.addEventListener('click', () => {
      customMessagesContainer.querySelectorAll('.zaix-turn-row').forEach((row) => {
        const isAi = row.getAttribute('data-role') === 'assistant';
        const cb = row.querySelector('.zaix-turn-cb');
        if (cb) cb.checked = isAi;
      });
      updateTurnCounter();
    });
  }

  if (turnFilterInput) {
    turnFilterInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      customMessagesContainer.querySelectorAll('.zaix-turn-row').forEach((row) => {
        const txt = row.textContent.toLowerCase();
        row.style.display = txt.includes(q) ? 'flex' : 'none';
      });
    });
  }

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

  // Copy Clean Markdown to Clipboard
  if (copyMdBtn) {
    copyMdBtn.addEventListener('click', async () => {
      if (!activeConversation) return;
      try {
        const opts = getOptions();
        let targetMessages = activeConversation.messages || [];

        if (opts.selectedIndices && Array.isArray(opts.selectedIndices)) {
          const s = new Set(opts.selectedIndices);
          targetMessages = targetMessages.filter((m) => s.has(m.index));
        }

        const convClone = {
          ...activeConversation,
          messages: targetMessages
        };

        const mdRes = await markdownExporter.exportConversation(convClone, {
          preset: opts.preset || 'github',
          includeThinking: opts.includeThinking,
          includeArtifacts: opts.includeArtifacts,
          includeCitations: opts.includeCitations
        });

        const text = await mdRes.blob.text();
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          const origText = copyMdBtn.textContent;
          copyMdBtn.textContent = '✓ Copied!';
          copyMdBtn.style.color = '#10b981';
          setTimeout(() => {
            copyMdBtn.textContent = origText;
            copyMdBtn.style.color = '';
          }, 2000);
        }
      } catch (err) {
        console.error('[Panel] Copy Markdown error:', err);
      }
    });
  }

  // Keyboard accessibility: Escape and Ctrl+K
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
    const checkboxes = customMessagesContainer.querySelectorAll('.zaix-turn-cb:checked');
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
    activeConversation = conv;

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
        row.className = 'zaix-checkbox-label zaix-turn-row';
        row.setAttribute('data-role', m.role || 'assistant');
        row.style.cssText = 'font-size: 11.5px; padding: 4px 6px; border-radius: 4px; display: flex; align-items: center; gap: 6px; cursor: pointer; transition: background 0.15s ease;';

        const snippet = (m.text || '').substring(0, 60).replace(/\n/g, ' ');
        const roleIcon = m.role === 'user' ? '👤' : '🤖';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'zaix-turn-cb';
        cb.setAttribute('data-index', String(m.index));
        cb.checked = true;
        cb.addEventListener('change', updateTurnCounter);

        const textSpan = document.createElement('span');
        textSpan.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;';
        const strong = document.createElement('strong');
        strong.textContent = `${roleIcon} #${m.index + 1}: `;
        textSpan.appendChild(strong);
        textSpan.appendChild(document.createTextNode(`${snippet}...`));

        row.appendChild(cb);
        row.appendChild(textSpan);
        customMessagesContainer.appendChild(row);
      });
      updateTurnCounter();
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

      const copyDiagBtn = document.createElement('button');
      copyDiagBtn.type = 'button';
      copyDiagBtn.className = 'zaix-btn';
      copyDiagBtn.style.cssText = 'margin-left: 8px; padding: 2px 6px; font-size: 11px;';
      copyDiagBtn.textContent = 'Copy diagnostics';
      copyDiagBtn.addEventListener('click', () => {
        const diagInfo = {
          extensionVersion: '2.1.0',
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
