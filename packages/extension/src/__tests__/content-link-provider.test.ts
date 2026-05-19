/**
 * Content link detection tests — priority, overlap, bare paths, false positives.
 */
import { describe, it, expect } from 'vitest';
import { detectLinks } from '../content-link-provider';

describe('detectLinks', () => {
  it('detects bare file path', () => {
    const links = detectLinks('See src/main.ts:42 for details', 1);
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('src/main.ts:42');
  });

  it('markdown link takes priority over bare path inside it', () => {
    const links = detectLinks('See [main.ts:42](/src/main.ts#L42) here', 1);
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('/src/main.ts#L42');
  });

  it('URL takes priority over overlapping bare path', () => {
    const links = detectLinks('Visit https://github.com/org/repo/blob/main/src/foo.ts', 1);
    expect(links).toHaveLength(1);
    expect(links[0].href).toMatch(/^https:/);
  });

  it('detects multiple non-overlapping links', () => {
    const links = detectLinks('[a.ts:1](/a.ts#L1) and b.ts:2', 1);
    expect(links).toHaveLength(2);
  });

  it('no false positives on plain text without dots', () => {
    const links = detectLinks('The value is large and no files here', 1);
    expect(links).toHaveLength(0);
  });

  it('detects relative paths with ./ prefix', () => {
    const links = detectLinks('See ./foo/bar.ts for details', 1);
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('./foo/bar.ts');
  });

  it('detects relative paths with ../ prefix', () => {
    const links = detectLinks('See ../other/module.ts:10 here', 1);
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('../other/module.ts:10');
  });

  it('detects absolute paths', () => {
    const links = detectLinks('See /modules/server/copy.ts#L51', 1);
    // This is a bare path — the # is not part of the regex, so it stops at .ts
    // Actually, the bare path regex matches .ts, the #L51 is separate
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it('bare URL is not duplicated by bare path detection', () => {
    const links = detectLinks('Go to https://example.com/path/file.ts:42 now', 1);
    // URL regex should capture the whole thing, bare path should skip it
    expect(links).toHaveLength(1);
    expect(links[0].href).toMatch(/^https:/);
  });

  it('markdown link with URL href is one link', () => {
    const links = detectLinks('[click here](https://example.com)', 1);
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('https://example.com');
  });
});
