/**
 * @file markdown.js
 * Markdown exporter with GitHub, Obsidian, and Notion presets.
 * Section 16.4 of the authoritative specification.
 */

import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { generateFilename } from '../core/utils/filename.js';
import { anonymizeConversation } from './pii.js';

/**
 * Initializes and configures the Turndown conversion engine.
 * @param {'github'|'obsidian'|'notion'} preset
 * @returns {TurndownService}
 */
function createTurndownService(_preset) {
  const service = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced'
  });

  service.use(gfm);

  // Preserve KaTeX math formulas as LaTeX syntax
  service.addRule('katex', {
    filter: (node) => {
      return (
        node.classList &&
        (node.classList.contains('katex') ||
          node.classList.contains('math-block') ||
          node.hasAttribute('data-tex'))
      );
    },
    replacement: (content, node) => {
      const annotation = node.querySelector('.katex-mathml annotation');
      const tex = annotation
        ? annotation.textContent.trim()
        : node.getAttribute('data-tex') || content.trim();
      const isDisplay =
        node.classList.contains('katex-display') ||
        node.parentElement?.classList.contains('katex-display');

      if (isDisplay) {
        return `\n\n$$\n${tex}\n$$\n\n`;
      }
      return `$${tex}$`;
    }
  });

  return service;
}

/**
 * Exports a conversation to Markdown.
 * @param {import('../core/conversation-model.js').Conversation} originalConversation
 * @param {Object} options
 * @param {'github'|'obsidian'|'notion'} [options.preset='github']
 * @param {boolean} [options.anonymizePii=false]
 * @returns {Promise<{ blob: Blob, filename: string, mime: string, previewText: string }>}
 */
export async function exportConversation(originalConversation, options = {}) {
  const { preset = 'github', anonymizePii = false } = options;
  const conv = anonymizePii ? anonymizeConversation(originalConversation) : originalConversation;

  const turndown = createTurndownService(preset);
  const lines = [];

  // Frontmatter / Title
  if (preset === 'obsidian') {
    lines.push('---');
    lines.push(`title: "${conv.title.replace(/"/g, '\\"')}"`);
    lines.push(`date: ${new Date(conv.createdAt).toISOString()}`);
    lines.push(`model: "${conv.model}"`);
    lines.push('tags: [zai, export, ai-chat]');
    lines.push('---\n');
  }

  lines.push(`# ${conv.title}\n`);

  for (const msg of conv.messages) {
    const hasBlocks =
      Array.isArray(msg.blocks) &&
      msg.blocks.some((b) => {
        if (b.kind === 'paragraph' || b.kind === 'heading' || b.kind === 'quote') {
          return (
            (b.text && b.text.trim()) ||
            (b.runs && b.runs.length > 0) ||
            (b.html && b.html.trim())
          );
        }
        if (b.kind === 'code') return b.code && b.code.trim();
        if (b.kind === 'table') return b.rows && b.rows.length > 0;
        if (b.kind === 'list') return b.items && b.items.length > 0;
        if (b.kind === 'image') return b.src || b.dataUrl;
        if (b.kind === 'attachment') return b.name;
        if (b.kind === 'divider') return true;
        if (b.kind === 'thinking') return b.text && b.text.trim();
        return true;
      });
    const hasText = Boolean(msg.text && msg.text.trim());
    if (!hasBlocks && !hasText) {
      continue;
    }

    const isUser = msg.role === 'user';
    const roleLabel = isUser ? 'User' : 'Z.ai Assistant';

    if (preset === 'obsidian') {
      lines.push(`### 💬 ${roleLabel}\n`);
    } else if (preset === 'notion') {
      lines.push(`**${roleLabel}:**\n`);
    } else {
      // GitHub
      lines.push(`### ${roleLabel}\n`);
    }

    // Process blocks
    if (Array.isArray(msg.blocks) && msg.blocks.length > 0) {
      for (const block of msg.blocks) {
        if (block.kind === 'thinking') {
          if (preset === 'obsidian') {
            lines.push(`> [!note]- Thinking & Reasoning\n> ${block.text.replace(/\n/g, '\n> ')}\n`);
          } else {
            lines.push(
              `<details><summary>Thinking Process</summary>\n\n${block.text}\n\n</details>\n`
            );
          }
        } else if (block.kind === 'code') {
          const backtickMatches = (block.code || '').match(/`{3,}/g);
          let fenceLen = 3;
          if (backtickMatches) {
            for (const m of backtickMatches) {
              if (m.length >= fenceLen) fenceLen = m.length + 1;
            }
          }
          const fence = '`'.repeat(fenceLen);
          lines.push(`${fence}${block.language || ''}\n${block.code}\n${fence}\n`);
        } else if (block.kind === 'math') {
          if (block.displayMode) {
            lines.push(`\n$$\n${block.tex}\n$$\n`);
          } else {
            lines.push(`$${block.tex}$`);
          }
        } else if (block.kind === 'list') {
          if (block.html) {
            lines.push(turndown.turndown(block.html) + '\n');
          } else if (Array.isArray(block.items)) {
            const listLines = block.items.map((it, idx) => {
              const prefix = it.ordered ? `${it.index || idx + 1}. ` : '- ';
              const indent = '  '.repeat(it.depth || 0);
              return `${indent}${prefix}${it.text || ''}`;
            });
            lines.push(listLines.join('\n') + '\n');
          }
        } else if (block.kind === 'divider') {
          lines.push('\n---\n');
        } else if (block.kind === 'attachment') {
          lines.push(`📎 **Attachment:** \`${block.name || 'File'}\`${block.size ? ` (${block.size})` : ''}\n`);
        } else if (block.kind === 'table') {
          if (block.html) {
            lines.push(turndown.turndown(block.html) + '\n');
          } else if (Array.isArray(block.rows) && block.rows.length > 0) {
            const tableLines = [];
            block.rows.forEach((row, rIdx) => {
              const rowStr =
                '| ' + row.map((c) => (c.text || '').replace(/\|/g, '\\|')).join(' | ') + ' |';
              tableLines.push(rowStr);
              if (rIdx === 0) {
                tableLines.push('| ' + row.map(() => '---').join(' | ') + ' |');
              }
            });
            lines.push(tableLines.join('\n') + '\n');
          }
        } else if (block.kind === 'image') {
          lines.push(`![${block.alt || 'Image'}](${block.dataUrl || block.src})\n`);
        } else if (block.kind === 'citation') {
          lines.push(
            `> 🔗 **Citation:** [${block.title}](${block.url}) ${block.snippet ? `— *${block.snippet}*` : ''}\n`
          );
        } else if (block.kind === 'artifact') {
          lines.push(
            `#### Artifact: ${block.title}\n${turndown.turndown(block.html || block.text || '')}\n`
          );
        } else if (block.kind === 'paragraph') {
          lines.push(turndown.turndown(block.html || block.text || '') + '\n');
        } else if (block.kind === 'heading') {
          const prefix = '#'.repeat(Math.min(6, (block.level || 3) + 2));
          lines.push(`${prefix} ${block.text}\n`);
        }
      }
    } else {
      lines.push(turndown.turndown(msg.html || msg.text || '') + '\n');
    }

    lines.push('\n---\n');
  }

  const content = lines.join('\n');
  const filename = generateFilename({
    template: options.template,
    title: conv.title,
    format: 'md',
    model: conv.model,
    timestamp: conv.createdAt
  });

  const mime = 'text/markdown;charset=utf-8';
  const blob = new Blob([content], { type: mime });

  return {
    blob,
    filename,
    mime,
    previewText: content
  };
}
