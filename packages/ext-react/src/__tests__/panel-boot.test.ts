import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveBootState } from '../boot-gate';
import { createNapStore, _resetTabIdCounter } from '../store';
import { createModel } from '../model';
import type { NapConfig } from '../url-config';
import type { LightningFsAdapter } from '../fs-adapter';

function createMockAdapter(): LightningFsAdapter {
  const dirs = new Map<string, string[]>();
  return {
    onChange: () => () => {},
    readdir: async (path: string) => dirs.get(path) ?? [],
    stat: async () => ({ isDirectory: true, isFile: false, isSymbolicLink: false, mode: 0o777, size: 0, mtime: new Date() }),
    exists: async () => false,
    readFile: async () => '',
    writeFile: async () => {},
    appendFile: async () => {},
    mkdir: async (path: string) => { dirs.set(path, []); },
    rm: async () => {},
    cp: async () => {},
    mv: async () => {},
    chmod: async () => {},
    utimes: async () => {},
    symlink: async () => {},
    link: async () => { throw new Error('not supported'); },
    readlink: async () => '',
    readFileBuffer: async () => new Uint8Array(),
    realpath: async (p: string) => p,
    resolvePath: (base: string, path: string) => path.startsWith('/') ? path : `${base}/${path}`,
    getAllPaths: () => [],
    lstat: async () => ({ isDirectory: true, isFile: false, isSymbolicLink: false, mode: 0o777, size: 0, mtime: new Date() }),
    emit: () => {},
  } as unknown as LightningFsAdapter;
}

function makeConfig(overrides?: Partial<NapConfig>): NapConfig {
  return {
    provider: 'github',
    cloneUrl: 'https://github.com/diunko/nap-test-nap.git',
    napBranch: 'main',
    napkinFocus: '0100-delivery-pipeline',
    mainOwner: 'diunko',
    mainRepo: 'nap-test-main',
    mainBranch: 'feature/delivery-v2',
    prNum: 1,
    ...overrides,
  };
}

// ── PB-S01: boot-gate decision logic ──

describe('PB-S01: boot-gate decision logic', () => {
  it('github.com + nap hash → session with config and key', () => {
    const url = 'https://github.com/diunko/nap-test-main/pull/1#nap-repo=github/diunko/nap-test-nap&napkin=01-v1/0100-delivery-pipeline';
    const result = resolveBootState(url);

    expect(result.state).toBe('session');
    if (result.state !== 'session') return;
    expect(result.config.cloneUrl).toBe('https://github.com/diunko/nap-test-nap.git');
    expect(result.config.mainOwner).toBe('diunko');
    expect(result.config.mainRepo).toBe('nap-test-main');
    expect(result.config.prNum).toBe(1);
    expect(result.config.napkinFocus).toBe('0100-delivery-pipeline');
    expect(result.config.mainBranch).toBe('main'); // defaults to 'main' — no DOM read
    expect(result.key).toBe('diunko/nap-test-main/1/github/diunko/nap-test-nap/main');
  });

  it('github.com + no hash → no-hash', () => {
    const url = 'https://github.com/diunko/nap-test-main/pull/1';
    const result = resolveBootState(url);
    expect(result.state).toBe('no-hash');
  });

  it('github.com repo page + no hash → no-hash', () => {
    const url = 'https://github.com/diunko/nap-test-main';
    const result = resolveBootState(url);
    expect(result.state).toBe('no-hash');
  });

  it('non-github URL → wrong-page', () => {
    const url = 'https://www.google.com/';
    const result = resolveBootState(url);
    expect(result.state).toBe('wrong-page');
  });

  it('chrome:// URL → wrong-page', () => {
    const url = 'chrome://extensions/';
    const result = resolveBootState(url);
    expect(result.state).toBe('wrong-page');
  });

  it('empty URL → wrong-page', () => {
    expect(resolveBootState('')).toEqual({ state: 'wrong-page' });
  });

  it('undefined URL → wrong-page', () => {
    expect(resolveBootState(undefined)).toEqual({ state: 'wrong-page' });
  });

  it('mainBranch defaults to main (no DOM read)', () => {
    const url = 'https://github.com/owner/repo/pull/42#nap-repo=github/org/nap-repo';
    const result = resolveBootState(url);
    if (result.state !== 'session') throw new Error('expected session');
    expect(result.config.mainBranch).toBe('main');
  });
});

// ── PB-S02: activeSurface default change ──

describe('PB-S02: activeSurface default', () => {
  beforeEach(_resetTabIdCounter);

  it('fresh store defaults activeSurface to editor', () => {
    const store = createNapStore();
    expect(store.getState().activeSurface).toBe('editor');
  });

  it('openDoc keeps activeSurface as editor', () => {
    const store = createNapStore();
    store.getState().openDoc('/test.md');
    expect(store.getState().activeSurface).toBe('editor');
  });
});

// ── PB-M01: model constructed with config ──

describe('PB-M01: model with config at construction', () => {
  beforeEach(_resetTabIdCounter);

  it('model created with config + empty LFS → after init + registerShell → clone fires', async () => {
    const store = createNapStore();
    const adapter = createMockAdapter();
    const model = createModel({ adapter, store, config: makeConfig() });
    const mockExec = vi.fn();

    model.registerShell(mockExec);
    await model.init();

    expect(mockExec).toHaveBeenCalledTimes(1);
    expect(mockExec.mock.calls[0][0]).toMatch(/git clone.*nap-test-nap/);

    model.destroy();
  });

  it('model created with config + existing repos → no clone', async () => {
    const store = createNapStore();
    const adapter = createMockAdapter();

    // Simulate existing repos
    store.getState().refreshNav([
      { type: 'section', name: '30-napkins', displayName: '30-napkins', path: '/test' },
    ]);

    const model = createModel({ adapter, store, config: makeConfig() });
    const mockExec = vi.fn();

    model.registerShell(mockExec);
    await model.init();

    expect(mockExec).not.toHaveBeenCalled();

    model.destroy();
  });

  it('model created with config + navSections populated (IDB return visit) → no clone', async () => {
    const store = createNapStore();
    const adapter = createMockAdapter();

    store.getState().refreshNav([
      { type: 'section', name: '30-napkins', displayName: '30-napkins', path: '/test' },
    ]);

    const model = createModel({ adapter, store, config: makeConfig() });
    const mockExec = vi.fn();

    model.registerShell(mockExec);
    await model.init();

    expect(mockExec).not.toHaveBeenCalled();

    model.destroy();
  });

  it('store has mainRepoConfig and prNum set at construction time', () => {
    const store = createNapStore();
    const adapter = createMockAdapter();
    const model = createModel({ adapter, store, config: makeConfig() });

    expect(store.getState().mainRepoConfig).toEqual({
      owner: 'diunko',
      repo: 'nap-test-main',
      branch: 'feature/delivery-v2',
    });
    expect(store.getState().prNum).toBe(1);

    model.destroy();
  });

  it('shell registered before init → clone fires after init', async () => {
    const store = createNapStore();
    const adapter = createMockAdapter();
    const model = createModel({ adapter, store, config: makeConfig() });
    const mockExec = vi.fn();

    model.registerShell(mockExec);
    expect(mockExec).not.toHaveBeenCalled(); // init not done

    await model.init();
    expect(mockExec).toHaveBeenCalledTimes(1);

    model.destroy();
  });
});

// ── PB-M03: content script trim verification ──

describe('PB-M03: content script trim', () => {
  it('content.ts does NOT import url-config (hash parsing removed)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const contentSrc = fs.readFileSync(
      path.resolve(__dirname, '../content.ts'),
      'utf-8',
    );

    // Should NOT import url-config (hash parsing removed)
    expect(contentSrc).not.toContain('url-config');
    expect(contentSrc).not.toContain('parseNapHash');
    expect(contentSrc).not.toContain('parseAndSendConfig');

    // Should NOT have SPA observer
    expect(contentSrc).not.toContain('MutationObserver');
    expect(contentSrc).not.toContain('hashchange');

    // Should NOT have get-nap-config handler
    expect(contentSrc).not.toContain('get-nap-config');
    expect(contentSrc).not.toContain('nap-config');

    // SHOULD still have navigate handler
    expect(contentSrc).toContain("message.type === 'navigate'");

    // SHOULD still have trigger button
    expect(contentSrc).toContain('nap-open-panel');

    // SHOULD still have napLoaded marker
    expect(contentSrc).toContain('napLoaded');
  });
});

// ── PB-M02: refresh PR logic ──

describe('PB-M02: refreshPr', () => {
  beforeEach(_resetTabIdCounter);

  it('does not crash when chrome.tabs.query is unavailable', () => {
    const store = createNapStore();
    const adapter = createMockAdapter();
    const model = createModel({ adapter, store, config: makeConfig() });

    // No chrome global — should not throw
    model.refreshPr();

    model.destroy();
  });

  it('does NOT remount or switch session', () => {
    const store = createNapStore();
    const adapter = createMockAdapter();
    const config = makeConfig();
    const model = createModel({ adapter, store, config });

    // Store state is set at construction
    expect(store.getState().prNum).toBe(1);

    // refreshPr without chrome API is a no-op — session stays intact
    model.refreshPr();

    expect(store.getState().prNum).toBe(1);
    expect(store.getState().mainRepoConfig).toEqual({
      owner: 'diunko',
      repo: 'nap-test-main',
      branch: 'feature/delivery-v2',
    });

    model.destroy();
  });
});
