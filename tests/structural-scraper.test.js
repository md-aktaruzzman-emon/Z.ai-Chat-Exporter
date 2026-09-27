/**
 * @file structural-scraper.test.js
 * Verification of the Definitive Root-Cause Repair for Z.ai Chat Exporter.
 * Ensures that live messages reach exporters as rich structured blocks,
 * not as flattened text strings.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  parseBlocks,
  parseMarkdownToBlocks,
  extractConversationId,
  fetchConversationFromApi,
  classifyRole,
  logMessageStructure
} from '../src/content/scraper.js';
import * as vectorPdfExporter from '../src/exporters/pdf-vector.js';
import * as docxExporter from '../src/exporters/docx.js';

describe('Definitive Root-Cause Repair: Semantic Block Preservation', () => {
  it('does NOT flatten nested React/Tailwind div structures into a single paragraph', () => {
    const container = document.createElement('div');
    container.className = 'chat-message chat-assistant';
    container.setAttribute('data-message-id', 'test-react-nested');
    container.setAttribute('data-role', 'assistant');

    // 4 levels of nested wrapper divs (standard React / Tailwind layout)
    container.innerHTML = `
      <div class="message-row flex">
        <div class="message-body flex-1">
          <div class="content-box">
            <div class="prose max-w-none">
              <h2>১. প্রধান বিষয় (Key Topic)</h2>
              <p>প্রথম অনুচ্ছেদ যেখানে <strong>গুরুত্বপূর্ণ</strong> তথ্য রয়েছে।</p>
              
              <h3>সাব-সেকশন (Sub-section)</h3>
              <ol>
                <li>প্রথম ধাপ</li>
                <li>দ্বিতীয় ধাপ</li>
              </ol>

              <div class="code-block-container">
                <div class="code-header">
                  <span>python</span>
                  <button class="copy-btn">Copy code</button>
                </div>
                <pre><code class="language-python">def solve():\n    return 42</code></pre>
              </div>

              <table>
                <thead>
                  <tr><th>নাম</th><th>মান</th></tr>
                </thead>
                <tbody>
                  <tr><td>Alpha</td><td>100</td></tr>
                </tbody>
              </table>

              <div class="katex-display" data-tex="x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}">
                <span class="katex"><annotation>x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}</annotation></span>
              </div>

              <p>সমাপ্তি বার্তা।</p>
            </div>
          </div>
        </div>
      </div>
    `;

    const blocks = parseBlocks(container);

    // CRITICAL ASSERTIONS:
    // Before repair, this returned 1 block (paragraph) with everything flattened into a raw string!
    // After repair, it MUST return distinct semantic blocks.
    expect(blocks.length).toBeGreaterThanOrEqual(8);

    const kinds = blocks.map((b) => b.kind);
    expect(kinds).toContain('heading');
    expect(kinds).toContain('paragraph');
    expect(kinds).toContain('list');
    expect(kinds).toContain('code');
    expect(kinds).toContain('table');
    expect(kinds).toContain('math');

    // Verify Heading
    const h2 = blocks.find((b) => b.kind === 'heading' && b.level === 2);
    expect(h2).toBeDefined();
    expect(h2.text).toContain('১. প্রধান বিষয়');

    // Verify List
    const list = blocks.find((b) => b.kind === 'list');
    expect(list).toBeDefined();
    expect(list.ordered).toBe(true);
    expect(list.items.length).toBe(2);
    expect(list.items[0].text).toBe('প্রথম ধাপ');

    // Verify Code block and verify copy button text is NOT included
    const code = blocks.find((b) => b.kind === 'code');
    expect(code).toBeDefined();
    expect(code.language).toBe('python');
    expect(code.code).toContain('def solve():');
    expect(code.code).not.toContain('Copy code');

    // Verify Table
    const table = blocks.find((b) => b.kind === 'table');
    expect(table).toBeDefined();
    expect(table.rows.length).toBe(2);
    expect(table.rows[0][0].text).toBe('নাম');

    // Verify Math
    const math = blocks.find((b) => b.kind === 'math');
    expect(math).toBeDefined();
    expect(math.tex).toContain('\\frac{-b');
  });

  it('parses raw Markdown strings into rich structured blocks for API responses', () => {
    const rawMd = `
# System Architecture

This is the introductory paragraph.

Key components:
1. Database Cluster
2. In-memory Cache

\`\`\`typescript
interface UserProfile {
  id: string;
  name: string;
}
\`\`\`

| Service | Port | Protocol |
| --- | --- | --- |
| Auth | 8080 | HTTPS |
| Core | 9090 | gRPC |

> Crucial architectural decision note.

Final paragraph.
    `.trim();

    const blocks = parseMarkdownToBlocks(rawMd);
    expect(blocks.length).toBe(8);

    expect(blocks[0].kind).toBe('heading');
    expect(blocks[0].text).toBe('System Architecture');

    expect(blocks[1].kind).toBe('paragraph');
    expect(blocks[2].kind).toBe('paragraph');

    expect(blocks[3].kind).toBe('list');
    expect(blocks[3].ordered).toBe(true);
    expect(blocks[3].items.length).toBe(2);

    expect(blocks[4].kind).toBe('code');
    expect(blocks[4].language).toBe('typescript');

    expect(blocks[5].kind).toBe('table');
    expect(blocks[5].rows.length).toBe(3);

    expect(blocks[6].kind).toBe('quote');
    expect(blocks[6].text).toContain('Crucial architectural decision');

    expect(blocks[7].kind).toBe('paragraph');
  });

  it('robustly extracts conversation ID from pathnames, query parameters, and DOM', () => {
    // 1. Pathname /c/:id
    expect(extractConversationId('https://chat.z.ai/c/conv-98765-xyz')).toBe('conv-98765-xyz');
    expect(extractConversationId('https://chat.z.ai/s/share-12345')).toBe('share-12345');
    expect(extractConversationId('https://chat.z.ai/chat/chat-abc-def')).toBe('chat-abc-def');

    // 2. Query param ?c=
    expect(extractConversationId('https://chat.z.ai/?c=query_conv_id')).toBe('query_conv_id');
    expect(extractConversationId('https://chat.z.ai/?id=query_id_val')).toBe('query_id_val');

    // 3. DOM fallback
    const mockDoc = document.createElement('div');
    mockDoc.innerHTML = `<div data-conversation-id="dom-conv-uuid-42"></div>`;
    expect(extractConversationId('https://chat.z.ai/', mockDoc)).toBe('dom-conv-uuid-42');
  });

  it('successfully fetches and normalizes conversation from authenticated API endpoint', async () => {
    const mockApiResponse = {
      title: 'API Export Test',
      model: 'GLM-5.3-Flash',
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello, explain vector layout.'
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: '## Overview\n\nVector layout computes block heights strictly.\n\n```python\nprint("zero overlap")\n```'
        }
      ]
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse
    });

    const conv = await fetchConversationFromApi('test-conv-id');
    expect(conv).toBeDefined();
    expect(conv.title).toBe('API Export Test');
    expect(conv.messages.length).toBe(2);

    const asstMsg = conv.messages[1];
    expect(asstMsg.role).toBe('assistant');
    expect(asstMsg.blocks.length).toBe(3);
    expect(asstMsg.blocks[0].kind).toBe('heading');
    expect(asstMsg.blocks[1].kind).toBe('paragraph');
    expect(asstMsg.blocks[2].kind).toBe('code');
  });

  it('renders multi-block structured messages into Vector PDF and DOCX with zero error', async () => {
    const conv = {
      schemaVersion: 2,
      id: 'test_structured_export',
      title: 'সিস্টেম ডিজাইন ও কাঠামোগত রপ্তানি',
      url: 'https://chat.z.ai/c/test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model: 'GLM-5.3-Flash',
      theme: 'light',
      stats: { words: 100, chars: 800, tokensEst: 200, codeBlocks: 1, images: 0, tables: 1 },
      messages: [
        {
          index: 0,
          role: 'user',
          text: 'ব্যাখ্যা দিন।',
          blocks: [{ kind: 'paragraph', text: 'ব্যাখ্যা দিন।' }]
        },
        {
          index: 1,
          role: 'assistant',
          text: 'বিস্তারিত...',
          blocks: [
            { kind: 'heading', level: 2, text: '১. ভূমিকা' },
            { kind: 'paragraph', text: 'বিশ্লেষণ দেওয়া হলো।' },
            {
              kind: 'list',
              ordered: false,
              items: [{ text: 'আইটেম ১' }, { text: 'আইটেম ২' }]
            },
            {
              kind: 'code',
              language: 'python',
              code: 'x = 10\ny = 20\nprint(x + y)'
            },
            {
              kind: 'table',
              rows: [
                [{ text: 'Header A', isHeader: true }, { text: 'Header B', isHeader: true }],
                [{ text: 'Data 1', isHeader: false }, { text: 'Data 2', isHeader: false }]
              ]
            }
          ]
        }
      ]
    };

    const pdfRes = await vectorPdfExporter.exportConversation(conv);
    expect(pdfRes.blob.size).toBeGreaterThan(2000);
    expect(pdfRes.filename.endsWith('.pdf')).toBe(true);

    const docxRes = await docxExporter.exportConversation(conv);
    expect(docxRes.blob.size).toBeGreaterThan(3000);
    expect(docxRes.filename.endsWith('.docx')).toBe(true);
  });
});
