import { describe, it, expect, beforeEach } from 'vitest';
import { createNapStore, _resetTabIdCounter, type NapStoreApi } from '../store';

let useNapStore: NapStoreApi;

function resetStore() {
  _resetTabIdCounter();
  useNapStore = createNapStore();
}

// ── IS-01: Store — tab lifecycle ──

describe('IS-01: Store — tab lifecycle', () => {
  beforeEach(resetStore);

  // IS-01a: openDoc creates ephemeral tab
  it('IS-01a: openDoc creates ephemeral tab', () => {
    useNapStore.getState().openDoc('/a.md');
    const s = useNapStore.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0].ephemeral).toBe(true);
    expect(s.tabs[0].path).toBe('/a.md');
    expect(s.activeTabId).toBe(s.tabs[0].id);
    expect(s.activeFilePath).toBe('/a.md');
  });

  // IS-01b: second openDoc reuses ephemeral slot
  it('IS-01b: second openDoc reuses ephemeral slot', () => {
    useNapStore.getState().openDoc('/a.md');
    const idAfterA = useNapStore.getState().tabs[0].id;

    useNapStore.getState().openDoc('/b.md');
    const s = useNapStore.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0].path).toBe('/b.md');
    expect(s.tabs[0].id).toBe(idAfterA); // same tab reused
    expect(s.tabs[0].ephemeral).toBe(true);
  });

  // IS-01c: openDoc + pinTab
  it('IS-01c: pinTab flips ephemeral to false', () => {
    useNapStore.getState().openDoc('/a.md');
    const tabId = useNapStore.getState().tabs[0].id;

    useNapStore.getState().pinTab(tabId);
    expect(useNapStore.getState().tabs[0].ephemeral).toBe(false);
  });

  // IS-01d: pin A, openDoc B — two tabs
  it('IS-01d: pinned tab survives next single-click', () => {
    useNapStore.getState().openDoc('/a.md');
    useNapStore.getState().pinTab(useNapStore.getState().tabs[0].id);

    useNapStore.getState().openDoc('/b.md');
    const s = useNapStore.getState();
    expect(s.tabs).toHaveLength(2);
    expect(s.tabs[0].path).toBe('/a.md');
    expect(s.tabs[0].ephemeral).toBe(false);
    expect(s.tabs[1].path).toBe('/b.md');
    expect(s.tabs[1].ephemeral).toBe(true);
  });

  // IS-01e: pin A, pin B, close A → active=B
  it('IS-01e: close tab picks neighbor', () => {
    useNapStore.getState().openDoc('/a.md');
    useNapStore.getState().pinTab(useNapStore.getState().tabs[0].id);
    useNapStore.getState().openDoc('/b.md');
    useNapStore.getState().pinTab(useNapStore.getState().tabs[1].id);

    // Close A
    const tabAId = useNapStore.getState().tabs[0].id;
    useNapStore.setState({ activeTabId: tabAId, activeFilePath: '/a.md' });
    useNapStore.getState().closeTab(tabAId);

    const s = useNapStore.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0].path).toBe('/b.md');
    expect(s.activeTabId).toBe(s.tabs[0].id);
    expect(s.activeFilePath).toBe('/b.md');
  });

  // IS-01f: openDoc, closeTab → empty
  it('IS-01f: close last tab clears state', () => {
    useNapStore.getState().openDoc('/only.md');
    useNapStore.getState().closeActiveTab();
    const s = useNapStore.getState();
    expect(s.tabs).toHaveLength(0);
    expect(s.activeTabId).toBeNull();
    expect(s.activeFilePath).toBeNull();
  });

  // IS-01g: pinActiveEphemeral
  it('IS-01g: pinActiveEphemeral pins the active tab', () => {
    useNapStore.getState().openDoc('/a.md');
    expect(useNapStore.getState().tabs[0].ephemeral).toBe(true);

    useNapStore.getState().pinActiveEphemeral();
    expect(useNapStore.getState().tabs[0].ephemeral).toBe(false);
  });

  // T04 equivalent: pinned + ephemeral coexist
  it('pinned + ephemeral coexist, ephemeral always rightmost', () => {
    // Pin A
    useNapStore.getState().openDoc('/a.md');
    useNapStore.getState().pinTab(useNapStore.getState().tabs[0].id);

    // Ephemeral B
    useNapStore.getState().openDoc('/b.md');
    expect(useNapStore.getState().tabs).toHaveLength(2);

    // Ephemeral slot reuses to C
    useNapStore.getState().openDoc('/c.md');
    expect(useNapStore.getState().tabs).toHaveLength(2);
    expect(useNapStore.getState().tabs[1].path).toBe('/c.md');

    // Pin C
    useNapStore.getState().pinTab(useNapStore.getState().tabs[1].id);

    // Ephemeral D
    useNapStore.getState().openDoc('/d.md');

    const s = useNapStore.getState();
    expect(s.tabs).toHaveLength(3);
    expect(s.tabs[0].path).toBe('/a.md');
    expect(s.tabs[0].ephemeral).toBe(false);
    expect(s.tabs[1].path).toBe('/c.md');
    expect(s.tabs[1].ephemeral).toBe(false);
    expect(s.tabs[2].path).toBe('/d.md');
    expect(s.tabs[2].ephemeral).toBe(true);
  });

  // Opening same path reuses existing tab
  it('opening same path reuses existing tab', () => {
    useNapStore.getState().openDoc('/a.md');
    const idA = useNapStore.getState().tabs[0].id;

    useNapStore.getState().pinTab(idA);
    useNapStore.getState().openDoc('/a.md'); // same path

    const s = useNapStore.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.activeTabId).toBe(idA);
  });
});

// ── IS-02: Store — card focus ──

describe('IS-02: Store — card focus', () => {
  beforeEach(resetStore);

  // IS-02a: expandCard sets focus
  it('IS-02a: expandCard sets focusedCardSlug', () => {
    useNapStore.getState().expandCard('0100');
    const s = useNapStore.getState();
    expect(s.focusedCardSlug).toBe('0100');
    expect(s.cardViewMode).toBe('focused');
  });

  // IS-02b: expandCard toggle
  it('IS-02b: expandCard same slug toggles off', () => {
    useNapStore.getState().expandCard('0100');
    useNapStore.getState().expandCard('0100');
    const s = useNapStore.getState();
    expect(s.focusedCardSlug).toBeNull();
    expect(s.cardViewMode).toBe('collapsed');
  });

  // IS-02c: expandCard different slug switches
  it('IS-02c: expandCard different slug switches', () => {
    useNapStore.getState().expandCard('0100');
    useNapStore.getState().expandCard('0200');
    const s = useNapStore.getState();
    expect(s.focusedCardSlug).toBe('0200');
    expect(s.cardViewMode).toBe('focused');
  });

  // extendCard toggles focused ↔ extended
  it('extendCard toggles focused to extended', () => {
    useNapStore.getState().expandCard('0100');
    useNapStore.getState().extendCard();
    expect(useNapStore.getState().cardViewMode).toBe('extended');

    useNapStore.getState().extendCard();
    expect(useNapStore.getState().cardViewMode).toBe('focused');
  });

  // extendCard does nothing without focus
  it('extendCard no-op without focused card', () => {
    useNapStore.getState().extendCard();
    expect(useNapStore.getState().cardViewMode).toBe('collapsed');
  });
});

// ── IS-03: Store — activeSurface toggle ──

describe('IS-03: Store — activeSurface', () => {
  beforeEach(resetStore);

  // IS-03a: initial state is editor (changed in 0651 — idle pane visible on boot)
  it('IS-03a: initial activeSurface is editor', () => {
    expect(useNapStore.getState().activeSurface).toBe('editor');
  });

  // IS-03b: openDoc switches to editor
  it('IS-03b: openDoc triggers surface switch to editor', () => {
    useNapStore.getState().openDoc('/test.md');
    expect(useNapStore.getState().activeSurface).toBe('editor');
  });

  // setActiveSurface works
  it('setActiveSurface toggles', () => {
    useNapStore.getState().setActiveSurface('editor');
    expect(useNapStore.getState().activeSurface).toBe('editor');

    useNapStore.getState().setActiveSurface('terminal');
    expect(useNapStore.getState().activeSurface).toBe('terminal');
  });
});
