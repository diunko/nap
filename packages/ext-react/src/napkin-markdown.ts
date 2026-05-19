/**
 * Napkin-markdown monarch tokenizer + shift-enter continuation.
 * Copied from v3/src/renderer/napkin-markdown.ts — adapted for standalone Monaco import.
 */
import * as monaco from 'monaco-editor';

// ── Shift-enter continuation ──

export interface LinePattern {
  indent: string;
  bullet: string;
  prefix: string;
  content: string;
}

export function detectLinePattern(line: string): LinePattern {
  const match = line.match(/^(\s*)(\* )?(\/\/\w+: )?(.*?)$/);
  if (!match) return { indent: '', bullet: '', prefix: '', content: line };
  return {
    indent: match[1] || '',
    bullet: match[2] || '',
    prefix: match[3] || '',
    content: match[4] || '',
  };
}

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
  console.log('[napkin-md] registering language');
  monaco.languages.register({ id: 'napkin-markdown' });

  monaco.languages.setMonarchTokensProvider('napkin-markdown', {
    tokenizer: {
      root: [
        [/^#{1,6}\s.*$/, 'heading'],
        [/\/\/\w+:.*$/, 'comment.role'],
        [/\/\/.*$/, 'comment'],
        [/\*\*/, 'bold.marker', '@bold'],
        [/`[^`]+`/, 'inline-code'],
        [/^(\s*\*)(\s)/, ['bullet.marker', 'white']],
        [/./, 'source'],
      ],
      bold: [
        [/\*\*/, 'bold.marker', '@pop'],
        [/[^*]+/, 'bold'],
        [/\*/, 'bold'],
      ],
    },
  });
  console.log('[napkin-md] language registered');
}
