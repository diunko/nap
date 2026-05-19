import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createNapStore, _resetTabIdCounter, type NapStoreApi } from '../store';
import { createMemoryStorage } from '../state-store';
import { createModel, type NapModel } from '../model';
import type { LightningFsAdapter } from '../fs-adapter';
import {
  parseNapHash,
  parsePageUrl,
  deriveStateKey,
  buildNapConfig,
  type NapConfig,
} from '../url-config';

// ── Mock adapter that simulates empty LFS ──

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
    cloneUrl: 'https://github.com/diunko/nap-test-nap',
    napBranch: 'main',
    napkinFocus: '0100-delivery-pipeline',
    mainOwner: 'diunko',
    mainRepo: 'nap-test-main',
    mainBranch: 'feature/delivery-v2',
    prNum: 1,
    ...overrides,
  };
}

// ── WW-M01: content script → panel message flow (mocked) ──

describe('WW-M01: nap-config message shape', () => {
  beforeEach(_resetTabIdCounter);

  it('builds correct message shape from URL hash + page', () => {
    const hash = '#nap-repo=github/diunko/nap-test-nap&napkin=01-v1/0100-delivery-pipeline';
    const hashConfig = parseNapHash(hash)!;
    const page = parsePageUrl('/diunko/nap-test-main/pull/1');
    const key = deriveStateKey(page, hashConfig);
    const config = buildNapConfig(page, hashConfig, 'feature/delivery-v2');

    expect(key).toBe('diunko/nap-test-main/1/github/diunko/nap-test-nap/main');
    expect(config.cloneUrl).toBe('https://github.com/diunko/nap-test-nap');
    expect(config.mainOwner).toBe('diunko');
    expect(config.mainRepo).toBe('nap-test-main');
    expect(config.mainBranch).toBe('feature/delivery-v2');
    expect(config.prNum).toBe(1);
    expect(config.napkinFocus).toBe('0100-delivery-pipeline');
  });

  it('model.applyConfig sets store state correctly', () => {
    const store = createNapStore();
    const adapter = createMockAdapter();
    const model = createModel({ adapter, store });
    const config = makeConfig();

    model.applyConfig(config);

    const s = store.getState();
    expect(s.mainRepoConfig).toEqual({
      owner: 'diunko',
      repo: 'nap-test-main',
      branch: 'feature/delivery-v2',
    });
    expect(s.prNum).toBe(1);

    model.destroy();
  });

  it('missing hash returns null', () => {
    expect(parseNapHash('')).toBeNull();
    expect(parseNapHash('#something-else=true')).toBeNull();
  });
});

// ── WW-M02: auto-clone via model orchestration ──

describe('WW-M02: model auto-clone', () => {
  beforeEach(_resetTabIdCounter);

  it('triggers clone when shell + config + empty LFS all ready', async () => {
    const store = createNapStore();
    const adapter = createMockAdapter();
    const model = createModel({ adapter, store });
    const mockExec = vi.fn();

    model.applyConfig(makeConfig());
    model.registerShell(mockExec);
    await model.init();

    expect(mockExec).toHaveBeenCalledTimes(1);
    expect(mockExec.mock.calls[0][0]).toMatch(/^git clone.*nap-test-nap/);
    expect(store.getState().cloningStatus).toBe('cloning');

    model.destroy();
  });

  it('works regardless of call order: init → config → shell', async () => {
    const store = createNapStore();
    const adapter = createMockAdapter();
    const model = createModel({ adapter, store });
    const mockExec = vi.fn();

    await model.init();                    // first: no config, no shell
    model.applyConfig(makeConfig());       // second: has config, no shell
    model.registerShell(mockExec);         // third: all ready → clone fires

    expect(mockExec).toHaveBeenCalledTimes(1);
    expect(store.getState().cloningStatus).toBe('cloning');

    model.destroy();
  });

  it('works regardless of call order: shell → init → config', async () => {
    const store = createNapStore();
    const adapter = createMockAdapter();
    const model = createModel({ adapter, store });
    const mockExec = vi.fn();

    model.registerShell(mockExec);         // first: no config, no init
    await model.init();                    // second: init complete, no config
    model.applyConfig(makeConfig());       // third: all ready → clone fires

    expect(mockExec).toHaveBeenCalledTimes(1);

    model.destroy();
  });

  it('does NOT clone before init completes', () => {
    const store = createNapStore();
    const adapter = createMockAdapter();
    const model = createModel({ adapter, store });
    const mockExec = vi.fn();

    // Config and shell ready, but init not called yet
    model.applyConfig(makeConfig());
    model.registerShell(mockExec);

    // Clone should NOT fire — init hasn't run
    expect(mockExec).not.toHaveBeenCalled();

    model.destroy();
  });

  it('does NOT clone when repos already exist', async () => {
    const store = createNapStore();
    const adapter = createMockAdapter();
    const model = createModel({ adapter, store });
    const mockExec = vi.fn();

    // Simulate existing repos: nav already populated
    store.getState().refreshNav([
      { type: 'section', name: '30-napkins', displayName: '30-napkins', path: '/test' },
    ]);

    model.applyConfig(makeConfig());
    model.registerShell(mockExec);
    await model.init();

    expect(mockExec).not.toHaveBeenCalled();
    expect(store.getState().cloningStatus).toBe('idle');

    model.destroy();
  });

  it('does NOT clone twice', async () => {
    const store = createNapStore();
    const adapter = createMockAdapter();
    const model = createModel({ adapter, store });
    const mockExec = vi.fn();

    model.applyConfig(makeConfig());
    model.registerShell(mockExec);
    await model.init();
    // Simulate another config arrival
    model.applyConfig(makeConfig());

    expect(mockExec).toHaveBeenCalledTimes(1);

    model.destroy();
  });

  it('napkin focus applied immediately on return visit (nav populated)', () => {
    const store = createNapStore();
    const adapter = createMockAdapter();
    const model = createModel({ adapter, store });

    // Simulate return visit: nav already populated
    store.getState().refreshNav([
      { type: 'section', name: '30-napkins', displayName: '30-napkins', path: '/test' },
    ]);

    model.applyConfig(makeConfig({ napkinFocus: '0100-delivery-pipeline' }));

    expect(store.getState().focusedCardSlug).toBe('0100-delivery-pipeline');

    model.destroy();
  });
});

// ── WW-M03: fetch latest ──

describe('WW-M03: model.fetchLatest', () => {
  beforeEach(_resetTabIdCounter);

  it('sends correct git commands via shell', () => {
    const store = createNapStore();
    const adapter = createMockAdapter();
    const model = createModel({ adapter, store });
    const mockExec = vi.fn();

    store.getState().setMainRepo({ owner: 'diunko', repo: 'nap-test-main', branch: 'feature/delivery-v2' });
    // applyConfig sets the model's internal config (including napBranch and cloneUrl)
    model.applyConfig(makeConfig({ napBranch: 'main' }));
    model.registerShell(mockExec);

    model.fetchLatest();

    // fetchLatest should send cd + fetch + checkout using napBranch (not mainRepoConfig.branch)
    const fetchCall = mockExec.mock.calls.find((c: any) => c[0].includes('git fetch'));
    expect(fetchCall).toBeDefined();
    const cmd = fetchCall![0];
    expect(cmd).toContain('cd /home/user/nap-test-nap');
    expect(cmd).toContain('git fetch origin');
    expect(cmd).toContain('git checkout origin/main'); // napBranch, not mainRepoConfig.branch

    model.destroy();
  });

  it('does nothing when no shell registered', () => {
    const store = createNapStore();
    const adapter = createMockAdapter();
    const model = createModel({ adapter, store });
    model.applyConfig(makeConfig());

    // No shell registered — should not throw
    model.fetchLatest();

    model.destroy();
  });
});

// ── WW-M04: prDiffRanges in store ──

describe('WW-M04: prDiffRanges store', () => {
  beforeEach(_resetTabIdCounter);

  it('setPrDiffRanges stores range map', () => {
    const store = createNapStore();
    const ranges = {
      'modules/delivery/order-router.ts': [{ start: 47, end: 62 }],
      'modules/queue/warp-queue.ts': [{ start: 10, end: 20 }],
    };
    store.getState().setPrDiffRanges(ranges);
    expect(store.getState().prDiffRanges).toEqual(ranges);
  });

  it('cloningStatus transitions correctly', () => {
    const store = createNapStore();
    expect(store.getState().cloningStatus).toBe('idle');
    store.getState().setCloningStatus('cloning');
    expect(store.getState().cloningStatus).toBe('cloning');
    store.getState().setCloningStatus('done');
    expect(store.getState().cloningStatus).toBe('done');
  });

  it('cloningStatus is NOT persisted (transient)', async () => {
    const storage = createMemoryStorage();
    const store = createNapStore('pr-42', storage);
    await new Promise(r => setTimeout(r, 50));

    store.getState().setCloningStatus('cloning');
    await new Promise(r => setTimeout(r, 50));

    const store2 = createNapStore('pr-42', storage);
    await new Promise(r => setTimeout(r, 100));
    expect(store2.getState().cloningStatus).toBe('idle');
  });
});
