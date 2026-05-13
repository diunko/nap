// ── Git gutter — apply deltaDecorations for diff hunks ──

import * as monaco from 'monaco-editor';

export interface GutterHunk {
  type: 'add' | 'modify' | 'delete';
  startLine: number;
  endLine: number;
}

const GUTTER_CLASS: Record<string, string> = {
  add: 'git-gutter-added',
  modify: 'git-gutter-modified',
  delete: 'git-gutter-deleted',
};

/**
 * Apply git gutter decorations to a Monaco editor.
 * Returns the new decoration IDs (pass back as oldDecorations next call).
 */
export function applyGitGutter(
  editor: monaco.editor.IStandaloneCodeEditor,
  hunks: GutterHunk[],
  oldDecorations: string[],
): string[] {
  const newDecorations: monaco.editor.IModelDeltaDecoration[] = hunks.map((hunk) => ({
    range: new monaco.Range(hunk.startLine, 1, hunk.endLine, 1),
    options: {
      isWholeLine: true,
      linesDecorationsClassName: GUTTER_CLASS[hunk.type],
    },
  }));

  return editor.deltaDecorations(oldDecorations, newDecorations);
}
