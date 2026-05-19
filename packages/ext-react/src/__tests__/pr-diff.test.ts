import { describe, it, expect, beforeEach } from 'vitest';
import { parseHunkRanges, lineInRanges, sha256Hex, buildDiffAnchor } from '../pr-diff';
import { routingDecision, routeLink, buildGitHubUrl } from '../link-routing';
import { createNapStore, _resetTabIdCounter } from '../store';
import { createMemoryStorage } from '../state-store';

// ── WW-S04: Hunk range parsing from GitHub API patch field ──

describe('WW-S04: parseHunkRanges', () => {
  it('parses single hunk', () => {
    const patch = '@@ -50,5 +50,10 @@ function routeOrder() {\n+  // added lines\n';
    const ranges = parseHunkRanges(patch);
    expect(ranges).toHaveLength(1);
    // Raw range: 50..59, expanded by ±3: 47..62
    expect(ranges[0].start).toBe(47);
    expect(ranges[0].end).toBe(62);
  });

  it('parses multiple hunks in one patch', () => {
    const patch = [
      '@@ -10,3 +10,5 @@ imports',
      '+import { foo } from "bar"',
      '+import { baz } from "qux"',
      '@@ -50,5 +52,10 @@ function main()',
      '+  // new code',
    ].join('\n');
    const ranges = parseHunkRanges(patch);
    expect(ranges).toHaveLength(2);
    expect(ranges[0].start).toBe(7);   // 10 - 3
    expect(ranges[0].end).toBe(17);    // (10+5-1) + 3 = 17
    expect(ranges[1].start).toBe(49);  // 52 - 3
    expect(ranges[1].end).toBe(64);    // (52+10-1) + 3 = 64
  });

  it('parses pure addition (new file)', () => {
    const patch = '@@ -0,0 +1,30 @@\n+// new file content';
    const ranges = parseHunkRanges(patch);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBe(1);   // max(1, 1-3) = 1
    expect(ranges[0].end).toBe(33);    // (1+30-1) + 3 = 33
  });

  it('parses pure deletion', () => {
    const patch = '@@ -5,3 +4,0 @@ deleted section';
    const ranges = parseHunkRanges(patch);
    expect(ranges).toHaveLength(1);
    // Pure deletion: marker at line 4, expanded: max(1, 4-3)..4+3
    expect(ranges[0].start).toBe(1);
    expect(ranges[0].end).toBe(7);
  });

  it('returns empty array for null/empty/missing patch', () => {
    expect(parseHunkRanges(null)).toEqual([]);
    expect(parseHunkRanges(undefined)).toEqual([]);
    expect(parseHunkRanges('')).toEqual([]);
  });

  it('parses hunk header without count (defaults to 1)', () => {
    // When count is missing, it means 1 line
    const patch = '@@ -10 +10 @@ single line change';
    const ranges = parseHunkRanges(patch);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBe(7);   // 10 - 3
    expect(ranges[0].end).toBe(13);    // 10 + 3
  });
});

// ── WW-S05: SHA256 diff anchor construction ──

describe('WW-S05: buildDiffAnchor / sha256Hex', () => {
  it('produces consistent hex for known path', async () => {
    const hex1 = await sha256Hex('modules/delivery/order-router.ts');
    const hex2 = await sha256Hex('modules/delivery/order-router.ts');
    expect(hex1).toBe(hex2);
    expect(hex1).toHaveLength(64);
  });

  it('different paths produce different hashes', async () => {
    const hex1 = await sha256Hex('modules/delivery/order-router.ts');
    const hex2 = await sha256Hex('modules/validation/crust-validator.ts');
    expect(hex1).not.toBe(hex2);
  });

  it('builds anchor with line number', async () => {
    const anchor = await buildDiffAnchor('modules/delivery/order-router.ts', 54);
    expect(anchor).toMatch(/^#diff-[0-9a-f]{64}R54$/);
  });
});

// ── WW-S06: Diff-aware link routing decisions ──

describe('WW-S06: routingDecision', () => {
  const diffRanges = {
    'modules/delivery/order-router.ts': [{ start: 47, end: 62 }],
    'modules/queue/warp-queue.ts': [{ start: 10, end: 20 }],
  };

  it('returns blob when not a PR page (prNum=0)', () => {
    expect(routingDecision('order-router.ts', 54, { prNum: 0, prDiffRanges: diffRanges })).toBe('blob');
  });

  it('returns blob when prDiffRanges is null', () => {
    expect(routingDecision('order-router.ts', 54, { prNum: 1, prDiffRanges: null })).toBe('blob');
  });

  it('returns blob when no diffCtx provided', () => {
    expect(routingDecision('order-router.ts', 54)).toBe('blob');
  });

  it('returns diff when file in diff and line within hunk range', () => {
    expect(routingDecision(
      'modules/delivery/order-router.ts', 54,
      { prNum: 1, prDiffRanges: diffRanges },
    )).toBe('diff');
  });

  it('returns blob when file in diff but line outside all hunks', () => {
    expect(routingDecision(
      'modules/delivery/order-router.ts', 100,
      { prNum: 1, prDiffRanges: diffRanges },
    )).toBe('blob');
  });

  it('returns blob when file NOT in diff', () => {
    expect(routingDecision(
      'modules/validation/crust-validator.ts', 40,
      { prNum: 1, prDiffRanges: diffRanges },
    )).toBe('blob');
  });

  it('returns diff at hunk boundary (start)', () => {
    expect(routingDecision(
      'modules/delivery/order-router.ts', 47,
      { prNum: 1, prDiffRanges: diffRanges },
    )).toBe('diff');
  });

  it('returns diff at hunk boundary (end)', () => {
    expect(routingDecision(
      'modules/delivery/order-router.ts', 62,
      { prNum: 1, prDiffRanges: diffRanges },
    )).toBe('diff');
  });

  it('returns blob just outside hunk boundary', () => {
    expect(routingDecision(
      'modules/delivery/order-router.ts', 46,
      { prNum: 1, prDiffRanges: diffRanges },
    )).toBe('blob');
    expect(routingDecision(
      'modules/delivery/order-router.ts', 63,
      { prNum: 1, prDiffRanges: diffRanges },
    )).toBe('blob');
  });
});

// ── WW-S06b: routeLink with diff context ──

describe('WW-S06b: routeLink with diff routing', () => {
  const mainRepo = { owner: 'diunko', repo: 'nap-test-main', branch: 'feature/delivery-v2' };
  const diffRanges = {
    'modules/delivery/order-router.ts': [{ start: 47, end: 62 }],
  };

  it('routes changed file to diff URL placeholder', () => {
    const result = routeLink(
      { href: '/modules/delivery/order-router.ts#L54', sourceFilePath: '/chapter.md' },
      mainRepo,
      { prNum: 1, prDiffRanges: diffRanges },
    );
    expect(result.action).toBe('openCode');
    if (result.action === 'openCode') {
      expect(result.githubUrl).toContain('__DIFF_URL__');
      expect(result.githubUrl).toContain('order-router.ts');
    }
  });

  it('routes unchanged file to blob URL', () => {
    const result = routeLink(
      { href: '/modules/validation/crust-validator.ts#L40', sourceFilePath: '/chapter.md' },
      mainRepo,
      { prNum: 1, prDiffRanges: diffRanges },
    );
    expect(result.action).toBe('openCode');
    if (result.action === 'openCode') {
      expect(result.githubUrl).toContain('/blob/');
      expect(result.githubUrl).toContain('crust-validator.ts');
      expect(result.githubUrl).toContain('#L40');
    }
  });

  it('routes to blob URL when no diff context', () => {
    const result = routeLink(
      { href: '/modules/delivery/order-router.ts#L54', sourceFilePath: '/chapter.md' },
      mainRepo,
    );
    expect(result.action).toBe('openCode');
    if (result.action === 'openCode') {
      expect(result.githubUrl).toContain('/blob/');
    }
  });
});

// ── WW-S07: prDiffRanges persistence round-trip ──

describe('WW-S07: prDiffRanges persistence', () => {
  beforeEach(_resetTabIdCounter);

  it('persists and hydrates prDiffRanges', async () => {
    const storage = createMemoryStorage();
    const store = createNapStore('pr-42', storage);
    await new Promise(r => setTimeout(r, 50));

    const ranges = {
      'modules/delivery/order-router.ts': [{ start: 47, end: 62 }],
      'modules/queue/warp-queue.ts': [{ start: 10, end: 20 }],
    };
    store.getState().setPrDiffRanges(ranges);
    store.getState().setPrNum(1);
    await new Promise(r => setTimeout(r, 50));

    // Recreate store with same key
    const store2 = createNapStore('pr-42', storage);
    await new Promise(r => setTimeout(r, 100));

    expect(store2.getState().prDiffRanges).toEqual(ranges);
    expect(store2.getState().prNum).toBe(1);
  });

  it('different session key has null ranges', async () => {
    const storage = createMemoryStorage();

    const store42 = createNapStore('pr-42', storage);
    await new Promise(r => setTimeout(r, 50));
    store42.getState().setPrDiffRanges({ 'a.ts': [{ start: 1, end: 10 }] });
    await new Promise(r => setTimeout(r, 50));

    const store87 = createNapStore('pr-87', storage);
    await new Promise(r => setTimeout(r, 100));

    // pr-87 should not have pr-42's ranges
    expect(store87.getState().prDiffRanges).toBeNull();
  });

  it('null ranges persist as null', async () => {
    const storage = createMemoryStorage();
    const store = createNapStore('pr-42', storage);
    await new Promise(r => setTimeout(r, 50));
    store.getState().setPrDiffRanges(null);
    await new Promise(r => setTimeout(r, 50));

    const store2 = createNapStore('pr-42', storage);
    await new Promise(r => setTimeout(r, 100));
    expect(store2.getState().prDiffRanges).toBeNull();
  });
});
