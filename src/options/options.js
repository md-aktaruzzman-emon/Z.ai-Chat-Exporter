/**
 * @file options.js
 * Controller for Settings & Options page.
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
  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  const settings = Object.assign({}, DEFAULT_SETTINGS, stored[SETTINGS_KEY]);

  templateInput.value = settings.template;
  themeSelect.value = settings.theme;
  pdfEngineSelect.value = settings.pdfEngine;
  mdPresetSelect.value = settings.mdPreset;
  piiCheckbox.checked = settings.anonymizePii;
  historyCheckbox.checked = settings.historyOptin;

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  applyTheme(settings.theme);

  themeSelect.addEventListener('change', () => {
    applyTheme(themeSelect.value);
  });

  // Interactive token pills to easily insert template variables
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
    });
  });

  // Check actual runtime contextMenus permission status
  const hasCtxPermission = await chrome.permissions.contains({ permissions: ['contextMenus'] });
  contextMenuCheckbox.checked = hasCtxPermission && settings.contextMenu;

  // Context menu permission toggle flow (Section 22)
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
  });

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

    await chrome.storage.sync.set({ [SETTINGS_KEY]: newSettings });

    saveStatus.textContent = 'Settings saved successfully!';
    setTimeout(() => {
      saveStatus.textContent = '';
    }, 2500);
  });

  // Selector Profile Export
  exportProfileBtn.addEventListener('click', async () => {
    const profile = (await chrome.storage.local.get('zai_selector_profile'))
      ?.zai_selector_profile || {
      schemaVersion: 1,
      createdAt: Date.now(),
      host: 'chat.z.ai',
      manualOverrides: {}
    };

    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zai_selector_profile.json';
    a.click();
    URL.revokeObjectURL(url);
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
        await chrome.storage.local.set({ zai_selector_profile: parsed });
        alert('Selector profile imported successfully!');
      } catch (err) {
        alert(`Failed to import selector profile: ${err.message}`);
      }
    };
    reader.readAsText(file);
  });
});
