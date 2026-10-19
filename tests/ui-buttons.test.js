/**
 * @file ui-buttons.test.js
 * Regression tests for UI button interactions in closed Shadow DOM, FAB, and Export Panel.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFloatingButton } from '../src/content/ui/floating-button.js';
import { createPanel } from '../src/content/ui/panel.js';

describe('UI Buttons & Controls Regression Tests', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('Floating Action Button clicks trigger onClick handler without false drag detection', () => {
    const onClick = vi.fn();
    const fab = createFloatingButton({ onClick });
    document.body.appendChild(fab);

    // 1. Regular click (mousedown -> mouseup -> click)
    fab.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 100, clientY: 100, button: 0 }));
    fab.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onClick).toHaveBeenCalledTimes(1);

    // 2. Micro-jitter (less than 5px movement) should NOT cancel click
    fab.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 102, clientY: 101 }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 102, clientY: 101, button: 0 }));
    fab.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onClick).toHaveBeenCalledTimes(2);

    // 3. Genuine drag (> 5px movement) should NOT fire onClick
    fab.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, button: 0 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 130, clientY: 140 }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 130, clientY: 140, button: 0 }));
    fab.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onClick).toHaveBeenCalledTimes(2); // Still 2, not incremented
  });

  it('Floating Action Button supports keyboard activation (Enter and Space)', () => {
    const onClick = vi.fn();
    const fab = createFloatingButton({ onClick });
    document.body.appendChild(fab);

    fab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    fab.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('Panel buttons (Export, Preview, History, Theme, Close) trigger appropriate callbacks', () => {
    const onExport = vi.fn();
    const onPreview = vi.fn();
    const onHistory = vi.fn();
    const onClose = vi.fn();
    const onThemeChange = vi.fn();

    const panel = createPanel({
      onExport,
      onPreview,
      onHistory,
      onClose,
      onThemeChange
    });

    document.body.appendChild(panel.element);

    // Initial check: overlay has hidden class
    expect(panel.element.classList.contains('hidden')).toBe(true);

    // Format selection
    const formatSelect = panel.element.querySelector('#zaix-format-select');
    expect(formatSelect).not.toBeNull();
    formatSelect.value = 'docx';
    formatSelect.dispatchEvent(new Event('change'));

    // Clicking Export button
    const exportBtn = panel.element.querySelector('#zaix-btn-export');
    expect(exportBtn).not.toBeNull();
    exportBtn.click();
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'docx'
      })
    );

    // Clicking Preview button
    const previewBtn = panel.element.querySelector('#zaix-btn-preview');
    expect(previewBtn).not.toBeNull();
    previewBtn.click();
    expect(onPreview).toHaveBeenCalledTimes(1);

    // Clicking History button
    const historyBtn = panel.element.querySelector('#zaix-btn-history');
    expect(historyBtn).not.toBeNull();
    historyBtn.click();
    expect(onHistory).toHaveBeenCalledTimes(1);

    // Theme toggle button
    const themeToggleBtn = panel.element.querySelector('#zaix-panel-theme-toggle');
    expect(themeToggleBtn).not.toBeNull();
    themeToggleBtn.click();
    expect(onThemeChange).toHaveBeenCalledWith('dark');

    // Close button
    const closeBtn = panel.element.querySelector('.zaix-close-btn');
    expect(closeBtn).not.toBeNull();
    closeBtn.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Panel setConversationData renders selectable turns and populates stats without error', () => {
    const panel = createPanel({
      onExport: vi.fn(),
      onPreview: vi.fn(),
      onHistory: vi.fn(),
      onClose: vi.fn()
    });

    const mockConv = {
      title: 'Test Discussion',
      stats: { words: 120, tokensEst: 160, chars: 800, codeBlocks: 2, tables: 1, images: 0 },
      messages: [
        { role: 'user', text: 'Hello, what is AI?' }, // no index property
        { index: 1, role: 'assistant', text: 'AI is artificial intelligence.' }
      ]
    };

    panel.setConversationData(mockConv);

    const titleInput = panel.element.querySelector('#zaix-title-input');
    expect(titleInput.value).toBe('Test Discussion');

    const wordsEl = panel.element.querySelector('#zaix-words');
    expect(wordsEl.textContent).toBe('120');

    const rows = panel.element.querySelectorAll('.zaix-turn-row');
    expect(rows.length).toBe(2);
  });

  it('Copy MD button invokes onCopyMd callback or shows status if conversation not loaded', async () => {
    const onCopyMd = vi.fn();
    const panel = createPanel({
      onExport: vi.fn(),
      onPreview: vi.fn(),
      onHistory: vi.fn(),
      onClose: vi.fn(),
      onCopyMd
    });
    document.body.appendChild(panel.element);

    const copyBtn = panel.element.querySelector('#zaix-btn-copy-md');
    expect(copyBtn).not.toBeNull();

    // Click without active conversation calls onCopyMd
    await copyBtn.click();
    expect(onCopyMd).toHaveBeenCalledTimes(1);

    // If onCopyMd is not provided and no conversation is loaded, shows status message
    const panelNoCb = createPanel({
      onExport: vi.fn(),
      onPreview: vi.fn(),
      onHistory: vi.fn(),
      onClose: vi.fn()
    });
    const copyBtnNoCb = panelNoCb.element.querySelector('#zaix-btn-copy-md');
    await copyBtnNoCb.click();
    const statusEl = panelNoCb.element.querySelector('.zaix-status');
    expect(statusEl.textContent).toContain('No active conversation');
  });

  it('Copy MD copies formatted markdown and displays copied feedback when conversation is loaded', async () => {
    const panel = createPanel({
      onExport: vi.fn(),
      onPreview: vi.fn(),
      onHistory: vi.fn(),
      onClose: vi.fn()
    });
    document.body.appendChild(panel.element);

    const mockConv = {
      title: 'Quick Chat',
      stats: { words: 10, tokensEst: 15, chars: 50, codeBlocks: 0, tables: 0, images: 0 },
      messages: [
        { index: 0, role: 'user', text: 'Hello', blocks: [{ kind: 'paragraph', text: 'Hello' }] },
        {
          index: 1,
          role: 'assistant',
          text: 'Hi there!',
          blocks: [{ kind: 'paragraph', text: 'Hi there!' }]
        }
      ]
    };
    panel.setConversationData(mockConv);

    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextSpy
      }
    });

    const copyBtn = panel.element.querySelector('#zaix-btn-copy-md');
    copyBtn.click();
    await new Promise((r) => setTimeout(r, 50));

    expect(writeTextSpy).toHaveBeenCalledTimes(1);
    const copiedText = writeTextSpy.mock.calls[0][0];
    expect(copiedText).toContain('Quick Chat');
    expect(copiedText).toContain('Hello');
    expect(copiedText).toContain('Hi there!');
    expect(copyBtn.textContent).toBe('✓ Copied!');
  });

  it('Preview Modal and History Drawer include zaix-submodal-overlay class for correct stacking', async () => {
    const { createPreviewModal } = await import('../src/content/ui/preview-modal.js');
    const { createHistoryDrawer } = await import('../src/content/ui/history-drawer.js');

    const preview = createPreviewModal({ onClose: vi.fn() });
    expect(preview.element.classList.contains('zaix-submodal-overlay')).toBe(true);

    const history = createHistoryDrawer({ onClose: vi.fn(), onReDownload: vi.fn() });
    expect(history.element.classList.contains('zaix-submodal-overlay')).toBe(true);
  });

  it('Turn selection controls (All, None, User, AI, Filter) work accurately', () => {
    const panel = createPanel({
      onExport: vi.fn(),
      onPreview: vi.fn(),
      onHistory: vi.fn(),
      onClose: vi.fn()
    });

    const mockConv = {
      title: 'Filter Test',
      stats: { words: 50, tokensEst: 60, chars: 250, codeBlocks: 0, tables: 0, images: 0 },
      messages: [
        { index: 0, role: 'user', text: 'Question 1' },
        { index: 1, role: 'assistant', text: 'Answer 1' },
        { index: 2, role: 'user', text: 'Question 2' },
        { index: 3, role: 'assistant', text: 'Answer 2' }
      ]
    };
    panel.setConversationData(mockConv);

    const btnNone = panel.element.querySelector('#zaix-btn-select-none');
    const btnAll = panel.element.querySelector('#zaix-btn-select-all');
    const btnUser = panel.element.querySelector('#zaix-btn-select-user');
    const btnAi = panel.element.querySelector('#zaix-btn-select-ai');
    const filterInput = panel.element.querySelector('#zaix-turn-filter');

    // Select None
    btnNone.click();
    let checked = panel.element.querySelectorAll('.zaix-turn-cb:checked');
    expect(checked.length).toBe(0);

    // Select User
    btnUser.click();
    checked = panel.element.querySelectorAll('.zaix-turn-cb:checked');
    expect(checked.length).toBe(2);

    // Select AI
    btnAi.click();
    checked = panel.element.querySelectorAll('.zaix-turn-cb:checked');
    expect(checked.length).toBe(2);

    // Select All
    btnAll.click();
    checked = panel.element.querySelectorAll('.zaix-turn-cb:checked');
    expect(checked.length).toBe(4);

    // Filter input
    filterInput.value = 'Question 1';
    filterInput.dispatchEvent(new Event('input'));
    const visibleRows = Array.from(panel.element.querySelectorAll('.zaix-turn-row')).filter(
      (r) => r.style.display !== 'none'
    );
    expect(visibleRows.length).toBe(1);
  });
});
