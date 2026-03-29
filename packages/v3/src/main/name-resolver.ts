import type { AgentState } from '../shared/bridge-types';

export function resolveByName(
  agents: AgentState[],
  name: string,
): { ok: true; agent: AgentState } | { ok: false; error: string } {
  const exact = agents.filter((a) => a.name === name);

  if (exact.length === 1) {
    return { ok: true, agent: exact[0] };
  }

  if (exact.length > 1) {
    return {
      ok: false,
      error: `ambiguous name '${name}', matches: ${exact.map((a) => a.name).join(', ')}`,
    };
  }

  // Not found — check for close matches (substring or Levenshtein ≤ 3)
  const suggestions = agents
    .map((a) => a.name)
    .filter((n) => n.includes(name) || name.includes(n) || levenshtein(n, name) <= 3);

  if (suggestions.length > 0) {
    const list = suggestions.map((s) => `  ${s}`).join('\n');
    return {
      ok: false,
      error: `no agent named '${name}'\n\ndid you mean:\n${list}`,
    };
  }

  return { ok: false, error: `no agent named '${name}'` };
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}
