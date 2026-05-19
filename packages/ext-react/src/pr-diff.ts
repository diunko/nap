/**
 * PR diff range parsing and GitHub API integration.
 *
 * Fetches PR files from the GitHub API, parses hunk ranges from the `patch` field,
 * and builds a map: filepath → Array<{start, end}> (new-side line numbers + context).
 *
 * Adapted from packages/v3/src/main/git-diff-parser.ts for the GitHub API patch format.
 */

export interface HunkRange {
  start: number;
  end: number;
}

const CONTEXT_LINES = 3;

/**
 * Parse hunk ranges from a GitHub API `patch` field.
 *
 * The patch field starts directly with @@ headers (no diff --git preamble).
 * Format: @@ -oldStart,oldCount +newStart,newCount @@
 *
 * Returns new-side ranges expanded by ±CONTEXT_LINES for GitHub's context window.
 */
export function parseHunkRanges(patch: string | null | undefined): HunkRange[] {
  if (!patch) return [];

  const ranges: HunkRange[] = [];
  const hunkRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;
  let match: RegExpExecArray | null;

  while ((match = hunkRegex.exec(patch)) !== null) {
    const newStart = parseInt(match[3], 10);
    const newCount = match[4] !== undefined ? parseInt(match[4], 10) : 1;

    if (newCount === 0) {
      // Pure deletion — marker at line (zero width on new side)
      const expanded = Math.max(1, newStart - CONTEXT_LINES);
      ranges.push({ start: expanded, end: newStart + CONTEXT_LINES });
    } else {
      const rawEnd = newStart + newCount - 1;
      ranges.push({
        start: Math.max(1, newStart - CONTEXT_LINES),
        end: rawEnd + CONTEXT_LINES,
      });
    }
  }

  return ranges;
}

/**
 * Check if a line number falls within any hunk range.
 */
export function lineInRanges(line: number, ranges: HunkRange[]): boolean {
  return ranges.some(r => line >= r.start && line <= r.end);
}

/**
 * Build the SHA256 diff anchor for a file path.
 * GitHub computes: SHA-256(filepath as UTF-8 bytes) → hex → #diff-{hex}R{line}
 */
export async function buildDiffAnchor(filePath: string, line: number): Promise<string> {
  const encoded = new TextEncoder().encode(filePath);
  const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
  const hex = [...new Uint8Array(hashBuf)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `#diff-${hex}R${line}`;
}

/**
 * Compute just the SHA256 hex of a file path (for testing).
 */
export async function sha256Hex(filePath: string): Promise<string> {
  const encoded = new TextEncoder().encode(filePath);
  const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(hashBuf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export type DiffRangeMap = Record<string, HunkRange[]>;

/**
 * Fetch PR files from the GitHub API and build a diff range map.
 *
 * @returns Map of filepath → hunk ranges, or null on failure.
 */
export async function fetchPrDiffRanges(
  owner: string,
  repo: string,
  prNum: number,
  pat?: string,
): Promise<DiffRangeMap | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNum}/files`;
  console.log(`[pr-diff] fetching ${url}`);

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
    };
    if (pat) {
      headers['Authorization'] = `Bearer ${pat}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      console.log(`[pr-diff] API returned ${response.status}`);
      return null;
    }

    const files: Array<{ filename: string; patch?: string }> = await response.json();
    const map: DiffRangeMap = {};

    for (const file of files) {
      const ranges = parseHunkRanges(file.patch);
      if (ranges.length > 0) {
        map[file.filename] = ranges;
      }
    }

    console.log(`[pr-diff] parsed ${Object.keys(map).length} files with hunks`);
    return map;
  } catch (e) {
    console.log(`[pr-diff] fetch failed:`, e);
    return null;
  }
}
