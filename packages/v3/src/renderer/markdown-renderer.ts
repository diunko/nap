// ── Markdown renderer — parse markdown to HTML with source line mapping + role comments ──
//
// Uses markdown-it. Adds data-source-line attributes on block elements (1-indexed for Monaco).
// Detects //XX: role comment patterns and wraps them in styled spans.

import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

const ROLE_PREFIXES: Record<string, string> = {
  A: 'architect',
  DU: 'user',
  FS: 'fs-eng',
  TA: 'test-arch',
  TE: 'test-eng',
};

const md = new MarkdownIt({ html: false, breaks: false, linkify: true });

// ── Plugin: inject data-source-line on block-level opening tags ──
// markdown-it token.map is 0-indexed [startLine, endLine]. Monaco is 1-indexed. Add +1.

md.core.ruler.push('source_line', (state) => {
  for (const token of state.tokens) {
    if (token.map && token.nesting === 1) {
      token.attrSet('data-source-line', String(token.map[0] + 1));
    }
    // Also handle list items and other blocks that contain children
    if (token.children) {
      for (const child of token.children) {
        if (child.map && child.nesting === 1) {
          child.attrSet('data-source-line', String(child.map[0] + 1));
        }
      }
    }
  }
});

// ── Override text renderer to detect and style role comments ──

const defaultTextRender =
  md.renderer.rules.text ??
  ((tokens: Token[], idx: number) => md.utils.escapeHtml(tokens[idx].content));

md.renderer.rules.text = (tokens, idx, options, env, self) => {
  const content = tokens[idx].content;

  // Match //XX: at start of text token (common in napkin list items)
  const roleMatch = content.match(/^\/\/(\w+):\s/);
  if (roleMatch) {
    const prefix = roleMatch[1];
    const role = ROLE_PREFIXES[prefix];
    if (role) {
      const escaped = md.utils.escapeHtml(content);
      return `<span class="role-comment role-${role}">${escaped}</span>`;
    }
  }

  return defaultTextRender(tokens, idx, options, env, self);
};

/**
 * Render markdown source to HTML with:
 * - data-source-line attributes on block elements (1-indexed)
 * - role comment spans with CSS classes
 */
export function renderMarkdown(source: string): string {
  const html = md.render(source);

  // Post-process: catch role comments not at the start of a text token
  // (e.g., mid-paragraph //A: patterns)
  return html.replace(
    /\/\/(A|DU|FS|TA|TE):\s([^<]*)/g,
    (match, prefix: string, rest: string) => {
      const role = ROLE_PREFIXES[prefix];
      if (role) {
        // Only wrap if not already inside a role-comment span
        return `<span class="role-comment role-${role}">//${prefix}: ${rest}</span>`;
      }
      return match;
    },
  );
}
