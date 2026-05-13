import { describe, it, expect } from 'vitest';
import { routeLink, parseLinkHref, extractProjectRoot } from '../src/renderer/routing-rules';

// ── 1. Link provider + routing (small tests) ──

describe('Link routing — routeLink', () => {
  const napkinSource = '.nap/nepics/01-v1/30-napkins/0100/0100.nap.md';

  // T-0200-L01: Code link — bare path with line number
  describe('L01: bare code path with line number', () => {
    it('routes src/main/model.ts:42 → openCode with line 42', () => {
      const result = routeLink({
        href: 'src/main/model.ts:42',
        sourceFilePath: napkinSource,
      });
      expect(result.action).toBe('openCode');
      expect(result).toHaveProperty('line', 42);
      // Bare path → primary is dirname(source)+path, fallback is projectRoot+path
      if (result.action === 'openCode') {
        expect(result.fallbackPath).toBeDefined();
      }
    });

    it('routes bare path with line:col', () => {
      const result = routeLink({
        href: 'src/renderer/store.ts:131:5',
        sourceFilePath: napkinSource,
      });
      expect(result.action).toBe('openCode');
      if (result.action === 'openCode') {
        expect(result.line).toBe(131);
        expect(result.col).toBe(5);
      }
    });

    it('routes bare path without line number', () => {
      const result = routeLink({
        href: 'src/main/model.ts',
        sourceFilePath: napkinSource,
      });
      expect(result.action).toBe('openCode');
      if (result.action === 'openCode') {
        expect(result.line).toBeUndefined();
      }
    });
  });

  // T-0200-L02: Code link — markdown link with #L anchor
  describe('L02: markdown link with #L anchor', () => {
    it('routes /path/file.ts#L51 → openCode with line 51', () => {
      // The link provider extracts href from [text](url), so routeLink gets clean href
      const result = routeLink({
        href: '/modules/server/frontend/private/actions/copy_document.ts#L51',
        sourceFilePath: napkinSource,
      });
      expect(result.action).toBe('openCode');
      if (result.action === 'openCode') {
        expect(result.line).toBe(51);
        // Leading / → project root resolution
        expect(result.path).toContain('copy_document.ts');
        expect(result.fallbackPath).toBeUndefined(); // absolute path, no fallback
      }
    });

    it('routes relative path with #L anchor', () => {
      const result = routeLink({
        href: './utils/helpers.ts#L10',
        sourceFilePath: napkinSource,
      });
      expect(result.action).toBe('openCode');
      if (result.action === 'openCode') {
        expect(result.line).toBe(10);
        expect(result.path).toContain('helpers.ts');
      }
    });
  });

  // T-0200-L03: Markdown link — .md extension routes to left pane
  describe('L03: .md extension → openDoc', () => {
    it('routes ./02-id-universe.md → openDoc', () => {
      const result = routeLink({
        href: './02-id-universe.md',
        sourceFilePath: napkinSource,
      });
      expect(result.action).toBe('openDoc');
      if (result.action === 'openDoc') {
        expect(result.path).toContain('02-id-universe.md');
      }
    });

    it('routes ../bar/baz.spec.md → openDoc', () => {
      const result = routeLink({
        href: '../bar/baz.spec.md',
        sourceFilePath: napkinSource,
      });
      expect(result.action).toBe('openDoc');
      if (result.action === 'openDoc') {
        expect(result.path).toContain('baz.spec.md');
      }
    });

    it('extension wins: changelog.md:15 → openDoc (not openCode)', () => {
      const result = routeLink({
        href: 'changelog.md:15',
        sourceFilePath: napkinSource,
      });
      // Per spec: extension wins. .md → openDoc, :15 stripped
      expect(result.action).toBe('openDoc');
    });
  });

  // T-0200-L04: External link — https routes to browser
  describe('L04: external links → openExternal', () => {
    it('routes https://coda.io/developers → openExternal', () => {
      const result = routeLink({
        href: 'https://coda.io/developers',
        sourceFilePath: napkinSource,
      });
      expect(result).toEqual({ action: 'openExternal', url: 'https://coda.io/developers' });
    });

    it('routes http:// → openExternal', () => {
      const result = routeLink({
        href: 'http://localhost:3000/api',
        sourceFilePath: napkinSource,
      });
      expect(result).toEqual({ action: 'openExternal', url: 'http://localhost:3000/api' });
    });

    it('httpconfig.ts is NOT openExternal', () => {
      const result = routeLink({
        href: 'httpconfig.ts',
        sourceFilePath: napkinSource,
      });
      expect(result.action).not.toBe('openExternal');
      expect(result.action).toBe('openCode');
    });
  });

  // T-0200-L05: Path resolution — two-root system
  describe('L05: path resolution', () => {
    it('leading / → project root + path', () => {
      const result = routeLink({
        href: '/src/main/model.ts:10',
        sourceFilePath: '/project/.nap/nepics/01-v1/30-napkins/0100/0100.nap.md',
      });
      expect(result.action).toBe('openCode');
      if (result.action === 'openCode') {
        expect(result.path).toBe('/project/src/main/model.ts');
        expect(result.line).toBe(10);
        expect(result.fallbackPath).toBeUndefined();
      }
    });

    it('./ → dirname(source) + path', () => {
      const result = routeLink({
        href: './sibling.ts',
        sourceFilePath: '/project/.nap/nepics/01-v1/30-napkins/0100/0100.nap.md',
      });
      expect(result.action).toBe('openCode');
      if (result.action === 'openCode') {
        expect(result.path).toBe('/project/.nap/nepics/01-v1/30-napkins/0100/sibling.ts');
        expect(result.fallbackPath).toBeUndefined();
      }
    });

    it('../ → walks up from dirname(source)', () => {
      const result = routeLink({
        href: '../other/file.ts',
        sourceFilePath: '/project/.nap/nepics/01-v1/30-napkins/0100/0100.nap.md',
      });
      expect(result.action).toBe('openCode');
      if (result.action === 'openCode') {
        expect(result.path).toBe('/project/.nap/nepics/01-v1/30-napkins/other/file.ts');
      }
    });

    it('bare path → dirname primary + projectRoot fallback', () => {
      const result = routeLink({
        href: 'src/renderer/store.ts',
        sourceFilePath: '/project/.nap/nepics/01-v1/30-napkins/0100/0100.nap.md',
      });
      expect(result.action).toBe('openCode');
      if (result.action === 'openCode') {
        // Primary: dirname(source) + path
        expect(result.path).toBe('/project/.nap/nepics/01-v1/30-napkins/0100/src/renderer/store.ts');
        // Fallback: projectRoot + path
        expect(result.fallbackPath).toBe('/project/src/renderer/store.ts');
      }
    });

    it('.md link → always dirname(source)', () => {
      const result = routeLink({
        href: './notes.md',
        sourceFilePath: '/project/.nap/nepics/01-v1/30-napkins/0100/0100.nap.md',
      });
      expect(result.action).toBe('openDoc');
      if (result.action === 'openDoc') {
        expect(result.path).toBe('/project/.nap/nepics/01-v1/30-napkins/0100/notes.md');
      }
    });
  });

  // T-0200-L07: Edge case — path that doesn't exist
  describe('L07: nonexistent path', () => {
    it('returns action anyway — routeLink is a classifier, not a validator', () => {
      const result = routeLink({
        href: 'nonexistent/file.ts:10',
        sourceFilePath: napkinSource,
      });
      expect(result.action).toBe('openCode');
      // Must not throw or return null
      if (result.action === 'openCode') {
        expect(result.line).toBe(10);
        expect(result.path).toBeDefined();
      }
    });

    it('does not throw on deeply nested nonexistent path', () => {
      expect(() =>
        routeLink({
          href: 'a/b/c/d/e/f/g.ts',
          sourceFilePath: napkinSource,
        }),
      ).not.toThrow();
    });
  });
});

// T-0200-L06: Link provider regex — parseLinkHref
describe('Link routing — parseLinkHref', () => {
  it('parses bare path:line', () => {
    expect(parseLinkHref('src/model.ts:42')).toEqual({ path: 'src/model.ts', line: 42 });
  });

  it('parses path:line:col', () => {
    expect(parseLinkHref('src/model.ts:42:17')).toEqual({ path: 'src/model.ts', line: 42, col: 17 });
  });

  it('parses #L anchor', () => {
    expect(parseLinkHref('/path/to/file.ts#L51')).toEqual({ path: '/path/to/file.ts', line: 51 });
  });

  it('returns path only when no line info', () => {
    expect(parseLinkHref('config.json')).toEqual({ path: 'config.json' });
  });

  it('handles path with dots in name', () => {
    expect(parseLinkHref('file.test.ts:10')).toEqual({ path: 'file.test.ts', line: 10 });
  });
});

// T-0200-L05 supplement: extractProjectRoot
describe('Link routing — extractProjectRoot', () => {
  it('extracts root from /.nap/ absolute path', () => {
    expect(extractProjectRoot('/Users/dev/project/.nap/nepics/01/30/0100/spec.md')).toBe('/Users/dev/project');
  });

  it('extracts root from relative .nap path', () => {
    expect(extractProjectRoot('.nap/nepics/01/30/0100/spec.md')).toBe('.');
  });

  it('falls back to dirname for non-.nap paths', () => {
    expect(extractProjectRoot('/some/random/file.ts')).toBe('/some/random');
  });
});
