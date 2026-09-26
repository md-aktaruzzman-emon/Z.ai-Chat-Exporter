import fs from 'fs';
import path from 'path';
import { createRichConversationFixture } from '../tests/fixtures/rich-conversation.js';
import * as vectorPdfExporter from '../src/exporters/pdf-vector.js';
import * as docxExporter from '../src/exporters/docx.js';

async function generateSampleFiles() {
  console.log('Generating sample PDF and DOCX output files with Paged Layout Engine...');
  const fixture = createRichConversationFixture();

  const pdfRes = await vectorPdfExporter.exportConversation(fixture, {
    pageFormat: 'a4',
    margin: 'normal',
    fontSize: 10,
    includeToc: true
  });

  const docxRes = await docxExporter.exportConversation(fixture);

  const outDir = path.resolve('dist/samples');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const pdfBuffer = Buffer.from(await pdfRes.blob.arrayBuffer());
  const docxBuffer = Buffer.from(await docxRes.blob.arrayBuffer());

  const pdfPath = path.join(outDir, 'sample-layout-engine.pdf');
  const docxPath = path.join(outDir, 'sample-layout-engine.docx');

  fs.writeFileSync(pdfPath, pdfBuffer);
  fs.writeFileSync(docxPath, docxBuffer);

  console.log(`✓ Sample PDF written to ${pdfPath} (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);
  console.log(`✓ Sample DOCX written to ${docxPath} (${(docxBuffer.length / 1024).toFixed(1)} KB)`);
}

generateSampleFiles().catch(err => {
  console.error('Error generating sample files:', err);
  process.exit(1);
});
