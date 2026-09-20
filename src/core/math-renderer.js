/**
 * @file math-renderer.js
 * Universal, offline math rendering engine using bundled KaTeX.
 * Supports HTML/MathML rendering, native Word OMML generation,
 * and high-resolution SVG/PNG image rendering for PDF and DOCX.
 */

import katex from 'katex';
import * as docx from 'docx';

const mathCache = new Map();

/**
 * Renders TeX math to offline KaTeX HTML string (including MathML and HTML representation).
 * @param {string} tex
 * @param {boolean} [displayMode=false]
 * @returns {string}
 */
export function renderMathToHtml(tex, displayMode = false) {
  if (!tex || typeof tex !== 'string') return '';
  const cleanTex = tex.trim();
  const cacheKey = `html:${displayMode}:${cleanTex}`;
  if (mathCache.has(cacheKey)) {
    return mathCache.get(cacheKey);
  }

  try {
    const rendered = katex.renderToString(cleanTex, {
      displayMode: Boolean(displayMode),
      throwOnError: false,
      output: 'htmlAndMathml'
    });
    mathCache.set(cacheKey, rendered);
    return rendered;
  } catch (err) {
    console.warn('[MathRenderer] KaTeX render error:', err);
    return `<span class="katex-error">${escapeHtml(cleanTex)}</span>`;
  }
}

/**
 * Renders TeX math strictly to MathML string.
 * @param {string} tex
 * @param {boolean} [displayMode=false]
 * @returns {string}
 */
export function renderMathToMathML(tex, displayMode = false) {
  if (!tex || typeof tex !== 'string') return '';
  const cleanTex = tex.trim();
  const cacheKey = `mathml:${displayMode}:${cleanTex}`;
  if (mathCache.has(cacheKey)) {
    return mathCache.get(cacheKey);
  }

  try {
    const rendered = katex.renderToString(cleanTex, {
      displayMode: Boolean(displayMode),
      throwOnError: false,
      output: 'mathml'
    });
    mathCache.set(cacheKey, rendered);
    return rendered;
  } catch (err) {
    console.warn('[MathRenderer] KaTeX MathML render error:', err);
    return `<math><mtext>${escapeHtml(cleanTex)}</mtext></math>`;
  }
}

/**
 * Converts a MathML DOM element tree into native docx.Math components (OMML).
 * Recursively maps MathML tags into docx Math components.
 * @param {Element|Node} node
 * @returns {any[]} Array of docx math components
 */
function mapMathMlNodeToDocx(node) {
  if (!node) return [];
  const tag = node.tagName ? node.tagName.toLowerCase() : '';

  // Text nodes
  if (node.nodeType === 3) {
    const text = node.textContent?.trim();
    if (text) return [new docx.MathRun(text)];
    return [];
  }

  // <mi>, <mn>, <mo>, <mtext>
  if (['mi', 'mn', 'mo', 'mtext'].includes(tag)) {
    const text = node.textContent || '';
    if (text) {
      return [new docx.MathRun(text)];
    }
    return [];
  }

  // <mfrac> -> MathFraction(numerator, denominator)
  if (tag === 'mfrac') {
    const children = Array.from(node.children || []);
    const numChildren = children[0] ? mapMathMlNodeToDocx(children[0]) : [new docx.MathRun('1')];
    const denChildren = children[1] ? mapMathMlNodeToDocx(children[1]) : [new docx.MathRun('1')];
    return [
      new docx.MathFraction({
        numerator: numChildren,
        denominator: denChildren
      })
    ];
  }

  // <msup> -> MathSuperScript
  if (tag === 'msup') {
    const children = Array.from(node.children || []);
    const baseChildren = children[0] ? mapMathMlNodeToDocx(children[0]) : [new docx.MathRun('')];
    const supChildren = children[1] ? mapMathMlNodeToDocx(children[1]) : [new docx.MathRun('')];
    return [
      new docx.MathSuperScript({
        children: baseChildren,
        superScript: supChildren
      })
    ];
  }

  // <msub> -> MathSubScript
  if (tag === 'msub') {
    const children = Array.from(node.children || []);
    const baseChildren = children[0] ? mapMathMlNodeToDocx(children[0]) : [new docx.MathRun('')];
    const subChildren = children[1] ? mapMathMlNodeToDocx(children[1]) : [new docx.MathRun('')];
    return [
      new docx.MathSubScript({
        children: baseChildren,
        subScript: subChildren
      })
    ];
  }

  // <msubsup> -> MathSubSuperScript
  if (tag === 'msubsup') {
    const children = Array.from(node.children || []);
    const baseChildren = children[0] ? mapMathMlNodeToDocx(children[0]) : [new docx.MathRun('')];
    const subChildren = children[1] ? mapMathMlNodeToDocx(children[1]) : [new docx.MathRun('')];
    const supChildren = children[2] ? mapMathMlNodeToDocx(children[2]) : [new docx.MathRun('')];
    return [
      new docx.MathSubSuperScript({
        children: baseChildren,
        subScript: subChildren,
        superScript: supChildren
      })
    ];
  }

  // <msqrt> -> MathRadical
  if (tag === 'msqrt') {
    const children = Array.from(node.children || []);
    const radChildren = children.flatMap(mapMathMlNodeToDocx);
    return [
      new docx.MathRadical({
        children: radChildren.length > 0 ? radChildren : [new docx.MathRun('')]
      })
    ];
  }

  // <mroot> -> MathRadical with degree
  if (tag === 'mroot') {
    const children = Array.from(node.children || []);
    const radChildren = children[0] ? mapMathMlNodeToDocx(children[0]) : [new docx.MathRun('')];
    const degreeChildren = children[1] ? mapMathMlNodeToDocx(children[1]) : [new docx.MathRun('')];
    return [
      new docx.MathRadical({
        children: radChildren,
        degree: degreeChildren
      })
    ];
  }

  // Containers like <mrow>, <semantics>, <math>, <mstyle>
  const result = [];
  for (const child of Array.from(node.childNodes || [])) {
    result.push(...mapMathMlNodeToDocx(child));
  }
  return result;
}

/**
 * Converts a TeX formula to a native docx.Math instance (OMML).
 * @param {string} tex
 * @param {boolean} [displayMode=false]
 * @returns {docx.Math}
 */
export function renderMathToDocxMath(tex, displayMode = false) {
  if (!tex || typeof tex !== 'string') {
    return new docx.Math({ children: [new docx.MathRun('')] });
  }

  const cleanTex = tex.trim();
  const cacheKey = `docxMath:${displayMode}:${cleanTex}`;
  if (mathCache.has(cacheKey)) {
    return mathCache.get(cacheKey);
  }

  try {
    const mathMl = renderMathToMathML(cleanTex, displayMode);
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(mathMl, 'text/html');
      const mathEl = doc.querySelector('math');
      if (mathEl) {
        const mathChildren = mapMathMlNodeToDocx(mathEl);
        if (mathChildren && mathChildren.length > 0) {
          const docxMathInstance = new docx.Math({ children: mathChildren });
          mathCache.set(cacheKey, docxMathInstance);
          return docxMathInstance;
        }
      }
    }
  } catch (err) {
    console.warn('[MathRenderer] Failed to convert to docx.Math OMML:', err);
  }

  // Fallback: simple text MathRun
  const fallbackMath = new docx.Math({ children: [new docx.MathRun(cleanTex)] });
  mathCache.set(cacheKey, fallbackMath);
  return fallbackMath;
}

/**
 * Renders a TeX formula to a crisp standalone SVG representation.
 * @param {string} tex
 * @param {boolean} [displayMode=false]
 * @param {string} [color='#1e293b']
 * @returns {string} SVG markup
 */
export function renderMathToSvg(tex, displayMode = false, color = '#1e293b') {
  const cleanTex = tex.trim();
  const html = renderMathToHtml(cleanTex, displayMode);

  // Approximate metrics based on character count and complexity
  const hasFraction = cleanTex.includes('\\frac');
  const hasMatrix = cleanTex.includes('matrix');
  const hasSumOrInt = cleanTex.includes('\\sum') || cleanTex.includes('\\int');
  const charLength = Math.max(cleanTex.length, 3);

  const baseHeight = hasMatrix ? 70 : hasFraction || hasSumOrInt ? 48 : displayMode ? 36 : 24;
  const approxWidth = Math.min(Math.max(charLength * 11, 60), 650);

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${approxWidth}" height="${baseHeight}" viewBox="0 0 ${approxWidth} ${baseHeight}">
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-size: ${displayMode ? '16px' : '14px'}; color: ${color}; display: flex; align-items: center; justify-content: ${displayMode ? 'center' : 'flex-start'}; height: 100%;">
      ${html}
    </div>
  </foreignObject>
</svg>`.trim();

  return svg;
}

/**
 * Escapes HTML characters.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
