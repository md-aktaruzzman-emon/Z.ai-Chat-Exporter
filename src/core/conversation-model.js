/**
 * @file conversation-model.js
 * Authoritative data model for Z.ai conversation export (Schema Version 2).
 */

export const SCHEMA_VERSION = 2;

/**
 * @typedef {'paragraph'|'heading'|'code'|'table'|'image'|'math'|'list'|'quote'|'thinking'|'artifact'|'citation'|'toolCall'|'searchResult'|'attachment'} BlockKind
 *
 * @typedef {Object} ParagraphBlock
 * @property {'paragraph'} kind
 * @property {string} [text]
 * @property {string} html
 *
 * @typedef {Object} HeadingBlock
 * @property {'heading'} kind
 * @property {1|2|3|4|5|6} level
 * @property {string} text
 * @property {string} [html]
 *
 * @typedef {Object} CodeBlock
 * @property {'code'} kind
 * @property {string} language
 * @property {string} code
 * @property {string} [highlightedHtml]
 *
 * @typedef {Object} TableBlock
 * @property {'table'} kind
 * @property {string} html
 * @property {Array<Array<{text: string, html?: string, isHeader?: boolean, colspan?: number, rowspan?: number, align?: string}>>} [rows]
 *
 * @typedef {Object} ImageBlock
 * @property {'image'} kind
 * @property {string} src
 * @property {string} [dataUrl]
 * @property {string} alt
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} [aspectRatio]
 * @property {string} [caption]
 *
 * @typedef {Object} MathBlock
 * @property {'math'} kind
 * @property {string} tex
 * @property {boolean} displayMode
 * @property {string} [html]
 * @property {string} [mathMl]
 *
 * @typedef {Object} ListBlock
 * @property {'list'} kind
 * @property {boolean} ordered
 * @property {string} html
 * @property {Array<{text: string, html?: string}>} [items]
 *
 * @typedef {Object} QuoteBlock
 * @property {'quote'} kind
 * @property {string} html
 *
 * @typedef {Object} ThinkingBlock
 * @property {'thinking'} kind
 * @property {string} text
 * @property {number} [durationMs]
 *
 * @typedef {Object} ArtifactBlock
 * @property {'artifact'} kind
 * @property {string} title
 * @property {string} html
 * @property {string} [language]
 *
 * @typedef {Object} CitationBlock
 * @property {'citation'} kind
 * @property {number} [index]
 * @property {string} title
 * @property {string} url
 * @property {string} [snippet]
 *
 * @typedef {Object} ToolCallBlock
 * @property {'toolCall'} kind
 * @property {string} tool
 * @property {string} inputJson
 * @property {string} outputSummary
 *
 * @typedef {Object} SearchResultItem
 * @property {string} title
 * @property {string} url
 * @property {string} snippet
 *
 * @typedef {Object} SearchResultBlock
 * @property {'searchResult'} kind
 * @property {string} query
 * @property {SearchResultItem[]} results
 *
 * @typedef {Object} AttachmentBlock
 * @property {'attachment'} kind
 * @property {string} name
 * @property {string} mime
 * @property {number} size
 * @property {string} [dataUrl]
 *
 * @typedef {ParagraphBlock|HeadingBlock|CodeBlock|TableBlock|ImageBlock|MathBlock|ListBlock|QuoteBlock|ThinkingBlock|ArtifactBlock|CitationBlock|ToolCallBlock|SearchResultBlock|AttachmentBlock} Block
 *
 * @typedef {Object} Message
 * @property {number} index
 * @property {'user'|'assistant'|'system'|'tool'} role
 * @property {string} html
 * @property {string} text
 * @property {Block[]} blocks
 * @property {number} [timestamp]
 * @property {boolean} [streaming]
 *
 * @typedef {Object} ConversationStats
 * @property {number} words
 * @property {number} chars
 * @property {number} tokensEst
 * @property {number} codeBlocks
 * @property {number} images
 * @property {number} tables
 *
 * @typedef {Object} Conversation
 * @property {2} schemaVersion
 * @property {string} id
 * @property {string} title
 * @property {string} url
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {string} model
 * @property {'light'|'dark'} theme
 * @property {ConversationStats} stats
 * @property {Message[]} messages
 */

/**
 * Creates an empty, clean Conversation object.
 * @returns {Conversation}
 */
export function createEmptyConversation() {
  const now = Date.now();
  return {
    schemaVersion: 2,
    id: `conv_${now}_${Math.random().toString(36).substring(2, 9)}`,
    title: 'Untitled Conversation',
    url: typeof window !== 'undefined' ? window.location?.href || '' : '',
    createdAt: now,
    updatedAt: now,
    model: 'Z.ai',
    theme: 'light',
    stats: {
      words: 0,
      chars: 0,
      tokensEst: 0,
      codeBlocks: 0,
      images: 0,
      tables: 0
    },
    messages: []
  };
}

/**
 * Computes deterministic statistics for a conversation.
 * @param {Conversation} conversation
 * @returns {ConversationStats}
 */
export function computeStats(conversation) {
  if (!conversation || !Array.isArray(conversation.messages)) {
    return {
      words: 0,
      chars: 0,
      tokensEst: 0,
      codeBlocks: 0,
      images: 0,
      tables: 0
    };
  }

  let totalChars = 0;
  let totalWords = 0;
  let codeBlocksCount = 0;
  let imagesCount = 0;
  let tablesCount = 0;

  for (const msg of conversation.messages) {
    const text = typeof msg.text === 'string' ? msg.text : '';
    totalChars += text.length;

    // Word count calculation: non-whitespace sequence matching
    const wordsMatch = text.trim().match(/\S+/g);
    if (wordsMatch) {
      totalWords += wordsMatch.length;
    }

    if (Array.isArray(msg.blocks)) {
      for (const block of msg.blocks) {
        if (block.kind === 'code') codeBlocksCount++;
        else if (block.kind === 'image') imagesCount++;
        else if (block.kind === 'table') tablesCount++;
      }
    }
  }

  // R7 / Section 7: tokensEst must be Math.round(chars / 4)
  const tokensEst = Math.round(totalChars / 4);

  return {
    words: totalWords,
    chars: totalChars,
    tokensEst,
    codeBlocks: codeBlocksCount,
    images: imagesCount,
    tables: tablesCount
  };
}
