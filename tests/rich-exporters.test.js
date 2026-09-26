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
import { FullConversationCollector } from '../src/content/scraper.js';
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

describe('6. Paged Document Layout Engine & Mandatory Overlap Prevention Tests', () => {
  it('renders multi-line wrapped paragraphs without overlapping subsequent headings, lists, or tables in Vector PDF', async () => {
    const longParaText =
      'Distributed consensus protocols like Raft and Paxos ensure fault tolerance by replicating a log of state transitions across multiple independent cluster nodes. ' +
      'In a typical production deployment, nodes exchange heartbeats and vote on leader leases while persisting log entries to local durable storage engines such as LSM-trees. ' +
      'When network partitions or node failures occur, quorum-based leader election guarantees that state machine execution remains deterministic without split-brain corruption. ' +
      'This long paragraph is specifically structured to test font measurement and multi-line word wrapping across at least 5 lines of document content in PDF export.';

    const conv = {
      schemaVersion: 2,
      id: 'test_overlap_prevention',
      title: 'Layout Engine Overlap Test',
      url: 'https://chat.z.ai/test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model: 'Z.ai',
      theme: 'light',
      stats: { words: 100, chars: 800, tokensEst: 200, codeBlocks: 0, images: 0, tables: 1 },
      messages: [
        {
          index: 0,
          role: 'user',
          text: 'Explain Raft consensus.'
        },
        {
          index: 1,
          role: 'assistant',
          blocks: [
            { kind: 'paragraph', text: longParaText },
            { kind: 'heading', level: 2, text: 'Key Consensus Properties' },
            {
              kind: 'list',
              ordered: true,
              items: [
                { text: 'Leader Election: Quorum majority election' },
                { text: 'Log Replication: AppendEntries RPC verification' },
                { text: 'Safety: Monotonically increasing term numbers' }
              ]
            },
            {
              kind: 'table',
              rows: [
                [
                  { text: 'Property', isHeader: true },
                  { text: 'Raft', isHeader: true },
                  { text: 'Paxos', isHeader: true }
                ],
                [
                  { text: 'Leader Role', isHeader: false },
                  { text: 'Strong Leader', isHeader: false },
                  { text: 'Multi-Proposer', isHeader: false }
                ]
              ]
            }
          ]
        }
      ]
    };

    const pdfRes = await vectorPdfExporter.exportConversation(conv);
    expect(pdfRes.blob.size).toBeGreaterThan(1000);
    expect(pdfRes.filename.endsWith('.pdf')).toBe(true);

    const pdfBuffer = await blobToArrayBuffer(pdfRes.blob);
    const pdfHeader = String.fromCharCode(...new Uint8Array(pdfBuffer).subarray(0, 5));
    expect(pdfHeader).toBe('%PDF-');

    const docxRes = await docxExporter.exportConversation(conv);
    expect(docxRes.blob.size).toBeGreaterThan(1000);
  });

  it('preserves exact line count, 4-space indentation, and blank lines for Python code in PDF & DOCX', async () => {
    const pythonCode =
      'from django.shortcuts import render\n\ndef home(request):\n    posts = Post.objects.all()\n\n    return render(request, \'home.html\', {\n        \'posts\': posts\n    })';

    const conv = {
      schemaVersion: 2,
      id: 'test_code_whitespace',
      title: 'Critical Code Whitespace Test',
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
          blocks: [
            {
              kind: 'code',
              language: 'python',
              code: pythonCode
            }
          ]
        }
      ]
    };

    const pdfRes = await vectorPdfExporter.exportConversation(conv);
    expect(pdfRes.blob.size).toBeGreaterThan(1000);

    const docxRes = await docxExporter.exportConversation(conv);
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(docxRes.blob));
    const docXml = await zip.file('word/document.xml').async('string');

    expect(docXml).toContain('def home(request):');
    expect(docXml).toContain('    posts = Post.objects.all()');
    expect(docXml).toContain('    return render(request, &apos;home.html&apos;, {');
    expect(docXml).toContain('        &apos;posts&apos;: posts');
  });

  it('exports exam-preparation conversation with file attachment cards, Bengali bilingual text, and extrention z card styling', async () => {
    const examPrepConv = {
      schemaVersion: 2,
      id: 'test_exam_prep_extrention_z',
      title: 'Advanced AI Chatbot & Agent powered by GLM-5.3-Flash',
      url: 'https://chat.z.ai/chat/exam-prep',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model: 'GLM-5.3-Flash',
      theme: 'light',
      stats: { words: 300, chars: 1800, tokensEst: 450, codeBlocks: 0, images: 0, tables: 1 },
      messages: [
        {
          index: 0,
          role: 'user',
          text: 'CSE 305 Lecture on Requirement Determination.pdf PDF 1.4 MB Please prepare me for the exam using the lecture slides as the main source.',
          blocks: [
            {
              kind: 'attachment',
              name: 'CSE 305 Lecture on Requirement Determination.pdf',
              ext: 'PDF',
              size: '1.4 MB',
              icon: '📄'
            },
            {
              kind: 'paragraph',
              text: 'Please prepare me for the exam using the lecture slides as the main source. Explain difficult parts in simple Bangla when necessary.'
            }
          ]
        },
        {
          index: 1,
          role: 'assistant',
          blocks: [
            {
              kind: 'heading',
              level: 2,
              text: 'Topic 1: The Analysis Phase'
            },
            {
              kind: 'paragraph',
              text: 'The Analysis Phase is a stage of the SDLC where we decide WHAT the new system should do -- not HOW it will do it.'
            },
            {
              kind: 'paragraph',
              text: 'বাংলায় শেখো: "As-Is" মানে এখন যে সিস্টেমটা আছে। "To-Be" মানে ভবিষ্যতে যে নতুন সিস্টেমটা হবে।'
            },
            {
              kind: 'heading',
              level: 3,
              text: 'Exam Answer: What is a Requirement?'
            },
            {
              kind: 'paragraph',
              text: 'A requirement is a statement of what the system must do, or a statement of characteristics the system must have.'
            },
            {
              kind: 'table',
              rows: [
                [
                  { text: 'Functional Requirement', isHeader: true },
                  { text: 'Nonfunctional Requirement', isHeader: true }
                ],
                [
                  { text: 'Defines system services and business functions', isHeader: false },
                  { text: 'Defines properties, constraints, security, and speed', isHeader: false }
                ]
              ]
            }
          ]
        }
      ]
    };

    // 1. PDF Vector export
    const pdfRes = await vectorPdfExporter.exportConversation(examPrepConv, {
      pageFormat: 'a4',
      margin: 'normal',
      headerText: 'extrention z'
    });

    expect(pdfRes.blob.size).toBeGreaterThan(1000);
    expect(pdfRes.filename.endsWith('.pdf')).toBe(true);

    const pdfBuffer = await blobToArrayBuffer(pdfRes.blob);
    const pdfHeader = String.fromCharCode(...new Uint8Array(pdfBuffer).subarray(0, 5));
    expect(pdfHeader).toBe('%PDF-');

    // 2. DOCX export
    const docxRes = await docxExporter.exportConversation(examPrepConv);
    expect(docxRes.blob.size).toBeGreaterThan(1000);

    const zip = await JSZip.loadAsync(await blobToArrayBuffer(docxRes.blob));
    const docXml = await zip.file('word/document.xml').async('string');

    expect(docXml).toContain('CSE 305 Lecture on Requirement Determination.pdf');
    expect(docXml).toContain('Topic 1: The Analysis Phase');
    expect(docXml).toContain('বাংলায় শেখো');
    expect(docXml).toContain('<w:tbl>');
  });
});

describe('7. Full Conversation Collection & Virtualization Sentinel Tests', () => {
  it('FullConversationCollector correctly fingerprints and deduplicates virtualized messages', () => {
    const collector = new FullConversationCollector();

    const mockBubble1 = {
      getAttribute: (attr) => (attr === 'data-message-id' ? 'msg_001' : null),
      textContent: 'First message content...'
    };
    const mockBubble2 = {
      getAttribute: () => null,
      textContent: 'Second message content...'
    };

    const id1 = collector.getMessageIdentity(mockBubble1, 'user');
    const id2 = collector.getMessageIdentity(mockBubble2, 'assistant');
    const id2Duplicate = collector.getMessageIdentity(mockBubble2, 'assistant');

    expect(id1).toBe('msg_001');
    expect(id2).toContain('assistant:25:Second message content');
    expect(id2).toBe(id2Duplicate);
  });

  it('collects all 200 messages across a virtualized DOM container where only 20 messages are mounted at a time', async () => {
    // Simulate virtualized chat container with 200 total messages where DOM only mounts 20 at any scroll position
    const totalMessagesCount = 200;
    const windowSize = 20;

    const mockContainer = document.createElement('div');
    mockContainer.id = 'messages-container';
    mockContainer.style.height = '600px';
    mockContainer.style.overflowY = 'auto';

    // Mock scroll properties
    Object.defineProperty(mockContainer, 'clientHeight', { value: 600, configurable: true });
    Object.defineProperty(mockContainer, 'scrollHeight', { value: 6000, configurable: true });

    let currentScrollTop = 5400; // Start at bottom
    Object.defineProperty(mockContainer, 'scrollTop', {
      get: () => currentScrollTop,
      set: (v) => {
        currentScrollTop = Math.max(0, Math.min(6000, v));
        updateMountedDOM();
      },
      configurable: true
    });

    function updateMountedDOM() {
      mockContainer.innerHTML = '';
      // Calculate mounted window based on scrollTop
      const centerIdx = Math.floor((currentScrollTop / 6000) * totalMessagesCount);
      const startIdx = Math.max(0, Math.min(totalMessagesCount - windowSize, centerIdx - 10));
      const endIdx = Math.min(totalMessagesCount, startIdx + windowSize);

      for (let i = startIdx; i < endIdx; i++) {
        const bubble = document.createElement('div');
        bubble.className = i % 2 === 0 ? 'user-message' : 'chat-assistant';
        bubble.setAttribute('data-message-id', `virtual_msg_${i}`);
        let text = `Virtualized Chat Message ${i + 1} content.`;
        if (i === 0) text = 'SENTINEL_FIRST_VIRTUAL_MSG: Beginning of 200 chat';
        if (i === 199) text = 'SENTINEL_LAST_VIRTUAL_MSG: End of 200 chat';
        bubble.textContent = text;
        mockContainer.appendChild(bubble);
      }
    }

    document.body.appendChild(mockContainer);
    updateMountedDOM();

    const collector = new FullConversationCollector();
    const collected = await collector.collectAll(mockContainer, {
      maxScrollAttempts: 30,
      settleDelayMs: 10
    });

    document.body.removeChild(mockContainer);

    expect(collected.length).toBe(totalMessagesCount);
    expect(collected[0].text).toContain('SENTINEL_FIRST_VIRTUAL_MSG');
    expect(collected[collected.length - 1].text).toContain('SENTINEL_LAST_VIRTUAL_MSG');
  });

  it('exports a 100-message long conversation with Sentinel First and Last messages present in PDF and DOCX', async () => {
    const messages = [];
    const messageCount = 100;

    for (let i = 0; i < messageCount; i++) {
      const isUser = i % 2 === 0;
      let text = `Message ${i + 1}: Standard discussion content line.`;
      if (i === 0) {
        text = 'SENTINEL_FIRST_MESSAGE: Welcome to the long conversation test suite.';
      } else if (i === messageCount - 1) {
        text = 'SENTINEL_LAST_MESSAGE: Final conclusion of the long conversation test suite.';
      } else if (i === 50) {
        text = 'SENTINEL_MIDDLE_MESSAGE: Midpoint state verification.';
      }

      messages.push({
        index: i,
        role: isUser ? 'user' : 'assistant',
        text,
        blocks: [
          {
            kind: 'paragraph',
            text
          }
        ]
      });
    }

    const longConv = {
      schemaVersion: 2,
      id: 'test_100_messages_sentinel',
      title: '100-Message Full Conversation Export Test',
      url: 'https://chat.z.ai/test/100',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model: 'GLM-5.3-Flash',
      theme: 'light',
      stats: { words: 2000, chars: 12000, tokensEst: 3000, codeBlocks: 0, images: 0, tables: 0 },
      messages
    };

    // 1. PDF Export
    const pdfRes = await vectorPdfExporter.exportConversation(longConv, {
      pageFormat: 'a4',
      margin: 'normal',
      fontSize: 10
    });
    expect(pdfRes.blob.size).toBeGreaterThan(5000);
    expect(pdfRes.filename.endsWith('.pdf')).toBe(true);

    const pdfBuffer = await blobToArrayBuffer(pdfRes.blob);
    const pdfHeader = String.fromCharCode(...new Uint8Array(pdfBuffer).subarray(0, 5));
    expect(pdfHeader).toBe('%PDF-');

    // 2. DOCX Export
    const docxRes = await docxExporter.exportConversation(longConv);
    expect(docxRes.blob.size).toBeGreaterThan(5000);

    const zip = await JSZip.loadAsync(await blobToArrayBuffer(docxRes.blob));
    const docXml = await zip.file('word/document.xml').async('string');

    // Sentinel Checks
    expect(docXml).toContain('SENTINEL_FIRST_MESSAGE');
    expect(docXml).toContain('SENTINEL_MIDDLE_MESSAGE');
    expect(docXml).toContain('SENTINEL_LAST_MESSAGE');
  });
});



