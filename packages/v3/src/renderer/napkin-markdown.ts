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

// ── Shift-enter continuation ──

export interface LinePattern {
  indent: string;
  bullet: string;
  prefix: string;
  content: string;
}

/**
 * Detect indent + bullet + prefix pattern on a line.
 * Returns null if no pattern detected (just use indent).
 */
export function detectLinePattern(line: string): LinePattern {
  // Match: <indent> [* ] [//XX: ]  <content>
  const match = line.match(/^(\s*)(\* )?(\/\/\w+: )?(.*?)$/);
  if (!match) return { indent: '', bullet: '', prefix: '', content: line };

  return {
    indent: match[1] || '',
    bullet: match[2] || '',
    prefix: match[3] || '',
    content: match[4] || '',
  };
}

/**
 * Register Shift+Enter keybinding for napkin-markdown continuation.
 */
export function registerShiftEnter(editor: monaco.editor.IStandaloneCodeEditor): monaco.IDisposable {
  return editor.addAction({
    id: 'napkin-shift-enter',
    label: 'Continue line pattern',
    keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.Enter],
    precondition: undefined,
    run(ed) {
      const position = ed.getPosition();
      if (!position) return;

      const model = ed.getModel();
      if (!model) return;

      const lineContent = model.getLineContent(position.lineNumber);
      const pattern = detectLinePattern(lineContent);

      const continuation = pattern.indent + pattern.bullet + pattern.prefix;
      const hasContent = pattern.content.trim().length > 0;

      if (!hasContent && (pattern.bullet || pattern.prefix)) {
        // Break-out: empty prefix/bullet line → clear it and insert plain newline
        const lineRange = new monaco.Range(
          position.lineNumber, 1,
          position.lineNumber, lineContent.length + 1,
        );
        ed.executeEdits('shift-enter', [
          { range: lineRange, text: pattern.indent },
          { range: new monaco.Range(position.lineNumber, lineContent.length + 1, position.lineNumber, lineContent.length + 1), text: '\n' + pattern.indent },
        ]);
        ed.setPosition(new monaco.Position(position.lineNumber + 1, pattern.indent.length + 1));
      } else {
        // Continue with same pattern
        const insertPos = new monaco.Range(
          position.lineNumber, lineContent.length + 1,
          position.lineNumber, lineContent.length + 1,
        );
        ed.executeEdits('shift-enter', [
          { range: insertPos, text: '\n' + continuation },
        ]);
        ed.setPosition(new monaco.Position(position.lineNumber + 1, continuation.length + 1));
      }
    },
  });
}

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
