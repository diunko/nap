import { describe, it, expect, vi } from 'vitest';

// Mock @parcel/watcher with controlled async subscribe
const mockSubs: Array<{ dir: string; unsubscribe: ReturnType<typeof vi.fn> }> = [];

vi.mock('@parcel/watcher', () => ({
  default: {
    subscribe: vi.fn().mockImplementation(async (dir: string, _callback: any) => {
      await new Promise(r => setTimeout(r, 50)); // simulate async setup
      const sub = { unsubscribe: vi.fn().mockResolvedValue(undefined) };
      mockSubs.push({ dir, unsubscribe: sub.unsubscribe });
      return sub;
    }),
  },
}));

// Mock fs/promises (GhostWatcher imports it for readFile)
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('ghost content'),
}));

import { GhostWatcher } from '../src/main/ghost-watcher';

describe('RACE-16: GhostWatcher — concurrent watch creates duplicate subscriptions', () => {
  it('two ghost files in same dir — second watch leaks first subscription', async () => {
    mockSubs.length = 0;

    const appeared: string[] = [];
    const watcher = new GhostWatcher((path) => appeared.push(path));

    // Two watches for files in the same dir — don't await the first
    const watchA = watcher.watch('/dir/a.md');
    const watchB = watcher.watch('/dir/b.md');
    await Promise.all([watchA, watchB]);

    // Should have created only 1 subscription for '/dir'
    // BUG: both calls pass the dirWatches.get() check (returns undefined)
    // before either sets dirWatches, so both create subscriptions
    const dirSubs = mockSubs.filter(s => s.dir === '/dir');
    expect(dirSubs).toHaveLength(1);
  });

  it('leaked subscription is never unsubscribed', async () => {
    mockSubs.length = 0;

    const watcher = new GhostWatcher(() => {});

    const watchA = watcher.watch('/dir/a.md');
    const watchB = watcher.watch('/dir/b.md');
    await Promise.all([watchA, watchB]);

    const dirSubs = mockSubs.filter(s => s.dir === '/dir');

    // If there are 2 subscriptions (the bug), the first should have been cleaned up
    if (dirSubs.length > 1) {
      // BUG: first subscription was never unsubscribed — leaked
      expect(dirSubs[0].unsubscribe).toHaveBeenCalled();
    }
  });
});
