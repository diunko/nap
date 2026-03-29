import type { Session } from './session-store';

export function resolveByName(
  sessions: Session[],
  name: string,
): { ok: true; session: Session } | { ok: false; error: string } {
  const exact = sessions.filter((s) => s.name === name);

  if (exact.length === 1) {
    return { ok: true, session: exact[0] };
  }

  if (exact.length > 1) {
    return {
      ok: false,
      error: `ambiguous name '${name}', matches: ${exact.map((s) => s.name).join(', ')}`,
    };
  }

  // Not found — check for close matches
  const suggestions = sessions
    .map((s) => s.name)
    .filter((n) => levenshtein(n, name) <= 2);

  if (suggestions.length > 0) {
    return {
      ok: false,
      error: `no session named '${name}'. did you mean: ${suggestions.join(', ')}?`,
    };
  }

  return { ok: false, error: `no session named '${name}'` };
}

// Levenshtein distance algorithm: computes the minimum number of single-character edits 
// (insertions, deletions, substitutions) required to change string 'a' into string 'b'.
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Create a (m+1) x (n+1) matrix to hold edit distances between prefixes of 'a' and 'b'.
  // dp[i][j] is the edit distance between a.slice(0, i) and b.slice(0, j)
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  // Fill the base cases:
  // - Turning the first i characters of 'a' into an empty string 'b' takes i deletions.
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  // - Turning an empty 'a' into the first j characters of 'b' takes j insertions.
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Compute the edit distance for each substring of 'a' and 'b'
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      // If the current characters are the same, no operation needed.
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        // Otherwise, consider the minimum cost among:
        // - Substitution (dp[i - 1][j - 1] + 1)
        // - Insertion (dp[i][j - 1] + 1)
        // - Deletion (dp[i - 1][j] + 1)
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],    // deletion
          dp[i][j - 1],    // insertion
          dp[i - 1][j - 1] // substitution
        );
      }
    }
  }

  // The edit distance between the full strings 'a' and 'b'
  return dp[m][n];
}
