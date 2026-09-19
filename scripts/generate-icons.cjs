/**
 * Generates valid PNG icon assets using pure Node.js Buffer (PNG format specification).
 * No external canvas or native dependencies required.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPng(width, height, r, g, b, a = 255) {
  // Raw RGBA scanlines: 1 filter byte (0 = None) + width * 4 bytes
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      // Draw a pleasant gradient or border
      const isBorder = x === 0 || x === width - 1 || y === 0 || y === height - 1;
      if (isBorder) {
        rawData[pixelOffset] = Math.max(0, r - 40);
        rawData[pixelOffset + 1] = Math.max(0, g - 40);
        rawData[pixelOffset + 2] = Math.max(0, b - 40);
        rawData[pixelOffset + 3] = a;
      } else {
        rawData[pixelOffset] = r;
        rawData[pixelOffset + 1] = g;
        rawData[pixelOffset + 2] = b;
        rawData[pixelOffset + 3] = a;
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth: 8
  ihdrData[9] = 6;  // color type: 6 (RGBA)
  ihdrData[10] = 0; // compression: deflate
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace: none

  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  // CRC32 over type + data
  const crcInput = chunk.subarray(4, 8 + len);
  const crc = crc32(crcInput);
  chunk.writeUInt32BE(crc, 8 + len);

  return chunk;
}

// Standard CRC32 table
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

const iconsDir = path.resolve(__dirname, '../src/assets/icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Primary brand colors: Indigo/Purple (79, 70, 229)
const sizes = [16, 32, 48, 128];
sizes.forEach(size => {
  const buffer = createPng(size, size, 79, 70, 229, 255);
  const filePath = path.join(iconsDir, `${size}.png`);
  fs.writeFileSync(filePath, buffer);
  console.log(`Created icon: ${filePath} (${buffer.length} bytes)`);
});
