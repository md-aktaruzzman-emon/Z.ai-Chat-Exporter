/**
 * @file pdf-vector.js
 * Selectable, searchable, deterministic Vector PDF generator using pdf-lib.
 * Matches the publication-quality 'extrention z' document styling:
 * - Rounded mint-green user message cards with '👤 You'
 * - File attachment cards with icons and metadata badges
 * - Running headers and footers with divider lines
 * - Dynamic block measurement and collision-free typography
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
 */
function createUnicodeTextSvgDataUrl(text, fontSize, colorHex, isBold, maxWidth) {
  const safeText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const height = Math.round(fontSize * 1.5);
  const width = Math.min(Math.max(text.length * fontSize * 0.75, 60), maxWidth);

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <text x="0" y="${fontSize * 1.15}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans Bengali', Kalpurush, sans-serif" font-size="${fontSize}px" font-weight="${isBold ? 'bold' : 'normal'}" fill="${colorHex}">${safeText}</text>
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
 * Paged Document Layout Engine for PDF generation.
 * Performs explicit block measurement and maintains layout state (`cursorY`) strictly based on actual rendered block heights.
 */
class PdfLayoutEngine {
  constructor(pdfDoc, options = {}) {
    this.pdfDoc = pdfDoc;
    this.pageWidth = options.pageWidth;
    this.pageHeight = options.pageHeight;
    this.margin = options.margin;
    this.contentWidth = this.pageWidth - this.margin * 2;

    this.theme = options.theme;
    this.isDark = options.isDark;
    this.bgColor = options.bgColor;
    this.textColor = options.textColor;
    this.textColorHex = options.textColorHex;
    this.mutedColor = options.mutedColor;
    this.mutedColorHex = options.mutedColorHex;
    this.primaryColor = options.primaryColor;
    this.primaryColorHex = options.primaryColorHex;
    this.userRoleColor = options.userRoleColor;
    this.assistantRoleColor = options.assistantRoleColor;
    this.codeBgColor = options.codeBgColor;
    this.tableHeaderBg = options.tableHeaderBg;
    this.borderColor = options.borderColor;

    this.fontRegular = options.fontRegular;
    this.fontBold = options.fontBold;
    this.fontMono = options.fontMono;
    this.fontSize = options.fontSize || 10;

    this.pages = [];
    this.currentPage = null;
    this.cursorY = 0;

    this.addPage();
  }

  addPage() {
    const page = this.pdfDoc.addPage([this.pageWidth, this.pageHeight]);
    if (this.isDark && this.bgColor) {
      page.drawRectangle({
        x: 0,
        y: 0,
        width: this.pageWidth,
        height: this.pageHeight,
        color: this.bgColor
      });
    }
    this.pages.push(page);
    this.currentPage = page;
    // Leave room below top running header line (header line is at pageHeight - 28)
    this.cursorY = this.pageHeight - this.margin - 12;
    return page;
  }

  get availableHeight() {
    // Bottom limit is above bottom footer divider line (footer line is at margin + 14)
    return this.cursorY - (this.margin + 20);
  }

  hasSpace(height) {
    return this.availableHeight >= height;
  }

  ensureSpace(height) {
    if (!this.hasSpace(height)) {
      this.addPage();
      return true;
    }
    return false;
  }

  async drawTextLine(text, x, curY, size, font, color, colorHex, isBold = false) {
    if (!text) return;
    if (hasComplexUnicode(text)) {
      try {
        const svgData = createUnicodeTextSvgDataUrl(text, size, colorHex, isBold, this.contentWidth);
        const convResult = await imageSourceToPngBytes(svgData);
        if (convResult && convResult.bytes) {
          const img = await this.pdfDoc.embedPng(convResult.bytes);
          const fitted = fitDimensions(
            convResult.width,
            convResult.height,
            this.contentWidth,
            size * 1.5
          );
          // Baseline alignment: align SVG text baseline with standard font baseline curY
          this.currentPage.drawImage(img, {
            x,
            y: curY - fitted.height * 0.35,
            width: fitted.width,
            height: fitted.height
          });
          return;
        }
      } catch {
        // fallback
      }
    }

    const safeStr = safeWinAnsiText(text, font);
    this.currentPage.drawText(safeStr, {
      x,
      y: curY,
      size,
      font,
      color
    });
  }

  // --- Block Measurements ---

  measureHeading(block, offset = 0) {
    const hSize =
      block.level === 1 ? this.fontSize + 4 : block.level === 2 ? this.fontSize + 2.5 : this.fontSize + 1.5;
    const hText = block.text || htmlToText(block.html) || '';
    const maxW = this.contentWidth - offset;
    const lines = wrapText(hText, maxW, this.fontBold, hSize);
    const lineHeight = hSize + 4;
    const spaceBefore = 10;
    const spaceAfter = 6;
    const contentHeight = lines.length * lineHeight;
    const totalHeight = spaceBefore + contentHeight + spaceAfter;
    const keepWithNextMin = 35;
    return { kind: 'heading', hSize, lines, lineHeight, spaceBefore, spaceAfter, contentHeight, totalHeight, keepWithNextMin };
  }

  measureParagraph(rawText, offset = 0) {
    const text = rawText || '';
    if (!text.trim()) return { kind: 'paragraph', lines: [], totalHeight: 0 };
    const maxW = this.contentWidth - offset;
    const lines = wrapText(text, maxW, this.fontRegular, this.fontSize);
    const lineHeight = this.fontSize + 4.5;
    const spaceAfter = 7;
    const contentHeight = lines.length * lineHeight;
    const totalHeight = contentHeight + spaceAfter;
    return { kind: 'paragraph', lines, lineHeight, contentHeight, spaceAfter, totalHeight };
  }

  measureCode(block) {
    const rawLines = (block.code || '').split('\n');
    const maxCodeWidth = this.contentWidth - 20;
    const codeLines = [];
    for (const rawLine of rawLines) {
      const subLines = wrapCodeLine(rawLine, maxCodeWidth, this.fontMono, 8.5);
      codeLines.push(...subLines);
    }
    const lineHeight = 13;
    const paddingTopBottom = 8;
    const spaceAfter = 10;
    const contentHeight = codeLines.length * lineHeight;
    const totalHeight = paddingTopBottom * 2 + contentHeight + spaceAfter;
    return { kind: 'code', codeLines, lineHeight, paddingTopBottom, contentHeight, totalHeight, spaceAfter };
  }

  measureList(block) {
    const items = block.items || [];
    const measuredItems = [];
    let totalHeight = 0;

    if (items.length > 0) {
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const depth = item.depth || 0;
        const isOrd = item.ordered !== undefined ? item.ordered : block.ordered;
        const itemIdx = item.index !== undefined ? item.index : idx + 1;
        const bullet = isOrd ? `${itemIdx}. ` : '• ';
        const bulletWidth = this.fontBold.widthOfTextAtSize(safeWinAnsiText(bullet, this.fontBold), this.fontSize);
        const text = item.text || htmlToText(item.html);
        const indentX = this.margin + 8 + depth * 16;
        const availW = this.contentWidth - (8 + depth * 16) - bulletWidth - 4;
        const lines = wrapText(text, availW, this.fontRegular, this.fontSize);
        const lineHeight = this.fontSize + 4;
        const itemH = lines.length * lineHeight + 3;
        totalHeight += itemH;
        measuredItems.push({ bullet, bulletWidth, text, indentX, lines, lineHeight, itemHeight: itemH });
      }
      totalHeight += 6;
    } else {
      const raw = block.text || htmlToText(block.html);
      const lines = wrapText(raw, this.contentWidth, this.fontRegular, this.fontSize);
      const lineHeight = this.fontSize + 4;
      totalHeight = lines.length * lineHeight + 6;
      measuredItems.push({ bullet: '', bulletWidth: 0, text: raw, indentX: this.margin, lines, lineHeight, itemHeight: totalHeight });
    }
    return { kind: 'list', items: measuredItems, totalHeight };
  }

  measureQuote(block) {
    const raw = block.text || htmlToText(block.html);
    const lines = wrapText(raw, this.contentWidth - 20, this.fontRegular, this.fontSize);
    const lineHeight = this.fontSize + 4;
    const contentHeight = lines.length * lineHeight;
    const totalHeight = contentHeight + 14;
    return { kind: 'quote', lines, lineHeight, contentHeight, totalHeight };
  }

  measureTable(block) {
    const tableRows = normalizeTableRows(block);
    if (tableRows.length === 0) return { kind: 'table', totalHeight: 0, measuredRows: [] };
    const colWidths = computeColumnWidths(tableRows, this.contentWidth);
    const cellFontSize = this.fontSize - 1;

    const measuredRows = [];
    let totalHeight = 0;

    for (let rIdx = 0; rIdx < tableRows.length; rIdx++) {
      const row = tableRows[rIdx];
      const isHeader = rIdx === 0 || row.some((c) => c.isHeader);
      const cellFont = isHeader ? this.fontBold : this.fontRegular;

      const cellsWithLines = row.map((cell, cIdx) => {
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

      const maxLines = Math.max(...cellsWithLines.map((c) => c.lines.length), 1);
      const rowHeight = maxLines * (cellFontSize + 3) + 8;
      totalHeight += rowHeight;
      measuredRows.push({ isHeader, cellFont, cellFontSize, cells: cellsWithLines, rowHeight });
    }
    totalHeight += 10;
    return { kind: 'table', colWidths, measuredRows, totalHeight };
  }

  // --- extrention z Message Cards & Renderers ---

  measureUserCard(msg) {
    const cardPadding = 10;
    const headerHeight = 16;
    let contentH = 0;
    const measuredBlocks = [];

    const blocks =
      Array.isArray(msg.blocks) && msg.blocks.length > 0
        ? msg.blocks
        : [{ kind: 'paragraph', text: msg.text || '' }];

    for (const b of blocks) {
      if (b.kind === 'attachment') {
        const h = 40;
        contentH += h;
        measuredBlocks.push({ block: b, height: h });
      } else if (b.kind === 'heading') {
        const m = this.measureHeading(b, 24);
        contentH += m.totalHeight;
        measuredBlocks.push({ block: b, measured: m, height: m.totalHeight });
      } else {
        const text = b.text || htmlToText(b.html);
        const m = this.measureParagraph(text, 24);
        contentH += m.totalHeight;
        measuredBlocks.push({ block: b, measured: m, height: m.totalHeight });
      }
    }

    const totalHeight = cardPadding * 2 + headerHeight + contentH;
    return { totalHeight, cardPadding, headerHeight, measuredBlocks };
  }

  async renderUserCard(msg) {
    const m = this.measureUserCard(msg);
    const pageContentH = this.pageHeight - this.margin * 2 - 30;

    if (m.totalHeight <= this.availableHeight) {
      const cardTop = this.cursorY;
      const cardH = m.totalHeight;

      // Draw soft mint-green bubble card (extrention z style)
      this.currentPage.drawRectangle({
        x: this.margin,
        y: cardTop - cardH,
        width: this.contentWidth,
        height: cardH,
        color: rgb(0.941, 0.992, 0.957), // #f0fdf4
        borderColor: rgb(0.525, 0.937, 0.675), // #86efac
        borderWidth: 1
      });

      this.cursorY -= m.cardPadding;

      // Speaker Header: 👤 You
      await this.drawTextLine(
        'You',
        this.margin + 12,
        this.cursorY - 11,
        10.5,
        this.fontBold,
        rgb(0.02, 0.588, 0.412), // #059669
        '#059669',
        true
      );
      this.cursorY -= m.headerHeight;

      // Render inner content inside card
      for (const item of m.measuredBlocks) {
        if (item.block.kind === 'attachment') {
          await this.renderAttachmentCard(item.block, true);
        } else if (item.block.kind === 'heading') {
          await this.renderHeading(item.block, 12);
        } else {
          const text = item.block.text || htmlToText(item.block.html);
          await this.renderParagraphText(text, 12);
        }
      }

      this.cursorY = cardTop - cardH - 18; // 18pt gap after user card
    } else if (m.totalHeight <= pageContentH) {
      this.addPage();
      await this.renderUserCard(msg);
    } else {
      // Long user prompt: header + plain render
      this.ensureSpace(35);
      await this.drawTextLine(
        'You',
        this.margin,
        this.cursorY - 12,
        11,
        this.fontBold,
        this.userRoleColor,
        '#059669',
        true
      );
      this.cursorY -= 20;

      for (const item of m.measuredBlocks) {
        if (item.block.kind === 'attachment') {
          await this.renderAttachmentCard(item.block, false);
        } else if (item.block.kind === 'heading') {
          await this.renderHeading(item.block);
        } else {
          const text = item.block.text || htmlToText(item.block.html);
          await this.renderParagraphText(text);
        }
      }
      this.cursorY -= 14;
    }
  }

  async renderAttachmentCard(att, inCard = true) {
    const cardW = inCard ? this.contentWidth - 24 : this.contentWidth;
    const cardX = inCard ? this.margin + 12 : this.margin;
    const cardH = 34;

    this.ensureSpace(cardH + 6);
    const boxTop = this.cursorY;

    // Inner white card box with subtle border
    this.currentPage.drawRectangle({
      x: cardX,
      y: boxTop - cardH,
      width: cardW,
      height: cardH,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.796, 0.835, 0.882), // #cbd5e1
      borderWidth: 0.8
    });

    // Filename in bold 9.5pt
    const name = (att.name || 'Attached File').substring(0, 65);
    await this.drawTextLine(
      name,
      cardX + 12,
      boxTop - 13,
      9.5,
      this.fontBold,
      rgb(0.06, 0.09, 0.16),
      '#0f172a',
      true
    );

    // Metadata pill: [PDF  1.4 MB]
    const metaStr = `${att.ext || 'FILE'}${att.size ? '  ' + att.size : ''}`;
    await this.drawTextLine(
      metaStr,
      cardX + 12,
      boxTop - 26,
      8,
      this.fontRegular,
      this.mutedColor,
      this.mutedColorHex,
      false
    );

    this.cursorY -= cardH + 8;
  }

  async renderHeading(block, offset = 0) {
    const m = this.measureHeading(block, offset);
    this.ensureSpace(m.totalHeight + m.keepWithNextMin);

    this.cursorY -= m.spaceBefore;
    for (const l of m.lines) {
      await this.drawTextLine(
        l,
        this.margin + offset,
        this.cursorY - m.hSize,
        m.hSize,
        this.fontBold,
        this.textColor,
        this.textColorHex,
        true
      );
      this.cursorY -= m.lineHeight;
    }
    this.cursorY -= m.spaceAfter;
  }

  async renderParagraphText(text, offset = 0) {
    const m = this.measureParagraph(text, offset);
    if (m.lines.length === 0) return;

    if (this.hasSpace(m.totalHeight)) {
      for (const l of m.lines) {
        await this.drawTextLine(
          l,
          this.margin + offset,
          this.cursorY - this.fontSize,
          this.fontSize,
          this.fontRegular,
          this.textColor,
          this.textColorHex,
          false
        );
        this.cursorY -= m.lineHeight;
      }
      this.cursorY -= m.spaceAfter;
    } else {
      if (this.availableHeight < m.lineHeight * 2) {
        this.addPage();
      }
      for (const l of m.lines) {
        if (!this.hasSpace(m.lineHeight + 5)) {
          this.addPage();
        }
        await this.drawTextLine(
          l,
          this.margin + offset,
          this.cursorY - this.fontSize,
          this.fontSize,
          this.fontRegular,
          this.textColor,
          this.textColorHex,
          false
        );
        this.cursorY -= m.lineHeight;
      }
      this.cursorY -= m.spaceAfter;
    }
  }

  async renderCode(block) {
    const m = this.measureCode(block);
    const pageContentHeight = this.pageHeight - this.margin * 2 - 30;

    if (m.totalHeight <= this.availableHeight) {
      const boxTop = this.cursorY;
      const boxH = m.totalHeight - m.spaceAfter;

      this.currentPage.drawRectangle({
        x: this.margin,
        y: boxTop - boxH,
        width: this.contentWidth,
        height: boxH,
        color: this.codeBgColor,
        borderColor: this.borderColor,
        borderWidth: 0.8
      });

      // Left accent bar
      this.currentPage.drawRectangle({
        x: this.margin,
        y: boxTop - boxH,
        width: 3,
        height: boxH,
        color: this.primaryColor
      });

      this.cursorY -= m.paddingTopBottom;
      for (const line of m.codeLines) {
        await this.drawTextLine(
          line,
          this.margin + 10,
          this.cursorY - 9,
          8.5,
          this.fontMono,
          this.textColor,
          this.textColorHex,
          false
        );
        this.cursorY -= m.lineHeight;
      }
      this.cursorY -= m.paddingTopBottom + m.spaceAfter;
    } else if (m.totalHeight <= pageContentHeight) {
      this.addPage();
      await this.renderCode(block);
    } else {
      const lines = [...m.codeLines];
      while (lines.length > 0) {
        const availH = this.availableHeight;
        if (availH < 40) {
          this.addPage();
        }
        const availLines = Math.max(1, Math.floor((this.availableHeight - 20) / m.lineHeight));
        const chunk = lines.splice(0, availLines);
        const chunkH = chunk.length * m.lineHeight + m.paddingTopBottom * 2;

        const boxTop = this.cursorY;
        this.currentPage.drawRectangle({
          x: this.margin,
          y: boxTop - chunkH,
          width: this.contentWidth,
          height: chunkH,
          color: this.codeBgColor,
          borderColor: this.borderColor,
          borderWidth: 0.8
        });

        this.currentPage.drawRectangle({
          x: this.margin,
          y: boxTop - chunkH,
          width: 3,
          height: chunkH,
          color: this.primaryColor
        });

        this.cursorY -= m.paddingTopBottom;
        for (const line of chunk) {
          await this.drawTextLine(
            line,
            this.margin + 10,
            this.cursorY - 9,
            8.5,
            this.fontMono,
            this.textColor,
            this.textColorHex,
            false
          );
          this.cursorY -= m.lineHeight;
        }
        this.cursorY -= m.paddingTopBottom + m.spaceAfter;
      }
    }
  }

  async renderList(block) {
    const m = this.measureList(block);
    if (m.totalHeight <= this.availableHeight) {
      for (const item of m.items) {
        if (item.bullet) {
          this.currentPage.drawText(safeWinAnsiText(item.bullet, this.fontBold), {
            x: item.indentX,
            y: this.cursorY - this.fontSize,
            size: this.fontSize,
            font: this.fontBold,
            color: this.primaryColor
          });
        }
        for (const l of item.lines) {
          await this.drawTextLine(
            l,
            item.indentX + item.bulletWidth + 4,
            this.cursorY - this.fontSize,
            this.fontSize,
            this.fontRegular,
            this.textColor,
            this.textColorHex,
            false
          );
          this.cursorY -= item.lineHeight;
        }
        this.cursorY -= 3;
      }
      this.cursorY -= 6;
    } else {
      for (const item of m.items) {
        if (!this.hasSpace(item.itemHeight)) {
          this.addPage();
        }
        if (item.bullet) {
          this.currentPage.drawText(safeWinAnsiText(item.bullet, this.fontBold), {
            x: item.indentX,
            y: this.cursorY - this.fontSize,
            size: this.fontSize,
            font: this.fontBold,
            color: this.primaryColor
          });
        }
        for (const l of item.lines) {
          if (!this.hasSpace(item.lineHeight + 4)) {
            this.addPage();
          }
          await this.drawTextLine(
            l,
            item.indentX + item.bulletWidth + 4,
            this.cursorY - this.fontSize,
            this.fontSize,
            this.fontRegular,
            this.textColor,
            this.textColorHex,
            false
          );
          this.cursorY -= item.lineHeight;
        }
        this.cursorY -= 3;
      }
      this.cursorY -= 6;
    }
  }

  async renderQuote(block) {
    const m = this.measureQuote(block);
    this.ensureSpace(m.totalHeight);

    const blockH = m.contentHeight;
    this.currentPage.drawLine({
      start: { x: this.margin + 4, y: this.cursorY },
      end: { x: this.margin + 4, y: this.cursorY - blockH },
      thickness: 2.5,
      color: this.primaryColor
    });

    for (const l of m.lines) {
      await this.drawTextLine(
        l,
        this.margin + 16,
        this.cursorY - this.fontSize,
        this.fontSize,
        this.fontRegular,
        this.mutedColor,
        this.mutedColorHex,
        false
      );
      this.cursorY -= m.lineHeight;
    }
    this.cursorY -= 8;
  }

  async renderTable(block) {
    const m = this.measureTable(block);
    if (m.measuredRows.length === 0) return;

    this.ensureSpace(Math.min(m.totalHeight, 100));

    const headerRow = m.measuredRows.find((r) => r.isHeader) || m.measuredRows[0];

    for (let rIdx = 0; rIdx < m.measuredRows.length; rIdx++) {
      const row = m.measuredRows[rIdx];

      if (!this.hasSpace(row.rowHeight)) {
        this.addPage();
        if (!row.isHeader && headerRow) {
          await this.renderTableRow(headerRow, m.colWidths);
        }
      }

      await this.renderTableRow(row, m.colWidths);
    }
    this.cursorY -= 10;
  }

  async renderTableRow(row, colWidths) {
    if (row.isHeader) {
      this.currentPage.drawRectangle({
        x: this.margin,
        y: this.cursorY - row.rowHeight,
        width: this.contentWidth,
        height: row.rowHeight,
        color: this.tableHeaderBg
      });
    }

    this.currentPage.drawLine({
      start: { x: this.margin, y: this.cursorY - row.rowHeight },
      end: { x: this.margin + this.contentWidth, y: this.cursorY - row.rowHeight },
      thickness: 0.8,
      color: this.borderColor
    });

    let currentX = this.margin;
    for (let cIdx = 0; cIdx < row.cells.length; cIdx++) {
      const cell = row.cells[cIdx];
      const cellX = currentX + 5;
      let lineY = this.cursorY - row.cellFontSize - 4;

      for (const line of cell.lines) {
        await this.drawTextLine(
          line,
          cellX,
          lineY,
          row.cellFontSize,
          row.cellFont,
          this.textColor,
          this.textColorHex,
          row.isHeader
        );
        lineY -= row.cellFontSize + 3;
      }
      currentX += cell.width;
    }
    this.cursorY -= row.rowHeight;
  }

  async renderMath(block) {
    try {
      const svgStr = renderMathToSvg(block.tex || '', block.displayMode, this.textColorHex);
      const svgData = `data:image/svg+xml;utf8,${encodeURIComponent(svgStr)}`;
      const convResult = await imageSourceToPngBytes(svgData);

      if (convResult && convResult.bytes) {
        const mathImg = await this.pdfDoc.embedPng(convResult.bytes);
        const maxH = block.displayMode ? 100 : 35;
        const fitted = fitDimensions(
          convResult.width,
          convResult.height,
          this.contentWidth,
          maxH
        );

        const neededHeight = fitted.height + 14;
        this.ensureSpace(neededHeight);

        const mathX = block.displayMode
          ? this.margin + Math.max(0, (this.contentWidth - fitted.width) / 2)
          : this.margin + 8;

        this.currentPage.drawImage(mathImg, {
          x: mathX,
          y: this.cursorY - fitted.height - 4,
          width: fitted.width,
          height: fitted.height
        });
        this.cursorY -= fitted.height + 12;
        return;
      }
    } catch {
      // fallback
    }

    this.ensureSpace(20);
    await this.drawTextLine(
      block.tex,
      this.margin + 10,
      this.cursorY - 12,
      this.fontSize,
      this.fontRegular,
      this.primaryColor,
      this.primaryColorHex,
      false
    );
    this.cursorY -= 20;
  }

  async renderImage(block) {
    try {
      const imgSrc = block.dataUrl || block.src;
      const convResult = await imageSourceToPngBytes(imgSrc);

      if (convResult && convResult.bytes) {
        let embeddedImg = null;
        if (convResult.isPng) {
          embeddedImg = await this.pdfDoc.embedPng(convResult.bytes);
        } else {
          embeddedImg = await this.pdfDoc.embedJpg(convResult.bytes);
        }

        if (embeddedImg) {
          const fitted = fitDimensions(
            convResult.width,
            convResult.height,
            this.contentWidth,
            380
          );

          this.ensureSpace(fitted.height + 15);
          this.currentPage.drawImage(embeddedImg, {
            x: this.margin + (this.contentWidth - fitted.width) / 2,
            y: this.cursorY - fitted.height,
            width: fitted.width,
            height: fitted.height
          });
          this.cursorY -= fitted.height + 15;
          return;
        }
      }
    } catch (imgErr) {
      console.warn('[PDF Exporter] Image embed error:', imgErr);
    }

    this.ensureSpace(20);
    await this.drawTextLine(
      `[Image: ${block.alt || 'Chat Image'}]`,
      this.margin,
      this.cursorY - 11,
      this.fontSize - 1,
      this.fontRegular,
      this.mutedColor,
      this.mutedColorHex,
      false
    );
    this.cursorY -= 15;
  }
}

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
  const userRoleColor = rgb(0.02, 0.588, 0.412); // #059669
  const assistantRoleColor = isDark ? rgb(0.3, 0.8, 0.6) : rgb(0.05, 0.6, 0.4);
  const codeBgColor = isDark ? rgb(0.15, 0.15, 0.2) : rgb(0.97, 0.98, 0.99);
  const tableHeaderBg = isDark ? rgb(0.2, 0.2, 0.25) : rgb(0.94, 0.96, 0.98);
  const borderColor = isDark ? rgb(0.28, 0.28, 0.35) : rgb(0.85, 0.88, 0.92);

  const [pageWidth, pageHeight] = PAGE_FORMATS[pageFormat.toLowerCase()] || PAGE_FORMATS.a4;
  const margin = MARGINS[marginOpt.toLowerCase()] || MARGINS.normal;

  const layoutEngine = new PdfLayoutEngine(pdfDoc, {
    pageWidth,
    pageHeight,
    margin,
    theme: resolvedTheme,
    isDark,
    bgColor,
    textColor,
    textColorHex,
    mutedColor,
    mutedColorHex,
    primaryColor,
    primaryColorHex,
    userRoleColor,
    assistantRoleColor,
    codeBgColor,
    tableHeaderBg,
    borderColor,
    fontRegular,
    fontBold,
    fontMono,
    fontSize
  });

  // Render Messages
  for (const msg of conv.messages) {
    const isUser = msg.role === 'user';

    if (isUser) {
      // User message rendered in extrention z styled mint-green card with attachments
      await layoutEngine.renderUserCard(msg);
    } else {
      // Assistant message: Speaker header with model name
      const roleLabel = conv.model || 'Z.ai Assistant';
      layoutEngine.ensureSpace(45);

      await layoutEngine.drawTextLine(
        roleLabel,
        margin,
        layoutEngine.cursorY - 12,
        fontSize + 2,
        fontBold,
        assistantRoleColor,
        '#059669',
        true
      );
      layoutEngine.cursorY -= 22;

      if (Array.isArray(msg.blocks) && msg.blocks.length > 0) {
        for (const block of msg.blocks) {
          if (block.kind === 'heading') {
            await layoutEngine.renderHeading(block);
          } else if (block.kind === 'list') {
            await layoutEngine.renderList(block);
          } else if (block.kind === 'quote') {
            await layoutEngine.renderQuote(block);
          } else if (block.kind === 'code') {
            await layoutEngine.renderCode(block);
          } else if (block.kind === 'table') {
            await layoutEngine.renderTable(block);
          } else if (block.kind === 'math') {
            await layoutEngine.renderMath(block);
          } else if (block.kind === 'attachment') {
            await layoutEngine.renderAttachmentCard(block, false);
          } else if (block.kind === 'image' && (block.src || block.dataUrl)) {
            await layoutEngine.renderImage(block);
          } else {
            const raw = block.text || htmlToText(block.html);
            await layoutEngine.renderParagraphText(raw);
          }
        }
      } else {
        const raw = msg.text || '';
        await layoutEngine.renderParagraphText(raw);
      }

      layoutEngine.cursorY -= 16; // Gap between assistant and next message
    }
  }

  // Draw running header, footer, and dividers across all pages (extrention z style)
  const totalPages = pdfDoc.getPageCount();
  for (let i = 0; i < totalPages; i++) {
    const p = pdfDoc.getPage(i);

    // Running Header
    const headerTitle = headerText || conv.title || 'extrention z';
    p.drawRectangle({
      x: margin,
      y: pageHeight - 24,
      width: 7,
      height: 7,
      color: rgb(0.65, 0.7, 0.75)
    });
    p.drawText(safeWinAnsiText(headerTitle, fontRegular), {
      x: margin + 12,
      y: pageHeight - 23,
      size: 8.5,
      font: fontRegular,
      color: mutedColor
    });

    // Top Divider Line
    p.drawLine({
      start: { x: margin, y: pageHeight - 28 },
      end: { x: pageWidth - margin, y: pageHeight - 28 },
      thickness: 0.5,
      color: rgb(0.88, 0.9, 0.93)
    });

    // Bottom Divider Line
    p.drawLine({
      start: { x: margin, y: margin + 14 },
      end: { x: pageWidth - margin, y: margin + 14 },
      thickness: 0.5,
      color: rgb(0.88, 0.9, 0.93)
    });

    // Running Footer: Exported: Sep 26, 2026 | Page 1 of 105
    const footerDate = new Date(conv.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    const footerStr = `Exported: ${footerDate} | Page ${i + 1} of ${totalPages}`;
    const footerW = fontRegular.widthOfTextAtSize(footerStr, 8);
    p.drawText(footerStr, {
      x: (pageWidth - footerW) / 2, // Centered
      y: margin,
      size: 8,
      font: fontRegular,
      color: mutedColor
    });
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
