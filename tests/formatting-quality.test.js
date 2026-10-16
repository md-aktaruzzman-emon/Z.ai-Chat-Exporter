/**
 * @file formatting-quality.test.js
 * Regression tests for Z.ai Chat Exporter whitespace preservation, document readability,
 * complex script rendering, table structure, and exporter consistency.
 */

import { describe, it, expect } from 'vitest';
import { parseMarkdownToBlocks, parseBlocks } from '../src/content/scraper.js';
import { parseHtmlToInlineRuns } from '../src/core/conversation-model.js';
import { imageSourceToPngBytes } from '../src/core/utils/image.js';
import * as pdfVectorExporter from '../src/exporters/pdf-vector.js';
import * as docxExporter from '../src/exporters/docx.js';
import * as markdownExporter from '../src/exporters/markdown.js';
import * as htmlExporter from '../src/exporters/html.js';
import * as txtExporter from '../src/exporters/txt.js';
import * as csvExporter from '../src/exporters/csv.js';
import { buildRenderHtml } from '../src/exporters/pdf-raster.js';

describe('Formatting Quality & Readability Verification', () => {
  it('preserves multiline whitespace and explicit line breaks in markdown paragraphs without flattening', () => {
    const rawMarkdown = `Question\nExplain functional requirements.\n\nAnswer\nFunctional requirements describe what a system must do.\n\n1. User authentication\n2. Data processing\n3. Report generation\n\n---\n\nConclusion\nThese requirements define the system's expected behavior.`;

    const blocks = parseMarkdownToBlocks(rawMarkdown);
    expect(blocks.length).toBeGreaterThanOrEqual(4);

    // First block should be Question paragraph preserving its internal newline
    expect(blocks[0].kind).toBe('paragraph');
    expect(blocks[0].text).toContain('Question\nExplain functional requirements.');

    // Second block is Answer
    expect(blocks[1].kind).toBe('paragraph');
    expect(blocks[1].text).toContain('Functional requirements describe what a system must do.');

    // Third block is ordered list with 3 items
    expect(blocks[2].kind).toBe('list');
    expect(blocks[2].ordered).toBe(true);
    expect(blocks[2].items.length).toBe(3);
    expect(blocks[2].items[0].text).toBe('User authentication');
    expect(blocks[2].items[1].text).toBe('Data processing');
    expect(blocks[2].items[2].text).toBe('Report generation');

    // Fourth block is divider
    expect(blocks[3].kind).toBe('divider');

    // Fifth block is conclusion
    expect(blocks[4].kind).toBe('paragraph');
    expect(blocks[4].text).toContain(
      "Conclusion\nThese requirements define the system's expected behavior."
    );
  });

  it('converts markdown inline syntax to structured runs in parseHtmlToInlineRuns', () => {
    const mdSnippet = 'This is **bold text**, *italic text*, and `console.log("code")`.';
    const runs = parseHtmlToInlineRuns(mdSnippet);

    expect(runs.length).toBeGreaterThan(1);
    const boldRun = runs.find((r) => r.bold);
    expect(boldRun).toBeDefined();
    expect(boldRun.text).toContain('bold text');

    const italicRun = runs.find((r) => r.italic);
    expect(italicRun).toBeDefined();
    expect(italicRun.text).toContain('italic text');

    const codeRun = runs.find((r) => r.code);
    expect(codeRun).toBeDefined();
    expect(codeRun.text).toContain('console.log("code")');
  });

  it('preserves line breaks between block elements like div and p in parseHtmlToInlineRuns', () => {
    const htmlWithDivs =
      '<div>First line of question</div><div>Second line of question</div><p>Third line</p>';
    const runs = parseHtmlToInlineRuns(htmlWithDivs);
    const combinedText = runs.map((r) => r.text).join('');

    expect(combinedText).toContain('First line of question\n');
    expect(combinedText).toContain('Second line of question\n');
    expect(combinedText).toContain('Third line');
  });

  it('renders SVG without white background overlay in imageSourceToPngBytes', async () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="50" height="20">
        <text x="0" y="15" font-size="14" fill="#000000">টেস্ট</text>
      </svg>
    `;
    const svgDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    const result = await imageSourceToPngBytes(svgDataUrl);

    expect(result).toBeDefined();
    expect(result.bytes).toBeDefined();
    expect(result.width).toBe(50);
    expect(result.height).toBe(20);
    expect(result.isPng).toBe(true);
  });

  it('filters empty/ghost messages across PDF, DOCX, Markdown, and HTML exporters', async () => {
    const conversationWithGhost = {
      title: 'Ghost Message Filter Test',
      model: 'GLM-4.5',
      createdAt: new Date().toISOString(),
      messages: [
        {
          role: 'assistant',
          text: '',
          blocks: []
        },
        {
          role: 'user',
          text: 'What are non-functional requirements?',
          blocks: [{ kind: 'paragraph', text: 'What are non-functional requirements?' }]
        },
        {
          role: 'assistant',
          text: 'Non-functional requirements specify criteria used to judge operation.',
          blocks: [
            {
              kind: 'paragraph',
              text: 'Non-functional requirements specify criteria used to judge operation.'
            }
          ]
        },
        {
          role: 'assistant',
          text: '   ',
          blocks: [{ kind: 'paragraph', text: '' }]
        }
      ]
    };

    // 1. PDF export succeeds without orphan assistant headers
    const pdfRes = await pdfVectorExporter.exportConversation(conversationWithGhost);
    expect(pdfRes.blob.size).toBeGreaterThan(1000);

    // 2. DOCX export succeeds
    const docxRes = await docxExporter.exportConversation(conversationWithGhost);
    expect(docxRes.blob.size).toBeGreaterThan(1000);

    // 3. Markdown export excludes ghost messages
    const mdRes = await markdownExporter.exportConversation(conversationWithGhost);
    expect(mdRes.previewText).not.toMatch(/### Z\.ai Assistant\s+---/);
    expect(mdRes.previewText).toContain('What are non-functional requirements?');

    // 4. HTML export excludes ghost messages
    const htmlRes = await htmlExporter.exportConversation(conversationWithGhost);
    const htmlBlob = htmlRes.blob;
    expect(htmlBlob.size).toBeGreaterThan(500);
  });

  it('exports divider and thinking process blocks across all formats seamlessly', async () => {
    const richConv = {
      title: 'Divider and Reasoning Test',
      model: 'Z.ai Pro',
      createdAt: new Date().toISOString(),
      messages: [
        {
          role: 'user',
          text: 'Analyze the system.',
          blocks: [{ kind: 'paragraph', text: 'Analyze the system.' }]
        },
        {
          role: 'assistant',
          text: 'Result',
          blocks: [
            {
              kind: 'thinking',
              text: 'Analyzing database indexes and response latencies step by step.'
            },
            {
              kind: 'paragraph',
              text: 'The analysis shows 99.9% uptime.'
            },
            {
              kind: 'divider'
            },
            {
              kind: 'paragraph',
              text: 'Further recommendations follow.'
            }
          ]
        }
      ]
    };

    const pdfRes = await pdfVectorExporter.exportConversation(richConv);
    expect(pdfRes.blob.size).toBeGreaterThan(1000);

    const docxRes = await docxExporter.exportConversation(richConv);
    expect(docxRes.blob.size).toBeGreaterThan(2000);

    const mdRes = await markdownExporter.exportConversation(richConv);
    expect(mdRes.previewText).toContain('Thinking Process');
    expect(mdRes.previewText).toContain('Analyzing database indexes');
    expect(mdRes.previewText).toContain('---');

    const htmlRes = await htmlExporter.exportConversation(richConv);
    expect(htmlRes.blob.size).toBeGreaterThan(500);

    const txtRes = await txtExporter.exportConversation(richConv);
    expect(txtRes.previewText).toContain('[Thinking: Analyzing database indexes');
    expect(txtRes.previewText).toContain('The analysis shows 99.9% uptime.');
    expect(txtRes.previewText).toContain('---');

    const csvRes = await csvExporter.exportConversation(richConv);
    expect(csvRes.previewText).toContain('Analyze the system.');
    expect(csvRes.previewText).toContain('The analysis shows 99.9% uptime.');
  });

  it('correctly extracts thinking/reasoning blocks and DOM structured elements via parseBlocks', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <details class="thinking-wrapper">
        <summary>Thinking Process</summary>
        <p>I am calculating the optimal architecture for this system.</p>
      </details>
      <h3>System Architecture</h3>
      <p>Here is the overview:</p>
      <ul>
        <li>Frontend UI</li>
        <li>Backend Worker</li>
      </ul>
      <div class="file-card attachment">
        <span class="file-name">spec.pdf</span>
        <span class="file-size">2.4 MB</span>
      </div>
      <hr />
    `;

    const blocks = parseBlocks(container, { includeThinking: true });
    expect(blocks.length).toBeGreaterThanOrEqual(5);

    const thinkingBlock = blocks.find((b) => b.kind === 'thinking');
    expect(thinkingBlock).toBeDefined();
    expect(thinkingBlock.text).toContain('optimal architecture');

    const headingBlock = blocks.find((b) => b.kind === 'heading');
    expect(headingBlock).toBeDefined();
    expect(headingBlock.text).toBe('System Architecture');

    const listBlock = blocks.find((b) => b.kind === 'list');
    expect(listBlock).toBeDefined();
    expect(listBlock.items.length).toBe(2);

    const attachmentBlock = blocks.find((b) => b.kind === 'attachment');
    expect(attachmentBlock).toBeDefined();
    expect(attachmentBlock.name).toContain('spec.pdf');

    const dividerBlock = blocks.find((b) => b.kind === 'divider');
    expect(dividerBlock).toBeDefined();
  });

  it('txt exporter structures lists, tables, dividers, attachments, and excludes empty ghost turns', async () => {
    const testConv = {
      title: 'TXT Structure Test',
      model: 'Z.ai Test',
      createdAt: new Date().toISOString(),
      messages: [
        {
          role: 'user',
          text: 'Show list and table',
          blocks: [{ kind: 'paragraph', text: 'Show list and table' }]
        },
        {
          role: 'assistant',
          text: '',
          blocks: [] // Empty ghost message that must be filtered
        },
        {
          role: 'assistant',
          text: 'Result:',
          blocks: [
            { kind: 'heading', level: 2, text: 'Capabilities' },
            {
              kind: 'list',
              ordered: true,
              items: [
                { text: 'Item One', depth: 0 },
                { text: 'Item Two', depth: 0 }
              ]
            },
            {
              kind: 'table',
              rows: [
                [{ text: 'Feature' }, { text: 'Status' }],
                [{ text: 'Auth' }, { text: 'Active' }]
              ]
            },
            { kind: 'divider' },
            { kind: 'attachment', name: 'report.docx', size: '1.2 MB' }
          ]
        }
      ]
    };

    const res = await txtExporter.exportConversation(testConv);
    expect(res.previewText).toContain('## Capabilities');
    expect(res.previewText).toContain('1. Item One');
    expect(res.previewText).toContain('2. Item Two');
    expect(res.previewText).toContain('| Feature | Status |');
    expect(res.previewText).toContain('| --- | --- |');
    expect(res.previewText).toContain('| Auth | Active |');
    expect(res.previewText).toContain('---');
    expect(res.previewText).toContain('[Attachment: report.docx (1.2 MB)]');

    // Should only have 2 messages, not 3 (ghost message excluded)
    const speakerMatches = res.previewText.match(/\[You\]|\[Z\.ai Test\]/g);
    expect(speakerMatches.length).toBe(2);
  });

  it('csv exporter excludes ghost messages and derives fallback text from structured blocks', async () => {
    const testConv = {
      title: 'CSV Test',
      model: 'Z.ai Test',
      createdAt: new Date().toISOString(),
      messages: [
        {
          role: 'user',
          text: '',
          blocks: [{ kind: 'attachment', name: 'uploaded.pdf', size: '500 KB' }]
        },
        {
          role: 'assistant',
          text: '',
          blocks: [] // Ghost message
        },
        {
          role: 'assistant',
          text: 'Here is the response',
          blocks: [{ kind: 'paragraph', text: 'Here is the response' }]
        }
      ]
    };

    const res = await csvExporter.exportConversation(testConv);
    const lines = res.previewText.trim().split('\n');
    // Header + 2 messages = 3 lines total
    expect(lines.length).toBe(3);
    expect(lines[1]).toContain('[Attachment: uploaded.pdf]');
    expect(lines[2]).toContain('Here is the response');
  });

  it('pdf raster buildRenderHtml handles dividers, attachments, list fallback, and allows natural pagination', () => {
    const testConv = {
      title: 'Raster HTML Test',
      model: 'Z.ai Model',
      createdAt: new Date().toISOString(),
      messages: [
        {
          role: 'assistant',
          text: 'Content',
          blocks: [
            { kind: 'divider' },
            { kind: 'attachment', name: 'document.pdf', size: '3.5 MB', icon: '📄' },
            {
              kind: 'list',
              ordered: false,
              items: [{ text: 'Bullet A' }, { text: 'Bullet B' }]
            }
          ]
        },
        {
          role: 'assistant',
          text: '',
          blocks: [] // Ghost message
        }
      ]
    };

    const html = buildRenderHtml(testConv, 'light');
    expect(html).toContain('<hr style="border: none; border-top: 1px solid');
    expect(html).toContain('document.pdf');
    expect(html).toContain('(3.5 MB)');
    expect(html).toContain('<li>Bullet A</li>');
    expect(html).toContain('<li>Bullet B</li>');
    // Verify that .zaix-message-card does NOT enforce page-break-inside: avoid on the card
    expect(html).not.toMatch(/class="zaix-message-card"[^>]*page-break-inside:\s*avoid/);
    // Verify ghost message is excluded
    const messageCards = html.match(/class="zaix-message-card"/g);
    expect(messageCards.length).toBe(1);
  });
});
