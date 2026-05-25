import { describe, it, expect, vi } from 'vitest';
import { createMonacoCommand } from '../monaco-command';

// ── Test harness ──

function makeMockStore() {
  const state = {
    openDoc: vi.fn(),
    pinActiveEphemeral: vi.fn(),
    setActiveSurface: vi.fn(),
  };
  return { getState: () => state } as any;
}

function makeMockAdapter(existsResult: boolean) {
  return {
    exists: vi.fn(async () => existsResult),
    resolvePath: (base: string, rel: string): string => {
      if (rel.startsWith('/')) return rel;
      // Simple normalization for tests
      const parts = (base + '/' + rel).split('/');
      const out: string[] = [];
      for (const part of parts) {
        if (part === '' || part === '.') continue;
        if (part === '..') { out.pop(); continue; }
        out.push(part);
      }
      return '/' + out.join('/');
    },
  } as any;
}

async function runCommand(
  store: any,
  adapter: any,
  args: string[],
  cwd = '/home/user',
) {
  const cmd = createMonacoCommand(store, adapter);
  return cmd.execute(args, { cwd, fs: adapter, env: new Map() } as any);
}

// ── MC-S01: relative path resolved against cwd ──

describe('MC-S01: relative path resolved against cwd', () => {
  it('resolves playground.yaml relative to /home/user', async () => {
    const store = makeMockStore();
    const adapter = makeMockAdapter(true);
    const result = await runCommand(store, adapter, ['playground.yaml'], '/home/user');

    expect(adapter.exists).toHaveBeenCalledWith('/home/user/playground.yaml');
    expect(store.getState().openDoc).toHaveBeenCalledWith('/home/user/playground.yaml');
    expect(result.exitCode).toBe(0);
  });
});

// ── MC-S02: absolute path used as-is ──

describe('MC-S02: absolute path used as-is', () => {
  it('does not prepend cwd for absolute path', async () => {
    const store = makeMockStore();
    const adapter = makeMockAdapter(true);
    const result = await runCommand(
      store, adapter,
      ['/home/user/nap-repo/file.md'],
      '/home/user',
    );

    expect(adapter.exists).toHaveBeenCalledWith('/home/user/nap-repo/file.md');
    expect(store.getState().openDoc).toHaveBeenCalledWith('/home/user/nap-repo/file.md');
    expect(result.exitCode).toBe(0);
  });
});

// ── MC-S03: `..` in relative path ──

describe('MC-S03: .. in relative path', () => {
  it('resolves ../other/file.md correctly', async () => {
    const store = makeMockStore();
    const adapter = makeMockAdapter(true);
    const result = await runCommand(
      store, adapter,
      ['../other/file.md'],
      '/home/user/repo',
    );

    expect(adapter.exists).toHaveBeenCalledWith('/home/user/other/file.md');
    expect(store.getState().openDoc).toHaveBeenCalledWith('/home/user/other/file.md');
    expect(result.exitCode).toBe(0);
  });
});

// ── MC-S04: file doesn't exist → error, no tab ──

describe('MC-S04: file doesn\'t exist → error, no tab', () => {
  it('returns error and does not open doc', async () => {
    const store = makeMockStore();
    const adapter = makeMockAdapter(false);
    const result = await runCommand(store, adapter, ['nonexistent.yaml']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('nonexistent.yaml');
    expect(result.stderr).toContain('no such file');
    expect(store.getState().openDoc).not.toHaveBeenCalled();
  });
});

// ── MC-S05: --help flag ──

describe('MC-S05: --help flag', () => {
  it('shows usage text and makes no store calls', async () => {
    const store = makeMockStore();
    const adapter = makeMockAdapter(true);
    const result = await runCommand(store, adapter, ['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('usage');
    expect(result.stdout).toContain('monaco');
    expect(store.getState().openDoc).not.toHaveBeenCalled();
  });
});

// ── MC-S06: no args → same as --help ──

describe('MC-S06: no args → same as --help', () => {
  it('shows usage text for empty args', async () => {
    const store = makeMockStore();
    const adapter = makeMockAdapter(true);
    const result = await runCommand(store, adapter, []);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('usage');
    expect(store.getState().openDoc).not.toHaveBeenCalled();
  });
});

// ── MC-S07: successful open → permanent tab + editor surface ──

describe('MC-S07: successful open → permanent tab + editor surface', () => {
  it('calls openDoc, pinActiveEphemeral, setActiveSurface in order', async () => {
    const store = makeMockStore();
    const adapter = makeMockAdapter(true);
    const callOrder: string[] = [];
    const s = store.getState();
    s.openDoc.mockImplementation(() => callOrder.push('openDoc'));
    s.pinActiveEphemeral.mockImplementation(() => callOrder.push('pinActiveEphemeral'));
    s.setActiveSurface.mockImplementation(() => callOrder.push('setActiveSurface'));

    await runCommand(store, adapter, ['file.md']);

    expect(callOrder).toEqual(['openDoc', 'pinActiveEphemeral', 'setActiveSurface']);
    expect(s.setActiveSurface).toHaveBeenCalledWith('editor');
  });
});

// ── MC-S08: return value on success ──

describe('MC-S08: return value on success', () => {
  it('returns { stdout: "", stderr: "", exitCode: 0 }', async () => {
    const store = makeMockStore();
    const adapter = makeMockAdapter(true);
    const result = await runCommand(store, adapter, ['file.md']);

    expect(result).toEqual({ stdout: '', stderr: '', exitCode: 0 });
  });
});
