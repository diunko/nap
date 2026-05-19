import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FsChangeEvent, FsChangeListener } from '../fs-adapter';

// ── IS-04: Adapter emitter ──
// Test the event emission without real LFS — mock the underlying lfs.promises

function createMockLfs() {
  const store: Record<string, string> = {};
  return {
    promises: {
      readFile: vi.fn(async (path: string) => store[path] ?? ''),
      writeFile: vi.fn(async (path: string, content: any) => { store[path] = String(content); }),
      mkdir: vi.fn(async () => {}),
      stat: vi.fn(async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false, mode: 0o777, size: 0, mtimeMs: Date.now() })),
      lstat: vi.fn(async () => ({ isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false, mode: 0o777, size: 0, mtimeMs: Date.now() })),
      readdir: vi.fn(async () => []),
      unlink: vi.fn(async () => {}),
      rmdir: vi.fn(async () => {}),
      rename: vi.fn(async () => {}),
      symlink: vi.fn(async () => {}),
      readlink: vi.fn(async () => ''),
    },
  };
}

// Dynamic import to avoid pulling in real LightningFS
async function createAdapter(lfs: any) {
  const { LightningFsAdapter } = await import('../fs-adapter');
  return new LightningFsAdapter(lfs);
}

describe('IS-04: Adapter emitter', () => {
  let lfs: ReturnType<typeof createMockLfs>;
  let adapter: Awaited<ReturnType<typeof createAdapter>>;
  let events: FsChangeEvent[];

  beforeEach(async () => {
    lfs = createMockLfs();
    adapter = await createAdapter(lfs as any);
    events = [];
    adapter.onChange((e) => events.push(e));
  });

  // IS-04a: writeFile emits
  it('IS-04a: writeFile emits { type: write, path }', async () => {
    await adapter.writeFile('/a.md', 'content');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'write', path: '/a.md' });
  });

  // IS-04b: mkdir emits
  it('IS-04b: mkdir emits { type: mkdir, path }', async () => {
    await adapter.mkdir('/dir');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'mkdir', path: '/dir' });
  });

  // IS-04c: rm emits
  it('IS-04c: rm emits { type: rm, path }', async () => {
    lfs.promises.stat.mockResolvedValueOnce({
      isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false,
      mode: 0o777, size: 0, mtimeMs: Date.now(),
    });
    await adapter.rm('/a.md');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'rm', path: '/a.md' });
  });

  // IS-04d: appendFile emits
  it('IS-04d: appendFile emits { type: write, path }', async () => {
    await adapter.appendFile('/a.md', 'more');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'write', path: '/a.md' });
  });

  // IS-04e: unsubscribe works
  it('IS-04e: unsubscribe stops events', async () => {
    const unsub = adapter.onChange((e) => events.push(e));
    await adapter.writeFile('/b.md', 'x');
    // events already has one from the beforeEach listener + one from this listener
    const countBefore = events.length;

    unsub();
    await adapter.writeFile('/c.md', 'y');
    // Only the beforeEach listener should fire
    expect(events.length).toBe(countBefore + 1);
  });
});
