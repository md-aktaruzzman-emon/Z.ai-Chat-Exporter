/**
 * @file floating-button.js
 * Draggable, keyboard accessible Floating Action Button (FAB).
 * Section 18 of the authoritative specification.
 */

const FAB_STORAGE_KEY = 'zaix_fab_position';

/**
 * Creates and initializes the Floating Action Button.
 * @param {Object} options
 * @param {Function} options.onClick - Click handler
 * @returns {HTMLButtonElement}
 */
export function createFloatingButton({ onClick }) {
  const btn = document.createElement('button');
  btn.className = 'zaix-fab';
  btn.setAttribute('aria-label', 'Open Z.ai Chat Exporter');
  btn.setAttribute('title', 'Z.ai Chat Exporter (Alt+Shift+E)');
  btn.innerHTML = `
    <svg viewBox="0 0 24 24">
      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
    </svg>
  `;

  // Restore saved position if valid
  try {
    const saved = localStorage.getItem(FAB_STORAGE_KEY);
    if (saved) {
      const { top, left } = JSON.parse(saved);
      if (typeof top === 'number' && typeof left === 'number') {
        btn.style.top = `${top}px`;
        btn.style.left = `${left}px`;
        btn.style.bottom = 'auto';
        btn.style.right = 'auto';
      }
    }
  } catch {
    // ignore storage read issues
  }

  // Dragging support
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let hasMoved = false;

  btn.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    hasMoved = false;
    startX = e.clientX - btn.getBoundingClientRect().left;
    startY = e.clientY - btn.getBoundingClientRect().top;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    hasMoved = true;
    let newLeft = e.clientX - startX;
    let newTop = e.clientY - startY;

    // Viewport bounding
    const maxLeft = window.innerWidth - btn.offsetWidth - 10;
    const maxTop = window.innerHeight - btn.offsetHeight - 10;

    newLeft = Math.max(10, Math.min(newLeft, maxLeft));
    newTop = Math.max(10, Math.min(newTop, maxTop));

    btn.style.left = `${newLeft}px`;
    btn.style.top = `${newTop}px`;
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      if (hasMoved) {
        try {
          const rect = btn.getBoundingClientRect();
          localStorage.setItem(FAB_STORAGE_KEY, JSON.stringify({ top: rect.top, left: rect.left }));
        } catch {
          // ignore
        }
      }
    }
  });

  btn.addEventListener('click', (e) => {
    if (!hasMoved && typeof onClick === 'function') {
      onClick(e);
    }
  });

  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(e);
    }
  });

  return btn;
}
