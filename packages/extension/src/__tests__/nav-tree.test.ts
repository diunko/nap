/**
 * Nav tree parser tests — T4.1 (directory convention parsing), T4.2 (numeric sort).
 *
 * Pure function tests, no browser needed.
 */
import { describe, it, expect } from 'vitest';
import {
  parseNavTree,
  numericPrefix,
  sortByPrefix,
  type DirEntry,
  type NavNode,
} from '../nav-tree';

// ── T4.2: numeric sort order ──

describe('numericPrefix', () => {
  it('extracts leading digits', () => {
    expect(numericPrefix('0100-feature')).toBe(100);
    expect(numericPrefix('0200-other')).toBe(200);
    expect(numericPrefix('001-architect')).toBe(1);
    expect(numericPrefix('30-napkins')).toBe(30);
  });

  it('returns Infinity for no digits', () => {
    expect(numericPrefix('readme.md')).toBe(Infinity);
  });
});

describe('sortByPrefix', () => {
  it('sorts by numeric prefix, not lexicographic', () => {
    const input = ['0200-other', '0100-feature', '0300-late'];
    expect(sortByPrefix(input)).toEqual(['0100-feature', '0200-other', '0300-late']);
    console.log('[T4.2] sort by numeric prefix passed');
  });

  it('handles mixed digit lengths (agents vs napkins)', () => {
    const input = ['002-fs-eng', '001-test-arch', '010-special'];
    expect(sortByPrefix(input)).toEqual(['001-test-arch', '002-fs-eng', '010-special']);
  });

  it('numeric sort differs from string sort for 2 vs 10', () => {
    const input = ['10-docs', '2-custom'];
    expect(sortByPrefix(input)).toEqual(['2-custom', '10-docs']);
    console.log('[T4.2] numeric vs string sort edge case passed');
  });
});

// ── T4.1: directory convention parsing ──

describe('parseNavTree', () => {
  // Mock filesystem
  const mockFs: Record<string, DirEntry[]> = {
    '/root': [
      { name: '10-docs', isDirectory: true },
      { name: '15-feedback', isDirectory: true },
      { name: '20-architects', isDirectory: true },
      { name: '30-napkins', isDirectory: true },
    ],
    '/root/10-docs': [
      { name: '01-inputs.nap.md', isDirectory: false },
    ],
    '/root/15-feedback': [
      { name: 'issues.md', isDirectory: false },
    ],
    '/root/20-architects': [
      { name: '001-architect', isDirectory: true },
    ],
    '/root/20-architects/001-architect': [
      { name: '.agent.nap.json', isDirectory: false },
      { name: 'prompt.md', isDirectory: false },
      { name: 'scratch', isDirectory: true },
    ],
    '/root/20-architects/001-architect/scratch': [
      { name: 'draft-01.md', isDirectory: false },
    ],
    '/root/30-napkins': [
      { name: '0100-feature', isDirectory: true },
      { name: '0200-other', isDirectory: true },
    ],
    '/root/30-napkins/0100-feature': [
      { name: '.napkin.nap.json', isDirectory: false },
      { name: '0100-feature.nap.md', isDirectory: false },
      { name: '0100-feature.spec.md', isDirectory: false },
      { name: 'mini-book', isDirectory: true },
      { name: 'agents', isDirectory: true },
    ],
    '/root/30-napkins/0100-feature/mini-book': [
      { name: '01-chapter.md', isDirectory: false },
      { name: '02-chapter.md', isDirectory: false },
    ],
    '/root/30-napkins/0100-feature/agents': [
      { name: '001-test-arch-feature', isDirectory: true },
    ],
    '/root/30-napkins/0100-feature/agents/001-test-arch-feature': [
      { name: '.agent.nap.json', isDirectory: false },
      { name: 'prompt.md', isDirectory: false },
      { name: 'response.md', isDirectory: false },
    ],
    '/root/30-napkins/0200-other': [
      { name: '.napkin.nap.json', isDirectory: false },
      { name: '0200-other.nap.md', isDirectory: false },
    ],
  };

  const mockJson: Record<string, Record<string, unknown>> = {
    '/root/30-napkins/0100-feature/.napkin.nap.json': { status: 'doing' },
    '/root/30-napkins/0200-other/.napkin.nap.json': { status: 'backlog' },
  };

  const readDir = async (path: string): Promise<DirEntry[]> => {
    console.log(`[mock readDir] ${path}`);
    return mockFs[path] ?? [];
  };

  const readJson = async (path: string) => {
    console.log(`[mock readJson] ${path}`);
    return mockJson[path];
  };

  it('parses all four section types', async () => {
    const tree = await parseNavTree('/root', readDir, readJson);

    expect(tree).toHaveLength(4);
    expect(tree[0].displayName).toBe('docs');
    expect(tree[1].displayName).toBe('feedback');
    expect(tree[2].displayName).toBe('architects');
    expect(tree[3].displayName).toBe('napkins');
    console.log('[T4.1] all sections found');
  });

  it('architects section has correct structure', async () => {
    const tree = await parseNavTree('/root', readDir, readJson);
    const architects = tree.find(n => n.displayName === 'architects')!;

    expect(architects.children).toHaveLength(1);
    const arch = architects.children![0];
    expect(arch.type).toBe('architect');
    expect(arch.displayName).toBe('architect');
    expect(arch.children).toBeDefined();
    // Should have prompt.md + scratch/ (skipping .agent.nap.json which starts with .)
    const visibleChildren = arch.children!.filter(c => !c.name.startsWith('.'));
    expect(visibleChildren.length).toBeGreaterThanOrEqual(2);
    console.log('[T4.1] architect children:', visibleChildren.map(c => c.name));
  });

  it('napkins have status labels from .napkin.nap.json', async () => {
    const tree = await parseNavTree('/root', readDir, readJson);
    const napkins = tree.find(n => n.displayName === 'napkins')!;

    expect(napkins.children).toHaveLength(2);
    expect(napkins.children![0].displayName).toBe('feature');
    expect(napkins.children![0].status).toBe('doing');
    expect(napkins.children![1].displayName).toBe('other');
    expect(napkins.children![1].status).toBe('backlog');
    console.log('[T4.1] napkin status labels correct');
  });

  it('napkins sorted by numeric prefix (0100 before 0200)', async () => {
    const tree = await parseNavTree('/root', readDir, readJson);
    const napkins = tree.find(n => n.displayName === 'napkins')!;

    expect(napkins.children![0].name).toBe('0100-feature');
    expect(napkins.children![1].name).toBe('0200-other');
    console.log('[T4.1] napkin sort order correct');
  });

  it('agents nested under parent napkin', async () => {
    const tree = await parseNavTree('/root', readDir, readJson);
    const napkins = tree.find(n => n.displayName === 'napkins')!;
    const feature = napkins.children![0];

    const agentsSection = feature.children?.find(c => c.name === 'agents');
    expect(agentsSection).toBeDefined();
    expect(agentsSection!.children).toHaveLength(1);
    expect(agentsSection!.children![0].displayName).toBe('test-arch-feature');
    console.log('[T4.1] agents nested correctly');
  });

  it('handles missing .napkin.nap.json gracefully', async () => {
    const sparseReadJson = async () => undefined;
    const tree = await parseNavTree('/root', readDir, sparseReadJson);
    const napkins = tree.find(n => n.displayName === 'napkins')!;

    expect(napkins.children![0].status).toBeUndefined();
    console.log('[T4.1] missing status handled');
  });

  it('includes non-agents subdirectories (mini-book/)', async () => {
    const tree = await parseNavTree('/root', readDir, readJson);
    const napkins = tree.find(n => n.displayName === 'napkins')!;
    const feature = napkins.children![0];

    const miniBook = feature.children?.find(c => c.name === 'mini-book');
    expect(miniBook).toBeDefined();
    expect(miniBook!.type).toBe('section');
    expect(miniBook!.children).toHaveLength(2);
    expect(miniBook!.children![0].name).toBe('01-chapter.md');
    expect(miniBook!.children![1].name).toBe('02-chapter.md');
    console.log('[T4.1] mini-book subdirectory parsed');
  });
});
