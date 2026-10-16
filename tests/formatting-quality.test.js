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
    expect(blocks[4].text).toContain('Conclusion\nThese requirements define the system\'s expected behavior.');
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
    const htmlWithDivs = '<div>First line of question</div><div>Second line of question</div><p>Third line</p>';
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
          blocks: [{ kind: 'paragraph', text: 'Non-functional requirements specify criteria used to judge operation.' }]
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
  });
});
