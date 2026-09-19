/**
 * @file popup.js
 * Controller for extension action toolbar popup.
 * Section 21 of the authoritative specification.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const statusBox = document.getElementById('page-status-box');
  const openBtn = document.getElementById('btn-open-panel');
  const optionsBtn = document.getElementById('btn-open-options');
  const quickBtns = document.querySelectorAll('.btn-quick');

  // Load saved theme preference
  try {
    const stored = await chrome.storage?.sync?.get('zaix_user_settings');
    const savedTheme = stored?.zaix_user_settings?.theme;
    if (savedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (savedTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  } catch {
    // Ignore storage read errors
  }

  let activeTab = null;

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tabs[0];
  } catch (err) {
    console.error('Failed to query active tab:', err);
  }

  const isZai =
    activeTab?.url &&
    (activeTab.url.includes('chat.z.ai') ||
      activeTab.url.includes('z.ai') ||
      /https?:\/\/[a-z0-9-.]*z\.ai/i.test(activeTab.url));

  if (isZai) {
    statusBox.className = 'status-box active';
    statusBox.textContent = 'Active on Z.ai chat page. Ready to export.';
    openBtn.disabled = false;
    quickBtns.forEach((btn) => (btn.disabled = false));
  } else {
    statusBox.className = 'status-box inactive';
    statusBox.textContent =
      'This extension operates on Z.ai (https://chat.z.ai). Open a Z.ai conversation to export.';
    openBtn.disabled = true;
    quickBtns.forEach((btn) => (btn.disabled = true));
  }

  openBtn.addEventListener('click', () => {
    if (activeTab?.id) {
      chrome.tabs.sendMessage(activeTab.id, { type: 'OPEN_PANEL' });
      window.close();
    }
  });

  optionsBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('src/options/options.html'));
    }
  });

  quickBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const format = btn.getAttribute('data-format');
      if (activeTab?.id && format) {
        chrome.tabs.sendMessage(activeTab.id, {
          type: 'TRIGGER_EXPORT_FORMAT',
          format
        });
        window.close();
      }
    });
  });
});
