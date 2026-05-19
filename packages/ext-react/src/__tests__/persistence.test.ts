import { describe, it, expect, beforeEach } from 'vitest';
import { createNapStore, _resetTabIdCounter, type NapStoreApi } from '../store';

// ── IS-07: Store — persistence round-trip ──

let store: NapStoreApi;

function resetStore() {
  _resetTabIdCounter();
  store = createNapStore();
}

describe('IS-07: Store — persistence round-trip', () => {
  beforeEach(resetStore);

  it('IS-07a: openDoc + expandCard produce correct state for persistence', () => {
    store.getState().openDoc('/test.md');
    store.getState().expandCard('0100');

    const state = store.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].path).toBe('/test.md');
    expect(state.focusedCardSlug).toBe('0100');
    expect(state.cardViewMode).toBe('focused');
    expect(state.activeFilePath).toBe('/test.md');
    expect(state.zoom).toBe(1.0);
  });

  it('IS-07b: restore hydrates store correctly', () => {
    const tabs = [{ id: 'restored-0', path: '/restored.md', type: 'file' as const, ephemeral: false }];
    store.setState({
      tabs,
      activeTabId: tabs[0].id,
      activeFilePath: '/restored.md',
      focusedCardSlug: '0200',
      cardViewMode: 'focused',
      zoom: 1.2,
    });

    const state = store.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].path).toBe('/restored.md');
    expect(state.focusedCardSlug).toBe('0200');
    expect(state.activeFilePath).toBe('/restored.md');
    expect(state.zoom).toBe(1.2);
  });

  it('IS-07c: mainRepoConfig round-trip', () => {
    store.getState().setMainRepo({ owner: 'diunko', repo: 'nap-test-main', branch: 'main' });
    const config = store.getState().mainRepoConfig;
    expect(config).toEqual({ owner: 'diunko', repo: 'nap-test-main', branch: 'main' });
  });
});
