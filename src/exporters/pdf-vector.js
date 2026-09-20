/**
 * @file pdf-vector.js
 * Selectable, searchable, deterministic Vector PDF generator using pdf-lib.
 * Section 16.1 of the authoritative specification.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { generateFilename } from '../core/utils/filename.js';
import { anonymizeConversation } from './pii.js';
import { imageSourceToPngBytes } from '../core/utils/image.js';

// Comprehensive symbol & diagram transliterations for WinAnsi StandardFonts
const SYMBOL_REPLACEMENTS = {
  // Tree & Directory structure characters (prevents ??? in project diagrams)
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
 * Safely encodes text for StandardFonts without throwing WinAnsi encoding errors.
 * Replaces unencodable characters with transliterations or safe fallbacks.
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
    result += supported ? char : char.charCodeAt(0) > 127 ? ' ' : ' ';
  }
  return result;
}

/**
 * Splits text into lines that fit within a maximum width given a font and size.
 * Automatically breaks words that are wider than maxWidth to prevent clipping.
 */
function wrapText(text, maxWidth, font, fontSize) {
  if (!text) return [];
  const safeStr = safeWinAnsiText(text, font);
  const words = safeStr.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (let word of words) {
    if (!word) continue;
    while (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
      let sliceLen = Math.max(1, Math.floor(word.length * 0.7));
      while (
        sliceLen > 1 &&
        font.widthOfTextAtSize(word.substring(0, sliceLen), fontSize) > maxWidth
      ) {
        sliceLen--;
      }
      const chunk = word.substring(0, sliceLen);
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }
      lines.push(chunk);
      word = word.substring(sliceLen);
    }

    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
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
 * Generates a clean vector PDF with selectable text.
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
  const mutedColor = isDark ? rgb(0.65, 0.65, 0.7) : rgb(0.42, 0.45, 0.5);
  const primaryColor = isDark ? rgb(0.55, 0.5, 0.95) : rgb(0.31, 0.27, 0.9);
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

  // Draw Title
  ensureSpace(45);
  page.drawText(safeWinAnsiText(conv.title || 'Z.ai Conversation', fontBold), {
    x: margin,
    y: y - 22,
    size: 18,
    font: fontBold,
    color: textColor
  });
  y -= 32;

  // Metadata Header
  const dateStr = new Date(conv.createdAt).toLocaleString();
  page.drawText(safeWinAnsiText(`Model: ${conv.model}  |  Date: ${dateStr}`, fontRegular), {
    x: margin,
    y: y - 10,
    size: 9,
    font: fontRegular,
    color: mutedColor
  });
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
      page.drawText(safeWinAnsiText(`#${i + 1} [${msg.role}]: ${snippet}...`, fontRegular), {
        x: margin + 10,
        y: y - 10,
        size: 8.5,
        font: fontRegular,
        color: mutedColor
      });
      y -= 14;
    }
    y -= 16;
  }

  // Render Messages
  for (const msg of conv.messages) {
    const isUser = msg.role === 'user';
    const roleLabel = isUser ? 'You' : conv.model || 'Z.ai Assistant';

    ensureSpace(32);

    // Speaker Header with round badge accent
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
          const hSize = block.level === 1 ? fontSize + 4 : block.level === 2 ? fontSize + 2.5 : fontSize + 1.5;
          const hText = block.text || block.html?.replace(/<[^>]*>/g, '') || '';
          const lines = wrapText(hText, contentWidth, fontBold, hSize);

          ensureSpace(lines.length * (hSize + 4) + 14);
          y -= 8;
          for (const l of lines) {
            page.drawText(l, {
              x: margin,
              y: y - hSize,
              size: hSize,
              font: fontBold,
              color: textColor
            });
            y -= hSize + 4;
          }
          y -= 6;
        } else if (block.kind === 'list') {
          const items = block.items || [];
          if (items.length > 0) {
            for (let idx = 0; idx < items.length; idx++) {
              const item = items[idx];
              const bullet = block.ordered ? `${idx + 1}. ` : '* ';
              const bulletWidth = fontBold.widthOfTextAtSize(bullet, fontSize);
              const text = item.text || item.html?.replace(/<[^>]*>/g, '') || '';
              const lines = wrapText(text, contentWidth - bulletWidth - 8, fontRegular, fontSize);

              ensureSpace(lines.length * (fontSize + 4) + 6);
              if (lines.length > 0) {
                page.drawText(safeWinAnsiText(bullet, fontBold), {
                  x: margin + 8,
                  y: y - fontSize,
                  size: fontSize,
                  font: fontBold,
                  color: primaryColor
                });

                for (let li = 0; li < lines.length; li++) {
                  page.drawText(lines[li], {
                    x: margin + 8 + bulletWidth + 4,
                    y: y - fontSize,
                    size: fontSize,
                    font: fontRegular,
                    color: textColor
                  });
                  y -= fontSize + 4;
                }
              }
              y -= 3;
            }
            y -= 6;
          } else {
            const raw = block.text || block.html?.replace(/<[^>]*>/g, '') || '';
            const lines = wrapText(raw, contentWidth, fontRegular, fontSize);
            for (const l of lines) {
              ensureSpace(fontSize + 5);
              page.drawText(l, {
                x: margin,
                y: y - fontSize,
                size: fontSize,
                font: fontRegular,
                color: textColor
              });
              y -= fontSize + 4;
            }
            y -= 6;
          }
        } else if (block.kind === 'quote') {
          const raw = block.text || block.html?.replace(/<[^>]*>/g, '') || '';
          const lines = wrapText(raw, contentWidth - 20, fontRegular, fontSize);
          const blockH = lines.length * (fontSize + 4) + 6;

          ensureSpace(blockH + 8);
          page.drawLine({
            start: { x: margin + 4, y: y },
            end: { x: margin + 4, y: y - blockH },
            thickness: 2.5,
            color: primaryColor
          });

          for (const l of lines) {
            page.drawText(l, {
              x: margin + 16,
              y: y - fontSize,
              size: fontSize,
              font: fontRegular,
              color: mutedColor
            });
            y -= fontSize + 4;
          }
          y -= 8;
        } else if (block.kind === 'code') {
          const codeLines = (block.code || '').split('\n');
          const blockHeight = codeLines.length * 13 + 16;

          ensureSpace(Math.min(blockHeight, 200));

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
            const safeLine = safeWinAnsiText(line, fontMono);
            const truncated = safeLine.length > 85 ? safeLine.substring(0, 85) + '...' : safeLine;
            page.drawText(truncated, {
              x: margin + 8,
              y: y - 9,
              size: 8.5,
              font: fontMono,
              color: textColor
            });
            y -= 13;
          }
          y -= 10;
        } else if (block.kind === 'table' && Array.isArray(block.rows) && block.rows.length > 0) {
          const rows = block.rows;
          const numCols = Math.max(...rows.map((r) => r.length), 1);
          const colWidth = contentWidth / numCols;

          ensureSpace(30);
          for (let rIdx = 0; rIdx < rows.length; rIdx++) {
            const row = rows[rIdx];
            const isHeader = rIdx === 0 || row.some((c) => c.isHeader);
            const rowHeight = 22;

            ensureSpace(rowHeight + 4);

            if (isHeader) {
              page.drawRectangle({
                x: margin,
                y: y - rowHeight,
                width: contentWidth,
                height: rowHeight,
                color: tableHeaderBg
              });
            }

            page.drawLine({
              start: { x: margin, y: y - rowHeight },
              end: { x: margin + contentWidth, y: y - rowHeight },
              thickness: 0.8,
              color: borderColor
            });

            for (let cIdx = 0; cIdx < row.length; cIdx++) {
              const cell = row[cIdx];
              const cellText = safeWinAnsiText(cell.text || '', isHeader ? fontBold : fontRegular);
              const cellX = margin + cIdx * colWidth + 6;

              page.drawText(cellText.substring(0, 35), {
                x: cellX,
                y: y - 14,
                size: fontSize - 1,
                font: isHeader ? fontBold : fontRegular,
                color: textColor
              });
            }
            y -= rowHeight;
          }
          y -= 10;
        } else if (block.kind === 'math') {
          ensureSpace(20);
          page.drawText(safeWinAnsiText(`[Formula: ${block.tex}]`, fontRegular), {
            x: margin + 10,
            y: y - 12,
            size: fontSize,
            font: fontRegular,
            color: primaryColor
          });
          y -= 20;
        } else if (block.kind === 'image' && (block.src || block.dataUrl)) {
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
                const imgDims = embeddedImg.scale(1);
                let displayWidth = Math.min(imgDims.width, contentWidth);
                let displayHeight = (imgDims.height / imgDims.width) * displayWidth;
                if (displayHeight > 380) {
                  displayHeight = 380;
                  displayWidth = (imgDims.width / imgDims.height) * displayHeight;
                }

                ensureSpace(displayHeight + 15);
                page.drawImage(embeddedImg, {
                  x: margin,
                  y: y - displayHeight,
                  width: displayWidth,
                  height: displayHeight
                });
                y -= displayHeight + 15;
              }
            }
          } catch (imgErr) {
            console.warn('[PDF Exporter] Failed to embed image:', imgErr);
            ensureSpace(20);
            page.drawText(safeWinAnsiText(`[Image: ${block.alt || 'Chat Image'}]`, fontRegular), {
              x: margin,
              y: y - 11,
              size: fontSize - 1,
              font: fontRegular,
              color: mutedColor
            });
            y -= 15;
          }
        } else {
          // Paragraph / Text / Other
          const raw = block.text || block.html?.replace(/<[^>]*>/g, '') || '';
          if (raw.trim()) {
            const lines = wrapText(raw, contentWidth, fontRegular, fontSize);
            for (const l of lines) {
              ensureSpace(fontSize + 5);
              page.drawText(l, {
                x: margin,
                y: y - fontSize,
                size: fontSize,
                font: fontRegular,
                color: textColor
              });
              y -= fontSize + 4.5;
            }
            y -= 7; // Clean paragraph bottom margin
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
          page.drawText(l, {
            x: margin,
            y: y - fontSize,
            size: fontSize,
            font: fontRegular,
            color: textColor
          });
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
      p.drawText(safeWinAnsiText(headerText, fontRegular), {
        x: margin,
        y: pageHeight - margin / 2,
        size: 8,
        font: fontRegular,
        color: mutedColor
      });
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
      p.drawText(safeWinAnsiText(footerText, fontRegular), {
        x: margin,
        y: margin / 2,
        size: 8,
        font: fontRegular,
        color: mutedColor
      });
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
