// ── Git diff parser — pure function, no I/O ──
//
// Parses `git diff --unified=0` output into typed hunk descriptors.
// Standalone module for testability.

export interface DiffHunk {
  type: 'add' | 'modify' | 'delete';
  startLine: number;
  endLine: number;
}

/**
 * Parse git diff --unified=0 output into DiffHunk[].
 *
 * Hunk header format: @@ -a,b +c,d @@
 *   - b=0 → pure addition (lines c..c+d-1 added)
 *   - d=0 → pure deletion (marker at line c)
 *   - both non-zero → modification (lines c..c+d-1 modified)
 *
 * Skips binary files ("Binary files ... differ").
 */
export function parseGitDiff(output: string): DiffHunk[] {
  if (!output || output.includes('Binary files') && output.includes('differ')) {
    return [];
  }

  const hunks: DiffHunk[] = [];
  const hunkRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;
  let match: RegExpExecArray | null;

  while ((match = hunkRegex.exec(output)) !== null) {
    const oldCount = match[2] !== undefined ? parseInt(match[2], 10) : 1;
    const newStart = parseInt(match[3], 10);
    const newCount = match[4] !== undefined ? parseInt(match[4], 10) : 1;

    if (newCount === 0) {
      // Pure deletion — marker between lines
      hunks.push({ type: 'delete', startLine: newStart, endLine: newStart });
    } else if (oldCount === 0) {
      // Pure addition
      hunks.push({ type: 'add', startLine: newStart, endLine: newStart + newCount - 1 });
    } else {
      // Modification
      hunks.push({ type: 'modify', startLine: newStart, endLine: newStart + newCount - 1 });
    }
  }

  return hunks;
}
