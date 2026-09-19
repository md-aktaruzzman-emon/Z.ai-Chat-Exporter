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

  let activeTab = null;

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tabs[0];
  } catch (err) {
    console.error('Failed to query active tab:', err);
  }

  const isZai = activeTab?.url && activeTab.url.includes('chat.z.ai');

  if (isZai) {
    statusBox.className = 'status-box active';
    statusBox.textContent = 'Active on Z.ai chat page. Ready to export.';
    openBtn.disabled = false;
    quickBtns.forEach((btn) => (btn.disabled = false));
  } else {
    statusBox.className = 'status-box inactive';
    statusBox.textContent =
      'This extension operates on https://chat.z.ai/*. Navigate to Z.ai to export conversations.';
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
