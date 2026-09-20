/**
 * @file table-layout.js
 * Universal table measurement, column width distribution, and multiline layout engine.
 * Eliminates fixed row heights and arbitrary text truncation across PDF and DOCX.
 */

/**
 * @typedef {Object} TableCellData
 * @property {string} text
 * @property {string} [html]
 * @property {boolean} [isHeader]
 * @property {number} [colspan=1]
 * @property {number} [rowspan=1]
 * @property {'left'|'center'|'right'} [align='left']
 * @property {string[]} [lines]
 * @property {number} [width]
 * @property {number} [height]
 */

/**
 * Normalizes table block into standard rows of TableCellData.
 * @param {import('./conversation-model.js').TableBlock} block
 * @returns {TableCellData[][]}
 */
export function normalizeTableRows(block) {
  if (Array.isArray(block.rows) && block.rows.length > 0) {
    return block.rows.map((row, rIdx) =>
      row.map((cell) => ({
        text: typeof cell.text === 'string' ? cell.text.trim() : '',
        html: cell.html || '',
        isHeader: Boolean(cell.isHeader || rIdx === 0),
        colspan: parseInt(String(cell.colspan || '1'), 10) || 1,
        rowspan: parseInt(String(cell.rowspan || '1'), 10) || 1,
        align: cell.align || 'left'
      }))
    );
  }

  if (block.html && typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(block.html, 'text/html');
      const trs = Array.from(doc.querySelectorAll('tr'));
      if (trs.length > 0) {
        return trs.map((tr, rIdx) => {
          const cells = Array.from(tr.querySelectorAll('th, td'));
          return cells.map((c) => ({
            text: c.textContent?.trim() || '',
            html: c.innerHTML || '',
            isHeader: c.tagName.toLowerCase() === 'th' || rIdx === 0,
            colspan: parseInt(c.getAttribute('colspan') || '1', 10) || 1,
            rowspan: parseInt(c.getAttribute('rowspan') || '1', 10) || 1,
            align: /** @type {'left'|'center'|'right'} */ (c.getAttribute('align') || 'left')
          }));
        });
      }
    } catch (e) {
      console.warn('[TableLayout] Error parsing table HTML:', e);
    }
  }

  return [];
}

/**
 * Calculates optimal column widths given total available content width.
 * Allocates column widths based on cell text lengths with min and max bounds.
 * @param {TableCellData[][]} rows
 * @param {number} totalWidth
 * @returns {number[]} Array of column widths summing to totalWidth
 */
export function computeColumnWidths(rows, totalWidth) {
  if (!rows || rows.length === 0) return [];
  const numCols = Math.max(...rows.map((r) => r.length), 1);
  if (numCols === 1) return [totalWidth];

  // Find max text length per column
  const colLengths = new Array(numCols).fill(1);
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell.colspan && cell.colspan > 1) continue; // skip spanning cells for col width weight
      const len = (cell.text || '').length;
      if (len > colLengths[c]) {
        colLengths[c] = len;
      }
    }
  }

  // Calculate weights (using square root to prevent ultra-wide outliers from starving short columns)
  const weights = colLengths.map((len) => Math.max(Math.sqrt(len), 2));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  // Distribute total width
  const minColWidth = Math.min(50, totalWidth / numCols);
  let widths = weights.map((w) => (w / totalWeight) * totalWidth);

  // Apply min width constraint
  widths = widths.map((w) => Math.max(w, minColWidth));
  const newTotal = widths.reduce((sum, w) => sum + w, 0);
  const scale = totalWidth / newTotal;
  return widths.map((w) => w * scale);
}

/**
 * Splits text into lines given a max width and font measurement function.
 * @param {string} text
 * @param {number} maxWidth
 * @param {(str: string) => number} measureFn
 * @returns {string[]}
 */
export function wrapCellLines(text, maxWidth, measureFn) {
  if (!text) return [''];
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    let word = words[i];
    if (!word) continue;

    // Handle exceptionally long words that exceed column width
    while (measureFn(word) > maxWidth && word.length > 2) {
      let cut = Math.max(1, Math.floor(word.length * 0.7));
      while (cut > 1 && measureFn(word.substring(0, cut)) > maxWidth) {
        cut--;
      }
      const chunk = word.substring(0, cut);
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }
      lines.push(chunk);
      word = word.substring(cut);
    }

    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (measureFn(testLine) <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}
