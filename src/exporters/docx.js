/**
 * @file docx.js
 * DOCX document generator using docx library in browser context.
 * Section 16.3 of the authoritative specification.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle
} from 'docx';
import { generateFilename } from '../core/utils/filename.js';
import { anonymizeConversation } from './pii.js';
import { imageSourceToPngBytes, fitDimensions } from '../core/utils/image.js';
import { renderMathToDocxMath } from '../core/math-renderer.js';
import { normalizeTableRows } from '../core/table-layout.js';

/**
 * Parses an HTML string into structured TextRun objects with bold, italics, code, and links preserved.
 * @param {string} htmlOrText
 * @returns {TextRun[]}
 */
function parseHtmlToTextRuns(htmlOrText) {
  if (!htmlOrText) return [new TextRun('')];

  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${htmlOrText}</div>`, 'text/html');
      const root = doc.body.firstElementChild || doc.body;
      const runs = [];

      function traverse(node, state = { bold: false, italic: false, code: false, link: null }) {
        if (node.nodeType === 3) {
          // Text node
          const text = node.textContent;
          if (text) {
            runs.push(
              new TextRun({
                text,
                bold: state.bold,
                italics: state.italic,
                font: state.code ? 'Consolas' : undefined,
                color: state.link ? '2563EB' : undefined,
                size: state.code ? 19 : 22
              })
            );
          }
          return;
        }

        if (node.nodeType === 1) {
          const tag = node.tagName.toLowerCase();
          if (tag === 'br') {
            runs.push(new TextRun({ text: '', break: 1 }));
            return;
          }
          const nextState = { ...state };
          if (tag === 'strong' || tag === 'b') nextState.bold = true;
          if (tag === 'em' || tag === 'i') nextState.italic = true;
          if (tag === 'code') nextState.code = true;
          if (tag === 'a') nextState.link = node.getAttribute('href');

          for (const child of node.childNodes) {
            traverse(child, nextState);
          }
        }
      }

      traverse(root);
      if (runs.length > 0) return runs;
    } catch {
      // fallback
    }
  }

  const raw = htmlOrText.replace(/<[^>]*>/g, '');
  return [new TextRun({ text: raw, size: 22 })];
}

/**
 * Creates DOCX paragraphs and tables from conversation blocks.
 */
async function createBlocksDocx(msg, modelName) {
  const isUser = msg.role === 'user';
  const roleName = isUser ? 'You' : modelName || 'Z.ai Assistant';
  const items = [];

  // Speaker heading
  items.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text: roleName,
          bold: true,
          color: isUser ? '4F46E5' : '059669',
          size: 26
        })
      ]
    })
  );

  if (Array.isArray(msg.blocks) && msg.blocks.length > 0) {
    for (const block of msg.blocks) {
      if (block.kind === 'heading') {
        const hLevel =
          block.level === 1
            ? HeadingLevel.HEADING_1
            : block.level === 2
              ? HeadingLevel.HEADING_2
              : block.level === 3
                ? HeadingLevel.HEADING_3
                : HeadingLevel.HEADING_4;

        items.push(
          new Paragraph({
            heading: hLevel,
            spacing: { before: 200, after: 100 },
            children: parseHtmlToTextRuns(block.html || block.text)
          })
        );
      } else if (block.kind === 'list') {
        const listItems = block.items || [];
        if (listItems.length > 0) {
          listItems.forEach((it, idx) => {
            items.push(
              new Paragraph({
                spacing: { before: 40, after: 40 },
                indent: { left: 360 },
                children: [
                  new TextRun({
                    text: block.ordered ? `${idx + 1}. ` : '• ',
                    bold: true,
                    size: 22
                  }),
                  ...parseHtmlToTextRuns(it.html || it.text)
                ]
              })
            );
          });
        } else {
          items.push(
            new Paragraph({
              spacing: { before: 60, after: 60 },
              children: parseHtmlToTextRuns(block.html || block.text)
            })
          );
        }
      } else if (block.kind === 'quote') {
        items.push(
          new Paragraph({
            indent: { left: 720 },
            spacing: { before: 100, after: 100 },
            children: [
              new TextRun({
                text: block.text || block.html?.replace(/<[^>]*>/g, '') || '',
                italics: true,
                color: '4B5563',
                size: 21
              })
            ]
          })
        );
      } else if (block.kind === 'code') {
        const lines = (block.code || '').split('\n');
        const codeRuns = lines.map(
          (line, idx) =>
            new TextRun({
              text: line.length > 0 ? line : ' ',
              font: 'Consolas',
              size: 19,
              color: '1E293B',
              break: idx > 0 ? 1 : 0
            })
        );

        const tableBorder = {
          style: BorderStyle.SINGLE,
          size: 4,
          color: 'E2E8F0'
        };

        items.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: tableBorder,
              bottom: tableBorder,
              left: { style: BorderStyle.SINGLE, size: 16, color: '6366F1' },
              right: tableBorder
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    shading: { fill: 'F8FAFC' },
                    margins: { top: 120, bottom: 120, left: 180, right: 180 },
                    children: [
                      new Paragraph({
                        spacing: { before: 0, after: 0 },
                        children: codeRuns
                      })
                    ]
                  })
                ]
              })
            ]
          })
        );
      } else if (block.kind === 'math') {
        // Native Word OMML equation rendering via docx.Math
        try {
          const docxMathElement = renderMathToDocxMath(block.tex, block.displayMode);
          items.push(
            new Paragraph({
              spacing: { before: 120, after: 120 },
              alignment: block.displayMode ? 'center' : 'left',
              children: [docxMathElement]
            })
          );
        } catch (mErr) {
          console.warn('[DOCX Exporter] Math OMML error, fallback to run:', mErr);
          items.push(
            new Paragraph({
              spacing: { before: 100, after: 100 },
              children: [
                new TextRun({
                  text: block.tex || '',
                  italics: true,
                  color: '4F46E5',
                  size: 22
                })
              ]
            })
          );
        }
      } else if (block.kind === 'thinking') {
        items.push(
          new Paragraph({
            indent: { left: 360 },
            spacing: { before: 80, after: 80 },
            children: [
              new TextRun({
                text: `Thinking Process: ${block.text}`,
                italics: true,
                color: '64748B',
                size: 20
              })
            ]
          })
        );
      } else if (block.kind === 'citation') {
        items.push(
          new Paragraph({
            spacing: { before: 60, after: 60 },
            children: [
              new TextRun({
                text: `Source: ${block.title} (${block.url})`,
                color: '2563EB',
                size: 20
              })
            ]
          })
        );
      } else if (block.kind === 'table') {
        try {
          const tableRows = normalizeTableRows(block);

          if (tableRows.length > 0) {
            const tableBorder = {
              style: BorderStyle.SINGLE,
              size: 4,
              color: 'CBD5E1'
            };

            const docxRows = tableRows.map((rowCells, rIdx) => {
              const isHeader = rIdx === 0 || rowCells.some((c) => c.isHeader);
              const cells = rowCells.map((c) => {
                return new TableCell({
                  shading: isHeader ? { fill: 'F1F5F9' } : undefined,
                  margins: { top: 100, bottom: 100, left: 140, right: 140 },
                  columnSpan: c.colspan > 1 ? c.colspan : undefined,
                  rowSpan: c.rowspan > 1 ? c.rowspan : undefined,
                  children: [
                    new Paragraph({
                      children: parseHtmlToTextRuns(c.html || c.text)
                    })
                  ]
                });
              });
              return new TableRow({
                tableHeader: isHeader,
                cantSplit: true,
                children: cells
              });
            });

            items.push(
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                  top: tableBorder,
                  bottom: tableBorder,
                  left: tableBorder,
                  right: tableBorder,
                  insideHorizontal: tableBorder,
                  insideVertical: tableBorder
                },
                rows: docxRows
              })
            );
          }
        } catch (tableErr) {
          console.warn('[DOCX Exporter] Table rendering fallback:', tableErr);
          const raw = block.text || block.html?.replace(/<[^>]*>/g, ' ') || '';
          items.push(
            new Paragraph({
              spacing: { before: 60, after: 60 },
              children: [new TextRun({ text: raw, size: 22 })]
            })
          );
        }
      } else if (block.kind === 'image' && (block.src || block.dataUrl)) {
        // Embed image with responsive aspect ratio (never hardcoded 450x300)
        try {
          const imgSrc = block.dataUrl || block.src;
          const convResult = await imageSourceToPngBytes(imgSrc);

          if (convResult && convResult.bytes) {
            // Calculate proportional dimensions based on page content width (~500px in Word 1-inch margins)
            const maxWordWidth = 520;
            const maxWordHeight = 400;
            const fitted = fitDimensions(
              convResult.width || 400,
              convResult.height || 300,
              maxWordWidth,
              maxWordHeight
            );

            items.push(
              new Paragraph({
                spacing: { before: 120, after: 120 },
                alignment: 'center',
                children: [
                  new ImageRun({
                    data: convResult.bytes.buffer,
                    transformation: {
                      width: fitted.width,
                      height: fitted.height
                    }
                  })
                ]
              })
            );
          }
        } catch (imgErr) {
          console.warn('[DOCX Exporter] Image embedding failed:', imgErr);
          items.push(
            new Paragraph({
              spacing: { before: 60, after: 60 },
              children: [
                new TextRun({
                  text: `[Image: ${block.alt || 'Chat Image'}]`,
                  italics: true,
                  color: '6B7280',
                  size: 20
                })
              ]
            })
          );
        }
      } else {
        items.push(
          new Paragraph({
            spacing: { before: 60, after: 120 },
            children: parseHtmlToTextRuns(block.html || block.text)
          })
        );
      }
    }
  } else if (msg.html || msg.text) {
    items.push(
      new Paragraph({
        spacing: { before: 60, after: 120 },
        children: parseHtmlToTextRuns(msg.html || msg.text)
      })
    );
  }

  return items;
}

/**
 * Exports conversation to Microsoft Word (.docx).
 * @param {import('../core/conversation-model.js').Conversation} originalConversation
 * @param {Object} options
 * @returns {Promise<{ blob: Blob, filename: string, mime: string }>}
 */
export async function exportConversation(originalConversation, options = {}) {
  const { anonymizePii = false } = options;
  const conv = anonymizePii ? anonymizeConversation(originalConversation) : originalConversation;

  const docChildren = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { before: 100, after: 100 },
      children: [new TextRun({ text: conv.title, bold: true, size: 36, color: '0F172A' })]
    }),
    new Paragraph({
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: `Model: ${conv.model}  |  Exported: ${new Date(conv.createdAt).toLocaleString()}`,
          color: '64748B',
          size: 19
        })
      ]
    })
  ];

  for (const msg of conv.messages) {
    const msgParagraphs = await createBlocksDocx(msg, conv.model);
    docChildren.push(...msgParagraphs);
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              bottom: 1440,
              left: 1440,
              right: 1440
            }
          }
        },
        children: docChildren
      }
    ]
  });

  const blob = await Packer.toBlob(doc);
  const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const filename = generateFilename({
    template: options.template,
    title: conv.title,
    format: 'docx',
    model: conv.model,
    timestamp: conv.createdAt
  });

  return {
    blob,
    filename,
    mime
  };
}
