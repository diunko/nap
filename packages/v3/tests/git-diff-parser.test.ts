import { describe, it, expect } from 'vitest';
import { parseGitDiff } from '../src/main/git-diff-parser';

// ── 4. Git gutter — parseGitDiff (small tests) ──

describe('Git diff parser — parseGitDiff', () => {
  // T-0200-G01: Hunk header parsing — added lines
  describe('G01: added lines', () => {
    it('parses @@ -10,0 +11,3 @@ → add lines 11-13', () => {
      const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -10,0 +11,3 @@
+line 1
+line 2
+line 3`;
      const hunks = parseGitDiff(diff);
      expect(hunks).toEqual([{ type: 'add', startLine: 11, endLine: 13 }]);
    });

    it('parses single line addition', () => {
      const diff = `@@ -5,0 +6,1 @@
+new line`;
      const hunks = parseGitDiff(diff);
      expect(hunks).toEqual([{ type: 'add', startLine: 6, endLine: 6 }]);
    });

    it('handles omitted count (defaults to 1) — @@ -5 +6 @@', () => {
      // When count is omitted, git means 1
      const diff = `@@ -5 +6 @@`;
      const hunks = parseGitDiff(diff);
      // Both old=1 and new=1 → modify
      expect(hunks).toEqual([{ type: 'modify', startLine: 6, endLine: 6 }]);
    });
  });

  // T-0200-G02: Hunk header parsing — modified lines
  describe('G02: modified lines', () => {
    it('parses @@ -5,2 +5,2 @@ → modify lines 5-6', () => {
      const diff = `@@ -5,2 +5,2 @@
-old line 1
-old line 2
+new line 1
+new line 2`;
      const hunks = parseGitDiff(diff);
      expect(hunks).toEqual([{ type: 'modify', startLine: 5, endLine: 6 }]);
    });

    it('handles asymmetric modify — @@ -5,2 +5,3 @@ → modify 5-7', () => {
      const diff = `@@ -5,2 +5,3 @@
-old1
-old2
+new1
+new2
+new3`;
      const hunks = parseGitDiff(diff);
      expect(hunks).toEqual([{ type: 'modify', startLine: 5, endLine: 7 }]);
    });
  });

  // T-0200-G03: Hunk header parsing — deleted lines
  describe('G03: deleted lines', () => {
    it('parses @@ -15,2 +14,0 @@ → delete at line 14', () => {
      const diff = `@@ -15,2 +14,0 @@
-deleted line 1
-deleted line 2`;
      const hunks = parseGitDiff(diff);
      expect(hunks).toEqual([{ type: 'delete', startLine: 14, endLine: 14 }]);
    });

    it('single line deletion', () => {
      const diff = `@@ -3,1 +2,0 @@
-removed`;
      const hunks = parseGitDiff(diff);
      expect(hunks).toEqual([{ type: 'delete', startLine: 2, endLine: 2 }]);
    });
  });

  // T-0200-G04: Untracked file — handled at IPC layer, not parser
  // The parser itself doesn't detect untracked files — that's the main process handler's job.
  // But we can verify the parser returns empty for empty input (which is what git diff gives for untracked files).
  describe('G04: empty input (untracked file path)', () => {
    it('returns empty array for empty string', () => {
      expect(parseGitDiff('')).toEqual([]);
    });

    it('returns empty array for null-ish input', () => {
      // @ts-expect-error testing null input
      expect(parseGitDiff(null)).toEqual([]);
      // @ts-expect-error testing undefined input
      expect(parseGitDiff(undefined)).toEqual([]);
    });
  });

  // T-0200-G05: Edge cases — binary file, empty file, multiple hunks
  describe('G05: edge cases', () => {
    it('skips binary file diff', () => {
      const diff = `diff --git a/image.png b/image.png
Binary files a/image.png and b/image.png differ`;
      expect(parseGitDiff(diff)).toEqual([]);
    });

    it('handles empty file (no hunks in diff)', () => {
      const diff = `diff --git a/empty.ts b/empty.ts
--- a/empty.ts
+++ b/empty.ts`;
      expect(parseGitDiff(diff)).toEqual([]);
    });

    it('handles multiple hunks in one diff', () => {
      const diff = `diff --git a/file.ts b/file.ts
@@ -1,0 +1,2 @@
+new line 1
+new line 2
@@ -10,3 +12,3 @@
-old
-old
-old
+new
+new
+new
@@ -20,1 +22,0 @@
-deleted line`;
      const hunks = parseGitDiff(diff);
      expect(hunks).toHaveLength(3);
      expect(hunks[0]).toEqual({ type: 'add', startLine: 1, endLine: 2 });
      expect(hunks[1]).toEqual({ type: 'modify', startLine: 12, endLine: 14 });
      expect(hunks[2]).toEqual({ type: 'delete', startLine: 22, endLine: 22 });
    });

    it('does not crash on malformed input', () => {
      expect(() => parseGitDiff('some random text without hunk headers')).not.toThrow();
      expect(parseGitDiff('some random text')).toEqual([]);
    });
  });
});
