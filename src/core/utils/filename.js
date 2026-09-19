/**
 * @file filename.js
 * Filename template engine and sanitizer adhering to Section 10 rules.
 */

const ILLEGAL_CHARS_REGEX = /[\\/:*?"<>|]/g;
const MAX_BASE_LENGTH = 120;

/**
 * Pads a number with leading zero.
 * @param {number} num
 * @returns {string}
 */
function pad(num) {
  return num < 10 ? `0${num}` : `${num}`;
}

/**
 * Returns formatted date strings YYYY-MM-DD and HH-mm-ss.
 * @param {number|Date} [timestamp]
 * @returns {{ date: string, time: string }}
 */
export function formatDateTime(timestamp) {
  const d = timestamp ? new Date(timestamp) : new Date();
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  const secs = pad(d.getSeconds());

  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}-${mins}-${secs}`
  };
}

/**
 * Sanitizes and formats a filename from a template string.
 *
 * Supported tokens:
 * {{title}} - conversation title
 * {{date}} - YYYY-MM-DD
 * {{time}} - HH-mm-ss
 * {{model}} - model name
 * {{format}} - format extension without dot
 *
 * @param {Object} options
 * @param {string} [options.template] - Filename template (default: "{{title}}_{{date}}")
 * @param {string} options.title - Conversation title
 * @param {string} options.format - File extension without dot (e.g. "pdf", "md")
 * @param {string} [options.model] - Model name (e.g. "Z.ai")
 * @param {number} [options.timestamp] - Timestamp
 * @param {number} [options.collisionIndex] - Optional deduplication index (e.g. 2 for " (2)")
 * @returns {string} Fully qualified filename with extension
 */
export function generateFilename({
  template = '{{title}}_{{date}}',
  title = 'Untitled Conversation',
  format = 'txt',
  model = 'Z.ai',
  timestamp = Date.now(),
  collisionIndex = 0
}) {
  const { date, time } = formatDateTime(timestamp);

  // Clean raw inputs
  const cleanTitle = (title || 'Untitled Conversation').replace(ILLEGAL_CHARS_REGEX, '').trim();
  const cleanModel = (model || 'Z.ai').replace(ILLEGAL_CHARS_REGEX, '').trim();
  const cleanFormat = (format || 'txt').toLowerCase().replace(/[^a-z0-9]/g, '');

  let baseName = template
    .replace(/\{\{title\}\}/g, cleanTitle)
    .replace(/\{\{date\}\}/g, date)
    .replace(/\{\{time\}\}/g, time)
    .replace(/\{\{model\}\}/g, cleanModel)
    .replace(/\{\{format\}\}/g, cleanFormat);

  // Remove illegal characters and collapse repeated whitespace
  baseName = baseName.replace(ILLEGAL_CHARS_REGEX, '').replace(/\s+/g, ' ').trim();

  if (!baseName) {
    baseName = `conversation_${date}`;
  }

  // Cap base name length at 120 characters before collision index and extension
  if (baseName.length > MAX_BASE_LENGTH) {
    baseName = baseName.substring(0, MAX_BASE_LENGTH).trim();
  }

  // Add deduplication suffix if collisionIndex > 1
  if (collisionIndex > 1) {
    baseName = `${baseName} (${collisionIndex})`;
  }

  return `${baseName}.${cleanFormat}`;
}
