import { describe, it, expect, beforeEach } from 'vitest';
import { createNapStore, _resetTabIdCounter, type NapStoreApi } from '../store';
import { createMemoryStorage } from '../state-store';

// ── SS-01: Store factory — different keys produce independent stores ──

describe('SS-01: Store factory — independent instances', () => {
  beforeEach(_resetTabIdCounter);

  it('SS-01a: createNapStore returns a store with default state', () => {
    const store = createNapStore();
    expect(store.getState().tabs).toHaveLength(0);
    expect(store.getState().activeFilePath).toBeNull();
    expect(store.getState().activeSurface).toBe('editor');
  });

  it('SS-01b: two stores are independent — state in one doesn\'t appear in other', () => {
    const storeA = createNapStore();
    const storeB = createNapStore();

    storeA.getState().openDoc('/a.md');

    expect(storeA.getState().tabs).toHaveLength(1);
    expect(storeA.getState().activeFilePath).toBe('/a.md');

    expect(storeB.getState().tabs).toHaveLength(0);
    expect(storeB.getState().activeFilePath).toBeNull();
  });

  it('SS-01c: modifying store B does not affect store A', () => {
    const storeA = createNapStore();
    const storeB = createNapStore();

    storeA.getState().openDoc('/a.md');
    storeA.getState().expandCard('0100');

    storeB.getState().openDoc('/b.md');
    storeB.getState().expandCard('0200');

    // A unchanged
    expect(storeA.getState().activeFilePath).toBe('/a.md');
    expect(storeA.getState().focusedCardSlug).toBe('0100');

    // B has its own state
    expect(storeB.getState().activeFilePath).toBe('/b.md');
    expect(storeB.getState().focusedCardSlug).toBe('0200');
  });
});

// ── SS-02: Store factory — actions in one don't affect the other ──

describe('SS-02: Store actions — cross-isolation', () => {
  beforeEach(_resetTabIdCounter);

  it('SS-02a: tabs, pins, closes are isolated', () => {
    const storeA = createNapStore();
    const storeB = createNapStore();

    storeA.getState().openDoc('/a1.md');
    storeA.getState().pinActiveEphemeral();
    storeA.getState().openDoc('/a2.md');

    storeB.getState().openDoc('/b1.md');

    expect(storeA.getState().tabs).toHaveLength(2);
    expect(storeB.getState().tabs).toHaveLength(1);

    storeB.getState().closeTab(storeB.getState().tabs[0].id);
    expect(storeB.getState().tabs).toHaveLength(0);
    expect(storeA.getState().tabs).toHaveLength(2); // unaffected
  });

  it('SS-02b: refreshNav in one doesn\'t affect other', () => {
    const storeA = createNapStore();
    const storeB = createNapStore();

    storeA.getState().refreshNav([{ type: 'section', name: 'test', displayName: 'test', path: '/test' }]);

    expect(storeA.getState().navSections).toHaveLength(1);
    expect(storeB.getState().navSections).toHaveLength(0);
  });
});

// ── SS-03: Persistence — save and restore per key ──

describe('SS-03: Persistence per key', () => {
  beforeEach(_resetTabIdCounter);

  it('SS-03a: persisted store saves to the right key', async () => {
    const storage = createMemoryStorage();
    const store = createNapStore('pr-42', storage);

    // Wait for hydration (no prior data, resolves immediately)
    await new Promise(r => setTimeout(r, 50));

    store.getState().openDoc('/chapter.md');
    store.getState().expandCard('0100');

    // Wait for persist middleware to write
    await new Promise(r => setTimeout(r, 50));

    // The storage should have data under 'nap-ui-pr-42'
    const raw = await storage.getItem('nap-ui-pr-42');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.activeFilePath).toBe('/chapter.md');
    expect(parsed.state.focusedCardSlug).toBe('0100');
  });

  it('SS-03b: different key gets different state', async () => {
    const storage = createMemoryStorage();

    const store42 = createNapStore('pr-42', storage);
    await new Promise(r => setTimeout(r, 50));
    store42.getState().openDoc('/pr42-file.md');
    await new Promise(r => setTimeout(r, 50));

    const store87 = createNapStore('pr-87', storage);
    await new Promise(r => setTimeout(r, 50));

    // pr-87 should start empty — no bleed from pr-42
    expect(store87.getState().activeFilePath).toBeNull();
    expect(store87.getState().tabs).toHaveLength(0);

    // pr-42 still has its data
    expect(store42.getState().activeFilePath).toBe('/pr42-file.md');
  });

  it('SS-03c: recreating store with same key restores state', async () => {
    const storage = createMemoryStorage();

    const store1 = createNapStore('pr-42', storage);
    await new Promise(r => setTimeout(r, 50));
    store1.getState().openDoc('/chapter.md');
    store1.getState().setMainRepo({ owner: 'diunko', repo: 'nap-test-main', branch: 'main' });
    await new Promise(r => setTimeout(r, 50));

    // Recreate with same key — should hydrate from storage
    const store2 = createNapStore('pr-42', storage);
    await new Promise(r => setTimeout(r, 100));

    expect(store2.getState().activeFilePath).toBe('/chapter.md');
    expect(store2.getState().mainRepoConfig?.owner).toBe('diunko');
  });
});

// ── SS-04: LFS isolation — different keys, different filesystems ──
// Requires real IndexedDB (browser). Tested in Playwright (SM-01), not vitest.

// ── SS-06: Wipe per key — cleanup is scoped ──

describe('SS-06: Wipe per key', () => {
  beforeEach(_resetTabIdCounter);

  it('SS-06a: deleting one key doesn\'t affect another', async () => {
    const storage = createMemoryStorage();

    const store42 = createNapStore('pr-42', storage);
    await new Promise(r => setTimeout(r, 50));
    store42.getState().openDoc('/pr42.md');
    await new Promise(r => setTimeout(r, 50));

    const store87 = createNapStore('pr-87', storage);
    await new Promise(r => setTimeout(r, 50));
    store87.getState().openDoc('/pr87.md');
    await new Promise(r => setTimeout(r, 50));

    // Both keys exist in storage
    expect(await storage.getItem('nap-ui-pr-42')).toBeTruthy();
    expect(await storage.getItem('nap-ui-pr-87')).toBeTruthy();

    // Wipe pr-42
    await storage.removeItem('nap-ui-pr-42');

    // pr-42 gone
    expect(await storage.getItem('nap-ui-pr-42')).toBeNull();

    // pr-87 still there
    const raw = await storage.getItem('nap-ui-pr-87');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.activeFilePath).toBe('/pr87.md');
  });
});
