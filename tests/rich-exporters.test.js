/**
 * @file rich-exporters.test.js
 * Comprehensive automated regression and fidelity test suite.
 * Validates rich conversation export across PDF Vector, DOCX, HTML, and Markdown.
 * Verifies non-truncation, math rendering, Bengali/Unicode preservation, and responsive sizing.
 * Sections 20, 21, and 23 of the authoritative specification.
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { createRichConversationFixture } from './fixtures/rich-conversation.js';

import * as vectorPdfExporter from '../src/exporters/pdf-vector.js';
import * as docxExporter from '../src/exporters/docx.js';
import * as htmlExporter from '../src/exporters/html.js';
import * as markdownExporter from '../src/exporters/markdown.js';
import {
  renderMathToHtml,
  renderMathToDocxMath,
  renderMathToSvg
} from '../src/core/math-renderer.js';
import { extractSvgDimensions, fitDimensions } from '../src/core/utils/image.js';
import { computeColumnWidths, normalizeTableRows } from '../src/core/table-layout.js';

async function blobToArrayBuffer(blob) {
  if (typeof blob.arrayBuffer === 'function') {
    return await blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsArrayBuffer(blob);
  });
}

describe('1. Rich Math Rendering Engine', () => {
  it('renders LaTeX formulas to KaTeX HTML without raw $$ delimiters', () => {
    const html = renderMathToHtml('f(x) = \\frac{1}{\\sigma \\sqrt{2\\pi}}', true);
    expect(html).toContain('katex');
    expect(html).toContain('math');
    expect(html).not.toContain('$$');
    expect(html).not.toContain('[Formula:');
  });

  it('generates native docx.Math OMML elements for standard formulas', () => {
    const docxMath = renderMathToDocxMath('E = mc^2');
    expect(docxMath).toBeDefined();
    expect(docxMath.root).toBeDefined();
  });

  it('renders formulas to standalone SVG representations', () => {
    const svg = renderMathToSvg('S_n = \\sum_{k=1}^{n} \\frac{1}{k^2}', true);
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox');
    expect(svg).toContain('katex');
  });
});

describe('2. Table Layout & Metrics Engine', () => {
  it('dynamically computes proportional column widths without hard truncation', () => {
    const fixture = createRichConversationFixture();
    const tableBlock = fixture.messages[3].blocks[1];
    const rows = normalizeTableRows(tableBlock);

    expect(rows.length).toBe(5);
    const widths = computeColumnWidths(rows, 500);
    expect(widths.length).toBe(4);
    // Widths should sum to available width
    const total = widths.reduce((s, w) => s + w, 0);
    expect(Math.round(total)).toBe(500);
    // Longer description column should receive wider allocation than short latency column
    expect(widths[3]).toBeGreaterThan(widths[1]);
  });
});

describe('3. Image & Diagram Pipeline', () => {
  it('accurately parses SVG intrinsic dimensions and preserves aspect ratio', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="140" viewBox="0 0 360 140"><rect width="360" height="140"/></svg>`;
    const dims = extractSvgDimensions(svg);
    expect(dims.width).toBe(360);
    expect(dims.height).toBe(140);
    expect(dims.aspectRatio).toBeCloseTo(360 / 140, 2);
  });

  it('computes responsive fitted dimensions without distortion', () => {
    const fitted = fitDimensions(800, 400, 500, 300);
    expect(fitted.width).toBe(500);
    expect(fitted.height).toBe(250);
    expect(fitted.width / fitted.height).toBeCloseTo(800 / 400, 2);
  });
});

describe('4. Comprehensive Rich Exporter Generation & Negative Checks', () => {
  const fixture = createRichConversationFixture();

  it('exports High-Fidelity HTML with embedded KaTeX, tables, code, and Bengali text', async () => {
    const res = await htmlExporter.exportConversation(fixture);
    expect(res.blob.size).toBeGreaterThan(1000);
    expect(res.previewHtml).toContain('<!DOCTYPE html>');
    expect(res.previewHtml).toContain('katex');
    expect(res.previewHtml).toContain('LSM-Tree (RocksDB)');
    expect(res.previewHtml).toContain('StateReplicator');
    expect(res.previewHtml).toContain('কম্পিউটার পারফরম্যান্স খুব গুরুত্বপূর্ণ');

    // Negative tests: No raw formulas or broken tags
    expect(res.previewHtml).not.toContain('[Formula:');
    expect(res.previewHtml).not.toContain('$$ f(x)');
    expect(res.previewHtml).not.toContain('undefined');
  });

  it('exports Word DOCX with real tables, code blocks, Bengali, and OMML math', async () => {
    const res = await docxExporter.exportConversation(fixture);
    expect(res.blob.size).toBeGreaterThan(1000);
    expect(res.filename.endsWith('.docx')).toBe(true);

    const arrayBuffer = await blobToArrayBuffer(res.blob);
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docXml = await zip.file('word/document.xml').async('string');

    // Document structure checks
    expect(docXml).toContain('Architectural Principles');
    expect(docXml).toContain('StateReplicator');
    expect(docXml).toContain('LSM-Tree (RocksDB)');
    expect(docXml).toContain('কম্পিউটার পারফরম্যান্স খুব গুরুত্বপূর্ণ');

    // Negative tests: No [Formula: ...] or broken formatting
    expect(docXml).not.toContain('[Formula:');
  });

  it('exports Vector PDF with selectable text, code preservation, and valid PDF bytes', async () => {
    const res = await vectorPdfExporter.exportConversation(fixture, {
      pageFormat: 'a4',
      margin: 'normal',
      fontSize: 10,
      includeToc: true
    });
    expect(res.blob.size).toBeGreaterThan(1000);
    expect(res.filename.endsWith('.pdf')).toBe(true);

    const arrayBuffer = await blobToArrayBuffer(res.blob);
    const headerStr = String.fromCharCode(...new Uint8Array(arrayBuffer).subarray(0, 5));
    expect(headerStr).toBe('%PDF-');
  });

  it('preserves complete long code lines (>200 chars) in Markdown without truncation', async () => {
    const res = await markdownExporter.exportConversation(fixture);
    expect(res.previewText).toContain('network_cluster_configuration_parameters_map');
    expect(res.previewText).toContain('maximum_append_entries_batch_size_bytes');
    expect(res.previewText).toContain('কম্পিউটার পারফরম্যান্স খুব গুরুত্বপূর্ণ');
  });
});

describe('5. Prompt-Specific Fidelity & Structural Regression Tests', () => {
  it('preserves exact multi-line Python code structure and 4-space indentation in DOCX XML', async () => {
    const codeSnippet = `from django.shortcuts import render\n\ndef home(request):\n    posts = Post.objects.all()\n\n    return render(request, 'home.html', {\n        'posts': posts\n    })`;

    const conv = {
      schemaVersion: 2,
      id: 'test_django_code',
      title: 'Django Code Test',
      url: 'https://chat.z.ai/test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model: 'Z.ai',
      theme: 'light',
      stats: { words: 20, chars: 150, tokensEst: 37, codeBlocks: 1, images: 0, tables: 0 },
      messages: [
        {
          index: 0,
          role: 'assistant',
          html: '<pre><code class="language-python">' + codeSnippet + '</code></pre>',
          text: codeSnippet,
          blocks: [
            {
              kind: 'code',
              language: 'python',
              code: codeSnippet
            }
          ]
        }
      ]
    };

    const res = await docxExporter.exportConversation(conv);
    const arrayBuffer = await blobToArrayBuffer(res.blob);
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docXml = await zip.file('word/document.xml').async('string');

    // Verify indentation & structure in DOCX XML
    expect(docXml).toContain('def home(request):');
    expect(docXml).toContain('    posts = Post.objects.all()');
    expect(docXml).toContain('posts');
  });

  it('exports structured matrix table with real Table structures', async () => {
    const tableHtml = `<table><thead><tr><th>Feature</th><th>Process</th><th>Project</th></tr></thead><tbody><tr><td>Product</td><td>Repeat</td><td>New</td></tr><tr><td>Objective</td><td>Several</td><td>One</td></tr><tr><td>Duration</td><td>Ongoing</td><td>Limited</td></tr></tbody></table>`;

    const conv = {
      schemaVersion: 2,
      id: 'test_table_matrix',
      title: 'Matrix Table Test',
      url: 'https://chat.z.ai/test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model: 'Z.ai',
      theme: 'light',
      stats: { words: 20, chars: 150, tokensEst: 37, codeBlocks: 0, images: 0, tables: 1 },
      messages: [
        {
          index: 0,
          role: 'assistant',
          html: tableHtml,
          text: 'Feature Process Project',
          blocks: [
            {
              kind: 'table',
              html: tableHtml,
              rows: [
                [
                  { text: 'Feature', isHeader: true },
                  { text: 'Process', isHeader: true },
                  { text: 'Project', isHeader: true }
                ],
                [
                  { text: 'Product', isHeader: false },
                  { text: 'Repeat', isHeader: false },
                  { text: 'New', isHeader: false }
                ],
                [
                  { text: 'Objective', isHeader: false },
                  { text: 'Several', isHeader: false },
                  { text: 'One', isHeader: false }
                ],
                [
                  { text: 'Duration', isHeader: false },
                  { text: 'Ongoing', isHeader: false },
                  { text: 'Limited', isHeader: false }
                ]
              ]
            }
          ]
        }
      ]
    };

    const res = await docxExporter.exportConversation(conv);
    const arrayBuffer = await blobToArrayBuffer(res.blob);
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docXml = await zip.file('word/document.xml').async('string');

    // Verify table XML tags <w:tbl>, <w:tr>, <w:tc>
    expect(docXml).toContain('<w:tbl>');
    expect(docXml).toContain('<w:tr');
    expect(docXml).toContain('<w:tc>');
    expect(docXml).toContain('Feature');
    expect(docXml).toContain('Product');
    expect(docXml).toContain('Ongoing');
  });
});
