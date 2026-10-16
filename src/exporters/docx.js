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
import { normalizeTableRows, computeColumnWidths } from '../core/table-layout.js';
import { parseHtmlToInlineRuns } from '../core/conversation-model.js';

/**
 * Converts structured InlineRun objects directly into docx TextRun elements.
 * @param {import('../core/conversation-model.js').InlineRun[]} runs
 * @returns {TextRun[]}
 */
function parseRunsToTextRuns(runs) {
  if (!Array.isArray(runs) || runs.length === 0) return [new TextRun('')];
  const textRuns = [];
  for (const run of runs) {
    const raw = run.text || '';
    const lines = raw.split('\n');
    lines.forEach((line, idx) => {
      if (idx > 0) {
        textRuns.push(new TextRun({ text: '', break: 1 }));
      }
      if (line.length > 0) {
        textRuns.push(
          new TextRun({
            text: line,
            bold: run.bold,
            italics: run.italic,
            font: run.code ? 'Consolas' : undefined,
            color: run.link ? '2563EB' : undefined,
            size: run.code ? 19 : 22
          })
        );
      }
    });
  }
  return textRuns.length > 0 ? textRuns : [new TextRun('')];
}

/**
 * Parses an HTML string, block, or runs into structured TextRun objects with bold, italics, code, and links preserved.
 * @param {string|object|Array} htmlOrTextOrBlock
 * @returns {TextRun[]}
 */
function parseHtmlToTextRuns(htmlOrTextOrBlock) {
  if (!htmlOrTextOrBlock) return [new TextRun('')];
  if (Array.isArray(htmlOrTextOrBlock)) {
    return parseRunsToTextRuns(htmlOrTextOrBlock);
  }
  if (typeof htmlOrTextOrBlock === 'object') {
    if (Array.isArray(htmlOrTextOrBlock.runs) && htmlOrTextOrBlock.runs.length > 0) {
      return parseRunsToTextRuns(htmlOrTextOrBlock.runs);
    }
    const content = htmlOrTextOrBlock.html || htmlOrTextOrBlock.text || '';
    return parseRunsToTextRuns(parseHtmlToInlineRuns(content));
  }

  const str = String(htmlOrTextOrBlock);
  return parseRunsToTextRuns(parseHtmlToInlineRuns(str));
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
      keepWithNext: true,
      spacing: { before: 480, after: 200 },
      children: [
        new TextRun({
          text: isUser ? '👤 You' : `🤖 ${roleName}`,
          bold: true,
          color: isUser ? '059669' : '2563EB',
          size: 26
        })
      ]
    })
  );

  if (Array.isArray(msg.blocks) && msg.blocks.length > 0) {
    for (const block of msg.blocks) {
      if (block.kind === 'attachment') {
        const attBorder = {
          style: BorderStyle.SINGLE,
          size: 4,
          color: 'CBD5E1'
        };
        items.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: attBorder,
              bottom: attBorder,
              left: { style: BorderStyle.SINGLE, size: 14, color: '10B981' },
              right: attBorder
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    shading: { fill: 'F8FAFC' },
                    margins: { top: 120, bottom: 120, left: 180, right: 180 },
                    children: [
                      new Paragraph({
                        spacing: { before: 0, after: 40 },
                        children: [
                          new TextRun({
                            text: (block.icon || '📄') + '  ' + (block.name || 'Attachment'),
                            bold: true,
                            size: 21,
                            color: '0F172A'
                          })
                        ]
                      }),
                      new Paragraph({
                        spacing: { before: 0, after: 0 },
                        children: [
                          new TextRun({
                            text: `${block.ext || 'FILE'}${block.size ? '  •  ' + block.size : ''}`,
                            size: 18,
                            color: '64748B'
                          })
                        ]
                      })
                    ]
                  })
                ]
              })
            ]
          })
        );
      } else if (block.kind === 'heading') {
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
            keepWithNext: true,
            spacing: { before: 360, after: 180 },
            children: parseHtmlToTextRuns(block.html || block.text)
          })
        );
      } else if (block.kind === 'list') {
        const listItems = block.items || [];
        if (listItems.length > 0) {
          listItems.forEach((it, idx) => {
            const depth = it.depth || 0;
            const isOrd = it.ordered !== undefined ? it.ordered : block.ordered;
            const itemIndex = it.index !== undefined ? it.index : idx + 1;
            const bulletStr = isOrd ? `${itemIndex}. ` : '• ';
            const leftIndent = 480 + depth * 360;

            const itemRuns =
              Array.isArray(it.runs) && it.runs.length > 0
                ? parseRunsToTextRuns(it.runs)
                : parseHtmlToTextRuns(it.html || it.text);

            items.push(
              new Paragraph({
                spacing: { before: 60, after: 60 },
                indent: { left: leftIndent, hanging: 240 },
                children: [
                  new TextRun({
                    text: bulletStr,
                    bold: true,
                    size: 22
                  }),
                  ...itemRuns
                ]
              })
            );
          });
        } else {
          items.push(
            new Paragraph({
              spacing: { before: 100, after: 100 },
              children: parseHtmlToTextRuns(block.html || block.text)
            })
          );
        }
      } else if (block.kind === 'divider') {
        items.push(
          new Paragraph({
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E2E8F0', space: 1 }
            },
            spacing: { before: 200, after: 200 }
          })
        );
      } else if (block.kind === 'quote') {
        items.push(
          new Paragraph({
            indent: { left: 860 },
            spacing: { before: 180, after: 180 },
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
        // PRESERVE EXACT INDENTATION & TABS (replace \t with 4 spaces for Word)
        const rawCode = (block.code || '').replace(/\t/g, '    ');
        const lines = rawCode.split('\n');
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
                cantSplit: false,
                children: [
                  new TableCell({
                    shading: { fill: 'F8FAFC' },
                    margins: { top: 180, bottom: 180, left: 240, right: 240 },
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
              spacing: { before: 180, after: 180 },
              alignment: block.displayMode ? 'center' : 'left',
              children: [docxMathElement]
            })
          );
        } catch (mErr) {
          console.warn('[DOCX Exporter] Math OMML error, fallback to run:', mErr);
          items.push(
            new Paragraph({
              spacing: { before: 180, after: 180 },
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
            indent: { left: 480 },
            spacing: { before: 120, after: 120 },
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
            spacing: { before: 120, after: 120 },
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

            const colWidths = computeColumnWidths(tableRows, 100);

            const docxRows = tableRows.map((rowCells, rIdx) => {
              const isHeader = rIdx === 0 || rowCells.some((c) => c.isHeader);
              const cells = rowCells.map((c, cIdx) => {
                const colW = Math.max(5, Math.round(colWidths[cIdx] || 100 / rowCells.length));
                return new TableCell({
                  width: { size: colW, type: WidthType.PERCENTAGE },
                  shading: isHeader
                    ? { fill: 'F1F5F9' }
                    : rIdx % 2 === 1
                      ? { fill: 'F8FAFC' }
                      : undefined,
                  margins: { top: 140, bottom: 140, left: 180, right: 180 },
                  columnSpan: c.colspan > 1 ? c.colspan : undefined,
                  rowSpan: c.rowspan > 1 ? c.rowspan : undefined,
                  children: [
                    new Paragraph({
                      spacing: { before: 0, after: 0 },
                      children: parseHtmlToTextRuns(c)
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
              spacing: { before: 120, after: 120 },
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
                spacing: { before: 180, after: 180 },
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
              spacing: { before: 120, after: 120 },
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
            spacing: { before: 60, after: 140 },
            children: parseHtmlToTextRuns(block.html || block.text)
          })
        );
      }
    }
  } else if (msg.html || msg.text) {
    items.push(
      new Paragraph({
        spacing: { before: 60, after: 140 },
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
    const hasBlocks =
      Array.isArray(msg.blocks) &&
      msg.blocks.some((b) => {
        if (b.kind === 'paragraph' || b.kind === 'heading' || b.kind === 'quote') {
          return (
            (b.text && b.text.trim()) || (b.runs && b.runs.length > 0) || (b.html && b.html.trim())
          );
        }
        if (b.kind === 'code') return b.code && b.code.trim();
        if (b.kind === 'table') return b.rows && b.rows.length > 0;
        if (b.kind === 'list') return b.items && b.items.length > 0;
        if (b.kind === 'image') return b.src || b.dataUrl;
        if (b.kind === 'attachment') return b.name;
        if (b.kind === 'divider') return true;
        if (b.kind === 'thinking') return b.text && b.text.trim();
        return true;
      });
    const hasText = Boolean(msg.text && msg.text.trim());
    if (!hasBlocks && !hasText) {
      continue;
    }
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
