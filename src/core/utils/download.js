/**
 * @file download.js
 * Browser download helpers and object URL lifecycle management.
 * Section 23 of the authoritative specification.
 */

/**
 * Initiates a browser download from a Blob or Data URL.
 * Automatically handles object URL revocation to prevent memory leaks.
 *
 * @param {Object} params
 * @param {Blob|string} params.data - Blob or dataUrl string
 * @param {string} params.filename - Sanitized destination filename
 * @param {string} [params.mime] - MIME type
 * @returns {Promise<void>}
 */
export async function triggerDownload({ data, filename, mime: _mime }) {
  let url = '';
  let shouldRevoke = false;

  if (typeof data === 'string') {
    url = data;
  } else if (data instanceof Blob) {
    url = URL.createObjectURL(data);
    shouldRevoke = true;
  } else {
    throw new Error('DOWNLOAD_FAILED: Invalid data type provided for download');
  }

  try {
    if (
      typeof chrome !== 'undefined' &&
      chrome.downloads &&
      typeof chrome.downloads.download === 'function'
    ) {
      // In extension context with downloads permission
      await new Promise((resolve, reject) => {
        chrome.downloads.download(
          {
            url,
            filename,
            saveAs: true
          },
          (downloadId) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(downloadId);
            }
          }
        );
      });
    } else if (typeof document !== 'undefined') {
      // DOM-based anchor click fallback
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } else {
      throw new Error('DOWNLOAD_FAILED: No DOM or Chrome downloads API available');
    }
  } finally {
    if (shouldRevoke) {
      // Small timeout before revoking so Chrome downloads API / browser finishes reading the blob URL
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore revocation errors
        }
      }, 60000);
    }
  }
}

/**
 * Converts a Blob to a Base64 data URL.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(/** @type {string} */ (reader.result));
    reader.onerror = () => reject(new Error('Failed to convert Blob to Data URL'));
    reader.readAsDataURL(blob);
  });
}
