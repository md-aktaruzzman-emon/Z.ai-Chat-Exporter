/**
 * @file generate-icons.cjs
 * Generates high-fidelity, production-grade PNG icons with smooth antialiased
 * geometric AI chat bubble & stylized 'Z' export emblem.
 * Pure Node.js with zlib and CRC32 — no external native dependencies required.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * Generates a PNG icon buffer with a rich, modern, anti-aliased glowing AI export badge.
 * @param {number} size
 * @returns {Buffer}
 */
function generateIconPng(size) {
  const width = size;
  const height = size;
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  const radius = size * 0.22; // rounded squircle corner radius
  const cx = size / 2;
  const cy = size / 2;

  // Color Palette
  // Background Gradient: Deep Royal Indigo (79, 70, 229) -> Electric Violet (147, 51, 234) -> Cyan glow accent
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter None

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;

      // Distance from squircle rounded rect
      const dx = Math.max(0, Math.abs(x + 0.5 - cx) - (cx - radius));
      const dy = Math.max(0, Math.abs(y + 0.5 - cy) - (cy - radius));
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Squircle Alpha (Antialiased edge)
      let alpha = 1.0;
      if (dist > radius) {
        alpha = 0;
      } else if (dist > radius - 1.0) {
        alpha = Math.max(0, Math.min(1, radius - dist));
      }

      if (alpha <= 0) {
        rawData[pixelOffset] = 0;
        rawData[pixelOffset + 1] = 0;
        rawData[pixelOffset + 2] = 0;
        rawData[pixelOffset + 3] = 0;
        continue;
      }

      // Background Gradient
      const t = (x + y) / (width + height);
      let bgR = Math.round(67 * (1 - t) + 147 * t);
      let bgG = Math.round(56 * (1 - t) + 51 * t);
      let bgB = Math.round(202 * (1 - t) + 234 * t);

      // Top-Left Ambient Highlight
      const highlightDist = Math.hypot(x - size * 0.25, y - size * 0.2);
      const highlight = Math.max(0, 1 - highlightDist / (size * 0.7)) * 0.35;
      bgR = Math.min(255, Math.round(bgR + highlight * 120));
      bgG = Math.min(255, Math.round(bgG + highlight * 140));
      bgB = Math.min(255, Math.round(bgB + highlight * 255));

      // Border Glow (Subtle Outer Ring)
      const borderDist = Math.abs(dist - (radius - 0.75));
      if (dist >= radius - 2.0 && dist <= radius) {
        const borderGlow = Math.max(0, 1 - borderDist / 1.5) * 0.4;
        bgR = Math.min(255, Math.round(bgR + borderGlow * 180));
        bgG = Math.min(255, Math.round(bgG + borderGlow * 200));
        bgB = Math.min(255, Math.round(bgB + borderGlow * 255));
      }

      // --- Draw Foreground Symbol: Modern AI Chat Bubble + Bold 'Z' + Export Arrow ---
      // Normalized coordinates [0..1]
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;

      let fgAlpha = 0;
      let fgR = 255;
      let fgG = 255;
      let fgB = 255;

      // 1. Stylized Geometric 'Z' Symbol in center
      // Top horizontal bar: y in [0.28, 0.38], x in [0.26, 0.74]
      // Diagonal bar: from (0.70, 0.35) to (0.30, 0.65)
      // Bottom horizontal bar: y in [0.62, 0.72], x in [0.26, 0.74]
      const inTopBar = ny >= 0.28 && ny <= 0.37 && nx >= 0.26 && nx <= 0.74;
      const inBottomBar = ny >= 0.63 && ny <= 0.72 && nx >= 0.26 && nx <= 0.74;

      // Diagonal segment distance
      // Line from (0.68, 0.34) to (0.32, 0.66)
      const p1x = 0.68, p1y = 0.34;
      const p2x = 0.32, p2y = 0.66;
      const segDx = p2x - p1x;
      const segDy = p2y - p1y;
      const segLenSq = segDx * segDx + segDy * segDy;
      let tSeg = ((nx - p1x) * segDx + (ny - p1y) * segDy) / segLenSq;
      tSeg = Math.max(0, Math.min(1, tSeg));
      const projX = p1x + tSeg * segDx;
      const projY = p1y + tSeg * segDy;
      const diagDist = Math.hypot(nx - projX, ny - projY);
      const inDiag = diagDist <= 0.065 && ny >= 0.32 && ny <= 0.68;

      // 2. Export Speed Arrow Accent on Top Right (nx: 0.68..0.84, ny: 0.18..0.34)
      // Arrow pointing up-right:
      const arrowDx = nx - 0.72;
      const arrowDy = ny - 0.26;
      const inArrowStem = Math.abs(arrowDx + arrowDy) <= 0.035 && arrowDx >= -0.06 && arrowDx <= 0.08 && arrowDy >= -0.08 && arrowDy <= 0.06;
      const inArrowHead1 = nx >= 0.68 && nx <= 0.80 && ny >= 0.18 && ny <= 0.22;
      const inArrowHead2 = nx >= 0.76 && nx <= 0.80 && ny >= 0.18 && ny <= 0.30;
      const inArrow = (inArrowStem || inArrowHead1 || inArrowHead2) && size >= 32;

      // 3. Small AI Sparkle Accent on bottom-left (size >= 32)
      const sparkDist = Math.hypot(nx - 0.24, ny - 0.24);
      const inSpark = sparkDist <= 0.035 && size >= 32;

      if (inTopBar || inBottomBar || inDiag || inArrow || inSpark) {
        fgAlpha = 1.0;
        // Cyan-to-white sheen on the Z emblem
        const zSheen = (nx + ny) * 0.5;
        fgR = Math.round(230 + zSheen * 25);
        fgG = Math.round(245 + (1 - zSheen) * 10);
        fgB = 255;
      }

      // Blend Foreground over Background
      if (fgAlpha > 0) {
        const outR = Math.round(fgR * fgAlpha + bgR * (1 - fgAlpha));
        const outG = Math.round(fgG * fgAlpha + bgG * (1 - fgAlpha));
        const outB = Math.round(fgB * fgAlpha + bgB * (1 - fgAlpha));
        rawData[pixelOffset] = outR;
        rawData[pixelOffset + 1] = outG;
        rawData[pixelOffset + 2] = outB;
        rawData[pixelOffset + 3] = Math.round(alpha * 255);
      } else {
        rawData[pixelOffset] = bgR;
        rawData[pixelOffset + 1] = bgG;
        rawData[pixelOffset + 2] = bgB;
        rawData[pixelOffset + 3] = Math.round(alpha * 255);
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
  ihdrData[8] = 8; // bit depth: 8
  ihdrData[9] = 6; // color type: 6 (RGBA)
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
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

const iconsDir = path.resolve(__dirname, '../src/assets/icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const sizes = [16, 32, 48, 128];
sizes.forEach((size) => {
  const buffer = generateIconPng(size);
  const filePath = path.join(iconsDir, `${size}.png`);
  fs.writeFileSync(filePath, buffer);
  console.log(`✓ Generated icon ${size}x${size} at ${filePath}`);
});
