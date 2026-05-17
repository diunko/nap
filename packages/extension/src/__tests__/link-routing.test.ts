/**
 * Link routing tests — T5.1 (GitHub URL), T5.2 (.md -> openDoc), T5.3 (https -> external).
 */
import { describe, it, expect } from 'vitest';
import {
  routeLink,
  parseLinkHref,
  buildGitHubUrl,
} from '../link-routing';

// ── parseLinkHref ──

describe('parseLinkHref', () => {
  it('parses #L anchor', () => {
    const result = parseLinkHref('/modules/server/copy.ts#L51');
    expect(result.path).toBe('/modules/server/copy.ts');
    expect(result.line).toBe(51);
    console.log('[T5.1] #L anchor parsed');
  });

  it('parses :line suffix', () => {
    const result = parseLinkHref('copy.ts:51');
    expect(result.path).toBe('copy.ts');
    expect(result.line).toBe(51);
    console.log('[T5.1] :line parsed');
  });

  it('returns bare path with no line info', () => {
    const result = parseLinkHref('readme.md');
    expect(result.path).toBe('readme.md');
    expect(result.line).toBeUndefined();
  });
});

// ── T5.1: file:line -> GitHub blob URL ──

describe('buildGitHubUrl', () => {
  const config = { owner: 'acme', repo: 'project', branch: 'main' };

  it('builds correct URL with #L anchor', () => {
    const url = buildGitHubUrl('/modules/server/copy_document.ts', 51, config);
    expect(url).toBe('https://github.com/acme/project/blob/main/modules/server/copy_document.ts#L51');
    console.log('[T5.1] GitHub URL with line anchor correct');
  });

  it('strips leading slash from path', () => {
    const url = buildGitHubUrl('/src/index.ts', undefined, config);
    expect(url).toBe('https://github.com/acme/project/blob/main/src/index.ts');
    console.log('[T5.1] leading slash stripped');
  });

  it('handles bare path without leading slash', () => {
    const url = buildGitHubUrl('src/index.ts', undefined, config);
    expect(url).toBe('https://github.com/acme/project/blob/main/src/index.ts');
  });

  it('uses placeholder when no config provided', () => {
    const url = buildGitHubUrl('/src/index.ts', 10, undefined);
    expect(url).toBe('https://github.com/OWNER/REPO/blob/main/src/index.ts#L10');
    console.log('[T5.1] placeholder defaults work');
  });

  it('handles .ts/.tsx extensions', () => {
    const url = buildGitHubUrl('/components/App.tsx', 5, config);
    expect(url).toContain('/App.tsx#L5');
  });
});

// ── T5.2: .md link -> openDoc ──

describe('routeLink — .md links', () => {
  it('resolves relative .md to sibling path', () => {
    const result = routeLink({
      href: '02-id-universe.md',
      sourceFilePath: '/home/user/repo/.nap/nepics/01-v1/30-napkins/0100/01-copy-pipeline.md',
    });
    expect(result.action).toBe('openDoc');
    if (result.action === 'openDoc') {
      expect(result.path).toBe('/home/user/repo/.nap/nepics/01-v1/30-napkins/0100/02-id-universe.md');
    }
    console.log('[T5.2] .md relative resolved');
  });

  it('resolves .md with path separator', () => {
    const result = routeLink({
      href: '../0200/chapter.md',
      sourceFilePath: '/root/0100/readme.md',
    });
    expect(result.action).toBe('openDoc');
    if (result.action === 'openDoc') {
      expect(result.path).toBe('/root/0200/chapter.md');
    }
  });
});

// ── T5.3: https:// -> external ──

describe('routeLink — external links', () => {
  it('classifies https:// as openExternal', () => {
    const result = routeLink({
      href: 'https://example.com',
      sourceFilePath: '/whatever.md',
    });
    expect(result.action).toBe('openExternal');
    if (result.action === 'openExternal') {
      expect(result.url).toBe('https://example.com');
    }
    console.log('[T5.3] external link classified');
  });

  it('classifies http:// as openExternal', () => {
    const result = routeLink({
      href: 'http://localhost:3000',
      sourceFilePath: '/whatever.md',
    });
    expect(result.action).toBe('openExternal');
  });
});

// ── T5.1: routeLink for code links ──

describe('routeLink — code links', () => {
  const config = { owner: 'acme', repo: 'project', branch: 'main' };

  it('routes .ts file to GitHub URL', () => {
    const result = routeLink(
      { href: '/modules/server/copy_document.ts#L51', sourceFilePath: '/chapter.md' },
      config,
    );
    expect(result.action).toBe('openCode');
    if (result.action === 'openCode') {
      expect(result.githubUrl).toContain('github.com/acme/project');
      expect(result.githubUrl).toContain('#L51');
      expect(result.line).toBe(51);
    }
    console.log('[T5.1] code link routed to GitHub');
  });

  it('routes .tsx file with :line suffix', () => {
    const result = routeLink(
      { href: 'App.tsx:10', sourceFilePath: '/chapter.md' },
      config,
    );
    expect(result.action).toBe('openCode');
    if (result.action === 'openCode') {
      expect(result.line).toBe(10);
    }
  });
});
