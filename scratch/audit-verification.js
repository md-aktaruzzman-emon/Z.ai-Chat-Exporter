import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { createRichConversationFixture } from '../tests/fixtures/rich-conversation.js';
import * as vectorPdfExporter from '../src/exporters/pdf-vector.js';
import * as docxExporter from '../src/exporters/docx.js';

async function performAuditVerification() {
  console.log('=== FINAL VERIFICATION AUDIT RUNNER ===');
  const fixture = createRichConversationFixture();

  // Add exam prep message with attachments & Bengali text to fixture for comprehensive audit
  fixture.messages.push(
    {
      index: 4,
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
      index: 5,
      role: 'assistant',
      blocks: [
        { kind: 'heading', level: 2, text: 'Topic 1: The Analysis Phase' },
        { kind: 'paragraph', text: 'The Analysis Phase is a stage of the SDLC where we decide WHAT the new system should do -- not HOW it will do it.' },
        { kind: 'paragraph', text: 'বাংলায় শেখো: "As-Is" মানে এখন যে সিস্টেমটা আছে। "To-Be" মানে ভবিষ্যতে যে নতুন সিস্টেমটা হবে।' },
        { kind: 'heading', level: 3, text: 'Exam Answer: What is a Requirement?' },
        { kind: 'paragraph', text: 'A requirement is a statement of what the system must do, or a statement of characteristics the system must have.' }
      ]
    }
  );

  // 1. Export PDF
  console.log('\n[1/3] Exporting Vector PDF...');
  const pdfRes = await vectorPdfExporter.exportConversation(fixture, {
    pageFormat: 'a4',
    margin: 'normal',
    fontSize: 10,
    headerText: 'extrention z'
  });
  const pdfBuffer = Buffer.from(await pdfRes.blob.arrayBuffer());

  // 2. Export DOCX
  console.log('[2/3] Exporting Word DOCX...');
  const docxRes = await docxExporter.exportConversation(fixture);
  const docxBuffer = Buffer.from(await docxRes.blob.arrayBuffer());

  // Save artifacts
  const outDir = path.resolve('dist/audit');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const pdfPath = path.join(outDir, 'audit-output.pdf');
  const docxPath = path.join(outDir, 'audit-output.docx');
  fs.writeFileSync(pdfPath, pdfBuffer);
  fs.writeFileSync(docxPath, docxBuffer);
  console.log(`✓ Saved PDF to ${pdfPath} (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);
  console.log(`✓ Saved DOCX to ${docxPath} (${(docxBuffer.length / 1024).toFixed(1)} KB)`);

  // 3. Inspect PDF Structure using pdf-lib
  console.log('\n[3/3] Inspecting PDF & DOCX Structure...');
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();
  console.log(`  PDF Page Count: ${pageCount} pages`);
  const headerMagic = pdfBuffer.toString('utf8', 0, 5);
  console.log(`  PDF Valid Header Magic: ${headerMagic} (%PDF-)`);

  // 4. Inspect DOCX ZIP Structure using JSZip
  const zip = await JSZip.loadAsync(docxBuffer);
  const docXml = await zip.file('word/document.xml').async('string');

  const hasTableTags = docXml.includes('<w:tbl>') && docXml.includes('<w:tr') && docXml.includes('<w:tc>');
  const hasAttachmentText = docXml.includes('CSE 305 Lecture on Requirement Determination.pdf');
  const hasBengaliText = docXml.includes('বাংলায় শেখো');
  const hasUserHeader = docXml.includes('👤 You');
  const hasCodeSpaces = docXml.includes('    def __init__(self, node_id: str');

  console.log(`  DOCX XML Has Native Tables (<w:tbl>, <w:tr>, <w:tc>): ${hasTableTags}`);
  console.log(`  DOCX XML Has Attachment Card Text: ${hasAttachmentText}`);
  console.log(`  DOCX XML Has Bengali Unicode Text: ${hasBengaliText}`);
  console.log(`  DOCX XML Has User Card Header ('👤 You'): ${hasUserHeader}`);
  console.log(`  DOCX XML Preserves Code 4-Space Indentation: ${hasCodeSpaces}`);

  console.log('\n=== AUDIT VERIFICATION COMPLETED ===');
}

performAuditVerification().catch((err) => {
  console.error('Audit Verification Error:', err);
  process.exit(1);
});
