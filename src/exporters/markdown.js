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
        } else if (block.kind === 'table') {
          lines.push(turndown.turndown(block.html) + '\n');
        } else if (block.kind === 'image') {
          lines.push(`![${block.alt || 'Image'}](${block.dataUrl || block.src})\n`);
        } else if (block.kind === 'citation') {
          lines.push(
            `> 🔗 **Citation:** [${block.title}](${block.url}) ${block.snippet ? `— *${block.snippet}*` : ''}\n`
          );
        } else if (block.kind === 'artifact') {
          lines.push(`#### Artifact: ${block.title}\n${turndown.turndown(block.html)}\n`);
        } else if (block.kind === 'paragraph') {
          lines.push(turndown.turndown(block.html) + '\n');
        } else if (block.kind === 'heading') {
          const prefix = '#'.repeat(Math.min(6, (block.level || 3) + 2));
          lines.push(`${prefix} ${block.text}\n`);
        }
      }
    } else {
      lines.push(turndown.turndown(msg.html || msg.text) + '\n');
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
