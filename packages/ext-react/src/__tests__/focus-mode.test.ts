import { describe, it, expect, beforeEach } from 'vitest';
import { createNapStore, _resetTabIdCounter, type NapStoreApi } from '../store';
import { createMemoryStorage } from '../state-store';

let store: NapStoreApi;

function resetStore() {
  _resetTabIdCounter();
  store = createNapStore();
}

// ── FM-S01: toggleFocusMode cycles correctly ──

describe('FM-S01: toggleFocusMode cycles correctly', () => {
  beforeEach(resetStore);

  it('starts true, toggles to false, toggles back to true', () => {
    expect(store.getState().focusMode).toBe(true);

    store.getState().toggleFocusMode();
    expect(store.getState().focusMode).toBe(false);

    store.getState().toggleFocusMode();
    expect(store.getState().focusMode).toBe(true);
  });
});

// ── FM-S02: toggleFocusMode preserves focusedCardSlug ──

describe('FM-S02: toggleFocusMode preserves focusedCardSlug', () => {
  beforeEach(resetStore);

  it('focusedCardSlug unchanged through toggles', () => {
    store.getState().expandCard('0100');
    expect(store.getState().focusedCardSlug).toBe('0100');

    store.getState().toggleFocusMode();
    expect(store.getState().focusedCardSlug).toBe('0100');

    store.getState().toggleFocusMode();
    expect(store.getState().focusedCardSlug).toBe('0100');
  });
});

// ── FM-S03: focus follows expandCard across toggle ──

describe('FM-S03: focus follows expandCard across toggle', () => {
  beforeEach(resetStore);

  it('toggling back to focus shows the last expanded card, not the original', () => {
    store.getState().expandCard('0100');
    expect(store.getState().focusedCardSlug).toBe('0100');

    // Toggle to show-all
    store.getState().toggleFocusMode();
    expect(store.getState().focusMode).toBe(false);

    // Expand a different card in show-all mode
    store.getState().expandCard('0200');
    expect(store.getState().focusedCardSlug).toBe('0200');

    // Toggle back to focus — should show 0200, not 0100
    store.getState().toggleFocusMode();
    expect(store.getState().focusMode).toBe(true);
    expect(store.getState().focusedCardSlug).toBe('0200');
  });
});

// ── FM-S04: expandCard works for architect slugs ──

describe('FM-S04: expandCard works for architect slugs', () => {
  beforeEach(resetStore);

  it('expand/extend/collapse cycle works for architect slug', () => {
    store.getState().expandCard('001-architect');
    expect(store.getState().focusedCardSlug).toBe('001-architect');
    expect(store.getState().cardViewMode).toBe('focused');

    store.getState().extendCard();
    expect(store.getState().cardViewMode).toBe('extended');

    store.getState().extendCard();
    expect(store.getState().cardViewMode).toBe('focused');

    // Toggle off
    store.getState().expandCard('001-architect');
    expect(store.getState().focusedCardSlug).toBeNull();
    expect(store.getState().cardViewMode).toBe('collapsed');
  });

  it('switching between napkin and architect slugs', () => {
    store.getState().expandCard('001-architect');
    expect(store.getState().focusedCardSlug).toBe('001-architect');

    store.getState().expandCard('0100');
    expect(store.getState().focusedCardSlug).toBe('0100');
    expect(store.getState().cardViewMode).toBe('focused');
  });
});

// ── FM-S05: focusMode persistence round-trip ──

describe('FM-S05: focusMode persistence round-trip', () => {
  beforeEach(_resetTabIdCounter);

  it('focusMode persists and restores', async () => {
    const storage = createMemoryStorage();
    const store1 = createNapStore('test-fm', storage);
    await new Promise(r => setTimeout(r, 50));

    // Default is true, toggle to false
    store1.getState().toggleFocusMode();
    expect(store1.getState().focusMode).toBe(false);

    store1.getState().expandCard('0200');

    // Wait for persist
    await new Promise(r => setTimeout(r, 50));

    // Verify storage contains focusMode
    const raw = await storage.getItem('nap-ui-test-fm');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.focusMode).toBe(false);
    expect(parsed.state.focusedCardSlug).toBe('0200');
    expect(parsed.state.cardViewMode).toBe('focused');

    // Recreate store with same key — should restore
    const store2 = createNapStore('test-fm', storage);
    await new Promise(r => setTimeout(r, 100));

    expect(store2.getState().focusMode).toBe(false);
    expect(store2.getState().focusedCardSlug).toBe('0200');
    expect(store2.getState().cardViewMode).toBe('focused');
  });
});

// ── FM-S06: focusMode default is true ──

describe('FM-S06: focusMode default is true', () => {
  it('new store starts with focusMode=true', () => {
    const fresh = createNapStore();
    expect(fresh.getState().focusMode).toBe(true);
  });
});
