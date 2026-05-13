// ── Napkin-markdown monarch tokenizer + theme ──
//
// Registers language 'napkin-markdown' with Monaco.
// Role-prefixed comment rules (//A:, //DU:, etc.) MUST come before generic //.

import * as monaco from 'monaco-editor';

// Role colors from dot-style.ts ROLE_COLORS
const ROLE_COLORS = {
  architect: '#3b82f6',   // blue
  user: '#22c55e',        // green (DU = "Dima/User")
  'fs-eng': '#22c55e',    // green
  'test-arch': '#f59e0b', // orange
  'test-eng': '#6b7280',  // gray
};

const COMMENT_COLOR = '#6A9955'; // muted gray-green (VS Code default comment)

export function registerNapkinMarkdown(): void {
  monaco.languages.register({ id: 'napkin-markdown' });

  monaco.languages.setMonarchTokensProvider('napkin-markdown', {
    tokenizer: {
      root: [
        // Headings: # at line start
        [/^#{1,6}\s.*$/, 'heading'],

        // Role-prefixed comments — MUST come before generic //
        [/\/\/A:.*$/, 'comment.architect'],
        [/\/\/DU:.*$/, 'comment.user'],
        [/\/\/FS:.*$/, 'comment.fs-eng'],
        [/\/\/TA:.*$/, 'comment.test-arch'],
        [/\/\/TE:.*$/, 'comment.test-eng'],

        // Generic comment
        [/\/\/.*$/, 'comment'],

        // Bold: **text** — tokenize markers and content
        [/\*\*/, 'bold.marker', '@bold'],

        // Inline code: `text`
        [/`[^`]+`/, 'inline-code'],

        // Bullet marker: * at line start (with optional leading whitespace)
        [/^(\s*\*)(\s)/, ['bullet.marker', 'white']],

        // Everything else
        [/./, 'source'],
      ],

      bold: [
        [/\*\*/, 'bold.marker', '@pop'],
        [/[^*]+/, 'bold'],
        [/\*/, 'bold'],
      ],
    },
  });

  monaco.editor.defineTheme('napkin-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'heading', foreground: 'e5e5e5', fontStyle: 'bold' },
      { token: 'bullet.marker', foreground: '6b7280' },
      { token: 'bold', fontStyle: 'bold' },
      { token: 'bold.marker', foreground: '6b7280' },
      { token: 'inline-code', foreground: 'ce9178', background: '2d2d2d' },
      { token: 'comment', foreground: COMMENT_COLOR.slice(1) },
      { token: 'comment.architect', foreground: ROLE_COLORS.architect.slice(1) },
      { token: 'comment.user', foreground: ROLE_COLORS.user.slice(1) },
      { token: 'comment.fs-eng', foreground: ROLE_COLORS['fs-eng'].slice(1) },
      { token: 'comment.test-arch', foreground: ROLE_COLORS['test-arch'].slice(1) },
      { token: 'comment.test-eng', foreground: ROLE_COLORS['test-eng'].slice(1) },
      { token: 'source', foreground: 'd4d4d4' },
    ],
    colors: {
      'editor.background': '#1e1e1e',
    },
  });
}
