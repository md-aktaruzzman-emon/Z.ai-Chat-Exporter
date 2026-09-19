/**
 * @file sanitize.js
 * Strict DOM sanitization engine without external network dependencies.
 * Follows Section 8 of the authoritative specification.
 */

const ALLOWED_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'pre',
  'code',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'img',
  'a',
  'br',
  'hr',
  'blockquote',
  'strong',
  'em',
  'del',
  'span',
  'div',
  'figure',
  'figcaption'
]);

const ALLOWED_ATTRIBUTES = new Set([
  'href',
  'src',
  'alt',
  'title',
  'colspan',
  'rowspan',
  'class',
  'data-role',
  'data-tex'
]);

/**
 * Validates a class name token: only alphanumeric and dashes.
 * @param {string} className
 * @returns {string} Sanitized classes space-delimited
 */
function sanitizeClassName(className) {
  if (!className || typeof className !== 'string') return '';
  const tokens = className.trim().split(/\s+/);
  const validTokens = tokens.filter((t) => /^[a-zA-Z0-9_-]+$/.test(t));
  return validTokens.join(' ');
}

/**
 * Validates safe URL protocols: http, https, mailto, tel, data, and relative paths.
 * Blocks javascript: and other dangerous protocols.
 * @param {string} url
 * @returns {boolean}
 */
export function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim().toLowerCase();
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('vbscript:') ||
    trimmed.startsWith('file:')
  ) {
    return false;
  }
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('#')
  ) {
    return true;
  }
  // If no scheme and safe path
  return !trimmed.includes(':');
}

/**
 * Recursively sanitizes a DOM Node in place according to Section 8 rules.
 * @param {Node} node
 */
function sanitizeNode(node) {
  if (!node) return;

  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType === 1) {
      // Element node
      const tagName = child.tagName.toLowerCase();

      // Check if tag is disallowed
      if (!ALLOWED_TAGS.has(tagName)) {
        // Disallowed tag - if it's dangerous, remove with contents
        if (['script', 'iframe', 'style', 'link', 'object', 'embed'].includes(tagName)) {
          child.remove();
          continue;
        }
        // If it's another non-allowed container, unwrap its contents into parent
        while (child.firstChild) {
          child.parentNode.insertBefore(child.firstChild, child);
        }
        child.remove();
        continue;
      }

      // Filter and sanitize attributes
      const attrs = Array.from(child.attributes);
      for (const attr of attrs) {
        const attrName = attr.name.toLowerCase();

        // Strip any on* event attribute
        if (attrName.startsWith('on')) {
          child.removeAttribute(attr.name);
          continue;
        }

        // Only allowed attributes
        if (!ALLOWED_ATTRIBUTES.has(attrName)) {
          child.removeAttribute(attr.name);
          continue;
        }

        // Specific attribute checks
        if (attrName === 'href' || attrName === 'src') {
          if (!isSafeUrl(attr.value)) {
            child.removeAttribute(attr.name);
          }
        } else if (attrName === 'class') {
          const cleanClass = sanitizeClassName(attr.value);
          if (cleanClass) {
            child.setAttribute('class', cleanClass);
          } else {
            child.removeAttribute('class');
          }
        }
      }

      // Recurse to children
      sanitizeNode(child);
    } else if (child.nodeType === 8) {
      // Comment node
      child.remove(); // Strip HTML comments
    }
  }
}

/**
 * Sanitizes an HTML string and returns safe sanitized HTML.
 * Can be executed in any browser/DOM environment (content script, offscreen, popup).
 * @param {string} rawHtml
 * @returns {string} Sanitized HTML
 */
export function sanitizeHtml(rawHtml) {
  if (!rawHtml || typeof rawHtml !== 'string') return '';

  let doc;
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    doc = parser.parseFromString(`<body>${rawHtml}</body>`, 'text/html');
  } else if (typeof document !== 'undefined') {
    doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = rawHtml;
  } else {
    // Fallback basic text escape if no DOM engine is available
    return rawHtml
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  sanitizeNode(doc.body);
  return doc.body.innerHTML;
}
