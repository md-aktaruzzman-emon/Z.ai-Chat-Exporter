/**
 * @file pdf-vector.js
 * Selectable, searchable, deterministic Vector PDF generator using pdf-lib.
 * Section 16.1 of the authoritative specification.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { generateFilename } from '../core/utils/filename.js';
import { anonymizeConversation } from './pii.js';

/**
 * Splits text into lines that fit within a maximum width given a font and size.
 */
function wrapText(text, maxWidth, font, fontSize) {
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
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
  narrow: 24,
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

  const isDark = theme === 'dark';
  const bgColor = isDark ? rgb(0.12, 0.12, 0.15) : rgb(1, 1, 1);
  const textColor = isDark ? rgb(0.95, 0.95, 0.95) : rgb(0.12, 0.16, 0.22);
  const mutedColor = isDark ? rgb(0.65, 0.65, 0.7) : rgb(0.42, 0.45, 0.5);
  const primaryColor = rgb(0.31, 0.27, 0.9);
  const codeBgColor = isDark ? rgb(0.18, 0.18, 0.22) : rgb(0.94, 0.95, 0.96);

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
  ensureSpace(40);
  page.drawText(conv.title || 'Z.ai Conversation', {
    x: margin,
    y: y - 20,
    size: 18,
    font: fontBold,
    color: textColor
  });
  y -= 30;

  // Metadata Header
  const dateStr = new Date(conv.createdAt).toLocaleString();
  page.drawText(`Model: ${conv.model} | Date: ${dateStr}`, {
    x: margin,
    y: y - 10,
    size: 9,
    font: fontRegular,
    color: mutedColor
  });
  y -= 25;

  // Horizontal divider
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: isDark ? rgb(0.25, 0.25, 0.3) : rgb(0.88, 0.9, 0.92)
  });
  y -= 20;

  // Table of Contents if enabled (Section 16.1)
  if (includeToc && Array.isArray(conv.messages) && conv.messages.length > 0) {
    ensureSpace(40);
    page.drawText('Table of Contents', {
      x: margin,
      y: y - 12,
      size: 13,
      font: fontBold,
      color: primaryColor
    });
    y -= 20;

    for (let i = 0; i < Math.min(conv.messages.length, 25); i++) {
      const msg = conv.messages[i];
      const snippet = (msg.text || '').substring(0, 45).replace(/\n/g, ' ');
      ensureSpace(14);
      page.drawText(`#${i + 1} [${msg.role}]: ${snippet}...`, {
        x: margin + 10,
        y: y - 10,
        size: 8.5,
        font: fontRegular,
        color: mutedColor
      });
      y -= 14;
    }
    y -= 15;
  }

  // Render Messages
  for (const msg of conv.messages) {
    const isUser = msg.role === 'user';
    const roleLabel = isUser ? 'You' : conv.model || 'Z.ai Assistant';

    ensureSpace(30);

    // Speaker Header
    page.drawText(roleLabel, {
      x: margin,
      y: y - 12,
      size: fontSize + 1,
      font: fontBold,
      color: isUser ? primaryColor : isDark ? rgb(0.4, 0.8, 0.6) : rgb(0.1, 0.6, 0.4)
    });
    y -= 22;

    if (Array.isArray(msg.blocks) && msg.blocks.length > 0) {
      for (const block of msg.blocks) {
        if (block.kind === 'code') {
          const codeLines = (block.code || '').split('\n');
          const blockHeight = codeLines.length * 13 + 12;

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
            const truncated = line.length > 80 ? line.substring(0, 80) + '...' : line;
            page.drawText(truncated, {
              x: margin + 8,
              y: y - 10,
              size: 8.5,
              font: fontMono,
              color: textColor
            });
            y -= 13;
          }
          y -= 8;
        } else if (block.kind === 'math') {
          ensureSpace(20);
          page.drawText(`[Formula: ${block.tex}]`, {
            x: margin + 10,
            y: y - 12,
            size: fontSize,
            font: fontRegular,
            color: primaryColor
          });
          y -= 20;
        } else if (block.kind === 'thinking') {
          const lines = wrapText(
            `Thinking: ${block.text}`,
            contentWidth - 20,
            fontRegular,
            fontSize - 1
          );
          for (const l of lines) {
            ensureSpace(14);
            page.drawText(l, {
              x: margin + 10,
              y: y - 10,
              size: fontSize - 1,
              font: fontRegular,
              color: mutedColor
            });
            y -= 13;
          }
          y -= 6;
        } else {
          // Paragraph / Text / Other
          const raw = block.text || block.html?.replace(/<[^>]*>/g, '') || '';
          const lines = wrapText(raw, contentWidth, fontRegular, fontSize);
          for (const l of lines) {
            ensureSpace(15);
            page.drawText(l, {
              x: margin,
              y: y - 11,
              size: fontSize,
              font: fontRegular,
              color: textColor
            });
            y -= 15;
          }
        }
      }
    } else {
      // Fallback message text
      const raw = msg.text || '';
      const lines = wrapText(raw, contentWidth, fontRegular, fontSize);
      for (const l of lines) {
        ensureSpace(15);
        page.drawText(l, {
          x: margin,
          y: y - 11,
          size: fontSize,
          font: fontRegular,
          color: textColor
        });
        y -= 15;
      }
    }

    y -= 15; // Gap between messages
  }

  // Draw headers, footers, and page numbers across all pages (Section 16.1)
  const totalPages = pdfDoc.getPageCount();
  for (let i = 0; i < totalPages; i++) {
    const p = pdfDoc.getPage(i);

    if (headerText) {
      p.drawText(headerText, {
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
      p.drawText(footerText, {
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
