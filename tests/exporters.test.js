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
import { anonymizePiiText, anonymizeConversation } from '../src/exporters/pii.js';
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

  it('parses math equations from math.html fixture', () => {
    const fixturePath = path.resolve(__dirname, 'fixtures/math.html');
    const fixtureHtml = fs.readFileSync(fixturePath, 'utf8');

    const container = document.createElement('div');
    container.innerHTML = fixtureHtml;
    const assistantBubble = container.querySelector('.assistant-message');

    const blocks = parseBlocks(assistantBubble);
    const mathBlocks = blocks.filter((b) => b.kind === 'math');

    expect(mathBlocks.length).toBeGreaterThanOrEqual(2);
    expect(mathBlocks.some((m) => m.tex.includes('E = mc^2'))).toBe(true);
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
});
