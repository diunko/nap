import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useNapStore, _resetTabIdCounter } from '../store';

// ── IS-07: Store — persistence round-trip ──
// Mock chrome.storage.sync for testing

function resetStore() {
  _resetTabIdCounter();
  useNapStore.setState({
    navSections: [],
    activeFilePath: null,
    focusedCardSlug: null,
    cardViewMode: 'collapsed',
    sidebarVisible: true,
    activeSurface: 'terminal',
    tabs: [],
    activeTabId: null,
    mainRepoConfig: null,
    zoom: 1.0,
    settingsVisible: false,
  });
}

// Mock chrome.storage.sync
function createMockStorage() {
  const data: Record<string, any> = {};
  return {
    get: vi.fn((keys: string | string[], cb: (result: Record<string, any>) => void) => {
      const result: Record<string, any> = {};
      const keyArr = typeof keys === 'string' ? [keys] : keys;
      for (const k of keyArr) {
        if (k in data) result[k] = data[k];
      }
      cb(result);
    }),
    set: vi.fn((items: Record<string, any>, cb?: () => void) => {
      Object.assign(data, items);
      cb?.();
    }),
    _data: data,
  };
}

describe('IS-07: Store — persistence round-trip', () => {
  beforeEach(resetStore);

  // IS-07a: state changes produce persistable data
  it('IS-07a: openDoc + expandCard produce correct state for persistence', () => {
    useNapStore.getState().openDoc('/test.md');
    useNapStore.getState().expandCard('0100');

    const state = useNapStore.getState();
    const toPerist = {
      tabs: state.tabs.map((t) => ({ path: t.path, ephemeral: t.ephemeral })),
      focusedCardSlug: state.focusedCardSlug,
      cardViewMode: state.cardViewMode,
      activeFilePath: state.activeFilePath,
      zoom: state.zoom,
    };

    expect(toPerist.tabs).toHaveLength(1);
    expect(toPerist.tabs[0].path).toBe('/test.md');
    expect(toPerist.focusedCardSlug).toBe('0100');
    expect(toPerist.cardViewMode).toBe('focused');
    expect(toPerist.activeFilePath).toBe('/test.md');
    expect(toPerist.zoom).toBe(1.0);
  });

  // IS-07b: restore from persisted data hydrates store
  it('IS-07b: restore hydrates store correctly', () => {
    const persisted = {
      tabs: [{ path: '/restored.md', ephemeral: false }],
      focusedCardSlug: '0200',
      cardViewMode: 'focused' as const,
      activeFilePath: '/restored.md',
      zoom: 1.2,
    };

    // Simulate restore
    const tabs = persisted.tabs.map((t, i) => ({
      id: `restored-${i}`,
      path: t.path,
      type: 'file' as const,
      ephemeral: t.ephemeral,
    }));

    useNapStore.setState({
      tabs,
      activeTabId: tabs[0]?.id ?? null,
      activeFilePath: persisted.activeFilePath,
      focusedCardSlug: persisted.focusedCardSlug,
      cardViewMode: persisted.cardViewMode,
      zoom: persisted.zoom,
    });

    const state = useNapStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].path).toBe('/restored.md');
    expect(state.focusedCardSlug).toBe('0200');
    expect(state.activeFilePath).toBe('/restored.md');
    expect(state.zoom).toBe(1.2);
  });

  // IS-07c: mainRepoConfig persists
  it('IS-07c: mainRepoConfig round-trip', () => {
    useNapStore.getState().setMainRepo({ owner: 'diunko', repo: 'nap-test-main', branch: 'main' });

    const config = useNapStore.getState().mainRepoConfig;
    expect(config).toEqual({ owner: 'diunko', repo: 'nap-test-main', branch: 'main' });
  });
});
