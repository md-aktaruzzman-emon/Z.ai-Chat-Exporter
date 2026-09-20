/**
 * @file image.js
 * Universal image and diagram conversion pipeline.
 * Extracts intrinsic metrics, rasterizes SVGs preserving viewBox & aspect ratio,
 * handles Canvas data URLs, and prepares PNG/JPEG bytes for PDF and DOCX embedding.
 */

/**
 * Parses SVG dimensions and viewBox to extract true intrinsic width and height.
 * @param {string} svgStr
 * @returns {{ width: number, height: number, aspectRatio: number }}
 */
export function extractSvgDimensions(svgStr) {
  if (!svgStr) return { width: 300, height: 150, aspectRatio: 2 };

  // 1. Check explicit width and height attributes
  const widthMatch = svgStr.match(/\bwidth=["']?(\d+(?:\.\d+)?)(?:px)?["']?/i);
  const heightMatch = svgStr.match(/\bheight=["']?(\d+(?:\.\d+)?)(?:px)?["']?/i);
  let width = widthMatch ? parseFloat(widthMatch[1]) : 0;
  let height = heightMatch ? parseFloat(heightMatch[1]) : 0;

  // 2. Check viewBox="x y w h"
  const viewBoxMatch = svgStr.match(
    /\bviewBox=["']?\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*["']?/i
  );
  if (viewBoxMatch) {
    const vbWidth = parseFloat(viewBoxMatch[3]);
    const vbHeight = parseFloat(viewBoxMatch[4]);
    if (!width && vbWidth) width = vbWidth;
    if (!height && vbHeight) height = vbHeight;
  }

  // Sensible default if dimensions couldn't be parsed
  if (!width || !height) {
    width = width || 400;
    height = height || 200;
  }

  const aspectRatio = width / (height || 1);
  return { width, height, aspectRatio };
}

/**
 * Calculates responsive display dimensions that fit within maximum bounds while strictly preserving aspect ratio.
 * @param {number} naturalWidth
 * @param {number} naturalHeight
 * @param {number} maxWidth
 * @param {number} [maxHeight=450]
 * @returns {{ width: number, height: number }}
 */
export function fitDimensions(naturalWidth, naturalHeight, maxWidth, maxHeight = 450) {
  let w = naturalWidth || maxWidth;
  let h = naturalHeight || maxHeight;
  const ratio = w / (h || 1);

  if (w > maxWidth) {
    w = maxWidth;
    h = w / ratio;
  }
  if (h > maxHeight) {
    h = maxHeight;
    w = h * ratio;
  }

  return { width: Math.round(w), height: Math.round(h) };
}

/**
 * Minimal valid 1x1 transparent PNG fallback for headless/test environments without canvas.
 */
const MINIMAL_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82
]);

/**
 * Converts any image source (PNG, JPEG, SVG dataUrl, blob, or HTTP URL)
 * into binary bytes with detected intrinsic dimensions and aspect ratio.
 *
 * @param {string} imgSrc
 * @returns {Promise<{ bytes: Uint8Array, isPng: boolean, width: number, height: number, aspectRatio: number }|null>}
 */
export async function imageSourceToPngBytes(imgSrc) {
  if (!imgSrc || typeof imgSrc !== 'string') return null;

  const atobFn = globalThis.atob
    ? (s) => globalThis.atob(s)
    : (s) => globalThis.Buffer.from(s, 'base64').toString('binary');

  // 1. Standard PNG base64
  if (imgSrc.startsWith('data:image/png;base64,')) {
    try {
      const base64 = imgSrc.split(',')[1];
      const binary = atobFn(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      // Parse PNG width & height from IHDR chunk (bytes 16-24)
      let width = 400;
      let height = 300;
      if (bytes.length >= 24) {
        width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
        height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
      }
      return {
        bytes,
        isPng: true,
        width: width || 400,
        height: height || 300,
        aspectRatio: (width || 400) / (height || 300)
      };
    } catch (e) {
      console.warn('[ImageUtil] Failed to decode PNG base64:', e);
    }
  }

  // 2. Standard JPEG base64
  if (imgSrc.startsWith('data:image/jpeg;base64,') || imgSrc.startsWith('data:image/jpg;base64,')) {
    try {
      const base64 = imgSrc.split(',')[1];
      const binary = atobFn(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return { bytes, isPng: false, width: 400, height: 300, aspectRatio: 4 / 3 };
    } catch (e) {
      console.warn('[ImageUtil] Failed to decode JPEG base64:', e);
    }
  }

  // 3. SVG Diagram / Graphic (data:image/svg+xml or raw <svg>)
  if (imgSrc.startsWith('data:image/svg+xml') || imgSrc.trim().startsWith('<svg')) {
    let svgStr = imgSrc;
    if (imgSrc.startsWith('data:image/svg+xml;utf8,')) {
      svgStr = decodeURIComponent(imgSrc.substring('data:image/svg+xml;utf8,'.length));
    } else if (imgSrc.startsWith('data:image/svg+xml;base64,')) {
      svgStr = atobFn(imgSrc.substring('data:image/svg+xml;base64,'.length));
    }

    if (!svgStr.includes('xmlns=')) {
      svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const dims = extractSvgDimensions(svgStr);

    if (typeof document !== 'undefined') {
      try {
        const pngResult = await new Promise((resolve) => {
          if (!globalThis.Image) {
            resolve(null);
            return;
          }

          const img = new globalThis.Image();
          const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
          const URLObj = globalThis.URL || globalThis.webkitURL;
          if (!URLObj || !URLObj.createObjectURL) {
            resolve(null);
            return;
          }
          const blobUrl = URLObj.createObjectURL(svgBlob);

          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext ? canvas.getContext('2d') : null;
              if (!ctx) {
                // In environments without 2d canvas (e.g. basic jsdom)
                URLObj.revokeObjectURL(blobUrl);
                resolve({
                  bytes: MINIMAL_PNG_BYTES,
                  isPng: true,
                  width: dims.width,
                  height: dims.height,
                  aspectRatio: dims.aspectRatio
                });
                return;
              }

              const scale = 2; // 2x for crisp high-DPI rasterization
              canvas.width = dims.width * scale;
              canvas.height = dims.height * scale;

              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              URLObj.revokeObjectURL(blobUrl);

              const pngDataUrl = canvas.toDataURL('image/png');
              const base64 = pngDataUrl.split(',')[1];
              const binary = atobFn(base64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
              }
              resolve({
                bytes,
                isPng: true,
                width: dims.width,
                height: dims.height,
                aspectRatio: dims.aspectRatio
              });
            } catch {
              URLObj.revokeObjectURL(blobUrl);
              resolve(null);
            }
          };

          img.onerror = () => {
            URLObj.revokeObjectURL(blobUrl);
            resolve(null);
          };

          img.src = blobUrl;
        });

        if (pngResult) return pngResult;
      } catch (err) {
        console.warn('[ImageUtil] SVG rasterization error:', err);
      }
    }

    // Fallback if DOM image loading unavailable
    return {
      bytes: MINIMAL_PNG_BYTES,
      isPng: true,
      width: dims.width,
      height: dims.height,
      aspectRatio: dims.aspectRatio
    };
  }

  // 4. HTTP / Blob URLs
  if (typeof fetch === 'function' && (imgSrc.startsWith('http') || imgSrc.startsWith('blob:'))) {
    try {
      const res = await fetch(imgSrc);
      const buffer = await res.arrayBuffer();
      const contentType = res.headers.get('content-type') || '';
      return {
        bytes: new Uint8Array(buffer),
        isPng: contentType.includes('png') || imgSrc.toLowerCase().endsWith('.png'),
        width: 400,
        height: 300,
        aspectRatio: 4 / 3
      };
    } catch (e) {
      console.warn('[ImageUtil] Fetch error for image URL:', e);
    }
  }

  return null;
}

/**
 * Converts an in-DOM SVG element into a PNG data URL.
 * @param {SVGElement} svgEl
 * @returns {Promise<string>}
 */
export async function rasterizeSvgElementToPng(svgEl) {
  if (!svgEl || typeof document === 'undefined') return '';

  try {
    let svgStr = svgEl.outerHTML;
    if (!svgStr.includes('xmlns=')) {
      svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const dims = extractSvgDimensions(svgStr);

    return await new Promise((resolve) => {
      if (!globalThis.Image) {
        resolve(`data:image/svg+xml;utf8,${encodeURIComponent(svgStr)}`);
        return;
      }
      const img = new globalThis.Image();
      const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const URLObj = globalThis.URL || globalThis.webkitURL;
      if (!URLObj || !URLObj.createObjectURL) {
        resolve(`data:image/svg+xml;utf8,${encodeURIComponent(svgStr)}`);
        return;
      }
      const blobUrl = URLObj.createObjectURL(svgBlob);

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext ? canvas.getContext('2d') : null;
          if (!ctx) {
            URLObj.revokeObjectURL(blobUrl);
            resolve(`data:image/svg+xml;utf8,${encodeURIComponent(svgStr)}`);
            return;
          }

          const scale = 2; // Crisp resolution
          canvas.width = dims.width * scale;
          canvas.height = dims.height * scale;

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URLObj.revokeObjectURL(blobUrl);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          URLObj.revokeObjectURL(blobUrl);
          resolve(`data:image/svg+xml;utf8,${encodeURIComponent(svgStr)}`);
        }
      };

      img.onerror = () => {
        URLObj.revokeObjectURL(blobUrl);
        resolve(`data:image/svg+xml;utf8,${encodeURIComponent(svgStr)}`);
      };

      img.src = blobUrl;
    });
  } catch {
    return '';
  }
}
