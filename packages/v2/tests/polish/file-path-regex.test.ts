import { describe, test, expect } from 'vitest';
import { FILE_PATH_REGEX, createFileLinkProvider } from '../../src/renderer/file-link-provider';

function matchAll(text: string): string[] {
  const regex = new RegExp(FILE_PATH_REGEX.source, 'g');
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    matches.push(m[0]);
  }
  return matches;
}

/** Create a link provider with a mock terminal that returns `text` for line 1 */
function testLinks(
  text: string,
): Promise<{ texts: string[]; activatedPaths: string[] }> {
  const mockTerminal = {
    buffer: {
      active: {
        getLine: (_n: number) => ({
          translateToString: () => text,
        }),
      },
    },
  } as any;

  const activatedPaths: string[] = [];
  const provider = createFileLinkProvider(
    mockTerminal,
    () => '/test-cwd',
    (p: string) => activatedPaths.push(p),
  );

  return new Promise((resolve) => {
    provider.provideLinks(1, (links) => {
      const texts = links ? links.map((l) => l.text) : [];
      // Activate each link to record resolved paths
      if (links) {
        for (const link of links) {
          link.activate({} as MouseEvent, link.text);
        }
      }
      resolve({ texts, activatedPaths });
    });
  });
}

// T-0600-17: File path regex matches common patterns
describe('T-0600-17: FILE_PATH_REGEX matches common file path patterns', () => {
  test('relative path: src/main/main.ts', () => {
    expect(matchAll('Error in src/main/main.ts')).toContain('src/main/main.ts');
  });

  test('dot-slash path: ./tests/foo.ts', () => {
    expect(matchAll('See ./tests/foo.ts for details')).toContain('./tests/foo.ts');
  });

  test('absolute path: /Users/me/file.ts', () => {
    expect(matchAll('at /Users/me/file.ts')).toContain('/Users/me/file.ts');
  });

  test('path with line and column: file.ts:42:17', () => {
    expect(matchAll('Error at file.ts:42:17')).toContain('file.ts:42:17');
  });

  test('path with line only: file.ts:42', () => {
    expect(matchAll('Warning at file.ts:42')).toContain('file.ts:42');
  });

  test('deeply nested: src/renderer/components/Sidebar.tsx', () => {
    expect(matchAll('in src/renderer/components/Sidebar.tsx')).toContain(
      'src/renderer/components/Sidebar.tsx',
    );
  });

  test('parent-relative: ../lib/utils.ts', () => {
    expect(matchAll('from ../lib/utils.ts')).toContain('../lib/utils.ts');
  });

  test('multiple paths in same line', () => {
    const matches = matchAll('diff src/a.ts src/b.ts');
    expect(matches).toContain('src/a.ts');
    expect(matches).toContain('src/b.ts');
  });

  test('plain words without file extensions do not match', () => {
    expect(matchAll('the quick brown fox jumps over')).toHaveLength(0);
  });
});

// T-0600-19: URLs not captured by file path provider
describe('T-0600-19: URLs not captured by file link provider', () => {
  test('https://example.com/path/to/file.html — should not produce links', async () => {
    const { texts } = await testLinks('Visit https://example.com/path/to/file.html');
    for (const t of texts) {
      expect(t).not.toContain('example.com');
    }
  });

  test('http://short.io/file.js — should not produce links', async () => {
    const { texts } = await testLinks('See http://short.io/file.js');
    for (const t of texts) {
      expect(t).not.toContain('short.io');
    }
  });

  test('file path NOT preceded by URL scheme is still matched', async () => {
    const { texts } = await testLinks('Error in src/main.ts and https://example.com/docs');
    expect(texts).toContain('src/main.ts');
  });

  test('activate resolves relative path using cwd', async () => {
    const { texts, activatedPaths } = await testLinks('See src/main.ts for details');
    expect(texts).toContain('src/main.ts');
    expect(activatedPaths).toContain('/test-cwd/src/main.ts');
  });

  test('activate preserves absolute paths', async () => {
    const { texts, activatedPaths } = await testLinks('at /Users/me/file.ts');
    expect(texts).toContain('/Users/me/file.ts');
    expect(activatedPaths).toContain('/Users/me/file.ts');
  });

  test('activate strips ./ prefix before joining cwd', async () => {
    const { texts, activatedPaths } = await testLinks('See ./tests/foo.ts');
    expect(texts).toContain('./tests/foo.ts');
    expect(activatedPaths).toContain('/test-cwd/tests/foo.ts');
  });
});
