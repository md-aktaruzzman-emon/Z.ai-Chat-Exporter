import { exportConversation as exportPdfVector } from '../src/exporters/pdf-vector.js';
import { exportConversation as exportDocx } from '../src/exporters/docx.js';
import { exportConversation as exportHtml } from '../src/exporters/html.js';
import { exportConversation as exportMd } from '../src/exporters/markdown.js';
import { exportConversation as exportJson } from '../src/exporters/json.js';
import { exportConversation as exportTxt } from '../src/exporters/txt.js';
import { exportConversation as exportCsv } from '../src/exporters/csv.js';

const sampleConv = {
  schemaVersion: 2,
  id: 'conv-test-123',
  title: 'Z.ai Test Chat: Bangla & Special Characters বাংলা 😊 🚀 & < > " \' / \\',
  model: 'GLM-4 / Z.ai Pro',
  theme: 'dark',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  messages: [
    {
      index: 0,
      role: 'user',
      text: 'How do I build a Chrome Extension in Manifest V3? Show me code & math: $E = mc^2$ and Bangla: কেমন আছেন?',
      blocks: [
        { kind: 'paragraph', html: '<p>How do I build a Chrome Extension in Manifest V3? Show me code & math: $E = mc^2$ and Bangla: কেমন আছেন?</p>' }
      ]
    },
    {
      index: 1,
      role: 'assistant',
      text: 'Here is how you do it:\n\n```javascript\nconsole.log("Hello Z.ai!");\nconst x = 10;\n```\n\nAnd a table:\n\nCol 1 | Col 2\n---|---\nVal A | Val B',
      blocks: [
        { kind: 'thinking', text: 'The user is asking about Chrome Extensions MV3...' },
        { kind: 'paragraph', html: '<p>Here is how you do it:</p>' },
        { kind: 'code', language: 'javascript', code: 'console.log("Hello Z.ai!");\nconst x = 10;\nfunction test() {\n  return true;\n}' },
        { kind: 'math', tex: '\\sum_{i=1}^n i = \\frac{n(n+1)}{2}', displayMode: true },
        { kind: 'citation', title: 'Chrome Developers', url: 'https://developer.chrome.com' },
        { kind: 'table', html: '<table><thead><tr><th>Header 1</th><th>Header 2</th></tr></thead><tbody><tr><td>Data 1</td><td>Data 2</td></tr></tbody></table>' }
      ]
    }
  ]
};

async function run() {
  console.log('Testing PDF Vector...');
  try {
    const pdfRes = await exportPdfVector(sampleConv, { theme: 'auto', pageFormat: 'a4' });
    console.log('PDF Vector Success! Size:', pdfRes.blob?.size, 'Filename:', pdfRes.filename);
  } catch (e) {
    console.error('PDF Vector FAILED:', e);
  }

  console.log('Testing DOCX...');
  try {
    const docxRes = await exportDocx(sampleConv, { anonymizePii: false });
    console.log('DOCX Success! Size:', docxRes.blob?.size, 'Filename:', docxRes.filename);
  } catch (e) {
    console.error('DOCX FAILED:', e);
  }

  console.log('Testing HTML...');
  try {
    const htmlRes = await exportHtml(sampleConv, { theme: 'auto' });
    console.log('HTML Success! Size:', htmlRes.blob?.size, 'Filename:', htmlRes.filename);
  } catch (e) {
    console.error('HTML FAILED:', e);
  }

  console.log('Testing Markdown...');
  try {
    const mdRes = await exportMd(sampleConv, { preset: 'github' });
    console.log('Markdown Success! Size:', mdRes.blob?.size, 'Filename:', mdRes.filename);
  } catch (e) {
    console.error('Markdown FAILED:', e);
  }

  console.log('Testing JSON...');
  try {
    const jsonRes = await exportJson(sampleConv);
    console.log('JSON Success! Size:', jsonRes.blob?.size, 'Filename:', jsonRes.filename);
  } catch (e) {
    console.error('JSON FAILED:', e);
  }

  console.log('Testing TXT...');
  try {
    const txtRes = await exportTxt(sampleConv);
    console.log('TXT Success! Size:', txtRes.blob?.size, 'Filename:', txtRes.filename);
  } catch (e) {
    console.error('TXT FAILED:', e);
  }

  console.log('Testing CSV...');
  try {
    const csvRes = await exportCsv(sampleConv);
    console.log('CSV Success! Size:', csvRes.blob?.size, 'Filename:', csvRes.filename);
  } catch (e) {
    console.error('CSV FAILED:', e);
  }
}

run();
