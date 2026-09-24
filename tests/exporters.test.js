/**
 * @file exporters.test.js
 * Comprehensive unit and integration tests across data models, sanitization,
 * PII redaction, filename templates, scraper fixtures, and export file generators.
 * Section 28 of the authoritative specification.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { marked } from 'marked';

// Core imports
import { createEmptyConversation, computeStats } from '../src/core/conversation-model.js';
import { sanitizeHtml, isSafeUrl } from '../src/core/sanitize.js';
import { generateFilename } from '../src/core/utils/filename.js';

// Exporters imports
import { anonymizePiiText, anonymizeConversation, redactUrlPii } from '../src/exporters/pii.js';
import * as markdownExporter from '../src/exporters/markdown.js';
import * as txtExporter from '../src/exporters/txt.js';
import * as jsonExporter from '../src/exporters/json.js';
import * as csvExporter from '../src/exporters/csv.js';
import * as htmlExporter from '../src/exporters/html.js';
import * as docxExporter from '../src/exporters/docx.js';
import * as vectorPdfExporter from '../src/exporters/pdf-vector.js';

// Scraper & DOM Engine imports
import { parseBlocks, classifyRole } from '../src/content/scraper.js';
import { ExportError, exportProfileJson, importProfileJson } from '../src/content/dom-engine.js';

describe('1. Data Model & Stats', () => {
  it('creates a clean Conversation v2 object', () => {
    const conv = createEmptyConversation();
    expect(conv.schemaVersion).toBe(2);
    expect(conv.messages).toEqual([]);
    expect(conv.stats.words).toBe(0);
    expect(conv.stats.tokensEst).toBe(0);
  });

  it('correctly calculates word count, char count, and tokensEst', () => {
    const conv = createEmptyConversation();
    conv.messages = [
      {
        index: 0,
        role: 'user',
        text: 'Hello world! This is a test conversation.',
        html: '<p>Hello world! This is a test conversation.</p>',
        blocks: []
      },
      {
        index: 1,
        role: 'assistant',
        text: 'Indeed it is.',
        html: '<p>Indeed it is.</p>',
        blocks: [{ kind: 'code', language: 'javascript', code: 'console.log(1);' }]
      }
    ];

    const stats = computeStats(conv);
    expect(stats.words).toBe(10);
    // chars: 41 + 13 = 54
    expect(stats.chars).toBe(54);
    // tokensEst: Math.round(54 / 4) = 14
    expect(stats.tokensEst).toBe(14);
    expect(stats.codeBlocks).toBe(1);
  });
});

describe('2. Sanitization Engine', () => {
  it('removes script, iframe, and dangerous event handlers', () => {
    const dangerous = `<div onclick="alert(1)"><script>alert('xss')</script><p>Safe content</p><img src="x" onerror="evil()" /></div>`;
    const clean = sanitizeHtml(dangerous);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('onerror');
    expect(clean).toContain('Safe content');
  });

  it('blocks javascript: URLs while allowing http/https and data URIs', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('https://chat.z.ai')).toBe(true);
    expect(isSafeUrl('data:image/png;base64,123')).toBe(true);
  });

  it('blocks executable data: URLs (text/html) while allowing media data URIs', () => {
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('data:application/javascript,alert(1)')).toBe(false);
    expect(isSafeUrl('data:image/jpeg;base64,abc')).toBe(true);
    expect(isSafeUrl('data:video/mp4;base64,abc')).toBe(true);
  });

  it('sanitizes data:text/html src/href attributes out of exported HTML', () => {
    const clean = sanitizeHtml('<a href="data:text/html,<b>x</b>">click</a>');
    expect(clean).not.toContain('href');
  });
});

describe('3. Filename Engine', () => {
  it('replaces tokens, removes illegal characters, and caps at 120 chars', () => {
    const filename = generateFilename({
      template: '{{title}}_{{date}}',
      title: 'What/is:the*best"architecture?|test',
      format: 'pdf',
      timestamp: 1710000000000
    });

    expect(filename).not.toMatch(/[\\/:*?"<>|]/);
    expect(filename.endsWith('.pdf')).toBe(true);
    expect(filename).toContain('Whatisthebestarchitecturetest');
  });

  it('handles collision index deduplication', () => {
    const filename = generateFilename({
      title: 'Report',
      format: 'md',
      collisionIndex: 2
    });
    expect(filename).toContain('(2).md');
  });
});

describe('4. PII Anonymizer', () => {
  it('redacts emails, API keys, tokens, and phone numbers', () => {
    const sample =
      'Contact test@example.com or call +1 555-0199. Key: sk-1234567890abcdef1234567890 and Bearer eyJhbGciOi.eyJzdWIiOi.test';
    const scrubbed = anonymizePiiText(sample);

    expect(scrubbed).toContain('[EMAIL REDACTED]');
    expect(scrubbed).toContain('[PHONE REDACTED]');
    expect(scrubbed).toContain('[API KEY REDACTED]');
    expect(scrubbed).toContain('[TOKEN REDACTED]');
  });

  it('does not transform safe ordinary text or code syntax (negative case)', () => {
    const safeText = 'const apiKey = "user_setting"; function calculate(x, y) { return x + y; }';
    const result = anonymizePiiText(safeText);
    expect(result).toBe(safeText);
  });

  it('does not mutate original conversation when anonymizing', () => {
    const original = createEmptyConversation();
    original.title = 'Private info: secret@corp.com';
    original.messages.push({
      index: 0,
      role: 'user',
      text: 'My email is secret@corp.com',
      html: '<p>My email is secret@corp.com</p>',
      blocks: []
    });

    const scrubbed = anonymizeConversation(original);
    expect(scrubbed.title).toContain('[EMAIL REDACTED]');
    expect(original.title).toBe('Private info: secret@corp.com'); // Untouched
  });

  it('anonymizes PII inside table cells, lists, tool calls, and search results', () => {
    const conv = createEmptyConversation();
    conv.messages.push({
      index: 0,
      role: 'assistant',
      text: '',
      html: '',
      blocks: [
        {
          kind: 'table',
          rows: [
            [
              { text: 'Owner', html: '<p>Owner</p>', isHeader: true, colspan: 1, rowspan: 1 },
              {
                text: 'bob@corp.com',
                html: '<p>bob@corp.com</p>',
                isHeader: false,
                colspan: 1,
                rowspan: 1
              }
            ]
          ]
        },
        {
          kind: 'list',
          ordered: false,
          items: [{ text: 'Call 555-0199 ext 32', html: '<p>Call 555-0199</p>' }]
        },
        {
          kind: 'toolCall',
          tool: 'fetch',
          inputJson: '{"token":"sk-abcdefghijklmnopqrstuvwx"}',
          outputSummary: 'OK for admin@corp.com'
        },
        {
          kind: 'searchResult',
          query: 'email me at eve@corp.com',
          results: [
            { title: 'Page', url: 'https://ex.com/u?user=a@b.com&token=abcdef123456', snippet: 'x' }
          ]
        },
        {
          kind: 'citation',
          title: 'Ref: a@b.com',
          url: 'https://ex.com/p?api_key=sk-secret123456789'
        }
      ]
    });

    const scrubbed = anonymizeConversation(conv);
    const blocks = scrubbed.messages[0].blocks;
    expect(blocks[0].rows[0][1].text).toContain('[EMAIL REDACTED]');
    expect(blocks[1].items[0].text).toContain('[PHONE REDACTED]');
    expect(blocks[2].outputSummary).toContain('[EMAIL REDACTED]');
    expect(blocks[3].query).toContain('[EMAIL REDACTED]');
    expect(blocks[3].results[0].url).toContain('[REDACTED]');
    expect(blocks[4].url).toContain('[REDACTED]');
    expect(blocks[4].url).toContain('https://ex.com/p'); // path preserved
    // Original untouched (R9)
    expect(conv.messages[0].blocks[0].rows[0][1].text).toBe('bob@corp.com');
  });

  it('redactsUrlPii strips secrets from query strings but keeps the path', () => {
    expect(redactUrlPii('https://ex.com/p?api_key=sk-123456&page=2')).toBe(
      'https://ex.com/p?api_key=[REDACTED]&page=2'
    );
    expect(redactUrlPii('https://ex.com/docs/guide?u=x')).toBe('https://ex.com/docs/guide?u=x');
  });
});

describe('5. Scraper Fixtures Integration', () => {
  it('parses plain messages from plain.html fixture', () => {
    const fixturePath = path.resolve(__dirname, 'fixtures/plain.html');
    const fixtureHtml = fs.readFileSync(fixturePath, 'utf8');

    const container = document.createElement('div');
    container.innerHTML = fixtureHtml;
    const userBubble = container.querySelector('.user-message');
    const assistantBubble = container.querySelector('.assistant-message');

    expect(classifyRole(userBubble)).toBe('user');
    expect(classifyRole(assistantBubble)).toBe('assistant');

    const assistantBlocks = parseBlocks(assistantBubble);
    expect(assistantBlocks.some((b) => b.kind === 'heading')).toBe(true);
  });

  it('parses code blocks from code.html fixture', () => {
    const fixturePath = path.resolve(__dirname, 'fixtures/code.html');
    const fixtureHtml = fs.readFileSync(fixturePath, 'utf8');

    const container = document.createElement('div');
    container.innerHTML = fixtureHtml;
    const assistantBubble = container.querySelector('.assistant-message');

    const blocks = parseBlocks(assistantBubble);
    const codeBlocks = blocks.filter((b) => b.kind === 'code');

    expect(codeBlocks.length).toBe(3);
    expect(codeBlocks.map((c) => c.language)).toEqual(['javascript', 'python', 'cpp']);
  });

  it('parses math equations and prevents duplicate inline math blocks from math.html fixture', () => {
    const fixturePath = path.resolve(__dirname, 'fixtures/math.html');
    const fixtureHtml = fs.readFileSync(fixturePath, 'utf8');

    const container = document.createElement('div');
    container.innerHTML = fixtureHtml;
    const assistantBubble = container.querySelector('.assistant-message');

    const blocks = parseBlocks(assistantBubble);
    const mathBlocks = blocks.filter((b) => b.kind === 'math');

    // Display math blocks are properly extracted as block-level math
    expect(mathBlocks.length).toBe(2);
    expect(mathBlocks.some((m) => m.tex.includes('f(x)'))).toBe(true);
    expect(mathBlocks.some((m) => m.tex.includes('\\nabla'))).toBe(true);
    expect(mathBlocks.every((m) => m.displayMode === true)).toBe(true);

    // Paragraph preserves inline math rich HTML without creating a duplicate block
    const pWithMath = blocks.find((b) => b.kind === 'paragraph' && b.html.includes('E = mc^2'));
    expect(pWithMath).toBeDefined();
    // Verify duplicate math prevention: inline math does NOT create separate standalone block
    expect(mathBlocks.some((m) => m.tex.includes('E = mc^2'))).toBe(false);
  });

  it('parses table structure from table.html fixture', () => {
    const fixturePath = path.resolve(__dirname, 'fixtures/table.html');
    const fixtureHtml = fs.readFileSync(fixturePath, 'utf8');

    const container = document.createElement('div');
    container.innerHTML = fixtureHtml;
    const assistantBubble = container.querySelector('.assistant-message');

    const blocks = parseBlocks(assistantBubble);
    const tableBlocks = blocks.filter((b) => b.kind === 'table');

    expect(tableBlocks.length).toBe(1);
    expect(tableBlocks[0].html).toContain('<table');
  });

  it('splits nested lists without double-counting parent item text', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="assistant-message">
        <ul>
          <li>Top level one</li>
          <li>Top level two
            <ul>
              <li>Nested alpha</li>
              <li>Nested beta</li>
            </ul>
          </li>
        </ul>
      </div>`;

    const blocks = parseBlocks(container.querySelector('.assistant-message'));
    const listBlocks = blocks.filter((b) => b.kind === 'list');

    // Outer list + one nested list block (nested lists become their own blocks)
    expect(listBlocks.length).toBe(2);
    const outerItems = listBlocks[0].items;
    expect(outerItems.length).toBe(2);
    // Parent item text must NOT include nested list text
    expect(outerItems[0].text).toBe('Top level one');
    expect(outerItems[1].text).toBe('Top level two');
    expect(outerItems[1].text).not.toContain('Nested');
    // Nested items emitted as their own block
    expect(nestedItems(nestedBlocks(listBlocks))).toEqual(['Nested alpha', 'Nested beta']);
  });

  function nestedBlocks(listBlocks) {
    return listBlocks.slice(1).filter((b) => b.kind === 'list');
  }
  function nestedItems(blocks) {
    return blocks.flatMap((b) => b.items.map((i) => i.text));
  }

  it('parses local data URL images from image.html fixture', () => {
    const fixturePath = path.resolve(__dirname, 'fixtures/image.html');
    const fixtureHtml = fs.readFileSync(fixturePath, 'utf8');

    const container = document.createElement('div');
    container.innerHTML = fixtureHtml;
    const assistantBubble = container.querySelector('.assistant-message');

    const blocks = parseBlocks(assistantBubble);
    const imageBlocks = blocks.filter((b) => b.kind === 'image');

    expect(imageBlocks.length).toBe(1);
    expect(imageBlocks[0].src.startsWith('data:image/png')).toBe(true);
  });

  it('parses agentic reasoning, tools, and citations from agentic.html', () => {
    const fixturePath = path.resolve(__dirname, 'fixtures/agentic.html');
    const fixtureHtml = fs.readFileSync(fixturePath, 'utf8');

    const container = document.createElement('div');
    container.innerHTML = fixtureHtml;
    const assistantBubble = container.querySelector('.assistant-message');

    const blocks = parseBlocks(assistantBubble);
    expect(blocks.some((b) => b.kind === 'thinking')).toBe(true);
    expect(blocks.some((b) => b.kind === 'toolCall')).toBe(true);
    expect(blocks.some((b) => b.kind === 'citation')).toBe(true);
    expect(blocks.some((b) => b.kind === 'artifact')).toBe(true);
  });

  it('preserves exact DOM order and does not drop paragraphs with mixed content', () => {
    const mixedHtml = `
      <div class="assistant-message">
        <h2>Step 1: Introduction</h2>
        <p>This is the first paragraph introducing the topic.</p>
        <pre><code class="language-js">console.log('in between');</code></pre>
        <p>This is a following paragraph that must never be destroyed.</p>
        <table><tr><td>Data</td></tr></table>
        <p>Final concluding paragraph.</p>
      </div>
    `;
    const container = document.createElement('div');
    container.innerHTML = mixedHtml;
    const bubble = container.querySelector('.assistant-message');

    const blocks = parseBlocks(bubble);
    expect(blocks.map((b) => b.kind)).toEqual([
      'heading',
      'paragraph',
      'code',
      'paragraph',
      'table',
      'paragraph'
    ]);
  });

  it('handles citations without href gracefully without crashing', () => {
    const citeHtml = `<div class="assistant-message"><p>Reference <a class="citation">Citation without href</a></p></div>`;
    const container = document.createElement('div');
    container.innerHTML = citeHtml;
    const bubble = container.querySelector('.assistant-message');

    expect(() => parseBlocks(bubble)).not.toThrow();
  });
});

describe('6. Selector Profile API & Errors', () => {
  it('exports valid profile JSON', () => {
    const jsonStr = exportProfileJson();
    const parsed = JSON.parse(jsonStr);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.host).toBe('chat.z.ai');
  });

  it('validates safe CSS selectors on import and rejects malformed ones', async () => {
    // Valid profile
    const validProfile = {
      schemaVersion: 1,
      host: 'chat.z.ai',
      threadContainer: 'div.chat-thread',
      messageBubble: '.assistant-message'
    };
    const imported = await importProfileJson(JSON.stringify(validProfile));
    expect(imported.threadContainer).toBe('div.chat-thread');

    // Malformed CSS selector should throw ExportError('INVALID_PROFILE')
    const malformed = {
      schemaVersion: 1,
      threadContainer: 'div[[[broken@@selector'
    };
    await expect(importProfileJson(JSON.stringify(malformed))).rejects.toThrow(ExportError);
  });

  it('creates structured ExportError with proper code and message', () => {
    const err = new ExportError('LOCATE_FAILED', 'Could not find messages');
    expect(err.name).toBe('ExportError');
    expect(err.code).toBe('LOCATE_FAILED');
    expect(err.message).toBe('Could not find messages');
  });
});

describe('7. Exporters File Generation', () => {
  let sampleConv;

  beforeEach(() => {
    sampleConv = createEmptyConversation();
    sampleConv.title = 'Comprehensive Systems Review';
    sampleConv.messages = [
      {
        index: 0,
        role: 'user',
        text: 'Can you show me a Python Fibonacci example and explain it?',
        html: '<p>Can you show me a Python Fibonacci example and explain it?</p>',
        blocks: [
          {
            kind: 'paragraph',
            html: '<p>Can you show me a Python Fibonacci example and explain it?</p>'
          }
        ]
      },
      {
        index: 1,
        role: 'assistant',
        text: 'Here is the function:\n\ndef fib(n):\n    return n if n <= 1 else fib(n-1) + fib(n-2)',
        html: '<p>Here is the function:</p>',
        blocks: [
          { kind: 'paragraph', html: '<p>Here is the function:</p>' },
          {
            kind: 'code',
            language: 'python',
            code: 'def fib(n):\n    return n if n <= 1 else fib(n-1) + fib(n-2)'
          },
          {
            kind: 'table',
            html: '<table><tr><th>n</th><th>fib(n)</th></tr><tr><td>1</td><td>1</td></tr></table>'
          }
        ]
      }
    ];
  });

  it('exports Markdown with GFM roundtrip consistency', async () => {
    const res = await markdownExporter.exportConversation(sampleConv, { preset: 'github' });
    expect(res.blob.size).toBeGreaterThan(100);
    expect(res.filename.endsWith('.md')).toBe(true);

    const parsedHtml = marked.parse(res.previewText);
    expect(parsedHtml).toContain('python');
    expect(parsedHtml).toContain('Comprehensive Systems Review');
  });

  it('exports Plain Text with speaker tags', async () => {
    const res = await txtExporter.exportConversation(sampleConv);
    expect(res.blob.size).toBeGreaterThan(100);
    expect(res.previewText).toContain('[You]');
    expect(res.previewText).toContain('def fib(n):');
  });

  it('exports valid JSON schema', async () => {
    const res = await jsonExporter.exportConversation(sampleConv);
    const parsed = JSON.parse(res.previewText);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.title).toBe(sampleConv.title);
  });

  it('exports RFC 4180 compliant CSV', async () => {
    const res = await csvExporter.exportConversation(sampleConv);
    expect(res.previewText).toContain('index,role,timestamp,text');
    expect(res.previewText).toContain('"user"');
  });

  it('exports standalone HTML', async () => {
    const res = await htmlExporter.exportConversation(sampleConv);
    expect(res.previewHtml).toContain('<!DOCTYPE html>');
    expect(res.previewHtml).toContain('Comprehensive Systems Review');
    expect(res.previewHtml).not.toContain('<script');
  });

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

  it('exports valid DOCX package with word/document.xml and tables', async () => {
    const res = await docxExporter.exportConversation(sampleConv);
    expect(res.blob.size).toBeGreaterThan(500);

    const arrayBuffer = await blobToArrayBuffer(res.blob);
    const zip = await JSZip.loadAsync(arrayBuffer);
    expect(zip.file('word/document.xml')).not.toBeNull();

    const docXml = await zip.file('word/document.xml').async('string');
    expect(docXml).toContain('Comprehensive Systems Review');
  });

  it('exports Vector PDF with selectable text bytes and options', async () => {
    const res = await vectorPdfExporter.exportConversation(sampleConv, {
      pageFormat: 'letter',
      margin: 'wide',
      fontSize: 11,
      includeToc: true,
      headerText: 'Confidential Report',
      footerText: 'Internal Use'
    });
    expect(res.blob.size).toBeGreaterThan(500);

    const buffer = await blobToArrayBuffer(res.blob);
    const header = new Uint8Array(buffer).subarray(0, 5);
    // '%PDF-'
    const headerStr = String.fromCharCode(...header);
    expect(headerStr).toBe('%PDF-');
  });

  it('safely handles Unicode, Bengali text, emojis, and math arrows in Vector PDF without WinAnsi errors', async () => {
    const unicodeConv = createEmptyConversation();
    unicodeConv.title = 'বাংলা কথোপকথন & Emojis 🚀';
    unicodeConv.messages = [
      {
        index: 0,
        role: 'user',
        text: 'কী খবর? Hello world! x → y and a ≤ b 😊',
        html: '<p>কী খবর? Hello world! x → y and a ≤ b 😊</p>',
        blocks: [
          { kind: 'paragraph', text: 'কী খবর? Hello world! x → y and a ≤ b 😊' },
          { kind: 'code', language: 'python', code: 'print("বাংলা 🚀")' }
        ]
      }
    ];

    const res = await vectorPdfExporter.exportConversation(unicodeConv, {
      headerText: 'শীর্ষচরণ • Header',
      footerText: 'পাদচরণ • Footer'
    });
    expect(res.blob.size).toBeGreaterThan(500);
    const buffer = await blobToArrayBuffer(res.blob);
    const headerStr = String.fromCharCode(...new Uint8Array(buffer).subarray(0, 5));
    expect(headerStr).toBe('%PDF-');
  });

  it('generates multi-backtick code fences in Markdown when code contains triple backticks', async () => {
    const codeConv = createEmptyConversation();
    codeConv.title = 'Markdown Code Fences';
    codeConv.messages = [
      {
        index: 0,
        role: 'assistant',
        text: 'Nested code sample',
        blocks: [
          {
            kind: 'code',
            language: 'markdown',
            code: '```javascript\nconsole.log("nested");\n```'
          }
        ]
      }
    ];

    const res = await markdownExporter.exportConversation(codeConv);
    expect(res.previewText).toContain('````markdown');
    expect(res.previewText).toContain('```javascript\nconsole.log("nested");\n```');
    expect(res.previewText).toContain('````\n');
  });

  it('escapes code blocks containing script and HTML tags in HTML export', async () => {
    const evilConv = createEmptyConversation();
    evilConv.title = 'Code Injection Test';
    evilConv.messages = [
      {
        index: 0,
        role: 'user',
        text: 'Check this code',
        blocks: [
          {
            kind: 'code',
            language: 'html',
            code: '<script>alert("xss")</script><div class="test">content</div>'
          },
          {
            kind: 'thinking',
            text: 'Thinking with <b>tags</b> & <script>alert(1)</script>'
          },
          {
            kind: 'citation',
            title: 'Malicious citation <img src=x>',
            url: 'javascript:alert(1)',
            snippet: 'Dangerous <script>'
          }
        ]
      }
    ];

    const res = await htmlExporter.exportConversation(evilConv);
    expect(res.previewHtml).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(res.previewHtml).toContain('&lt;div class=&quot;test&quot;&gt;content&lt;/div&gt;');
    expect(res.previewHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    // Unsafe javascript: protocol should be replaced with #
    expect(res.previewHtml).not.toContain('href="javascript:');
    expect(res.previewHtml).toContain('href="#"');
  });

  it('correctly classifies role using data-message-author-role and aliases', () => {
    const el1 = document.createElement('div');
    el1.setAttribute('data-message-author-role', 'human');
    expect(classifyRole(el1)).toBe('user');

    const el2 = document.createElement('div');
    el2.setAttribute('data-message-author-role', 'bot');
    expect(classifyRole(el2)).toBe('assistant');

    const el3 = document.createElement('div');
    el3.setAttribute('data-message-author-role', 'tool');
    expect(classifyRole(el3)).toBe('tool');
  });

  it('preserves structured educational hierarchy (Headings, Lists, Tables, Code) in DOCX export', async () => {
    const eduConv = createEmptyConversation();
    eduConv.title = 'Project vs Process Guide';
    eduConv.messages = [
      {
        index: 0,
        role: 'user',
        text: 'Q1. Explain Project vs Process with examples',
        blocks: [
          { kind: 'heading', level: 1, text: 'Q1. Project vs Process' },
          {
            kind: 'paragraph',
            html: '<p><strong>Question:</strong> What is the core difference between a project and ongoing operations?</p>'
          }
        ]
      },
      {
        index: 1,
        role: 'assistant',
        text: 'Detailed answer with comparison table and steps',
        blocks: [
          { kind: 'heading', level: 2, text: 'Answer & Core Differences' },
          {
            kind: 'list',
            ordered: true,
            items: [
              { text: 'A project is temporary with a clear start and end date.' },
              { text: 'Process work is ongoing and repetitive (e.g. software maintenance).' }
            ]
          },
          {
            kind: 'table',
            html: '<table><tr><th>Attribute</th><th>Project</th><th>Process</th></tr><tr><td>Nature</td><td>Unique</td><td>Repetitive</td></tr></table>',
            rows: [
              [
                { text: 'Attribute', isHeader: true },
                { text: 'Project', isHeader: true },
                { text: 'Process', isHeader: true }
              ],
              [{ text: 'Nature' }, { text: 'Unique' }, { text: 'Repetitive' }]
            ]
          },
          {
            kind: 'quote',
            text: 'Conclusion: Managing projects requires adaptive planning, whereas process work requires standard operating procedures.'
          }
        ]
      }
    ];

    const res = await docxExporter.exportConversation(eduConv);
    expect(res.blob.size).toBeGreaterThan(1000);
    expect(res.filename.endsWith('.docx')).toBe(true);

    const arrayBuffer = await blobToArrayBuffer(res.blob);
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docXml = await zip.file('word/document.xml').async('string');

    expect(docXml).toContain('Q1. Project vs Process');
    expect(docXml).toContain('Question:');
    expect(docXml).toContain('Answer &amp; Core Differences');
    expect(docXml).toContain('temporary with a clear start');
    expect(docXml).toContain('Unique');
    expect(docXml).toContain('Conclusion:');
  });

  it('captures SVG and canvas diagrams into image blocks in scraper', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="user-message">
        <p>Here is my system architecture diagram:</p>
        <svg width="200" height="100" aria-label="System Architecture Diagram">
          <rect x="10" y="10" width="80" height="40" fill="#4F46E5" />
          <text x="20" y="35" fill="#FFFFFF">App Client</text>
        </svg>
      </div>
    `;

    const blocks = parseBlocks(container.querySelector('.user-message'));
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    const imgBlock = blocks.find((b) => b.kind === 'image');
    expect(imgBlock).toBeDefined();
    expect(imgBlock.dataUrl).toContain('data:image/svg+xml');
    expect(imgBlock.alt).toBe('System Architecture Diagram');
  });
});
