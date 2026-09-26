/**
 * @file pdf-vector.js
 * Selectable, searchable, deterministic Vector PDF generator using pdf-lib.
 * Section 16.1 of the authoritative specification.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { generateFilename } from '../core/utils/filename.js';
import { anonymizeConversation } from './pii.js';
import { imageSourceToPngBytes, fitDimensions } from '../core/utils/image.js';
import { renderMathToSvg } from '../core/math-renderer.js';
import { normalizeTableRows, computeColumnWidths, wrapCellLines } from '../core/table-layout.js';

// Comprehensive symbol & diagram transliterations for WinAnsi StandardFonts
const SYMBOL_REPLACEMENTS = {
  // Tree & Directory structure characters
  '├──': '|-- ',
  '└──': '`-- ',
  '│': '|',
  '├': '|-',
  '└': '`- ',
  '─': '-',
  '━': '=',
  '┃': '|',
  '┌': '+',
  '┐': '+',
  '┘': '+',
  '┬': '+',
  '┴': '+',
  '┼': '+',
  '═': '=',
  '║': '|',
  '╔': '+',
  '╗': '+',
  '╝': '+',
  '╚': '+',
  '╠': '+',
  '╣': '+',
  '╦': '+',
  '╩': '+',
  '╬': '+',

  // Flowchart & Diagram Arrows
  '↓': 'v',
  '↑': '^',
  '→': '->',
  '←': '<-',
  '↔': '<->',
  '↕': '|^|',
  '⇒': '=>',
  '⇐': '<=',
  '⇔': '<=>',
  '➔': '->',
  '➜': '->',
  '➤': '->',
  '►': '>',
  '◄': '<',
  '▲': '^',
  '▼': 'v',
  '▶': '>',
  '◀': '<',

  // Checklists, markers, and bullets
  '✓': '[v]',
  '✔': '[v]',
  '✕': '[x]',
  '✖': '[x]',
  '✗': '[x]',
  '•': '*',
  '●': '*',
  '○': 'o',
  '■': '*',
  '□': '[ ]',
  '▪': '*',
  '▫': '*',
  '◆': '*',
  '◇': '*',
  '★': '*',
  '☆': '*',

  // Typography, Quotes & Dashes
  '—': '--',
  '–': '-',
  '…': '...',
  '“': '"',
  '”': '"',
  '‘': "'",
  '’': "'",
  '«': '<<',
  '»': '>>',

  // Math, currency, and scientific symbols
  '≈': '~',
  '≠': '!=',
  '≤': '<=',
  '≥': '>=',
  '±': '+/-',
  '×': '*',
  '÷': '/',
  '∞': 'inf',
  '∑': 'sum',
  '∏': 'prod',
  '√': 'sqrt',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '₹': 'INR',
  '৳': 'BDT'
};

const fontSupportCache = new WeakMap();

/**
 * Checks if a string can be encoded by the WinAnsi font without errors.
 * @param {string} str
 * @param {import('pdf-lib').PDFFont} font
 * @returns {boolean}
 */
export function canEncodeWithFont(str, font) {
  if (!str) return true;
  for (const char of str) {
    try {
      font.encodeText(char);
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Checks if a string contains complex Unicode scripts (e.g. Bengali, Indic, CJK, Emojis).
 * @param {string} str
 * @returns {boolean}
 */
export function hasComplexUnicode(str) {
  if (!str) return false;
  // Bengali: \u0980-\u09FF, Arabic: \u0600-\u06FF, Devanagari: \u0900-\u097F, CJK: \u4E00-\u9FFF, Emojis: \uD800-\uDFFF
  return /[\u0980-\u09FF\u0900-\u097F\u0600-\u06FF\u4E00-\u9FFF\uD800-\uDFFF]/.test(str);
}

/**
 * Safely encodes text for StandardFonts without throwing WinAnsi encoding errors.
 * Applies symbol transliterations. For unencodable characters, retains readable representation.
 * @param {string} str
 * @param {import('pdf-lib').PDFFont} font
 * @returns {string}
 */
export function safeWinAnsiText(str, font) {
  if (!str) return '';
  let replaced = String(str);
  for (const [sym, rep] of Object.entries(SYMBOL_REPLACEMENTS)) {
    if (replaced.includes(sym)) {
      replaced = replaced.split(sym).join(rep);
    }
  }

  let charCache = fontSupportCache.get(font);
  if (!charCache) {
    charCache = new Map();
    fontSupportCache.set(font, charCache);
  }

  let result = '';
  for (const char of replaced) {
    let supported = charCache.get(char);
    if (supported === undefined) {
      try {
        font.encodeText(char);
        supported = true;
      } catch {
        supported = false;
      }
      charCache.set(char, supported);
    }
    result += supported ? char : '?';
  }
  return result;
}

/**
 * Safely converts HTML content to clean text preserving line breaks and paragraph structure.
 */
export function htmlToText(html) {
  if (!html || typeof html !== 'string') return '';
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
      doc.querySelectorAll('br').forEach((el) => el.replaceWith('\n'));
      doc.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, h5, h6, blockquote').forEach((el) => {
        el.append('\n');
      });
      return doc.body.textContent.trim();
    } catch {
      // fallback
    }
  }
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

/**
 * Wraps code lines preserving exact whitespace, tabs, and indentation.
 */
function wrapCodeLine(rawLine, maxWidth, fontMono, fontSize) {
  if (rawLine === undefined || rawLine === null) return [''];
  const line = rawLine.replace(/\t/g, '    ');
  if (!line) return [''];

  const measure = (str) => {
    try {
      return fontMono.widthOfTextAtSize(safeWinAnsiText(str, fontMono), fontSize);
    } catch {
      return str.length * (fontSize * 0.6);
    }
  };

  if (measure(line) <= maxWidth) {
    return [line];
  }

  const leadingSpaces = line.match(/^ */)[0];
  const lines = [];
  let cur = '';

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const test = cur + char;
    if (measure(test) <= maxWidth) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = leadingSpaces + '  ' + char;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Splits text into lines that fit within a maximum width given a font and size.
 * Automatically wraps words and long tokens to prevent clipping, while preserving intentional line breaks.
 */
function wrapText(text, maxWidth, font, fontSize) {
  if (!text) return [];
  const paragraphs = String(text).split('\n');
  const resultLines = [];

  for (const para of paragraphs) {
    if (!para.trim()) {
      resultLines.push('');
      continue;
    }

    const words = para.split(/\s+/);
    let currentLine = '';

    for (let word of words) {
      if (!word) continue;

      const measureWord = (w) => {
        try {
          return font.widthOfTextAtSize(safeWinAnsiText(w, font), fontSize);
        } catch {
          return w.length * (fontSize * 0.55);
        }
      };

      while (measureWord(word) > maxWidth && word.length > 2) {
        let sliceLen = Math.max(1, Math.floor(word.length * 0.7));
        while (sliceLen > 1 && measureWord(word.substring(0, sliceLen)) > maxWidth) {
          sliceLen--;
        }
        const chunk = word.substring(0, sliceLen);
        if (currentLine) {
          resultLines.push(currentLine);
          currentLine = '';
        }
        resultLines.push(chunk);
        word = word.substring(sliceLen);
      }

      const testLine = currentLine ? `${currentLine} ${word}` : word;
      let testWidth = 0;
      try {
        testWidth = font.widthOfTextAtSize(safeWinAnsiText(testLine, font), fontSize);
      } catch {
        testWidth = testLine.length * (fontSize * 0.55);
      }

      if (testWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) resultLines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) resultLines.push(currentLine);
  }

  return resultLines;
}

/**
 * Creates an SVG data URL for a text string that contains complex Unicode (e.g. Bengali).
 * @param {string} text
 * @param {number} fontSize
 * @param {string} colorHex
 * @param {boolean} isBold
 * @param {number} maxWidth
 * @returns {string} SVG data URL
 */
function createUnicodeTextSvgDataUrl(text, fontSize, colorHex, isBold, maxWidth) {
  const safeText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const height = Math.round(fontSize * 1.5);
  const width = Math.min(Math.max(text.length * fontSize * 0.7, 50), maxWidth);

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <text x="0" y="${fontSize * 1.1}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans Bengali', Kalpurush, sans-serif" font-size="${fontSize}px" font-weight="${isBold ? 'bold' : 'normal'}" fill="${colorHex}">${safeText}</text>
</svg>`.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const PAGE_FORMATS = {
  a4: [595.28, 841.89],
  letter: [612.0, 792.0],
  legal: [612.0, 1008.0]
};

const MARGINS = {
  narrow: 28,
  wide: 54,
  normal: 40
};

/**
 * Generates a clean vector PDF with selectable text, rendered math formulas,
 * multiline table layouts, full code blocks, and Bengali/Unicode support.
 *
 * @param {import('../core/conversation-model.js').Conversation} originalConversation
 * @param {Object} options
 * @returns {Promise<{ blob: Blob, filename: string, mime: string }>}
 */
export async function exportConversation(originalConversation, options = {}) {
  const {
    anonymizePii = false,
    theme = 'light',
    pageFormat = 'a4',
    margin: marginOpt = 'normal',
    fontSize = 10,
    includeToc = false,
    headerText = '',
    footerText = ''
  } = options;

  const conv = anonymizePii ? anonymizeConversation(originalConversation) : originalConversation;

  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

  const resolvedTheme = theme === 'dark' ? 'dark' : 'light';
  const isDark = resolvedTheme === 'dark';
  const bgColor = isDark ? rgb(0.1, 0.1, 0.13) : rgb(1, 1, 1);
  const textColor = isDark ? rgb(0.95, 0.95, 0.95) : rgb(0.12, 0.16, 0.22);
  const textColorHex = isDark ? '#f3f4f6' : '#1e293b';
  const mutedColor = isDark ? rgb(0.65, 0.65, 0.7) : rgb(0.42, 0.45, 0.5);
  const mutedColorHex = isDark ? '#9ca3af' : '#64748b';
  const primaryColor = isDark ? rgb(0.55, 0.5, 0.95) : rgb(0.31, 0.27, 0.9);
  const primaryColorHex = isDark ? '#818cf8' : '#4f46e5';
  const userRoleColor = isDark ? rgb(0.55, 0.5, 0.95) : rgb(0.31, 0.27, 0.9);
  const assistantRoleColor = isDark ? rgb(0.3, 0.8, 0.6) : rgb(0.05, 0.6, 0.4);
  const codeBgColor = isDark ? rgb(0.15, 0.15, 0.2) : rgb(0.95, 0.96, 0.98);
  const tableHeaderBg = isDark ? rgb(0.2, 0.2, 0.25) : rgb(0.93, 0.94, 0.96);
  const borderColor = isDark ? rgb(0.28, 0.28, 0.35) : rgb(0.85, 0.88, 0.92);

  const [pageWidth, pageHeight] = PAGE_FORMATS[pageFormat.toLowerCase()] || PAGE_FORMATS.a4;
  const margin = MARGINS[marginOpt.toLowerCase()] || MARGINS.normal;
  const contentWidth = pageWidth - margin * 2;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  if (isDark) {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
      color: bgColor
    });
  }

  let y = pageHeight - margin;

  function ensureSpace(neededHeight) {
    if (y - neededHeight < margin) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      if (isDark) {
        page.drawRectangle({
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight,
          color: bgColor
        });
      }
      y = pageHeight - margin;
    }
  }

  /**
   * Draws a line of text, automatically using high-DPI image embedding for complex Unicode (e.g. Bengali).
   */
  async function drawTextLine(text, x, curY, size, font, color, colorHex, isBold = false) {
    if (!text) return;
    if (hasComplexUnicode(text)) {
      try {
        const svgData = createUnicodeTextSvgDataUrl(text, size, colorHex, isBold, contentWidth);
        const convResult = await imageSourceToPngBytes(svgData);
        if (convResult && convResult.bytes) {
          const img = await pdfDoc.embedPng(convResult.bytes);
          const fitted = fitDimensions(
            convResult.width,
            convResult.height,
            contentWidth,
            size * 1.8
          );
          page.drawImage(img, {
            x,
            y: curY - fitted.height + 2,
            width: fitted.width,
            height: fitted.height
          });
          return;
        }
      } catch {
        // fallback to vector text
      }
    }

    const safeStr = safeWinAnsiText(text, font);
    page.drawText(safeStr, {
      x,
      y: curY,
      size,
      font,
      color
    });
  }

  // Draw Title
  ensureSpace(45);
  await drawTextLine(
    conv.title || 'Z.ai Conversation',
    margin,
    y - 22,
    18,
    fontBold,
    textColor,
    textColorHex,
    true
  );
  y -= 32;

  // Metadata Header
  const dateStr = new Date(conv.createdAt).toLocaleString();
  await drawTextLine(
    `Model: ${conv.model}  |  Date: ${dateStr}`,
    margin,
    y - 10,
    9,
    fontRegular,
    mutedColor,
    mutedColorHex,
    false
  );
  y -= 22;

  // Horizontal divider
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: borderColor
  });
  y -= 24;

  // Table of Contents if enabled
  if (includeToc && Array.isArray(conv.messages) && conv.messages.length > 0) {
    ensureSpace(40);
    page.drawText('Table of Contents', {
      x: margin,
      y: y - 12,
      size: 13,
      font: fontBold,
      color: primaryColor
    });
    y -= 22;

    for (let i = 0; i < Math.min(conv.messages.length, 25); i++) {
      const msg = conv.messages[i];
      const snippet = (msg.text || '').substring(0, 45).replace(/\n/g, ' ');
      ensureSpace(14);
      await drawTextLine(
        `#${i + 1} [${msg.role}]: ${snippet}...`,
        margin + 10,
        y - 10,
        8.5,
        fontRegular,
        mutedColor,
        mutedColorHex,
        false
      );
      y -= 14;
    }
    y -= 16;
  }

  // Render Messages
  for (const msg of conv.messages) {
    const isUser = msg.role === 'user';
    const roleLabel = isUser ? 'You' : conv.model || 'Z.ai Assistant';

    ensureSpace(32);

    // Speaker Header
    page.drawText(safeWinAnsiText(roleLabel, fontBold), {
      x: margin,
      y: y - 12,
      size: fontSize + 2,
      font: fontBold,
      color: isUser ? userRoleColor : assistantRoleColor
    });
    y -= 22;

    if (Array.isArray(msg.blocks) && msg.blocks.length > 0) {
      for (const block of msg.blocks) {
        if (block.kind === 'heading') {
          const hSize =
            block.level === 1 ? fontSize + 4 : block.level === 2 ? fontSize + 2.5 : fontSize + 1.5;
          const hText = block.text || block.html?.replace(/<[^>]*>/g, '') || '';
          const lines = wrapText(hText, contentWidth, fontBold, hSize);

          ensureSpace(lines.length * (hSize + 4) + 14);
          y -= 8;
          for (const l of lines) {
            await drawTextLine(
              l,
              margin,
              y - hSize,
              hSize,
              fontBold,
              textColor,
              textColorHex,
              true
            );
            y -= hSize + 4;
          }
          y -= 6;
        } else if (block.kind === 'list') {
          const items = block.items || [];
          if (items.length > 0) {
            for (let idx = 0; idx < items.length; idx++) {
              const item = items[idx];
              const depth = item.depth || 0;
              const isOrd = item.ordered !== undefined ? item.ordered : block.ordered;
              const itemIdx = item.index !== undefined ? item.index : idx + 1;
              const bullet = isOrd ? `${itemIdx}. ` : '* ';
              const bulletWidth = fontBold.widthOfTextAtSize(bullet, fontSize);
              const text = item.text || htmlToText(item.html);
              const indentX = margin + 8 + depth * 16;
              const lines = wrapText(
                text,
                contentWidth - bulletWidth - 8 - depth * 16,
                fontRegular,
                fontSize
              );

              ensureSpace(lines.length * (fontSize + 4) + 6);
              if (lines.length > 0) {
                page.drawText(safeWinAnsiText(bullet, fontBold), {
                  x: indentX,
                  y: y - fontSize,
                  size: fontSize,
                  font: fontBold,
                  color: primaryColor
                });

                for (let li = 0; li < lines.length; li++) {
                  await drawTextLine(
                    lines[li],
                    indentX + bulletWidth + 4,
                    y - fontSize,
                    fontSize,
                    fontRegular,
                    textColor,
                    textColorHex,
                    false
                  );
                  y -= fontSize + 4;
                }
              }
              y -= 3;
            }
            y -= 6;
          } else {
            const raw = block.text || htmlToText(block.html);
            const lines = wrapText(raw, contentWidth, fontRegular, fontSize);
            for (const l of lines) {
              ensureSpace(fontSize + 5);
              await drawTextLine(
                l,
                margin,
                y - fontSize,
                fontSize,
                fontRegular,
                textColor,
                textColorHex,
                false
              );
              y -= fontSize + 4;
            }
            y -= 6;
          }
        } else if (block.kind === 'quote') {
          const raw = block.text || htmlToText(block.html);
          const lines = wrapText(raw, contentWidth - 20, fontRegular, fontSize);
          const blockH = lines.length * (fontSize + 4) + 6;

          ensureSpace(blockH + 8);
          page.drawLine({
            start: { x: margin + 4, y },
            end: { x: margin + 4, y: y - blockH },
            thickness: 2.5,
            color: primaryColor
          });

          for (const l of lines) {
            await drawTextLine(
              l,
              margin + 16,
              y - fontSize,
              fontSize,
              fontRegular,
              mutedColor,
              mutedColorHex,
              false
            );
            y -= fontSize + 4;
          }
          y -= 8;
        } else if (block.kind === 'code') {
          // Wrap long code lines PRESERVING EXACT WHITESPACE & INDENTATION
          const rawLines = (block.code || '').split('\n');
          const maxCodeWidth = contentWidth - 20;
          const codeLines = [];

          for (const rawLine of rawLines) {
            const subLines = wrapCodeLine(rawLine, maxCodeWidth, fontMono, 8.5);
            codeLines.push(...subLines);
          }

          const blockHeight = codeLines.length * 13 + 16;
          ensureSpace(Math.min(blockHeight, 150));

          // Draw code background box
          const boxTop = y;
          const boxH = Math.min(blockHeight, y - margin);
          page.drawRectangle({
            x: margin,
            y: boxTop - boxH,
            width: contentWidth,
            height: boxH,
            color: codeBgColor
          });

          y -= 8;
          for (const line of codeLines) {
            ensureSpace(14);
            await drawTextLine(
              line,
              margin + 8,
              y - 9,
              8.5,
              fontMono,
              textColor,
              textColorHex,
              false
            );
            y -= 13;
          }
          y -= 10;
        } else if (block.kind === 'table') {
          // Dynamic content-aware table without truncation
          const tableRows = normalizeTableRows(block);
          if (tableRows.length > 0) {
            const colWidths = computeColumnWidths(tableRows, contentWidth);

            ensureSpace(35);

            for (let rIdx = 0; rIdx < tableRows.length; rIdx++) {
              const row = tableRows[rIdx];
              const isHeader = rIdx === 0 || row.some((c) => c.isHeader);
              const cellFont = isHeader ? fontBold : fontRegular;
              const cellFontSize = fontSize - 1;

              // Compute wrapped lines for each cell in this row
              const rowCellsWithLines = row.map((cell, cIdx) => {
                const w = colWidths[cIdx] || 50;
                const lines = wrapCellLines(cell.text, w - 10, (str) => {
                  try {
                    return cellFont.widthOfTextAtSize(safeWinAnsiText(str, cellFont), cellFontSize);
                  } catch {
                    return str.length * (cellFontSize * 0.55);
                  }
                });
                return { ...cell, lines, width: w };
              });

              // Dynamic content-aware row height (never fixed at 22px)
              const maxLines = Math.max(...rowCellsWithLines.map((c) => c.lines.length), 1);
              const rowHeight = maxLines * (cellFontSize + 3) + 8;

              // Check page boundary. If row doesn't fit, add page and repeat header
              if (y - rowHeight < margin) {
                ensureSpace(rowHeight + 10);
                if (!isHeader && tableRows[0]) {
                  // Re-draw header row on new page
                  const headerHeight = 22;
                  page.drawRectangle({
                    x: margin,
                    y: y - headerHeight,
                    width: contentWidth,
                    height: headerHeight,
                    color: tableHeaderBg
                  });
                  let hx = margin;
                  for (let hIdx = 0; hIdx < tableRows[0].length; hIdx++) {
                    const hCell = tableRows[0][hIdx];
                    const hw = colWidths[hIdx] || 50;
                    await drawTextLine(
                      hCell.text,
                      hx + 5,
                      y - 14,
                      cellFontSize,
                      fontBold,
                      textColor,
                      textColorHex,
                      true
                    );
                    hx += hw;
                  }
                  y -= headerHeight;
                }
              }

              // Background for header
              if (isHeader) {
                page.drawRectangle({
                  x: margin,
                  y: y - rowHeight,
                  width: contentWidth,
                  height: rowHeight,
                  color: tableHeaderBg
                });
              }

              // Cell bottom border
              page.drawLine({
                start: { x: margin, y: y - rowHeight },
                end: { x: margin + contentWidth, y: y - rowHeight },
                thickness: 0.8,
                color: borderColor
              });

              // Draw cell content
              let currentX = margin;
              for (let cIdx = 0; cIdx < rowCellsWithLines.length; cIdx++) {
                const cell = rowCellsWithLines[cIdx];
                const cellX = currentX + 5;
                let lineY = y - cellFontSize - 4;

                for (const line of cell.lines) {
                  await drawTextLine(
                    line,
                    cellX,
                    lineY,
                    cellFontSize,
                    cellFont,
                    textColor,
                    textColorHex,
                    isHeader
                  );
                  lineY -= cellFontSize + 3;
                }

                currentX += cell.width;
              }

              y -= rowHeight;
            }
            y -= 10;
          }
        } else if (block.kind === 'math') {
          // Render math as crisp high-DPI equation image (NEVER output [Formula: ...])
          try {
            const svgStr = renderMathToSvg(block.tex || '', block.displayMode, textColorHex);
            const svgData = `data:image/svg+xml;utf8,${encodeURIComponent(svgStr)}`;
            const convResult = await imageSourceToPngBytes(svgData);

            if (convResult && convResult.bytes) {
              const mathImg = await pdfDoc.embedPng(convResult.bytes);
              const fitted = fitDimensions(
                convResult.width,
                convResult.height,
                contentWidth,
                block.displayMode ? 100 : 35
              );

              ensureSpace(fitted.height + 14);
              const mathX = block.displayMode
                ? margin + Math.max(0, (contentWidth - fitted.width) / 2)
                : margin + 8;

              page.drawImage(mathImg, {
                x: mathX,
                y: y - fitted.height - 4,
                width: fitted.width,
                height: fitted.height
              });
              y -= fitted.height + 12;
            } else {
              // Graceful clean math representation if image embedding unavailable
              ensureSpace(20);
              await drawTextLine(
                block.tex,
                margin + 10,
                y - 12,
                fontSize,
                fontRegular,
                primaryColor,
                primaryColorHex,
                false
              );
              y -= 20;
            }
          } catch (mErr) {
            console.warn('[PDF-Vector] Math image error:', mErr);
            ensureSpace(20);
            await drawTextLine(
              block.tex,
              margin + 10,
              y - 12,
              fontSize,
              fontRegular,
              primaryColor,
              primaryColorHex,
              false
            );
            y -= 20;
          }
        } else if (block.kind === 'image' && (block.src || block.dataUrl)) {
          // Embed image preserving intrinsic aspect ratio without stretching
          try {
            const imgSrc = block.dataUrl || block.src;
            const convResult = await imageSourceToPngBytes(imgSrc);

            if (convResult && convResult.bytes) {
              let embeddedImg = null;
              if (convResult.isPng) {
                embeddedImg = await pdfDoc.embedPng(convResult.bytes);
              } else {
                embeddedImg = await pdfDoc.embedJpg(convResult.bytes);
              }

              if (embeddedImg) {
                const fitted = fitDimensions(
                  convResult.width,
                  convResult.height,
                  contentWidth,
                  380
                );

                ensureSpace(fitted.height + 15);
                page.drawImage(embeddedImg, {
                  x: margin + (contentWidth - fitted.width) / 2, // Centered
                  y: y - fitted.height,
                  width: fitted.width,
                  height: fitted.height
                });
                y -= fitted.height + 15;
              }
            }
          } catch (imgErr) {
            console.warn('[PDF Exporter] Failed to embed image:', imgErr);
            ensureSpace(20);
            await drawTextLine(
              `[Image: ${block.alt || 'Chat Image'}]`,
              margin,
              y - 11,
              fontSize - 1,
              fontRegular,
              mutedColor,
              mutedColorHex,
              false
            );
            y -= 15;
          }
        } else {
          // Paragraph / Text / Other
          const raw = block.text || htmlToText(block.html);
          if (raw.trim()) {
            const lines = wrapText(raw, contentWidth, fontRegular, fontSize);
            for (const l of lines) {
              ensureSpace(fontSize + 5);
              await drawTextLine(
                l,
                margin,
                y - fontSize,
                fontSize,
                fontRegular,
                textColor,
                textColorHex,
                false
              );
              y -= fontSize + 4.5;
            }
            y -= 7;
          }
        }
      }
    } else {
      // Fallback message text
      const raw = msg.text || '';
      if (raw.trim()) {
        const lines = wrapText(raw, contentWidth, fontRegular, fontSize);
        for (const l of lines) {
          ensureSpace(fontSize + 5);
          await drawTextLine(
            l,
            margin,
            y - fontSize,
            fontSize,
            fontRegular,
            textColor,
            textColorHex,
            false
          );
          y -= fontSize + 4.5;
        }
        y -= 7;
      }
    }

    y -= 14; // Gap between speaker messages
  }

  // Draw headers, footers, and page numbers across all pages
  const totalPages = pdfDoc.getPageCount();
  for (let i = 0; i < totalPages; i++) {
    const p = pdfDoc.getPage(i);

    if (headerText) {
      await drawTextLine(
        headerText,
        margin,
        pageHeight - margin / 2,
        8,
        fontRegular,
        mutedColor,
        mutedColorHex,
        false
      );
    }

    const pageNumberText = `Page ${i + 1} of ${totalPages}`;
    const pageNumWidth = fontRegular.widthOfTextAtSize(pageNumberText, 8);
    p.drawText(pageNumberText, {
      x: pageWidth - margin - pageNumWidth,
      y: margin / 2,
      size: 8,
      font: fontRegular,
      color: mutedColor
    });

    if (footerText) {
      await drawTextLine(
        footerText,
        margin,
        margin / 2,
        8,
        fontRegular,
        mutedColor,
        mutedColorHex,
        false
      );
    }
  }

  const pdfBytes = await pdfDoc.save();
  const mime = 'application/pdf';
  const blob = new Blob([pdfBytes], { type: mime });

  const filename = generateFilename({
    template: options.template,
    title: conv.title,
    format: 'pdf',
    model: conv.model,
    timestamp: conv.createdAt
  });

  return {
    blob,
    filename,
    mime
  };
}
