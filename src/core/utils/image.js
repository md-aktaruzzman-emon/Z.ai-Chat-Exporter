/**
 * @file image.js
 * Universal image and diagram conversion utilities.
 * Rasterizes SVGs, extracts Canvas data URLs, and prepares bytes for PDF and DOCX embedding.
 */

/**
 * Converts any image source (PNG, JPEG, SVG dataUrl, blob, or HTTP URL)
 * into a binary Uint8Array and identifies if it's PNG or JPEG.
 * @param {string} imgSrc
 * @returns {Promise<{ bytes: Uint8Array, isPng: boolean }|null>}
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
      return { bytes, isPng: true };
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
      return { bytes, isPng: false };
    } catch (e) {
      console.warn('[ImageUtil] Failed to decode JPEG base64:', e);
    }
  }

  // 3. SVG Diagram / Graphic (data:image/svg+xml or raw <svg>)
  if (imgSrc.startsWith('data:image/svg+xml') || imgSrc.trim().startsWith('<svg')) {
    if (typeof document !== 'undefined') {
      try {
        let svgStr = imgSrc;
        if (imgSrc.startsWith('data:image/svg+xml;utf8,')) {
          svgStr = decodeURIComponent(imgSrc.substring('data:image/svg+xml;utf8,'.length));
        } else if (imgSrc.startsWith('data:image/svg+xml;base64,')) {
          svgStr = atobFn(imgSrc.substring('data:image/svg+xml;base64,'.length));
        }

        if (!svgStr.includes('xmlns=')) {
          svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        }

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
              const width = Math.max(img.naturalWidth || img.width || 800, 300);
              const height = Math.max(img.naturalHeight || img.height || 450, 150);
              const scale = 2; // 2x for crisp high-DPI export
              canvas.width = width * scale;
              canvas.height = height * scale;

              const ctx = canvas.getContext('2d');
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
              resolve({ bytes, isPng: true });
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
  }

  // 4. HTTP / Blob URLs
  if (typeof fetch === 'function' && (imgSrc.startsWith('http') || imgSrc.startsWith('blob:'))) {
    try {
      const res = await fetch(imgSrc);
      const buffer = await res.arrayBuffer();
      const contentType = res.headers.get('content-type') || '';
      return {
        bytes: new Uint8Array(buffer),
        isPng: contentType.includes('png') || imgSrc.toLowerCase().endsWith('.png')
      };
    } catch (e) {
      console.warn('[ImageUtil] Fetch error for image URL:', e);
    }
  }

  return null;
}

/**
 * Synchronously or asynchronously converts an in-DOM SVG element into a PNG data URL.
 * @param {SVGElement} svgEl
 * @returns {Promise<string>}
 */
export async function rasterizeSvgElementToPng(svgEl) {
  if (!svgEl || typeof document === 'undefined') return '';

  try {
    const rect = svgEl.getBoundingClientRect?.() || {};
    const width = Math.max(rect.width || 0, parseInt(svgEl.getAttribute('width') || '0', 10), 400);
    const height = Math.max(rect.height || 0, parseInt(svgEl.getAttribute('height') || '0', 10), 250);

    let svgStr = svgEl.outerHTML;
    if (!svgStr.includes('xmlns=')) {
      svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }

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
          const scale = 2; // Crisp resolution
          canvas.width = width * scale;
          canvas.height = height * scale;

          const ctx = canvas.getContext('2d');
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
