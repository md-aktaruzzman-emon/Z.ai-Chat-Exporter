/**
 * @file pii.js
 * Conservative local PII anonymizer.
 * Section 16.10 of the authoritative specification.
 */

// Email regex
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/g;

// International and North American phone number patterns
const PHONE_REGEX = /(?:\+\d{1,3}[-.\s]*)?(?:\(?\d{2,4}\)?[-.\s]*)?\d{3,4}[-.\s]*\d{3,4}\b/g;

// Standard API key patterns (OpenAI, AWS, Google, GitHub tokens, Generic 32+ hex/base64 strings)
const API_KEY_REGEX =
  /\b(?:sk-[a-zA-Z0-9]{20,48}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36}|AIza[0-9A-Za-z-_]{35})\b/g;

// Bearer tokens
const BEARER_REGEX = /\bBearer\s+([a-zA-Z0-9_\-.~+/=]{20,})\b/gi;

// JSON Web Tokens (header.payload.signature)
const JWT_REGEX = /\beyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g;

/**
 * Anonymizes PII in a given text string.
 * @param {string} text
 * @returns {string} Anonymized text
 */
export function anonymizePiiText(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    .replace(API_KEY_REGEX, '[API KEY REDACTED]')
    .replace(JWT_REGEX, '[TOKEN REDACTED]')
    .replace(BEARER_REGEX, 'Bearer [TOKEN REDACTED]')
    .replace(EMAIL_REGEX, '[EMAIL REDACTED]')
    .replace(PHONE_REGEX, (match) => {
      // Filter out small non-phone numbers like single digits or simple code arithmetic
      const digitsOnly = match.replace(/\D/g, '');
      if (digitsOnly.length >= 7 && digitsOnly.length <= 15) {
        return '[PHONE REDACTED]';
      }
      return match;
    });
}

/**
 * Deeply anonymizes a Conversation model without mutating the original object.
 * Rule R9: Never mutate the original scraped conversation.
 * @param {import('../core/conversation-model.js').Conversation} conversation
 * @returns {import('../core/conversation-model.js').Conversation} Cloned and scrubbed conversation
 */
export function anonymizeConversation(conversation) {
  if (!conversation) return conversation;

  const cloned = JSON.parse(JSON.stringify(conversation));
  cloned.title = anonymizePiiText(cloned.title);

  if (Array.isArray(cloned.messages)) {
    for (const msg of cloned.messages) {
      msg.text = anonymizePiiText(msg.text);
      msg.html = anonymizePiiText(msg.html);

      if (Array.isArray(msg.blocks)) {
        for (const block of msg.blocks) {
          if (block.text) block.text = anonymizePiiText(block.text);
          if (block.html) block.html = anonymizePiiText(block.html);
          if (block.code) block.code = anonymizePiiText(block.code);
          if (block.snippet) block.snippet = anonymizePiiText(block.snippet);
          if (block.title) block.title = anonymizePiiText(block.title);
        }
      }
    }
  }

  return cloned;
}
