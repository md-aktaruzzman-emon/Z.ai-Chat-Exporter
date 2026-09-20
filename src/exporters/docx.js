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
  WidthType
} from 'docx';
import { generateFilename } from '../core/utils/filename.js';
import { anonymizeConversation } from './pii.js';

/**
 * Creates DOCX paragraphs and tables from conversation blocks.
 */
async function createBlocksDocx(msg, modelName) {
  const isUser = msg.role === 'user';
  const roleName = isUser ? 'User' : modelName || 'Z.ai Assistant';
  const items = [];

  // Speaker heading
  items.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 100 },
      children: [
        new TextRun({
          text: `[${roleName}]`,
          bold: true,
          color: isUser ? '4F46E5' : '059669'
        })
      ]
    })
  );

  if (Array.isArray(msg.blocks) && msg.blocks.length > 0) {
    for (const block of msg.blocks) {
      if (block.kind === 'code') {
        const lines = (block.code || '').split('\n');
        const codeRuns = lines.map(
          (line, idx) =>
            new TextRun({
              text: line.length > 0 ? line : ' ',
              font: 'Courier New',
              size: 19,
              break: idx > 0 ? 1 : 0
            })
        );
        items.push(
          new Paragraph({
            spacing: { before: 100, after: 100 },
            children: codeRuns
          })
        );
      } else if (block.kind === 'math') {
        items.push(
          new Paragraph({
            spacing: { before: 80, after: 80 },
            children: [
              new TextRun({
                text: `[Formula: ${block.tex}]`,
                italics: true,
                color: '4F46E5'
              })
            ]
          })
        );
      } else if (block.kind === 'thinking') {
        items.push(
          new Paragraph({
            spacing: { before: 80, after: 80 },
            children: [
              new TextRun({
                text: `Thinking: ${block.text}`,
                italics: true,
                color: '6B7280'
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
                color: '2563EB'
              })
            ]
          })
        );
      } else if (block.kind === 'table' && block.html) {
        try {
          let doc = null;
          if (typeof DOMParser !== 'undefined') {
            const parser = new DOMParser();
            doc = parser.parseFromString(block.html, 'text/html');
          } else if (typeof document !== 'undefined') {
            doc = document.implementation.createHTMLDocument('');
            doc.body.innerHTML = block.html;
          }
          if (doc) {
            const trElements = Array.from(doc.querySelectorAll('tr'));
            if (trElements.length > 0) {
              const rows = trElements.map((tr) => {
                const cells = Array.from(tr.querySelectorAll('th, td')).map((cell) => {
                  return new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: cell.textContent.trim(),
                            bold: cell.tagName.toLowerCase() === 'th'
                          })
                        ]
                      })
                    ]
                  });
                });
                return new TableRow({ children: cells });
              });
              items.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
            }
          }
        } catch {
          const raw = block.text || block.html?.replace(/<[^>]*>/g, ' ') || '';
          items.push(
            new Paragraph({
              spacing: { before: 60, after: 60 },
              children: [new TextRun({ text: raw })]
            })
          );
        }
      } else if (block.kind === 'image' && (block.src || block.dataUrl)) {
        try {
          const imgSrc = block.dataUrl || block.src;
          let imgData = null;

          if (imgSrc.startsWith('data:image/')) {
            const base64 = imgSrc.split(',')[1];
            const atobFn = globalThis.atob
              ? (s) => globalThis.atob(s)
              : (s) => globalThis.Buffer.from(s, 'base64').toString('binary');
            const binaryStr = atobFn(base64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            imgData = bytes.buffer;
          } else if (typeof fetch === 'function' && (imgSrc.startsWith('http') || imgSrc.startsWith('blob:'))) {
            const res = await fetch(imgSrc);
            imgData = await res.arrayBuffer();
          }

          if (imgData) {
            items.push(
              new Paragraph({
                spacing: { before: 100, after: 100 },
                children: [
                  new ImageRun({
                    data: imgData,
                    transformation: {
                      width: 450,
                      height: 300
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
                  color: '6B7280'
                })
              ]
            })
          );
        }
      } else {
        const raw = block.text || block.html?.replace(/<[^>]*>/g, '') || '';
        if (raw.trim()) {
          const lines = raw.split('\n');
          const runs = lines.map(
            (l, idx) =>
              new TextRun({
                text: l,
                break: idx > 0 ? 1 : 0
              })
          );
          items.push(
            new Paragraph({
              spacing: { before: 60, after: 60 },
              children: runs
            })
          );
        }
      }
    }
  } else if (msg.text) {
    const lines = (msg.text || '').split('\n');
    const runs = lines.map(
      (l, idx) =>
        new TextRun({
          text: l,
          break: idx > 0 ? 1 : 0
        })
    );
    items.push(
      new Paragraph({
        spacing: { before: 60, after: 60 },
        children: runs
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
      children: [new TextRun({ text: conv.title, bold: true })]
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `Model: ${conv.model} | Exported: ${new Date(conv.createdAt).toLocaleString()}`,
          color: '6B7280',
          size: 18
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
        properties: {},
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
