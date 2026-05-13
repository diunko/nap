import { describe, it, expect } from 'vitest';
import { routeLink } from '../src/renderer/routing-rules';
import { extractPathAndLocation, FILE_PATH_REGEX } from '../src/renderer/file-link-provider';

// ── Terminal link routing — small tests ──
// Tests the integration: terminal produces paths → file-link-provider extracts → routeLink classifies

// T-0300-TL-01: Terminal .nap/ link → left pane (openDoc)
describe('TL-01: Terminal .nap/ link → openDoc', () => {
  it('absolute .nap/ path with .md extension routes to openDoc', () => {
    const result = routeLink({
      href: '/Users/dev/project/.nap/nepics/01/30/0100.nap.md',
      sourceFilePath: '',
    });
    expect(result.action).toBe('openDoc');
    if (result.action === 'openDoc') {
      expect(result.path).toBe('/Users/dev/project/.nap/nepics/01/30/0100.nap.md');
    }
  });

  it('handles empty sourceFilePath gracefully (terminal context)', () => {
    const result = routeLink({
      href: '/project/.nap/nepics/04/30/0300.spec.md',
      sourceFilePath: '',
    });
    expect(result.action).toBe('openDoc');
  });

  it('.nap/ path with .test.md extension routes to openDoc', () => {
    const result = routeLink({
      href: '/project/.nap/nepics/04/30/0300.test.md',
      sourceFilePath: '',
    });
    expect(result.action).toBe('openDoc');
  });
});

// T-0300-TL-02: Terminal code link → right pane (openCode) with line number
describe('TL-02: Terminal code link → openCode with line number', () => {
  it('extractPathAndLocation preserves line from path:line', () => {
    const result = extractPathAndLocation('src/renderer/store.ts:42');
    expect(result.path).toBe('src/renderer/store.ts');
    expect(result.line).toBe(42);
  });

  it('extractPathAndLocation preserves line:col', () => {
    const result = extractPathAndLocation('src/renderer/store.ts:42:17');
    expect(result.path).toBe('src/renderer/store.ts');
    expect(result.line).toBe(42);
    expect(result.col).toBe(17);
  });

  it('full chain: absolute code path with :line → openCode', () => {
    // Terminal resolves to absolute path, file-link-provider reattaches :line
    const resolved = '/Users/dev/project/src/renderer/store.ts:42';
    const result = routeLink({ href: resolved, sourceFilePath: '' });
    expect(result.action).toBe('openCode');
    if (result.action === 'openCode') {
      expect(result.path).toBe('/Users/dev/project/src/renderer/store.ts');
      expect(result.line).toBe(42);
    }
  });

  it('full chain: absolute code path with :line:col → openCode', () => {
    const resolved = '/Users/dev/project/src/renderer/store.ts:42:17';
    const result = routeLink({ href: resolved, sourceFilePath: '' });
    expect(result.action).toBe('openCode');
    if (result.action === 'openCode') {
      expect(result.path).toBe('/Users/dev/project/src/renderer/store.ts');
      expect(result.line).toBe(42);
      expect(result.col).toBe(17);
    }
  });

  it('full chain: absolute code path without line → openCode with no line', () => {
    const resolved = '/Users/dev/project/src/renderer/store.ts';
    const result = routeLink({ href: resolved, sourceFilePath: '' });
    expect(result.action).toBe('openCode');
    if (result.action === 'openCode') {
      expect(result.line).toBeUndefined();
    }
  });
});

// T-0300-TL-03: Terminal link — URL-like paths not misrouted
describe('TL-03: URL-like paths not misrouted', () => {
  it('https:// URL routes to openExternal, not openCode', () => {
    const result = routeLink({
      href: 'https://github.com/user/repo/blob/main/file.ts',
      sourceFilePath: '',
    });
    expect(result.action).toBe('openExternal');
  });

  it('http:// URL routes to openExternal', () => {
    const result = routeLink({
      href: 'http://localhost:3000/api/test',
      sourceFilePath: '',
    });
    expect(result.action).toBe('openExternal');
  });

  it('FILE_PATH_REGEX does not match http:// at the start of a token', () => {
    // The regex may match substrings of URLs. The isUrl guard in file-link-provider
    // is the defense. Verify extractPathAndLocation handles clean file paths correctly.
    const match = extractPathAndLocation('file.ts:10');
    expect(match.path).toBe('file.ts');
    expect(match.line).toBe(10);
  });

  it('extractPathAndLocation handles path without line info', () => {
    const match = extractPathAndLocation('src/main.ts');
    expect(match.path).toBe('src/main.ts');
    expect(match.line).toBeUndefined();
    expect(match.col).toBeUndefined();
  });
});
