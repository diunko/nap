// ── Markdown renderer — parse markdown to HTML with source line mapping + role comments ──
//
// Uses markdown-it for structure, shiki for fenced code block syntax highlighting.
// Adds data-source-line attributes on block elements (1-indexed for Monaco).
// Detects //XX: role comment patterns and wraps them in styled spans.

import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import type { HighlighterGeneric, BundledLanguage, BundledTheme } from 'shiki';

const ROLE_PREFIXES: Record<string, string> = {
  A: 'architect',
  DU: 'user',
  FS: 'fs-eng',
  TA: 'test-arch',
  TE: 'test-eng',
};

// ── Shiki highlighter (lazy-initialized) ──

let highlighter: HighlighterGeneric<BundledLanguage, BundledTheme> | null = null;
let shikiReady = false;
let currentShikiTheme = 'vitesse-dark';

const SHIKI_LANGS = ['typescript', 'javascript', 'json', 'bash', 'markdown', 'html', 'css', 'tsx', 'jsx', 'yaml', 'python', 'go', 'rust', 'sql'];
const SHIKI_THEMES = ['vitesse-dark', 'vitesse-light'];

/** Initialize shiki highlighter. Call once at startup. Returns a promise that resolves when ready. */
export async function initShiki(): Promise<void> {
  if (shikiReady || highlighter) return;
  try {
    const { createHighlighter } = await import('shiki');
    highlighter = await createHighlighter({
      langs: SHIKI_LANGS,
      themes: SHIKI_THEMES,
    });
    shikiReady = true;
  } catch (e) {
    // Shiki failed to load — code blocks render as plain text
    console.warn('[shiki] init failed:', e);
  }
}

// ── Markdown-it setup ──

const md = new MarkdownIt({ html: false, breaks: false, linkify: true });

// ── Plugin: inject data-source-line on block-level opening tags ──
// markdown-it token.map is 0-indexed [startLine, endLine]. Monaco is 1-indexed. Add +1.

md.core.ruler.push('source_line', (state) => {
  for (const token of state.tokens) {
    if (token.map && token.nesting === 1) {
      token.attrSet('data-source-line', String(token.map[0] + 1));
    }
    if (token.children) {
      for (const child of token.children) {
        if (child.map && child.nesting === 1) {
          child.attrSet('data-source-line', String(child.map[0] + 1));
        }
      }
    }
  }
});

// ── Override fence rule for shiki syntax highlighting ──

md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  const lang = token.info.trim();
  const code = token.content;
  const sourceLine = token.map ? ` data-source-line="${token.map[0] + 1}"` : '';

  if (highlighter && lang) {
    try {
      const loadedLangs = highlighter.getLoadedLanguages();
      if (loadedLangs.includes(lang)) {
        const html = highlighter.codeToHtml(code, { lang, theme: currentShikiTheme });
        // Inject data-source-line into the outer <pre> tag
        return html.replace(/^<pre /, `<pre${sourceLine} `);
      }
    } catch {
      // Fall through to plain rendering
    }
  }

  // Fallback: plain pre/code with escaping
  const escaped = md.utils.escapeHtml(code);
  return `<pre${sourceLine} class="nap-code-block"><code>${escaped}</code></pre>`;
};

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
 * - Shiki syntax-highlighted fenced code blocks
 * - data-source-line attributes on block elements (1-indexed)
 * - role comment spans with CSS classes
 *
 * @param shikiTheme — shiki theme name to use for code blocks (from ThemeDef.shikiTheme)
 */
export function renderMarkdown(source: string, shikiTheme?: string): string {
  if (shikiTheme) currentShikiTheme = shikiTheme;

  const html = md.render(source);

  // Post-process: catch role comments not at the start of a text token
  return html.replace(
    /\/\/(A|DU|FS|TA|TE):\s([^<]*)/g,
    (match, prefix: string, rest: string) => {
      const role = ROLE_PREFIXES[prefix];
      if (role) {
        return `<span class="role-comment role-${role}">//${prefix}: ${rest}</span>`;
      }
      return match;
    },
  );
}
