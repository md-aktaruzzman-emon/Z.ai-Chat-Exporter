/**
 * @file options.js
 * Controller for Settings & Options page with live filename preview,
 * unsaved changes indicator, and animated toast feedback.
 * Section 22 of the authoritative specification.
 */

const SETTINGS_KEY = 'zaix_user_settings';

const DEFAULT_SETTINGS = {
  template: '{{title}}_{{date}}',
  theme: 'auto',
  pdfEngine: 'vector',
  mdPreset: 'github',
  anonymizePii: false,
  historyOptin: true,
  contextMenu: false
};

document.addEventListener('DOMContentLoaded', async () => {
  const templateInput = document.getElementById('opt-filename-template');
  const previewEl = document.getElementById('filename-live-preview');
  const unsavedBadge = document.getElementById('unsaved-badge');
  const saveToast = document.getElementById('save-toast');

  const themeSelect = document.getElementById('opt-default-theme');
  const pdfEngineSelect = document.getElementById('opt-pdf-engine');
  const mdPresetSelect = document.getElementById('opt-md-preset');
  const piiCheckbox = document.getElementById('opt-anonymize-pii');
  const historyCheckbox = document.getElementById('opt-history-optin');
  const contextMenuCheckbox = document.getElementById('opt-context-menu');

  const saveBtn = document.getElementById('btn-save-settings');
  const saveStatus = document.getElementById('save-status');

  const exportProfileBtn = document.getElementById('btn-export-profile');
  const importProfileBtn = document.getElementById('btn-import-profile');
  const fileInput = document.getElementById('file-import-profile');

  // Load saved settings
  let initialSettings = Object.assign({}, DEFAULT_SETTINGS);
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      const stored = await chrome.storage.sync.get(SETTINGS_KEY);
      initialSettings = Object.assign({}, DEFAULT_SETTINGS, stored[SETTINGS_KEY]);
    }
  } catch (err) {
    console.warn('[Options] storage.sync unavailable, using defaults:', err);
  }

  templateInput.value = initialSettings.template;
  themeSelect.value = initialSettings.theme;
  pdfEngineSelect.value = initialSettings.pdfEngine;
  mdPresetSelect.value = initialSettings.mdPreset;
  piiCheckbox.checked = initialSettings.anonymizePii;
  historyCheckbox.checked = initialSettings.historyOptin;

  function updateLivePreview() {
    const rawTpl = templateInput.value.trim() || '{{title}}_{{date}}';
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const modelStr = 'GLM-5.3-Flash';
    const formatStr = 'pdf';

    const rendered = rawTpl
      .replace(/\{\{title\}\}/g, 'Machine_Learning_Lecture')
      .replace(/\{\{date\}\}/g, dateStr)
      .replace(/\{\{time\}\}/g, timeStr)
      .replace(/\{\{model\}\}/g, modelStr)
      .replace(/\{\{format\}\}/g, formatStr);

    if (previewEl) {
      previewEl.textContent = `${rendered}.${formatStr}`;
    }
  }

  function checkUnsavedChanges() {
    const hasChanges =
      templateInput.value !== initialSettings.template ||
      themeSelect.value !== initialSettings.theme ||
      pdfEngineSelect.value !== initialSettings.pdfEngine ||
      mdPresetSelect.value !== initialSettings.mdPreset ||
      piiCheckbox.checked !== initialSettings.anonymizePii ||
      historyCheckbox.checked !== initialSettings.historyOptin;

    if (unsavedBadge) {
      unsavedBadge.style.display = hasChanges ? 'inline-flex' : 'none';
    }
  }

  updateLivePreview();
  templateInput.addEventListener('input', () => {
    updateLivePreview();
    checkUnsavedChanges();
  });

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  applyTheme(initialSettings.theme);

  themeSelect.addEventListener('change', () => {
    applyTheme(themeSelect.value);
    checkUnsavedChanges();
  });

  [pdfEngineSelect, mdPresetSelect, piiCheckbox, historyCheckbox].forEach((el) => {
    el.addEventListener('change', checkUnsavedChanges);
  });

  // Interactive token pills
  const tokenPills = document.querySelectorAll('.token-pill');
  tokenPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const token = pill.getAttribute('data-token');
      if (!token) return;
      const start = templateInput.selectionStart || templateInput.value.length;
      const end = templateInput.selectionEnd || templateInput.value.length;
      const val = templateInput.value;
      templateInput.value = val.substring(0, start) + token + val.substring(end);
      templateInput.focus();
      templateInput.setSelectionRange(start + token.length, start + token.length);
      updateLivePreview();
      checkUnsavedChanges();
    });
  });

  // Check runtime contextMenus permission
  try {
    if (typeof chrome !== 'undefined' && chrome.permissions) {
      const hasCtxPermission = await chrome.permissions.contains({ permissions: ['contextMenus'] });
      contextMenuCheckbox.checked = hasCtxPermission && initialSettings.contextMenu;

      contextMenuCheckbox.addEventListener('change', async () => {
        if (contextMenuCheckbox.checked) {
          const granted = await chrome.permissions.request({ permissions: ['contextMenus'] });
          if (!granted) {
            contextMenuCheckbox.checked = false;
            alert('Context menu permission was not granted.');
          }
        } else {
          await chrome.permissions.remove({ permissions: ['contextMenus'] });
        }
        checkUnsavedChanges();
      });
    }
  } catch {
    // ignore permission check in mock environments
  }

  function showToast(message = 'Preferences saved successfully!') {
    if (!saveToast) return;
    const textEl = saveToast.querySelector('.toast-text');
    if (textEl) textEl.textContent = message;
    saveToast.classList.remove('hidden');

    setTimeout(() => {
      saveToast.classList.add('hidden');
    }, 2800);
  }

  saveBtn.addEventListener('click', async () => {
    const newSettings = {
      template: templateInput.value.trim() || DEFAULT_SETTINGS.template,
      theme: themeSelect.value,
      pdfEngine: pdfEngineSelect.value,
      mdPreset: mdPresetSelect.value,
      anonymizePii: piiCheckbox.checked,
      historyOptin: historyCheckbox.checked,
      contextMenu: contextMenuCheckbox.checked
    };

    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        await chrome.storage.sync.set({ [SETTINGS_KEY]: newSettings });
      }
      initialSettings = Object.assign({}, newSettings);
      checkUnsavedChanges();
      showToast('Settings saved successfully!');
    } catch (err) {
      console.error('[Options] Failed to save settings:', err);
      if (saveStatus) {
        saveStatus.textContent = 'Save failed. Please try again.';
      }
    }
  });

  // Selector Profile Export
  exportProfileBtn.addEventListener('click', async () => {
    let profile = {
      schemaVersion: 1,
      createdAt: Date.now(),
      host: 'chat.z.ai',
      manualOverrides: {}
    };

    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const stored = await chrome.storage.local.get('zai_selector_profile');
        if (stored?.zai_selector_profile) {
          profile = stored.zai_selector_profile;
        }
      }
    } catch {
      // fallback
    }

    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zai_selector_profile.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Selector profile exported as JSON!');
  });

  // Selector Profile Import
  importProfileBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid profile schema');
        }
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          await chrome.storage.local.set({ zai_selector_profile: parsed });
        }
        showToast('Selector profile imported successfully!');
      } catch (err) {
        alert(`Failed to import profile: ${err.message}`);
      }
    };
    reader.readAsText(file);
  });
});
