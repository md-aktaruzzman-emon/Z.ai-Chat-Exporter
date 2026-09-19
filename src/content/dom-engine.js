/**
 * @file dom-engine.js
 * Robust DOM locating, scoring, Shadow DOM piercing, virtualization, and streaming detection.
 * Section 11 of the authoritative specification.
 */

export const ERROR_CODES = {
  LOCATE_FAILED: 'LOCATE_FAILED',
  STREAM_TIMEOUT: 'STREAM_TIMEOUT',
  NO_CONVERSATION: 'NO_CONVERSATION',
  EXPORT_UNSUPPORTED: 'EXPORT_UNSUPPORTED',
  RENDER_FAILED: 'RENDER_FAILED',
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  SANITIZE_FAILED: 'SANITIZE_FAILED',
  HISTORY_FAILED: 'HISTORY_FAILED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  INVALID_PROFILE: 'INVALID_PROFILE',
  BUILD_CONFIGURATION_ERROR: 'BUILD_CONFIGURATION_ERROR'
};

/**
 * Structured ExportError adhering to Section 11.8 & Section 32.
 */
export class ExportError extends Error {
  /**
   * @param {string} code - Technical error code
   * @param {string} [message] - Human-readable description
   * @param {Error} [cause] - Underlying cause
   */
  constructor(code, message, cause) {
    super(message || code);
    this.name = 'ExportError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

const PROFILE_STORAGE_KEY = 'zai_selector_profile';
const PROFILE_CACHE_TTL_MS = 30000; // 30s cache

/**
 * Recursively queries DOM and open Shadow DOM roots without duplicates.
 * @param {string} selector
 * @param {Node|Element|Document} root
 * @returns {Element[]} Flat array of matched elements
 */
export function deepQueryAll(selector, root = document) {
  const results = [];
  const visited = new Set();

  function traverse(current) {
    if (!current || visited.has(current)) return;
    visited.add(current);

    if (current.querySelectorAll) {
      try {
        const matches = current.querySelectorAll(selector);
        for (let i = 0; i < matches.length; i++) {
          results.push(matches[i]);
        }
      } catch {
        // ignore malformed selector exceptions on specific subtrees
      }
    }

    // Traverse children and open shadow roots
    const children = current.children || [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.shadowRoot) {
        traverse(child.shadowRoot);
      }
      traverse(child);
    }
  }

  traverse(root);
  return Array.from(new Set(results));
}

// Selector Candidates based on Section 11.2
export const THREAD_CANDIDATES = [
  'div[class*="conversation"]',
  'div[class*="chat-thread"]',
  'main [role="log"]',
  'div[class*="messages"]',
  '[class*="chat-container"]',
  'main'
];

export const MESSAGE_CANDIDATES = [
  '[data-role="user"], [data-role="assistant"]',
  'div[class*="user-message"], div[class*="assistant-message"]',
  '[class*="message-item"]',
  '[class*="chat-message"]',
  '[class*="markdown-body"]'
];

export const TITLE_CANDIDATES = [
  '[class*="chat-title"]',
  'header h1',
  'h1',
  '[class*="conversation-title"]'
];

export const MODEL_CANDIDATES = [
  '[class*="model-name"]',
  '[class*="model-badge"]',
  '[class*="model-selector"]'
];

let cachedProfile = null;
let lastProfileScanTime = 0;
let activeSavedProfile = null;

/**
 * Scores a thread container element based on relevance and message count.
 * @param {Element} el
 * @returns {number}
 */
function scoreThreadCandidate(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return -1;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return -1;

  let score = 0;
  // Prefer scrollable elements
  const isScrollable = el.scrollHeight > el.clientHeight;
  if (isScrollable) score += 20;

  // Count inner message-like nodes
  for (const sel of MESSAGE_CANDIDATES) {
    const matched = el.querySelectorAll(sel);
    if (matched.length >= 2) {
      score += matched.length * 5;
      break;
    }
  }

  // Penalize the entire document.body / huge window container if a narrower container exists
  if (el.tagName === 'BODY' || el.tagName === 'HTML') {
    score -= 50;
  }

  return score;
}

/**
 * Detects the active theme (light or dark).
 * @returns {'light'|'dark'}
 */
export function detectTheme() {
  if (typeof window === 'undefined') return 'light';

  // 1. Class names or attributes on root or body (Z.ai specific and general SPA)
  const root = document.documentElement;
  const body = document.body;
  if (
    root?.classList.contains('dark') ||
    root?.getAttribute('data-theme') === 'dark' ||
    body?.classList.contains('dark') ||
    body?.getAttribute('data-theme') === 'dark'
  ) {
    return 'dark';
  }
  if (
    root?.classList.contains('light') ||
    root?.getAttribute('data-theme') === 'light' ||
    body?.classList.contains('light') ||
    body?.getAttribute('data-theme') === 'light'
  ) {
    return 'light';
  }

  // 2. Computed luminance of body or root background
  try {
    const bg = window.getComputedStyle(body || root).backgroundColor;
    const rgb = bg.match(/\d+/g);
    if (rgb && rgb.length >= 3) {
      const alpha = rgb.length >= 4 ? Number(rgb[3]) : 1;
      if (alpha > 0) {
        const luminance = 0.299 * Number(rgb[0]) + 0.587 * Number(rgb[1]) + 0.114 * Number(rgb[2]);
        return luminance < 128 ? 'dark' : 'light';
      }
    }
  } catch {
    // fallback
  }

  // 3. System color scheme query fallback
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
}

/**
 * Locates the chat thread and messages on page.
 * Respects manual overrides and logs candidate match counts when 0 found (Section 11.8).
 * @param {Object} [overrideProfile] - Optional explicit profile override
 * @returns {{
 *   threadContainer: Element|null,
 *   messageBubbles: Element[],
 *   title: string,
 *   modelBadge: string,
 *   theme: 'light'|'dark',
 *   ok: boolean
 * }}
 */
export function locate(overrideProfile) {
  const profileToUse = overrideProfile || activeSavedProfile;

  const now = Date.now();
  if (!overrideProfile && cachedProfile && now - lastProfileScanTime < PROFILE_CACHE_TTL_MS) {
    if (cachedProfile.threadContainer && document.contains(cachedProfile.threadContainer)) {
      return cachedProfile;
    }
  }

  let bestContainer = null;
  let bestScore = -1;

  // 1. Check manual override for thread container first (Section 11.3)
  if (profileToUse?.manualOverrides?.threadContainer) {
    const manualEl = document.querySelector(profileToUse.manualOverrides.threadContainer);
    if (manualEl) {
      bestContainer = manualEl;
    }
  }

  if (!bestContainer) {
    for (const selector of THREAD_CANDIDATES) {
      const found = deepQueryAll(selector);
      for (const el of found) {
        const s = scoreThreadCandidate(el);
        if (s > bestScore) {
          bestScore = s;
          bestContainer = el;
        }
      }
    }
  }

  // 2. Find message bubbles (manual override has priority)
  let messageBubbles = [];
  const searchRoot = bestContainer || document.body;

  if (profileToUse?.manualOverrides?.messageBubble) {
    const manualBubbles = deepQueryAll(profileToUse.manualOverrides.messageBubble, searchRoot);
    if (manualBubbles.length > 0) {
      messageBubbles = manualBubbles;
    }
  }

  if (messageBubbles.length === 0) {
    for (const selector of MESSAGE_CANDIDATES) {
      const found = deepQueryAll(selector, searchRoot);
      if (found.length > 0) {
        messageBubbles = found;
        break;
      }
    }
  }

  // Fallback: unwrap wrapper divs and inspect direct children with content
  if (messageBubbles.length === 0 && bestContainer) {
    let containerForChildren = bestContainer;
    while (
      containerForChildren &&
      containerForChildren.children.length === 1 &&
      containerForChildren.firstElementChild
    ) {
      containerForChildren = containerForChildren.firstElementChild;
    }
    const potentialChildren = Array.from(containerForChildren.children).filter((child) => {
      const text = child.textContent?.trim() || '';
      return (
        text.length > 0 && (child.clientHeight > 15 || child.scrollHeight > 15 || text.length > 5)
      );
    });
    if (potentialChildren.length >= 1) {
      messageBubbles = potentialChildren;
    }
  }

  // Section 11.8: When zero usable message bubbles are found, log each candidate selector and match count
  if (messageBubbles.length === 0) {
    console.debug('[Z.ai Exporter] locate(): Zero message bubbles found. Candidate inspection:');
    THREAD_CANDIDATES.forEach((sel) => {
      const count = deepQueryAll(sel).length;
      console.debug(`[Z.ai Exporter] Thread candidate "${sel}": ${count} matches`);
    });
    MESSAGE_CANDIDATES.forEach((sel) => {
      const count = deepQueryAll(sel, searchRoot).length;
      console.debug(`[Z.ai Exporter] Message candidate "${sel}": ${count} matches`);
    });
  }

  // Detect Title
  let title = '';
  if (profileToUse?.manualOverrides?.title) {
    const manualTitleEl = document.querySelector(profileToUse.manualOverrides.title);
    if (manualTitleEl && manualTitleEl.textContent.trim()) {
      title = manualTitleEl.textContent.trim();
    }
  }
  if (!title) {
    for (const sel of TITLE_CANDIDATES) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        title = el.textContent.trim();
        break;
      }
    }
  }
  if (!title) {
    title = document.title
      ? document.title.replace(/[-|]\s*Z\.ai.*$/i, '').trim()
      : 'Z.ai Conversation';
  }

  // Detect Model Badge
  let modelBadge = 'Z.ai';
  for (const sel of MODEL_CANDIDATES) {
    const el = document.querySelector(sel);
    if (el && el.textContent.trim()) {
      modelBadge = el.textContent.trim();
      break;
    }
  }

  const theme = detectTheme();
  const ok = messageBubbles.length > 0;

  const result = {
    threadContainer: bestContainer,
    messageBubbles,
    title,
    modelBadge,
    theme,
    ok
  };

  if (ok) {
    cachedProfile = result;
    lastProfileScanTime = now;
  }

  return result;
}

/**
 * Handles virtualized lists by scrolling sequentially to load messages.
 * Restores original scroll position after unrolling.
 * @param {Element} container
 * @returns {Promise<void>}
 */
export async function unvirtualize(container) {
  if (!container) return;

  const originalScrollTop = container.scrollTop;
  let lastScrollHeight = container.scrollHeight;
  let iterations = 0;
  const MAX_ITERATIONS = 50;

  // Scroll to top progressively to trigger lazy loading / reverse virtualization
  while (iterations < MAX_ITERATIONS) {
    container.scrollTop = 0;
    container.dispatchEvent(new Event('scroll', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));

    if (container.scrollHeight === lastScrollHeight) {
      break;
    }
    lastScrollHeight = container.scrollHeight;
    iterations++;
  }

  // Restore user original scroll position
  container.scrollTop = originalScrollTop;
}

/**
 * Checks if the assistant is currently streaming responses.
 * @returns {boolean}
 */
export function isStreaming() {
  if (typeof document === 'undefined') return false;

  // 1. Check aria-busy attributes
  const busyElement = document.querySelector('[aria-busy="true"]');
  if (busyElement) return true;

  // 2. Stop generation button
  const stopBtn = document.querySelector(
    'button[aria-label*="stop" i], button[title*="stop" i], [class*="stop-generating"]'
  );
  if (stopBtn && stopBtn.offsetParent !== null) return true;

  return false;
}

/**
 * Waits for streaming generation to finish or times out safely.
 * @param {number} [timeoutMs=120000]
 * @returns {Promise<boolean>} Resolves to true if stream finished, false if timed out
 */
export async function waitForStreamEnd(timeoutMs = 120000) {
  const startTime = Date.now();
  let lastContentLength = document.body ? document.body.innerText.length : 0;

  while (Date.now() - startTime < timeoutMs) {
    if (!isStreaming()) {
      // Check content stability across 400ms
      await new Promise((r) => setTimeout(r, 400));
      const currentLength = document.body ? document.body.innerText.length : 0;
      if (currentLength === lastContentLength && !isStreaming()) {
        return true;
      }
      lastContentLength = currentLength;
    } else {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  return false; // Timed out
}

/**
 * Observes thread and route changes with debouncing.
 * @param {Function} callback
 * @returns {() => void} Unsubscribe function
 */
export function onThreadChange(callback) {
  let timeoutId = null;
  const debounced = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      cachedProfile = null;
      callback();
    }, 200);
  };

  const observer = new MutationObserver(debounced);
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  const handlePopState = () => debounced();
  window.addEventListener('popstate', handlePopState);

  // Monkey-patch pushState/replaceState for SPA navigation
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;

  history.pushState = function (...args) {
    const ret = origPushState.apply(this, args);
    debounced();
    return ret;
  };

  history.replaceState = function (...args) {
    const ret = origReplaceState.apply(this, args);
    debounced();
    return ret;
  };

  return () => {
    observer.disconnect();
    window.removeEventListener('popstate', handlePopState);
    history.pushState = origPushState;
    history.replaceState = origReplaceState;
  };
}

/**
 * Gets saved selector profile from chrome.storage.local.
 * @returns {Promise<Object|null>}
 */
export async function getProfile() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const res = await chrome.storage.local.get(PROFILE_STORAGE_KEY);
    activeSavedProfile = res[PROFILE_STORAGE_KEY] || null;
    return activeSavedProfile;
  }
  return activeSavedProfile;
}

/**
 * Saves a custom selector profile into chrome.storage.local.
 * @param {Object} profile
 * @returns {Promise<void>}
 */
export async function saveProfile(profile) {
  activeSavedProfile = profile;
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [PROFILE_STORAGE_KEY]: profile });
  }
}

/**
 * Exports current or given profile as pretty JSON string (Section 11.9).
 * @param {Object} [profile]
 * @returns {string} Plain JSON string
 */
export function exportProfileJson(profile) {
  const toExport = profile ||
    activeSavedProfile || {
      schemaVersion: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      host: 'chat.z.ai',
      threadContainer: '',
      messageBubble: '',
      codeBlock: '',
      mathBlock: '',
      thinkingBlock: '',
      citationBlock: '',
      artifactBlock: '',
      title: '',
      modelBadge: '',
      manualOverrides: {}
    };
  return JSON.stringify(toExport, null, 2);
}

/**
 * Imports and validates selector profile JSON schema before saving (Section 11.9, 34).
 * @param {string|Object} jsonStringOrObj
 * @returns {Promise<Object>} Validated and saved profile
 */
export async function importProfileJson(jsonStringOrObj) {
  let parsed;
  try {
    parsed = typeof jsonStringOrObj === 'string' ? JSON.parse(jsonStringOrObj) : jsonStringOrObj;
  } catch (err) {
    throw new ExportError('INVALID_PROFILE', `Malformed profile JSON: ${err.message}`, err);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ExportError('INVALID_PROFILE', 'Profile must be a valid JSON object');
  }

  // Validate CSS selectors so malicious or syntax-breaking selectors are rejected
  const selectorFields = [
    'threadContainer',
    'messageBubble',
    'codeBlock',
    'mathBlock',
    'thinkingBlock',
    'citationBlock',
    'artifactBlock',
    'title',
    'modelBadge'
  ];

  for (const field of selectorFields) {
    if (parsed[field] && typeof parsed[field] === 'string') {
      try {
        document.createDocumentFragment().querySelector(parsed[field]);
      } catch (err) {
        throw new ExportError(
          'INVALID_PROFILE',
          `Invalid CSS selector in "${field}": ${parsed[field]}`,
          err
        );
      }
    }
  }

  if (parsed.manualOverrides && typeof parsed.manualOverrides === 'object') {
    for (const [k, v] of Object.entries(parsed.manualOverrides)) {
      if (typeof v === 'string') {
        try {
          document.createDocumentFragment().querySelector(v);
        } catch (err) {
          throw new ExportError(
            'INVALID_PROFILE',
            `Invalid manualOverride selector for "${k}": ${v}`,
            err
          );
        }
      }
    }
  }

  parsed.updatedAt = Date.now();
  await saveProfile(parsed);
  cachedProfile = null;
  return parsed;
}
