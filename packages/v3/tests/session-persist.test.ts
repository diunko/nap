import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// Mock monaco-editor (store → themes → monaco)
vi.mock('monaco-editor', () => ({
  default: {},
  editor: {
    defineTheme: vi.fn(),
    setTheme: vi.fn(),
  },
}));

// Provide document + window stubs for persistUiState / applyTheme
vi.stubGlobal('document', {
  documentElement: { style: { setProperty: vi.fn() } },
});
if (typeof window === 'undefined') {
  vi.stubGlobal('window', globalThis);
}

import { useNapStore, loadPersistedUiState, persistFullUiState, startAutoSave, _resetNepicTerminalMemory, TERMINAL_TAB_ID } from '../src/renderer/store';
import { findClosestSourceLine, findTopmostVisibleSourceLine } from '../src/renderer/scroll-sync';
import type { AppSnapshot, AgentState, NapkinState } from '../src/shared/bridge-types';

function makeAgent(overrides: Partial<AgentState>): AgentState {
  return {
    id: '', name: '', role: '', nepicId: '', napkinId: null,
    parentName: null, parentId: null, createdAt: 0,
    started: false, exited: false, running: false, done: false,
    archived: false, pendingApproval: null, homePath: '', entries: [],
    ...overrides,
  };
}

function makeNapkin(overrides: Partial<NapkinState>): NapkinState {
  return {
    id: '', slug: '', nepicId: '', status: 'doing', path: '',
    agents: [], entries: [], napkinContent: '',
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<AppSnapshot>): AppSnapshot {
  return { napkins: [], architects: [], activeNepicId: '', nepics: [], ...overrides };
}

function resetStore() {
  _resetNepicTerminalMemory();
  useNapStore.setState({
    napkins: [],
    architects: [],
    activeNepicId: '',
    activeTerminalId: null,
    activeFilePath: null,
    focusedCardSlug: null,
    cardViewMode: 'collapsed',
    nepics: [],
    watcherEvents: [],
    rightPaneMode: 'terminal',
    rightFilePath: null,
    rightFileLine: null,
    leftTabs: [],
    activeLeftTabId: null,
    rightTabs: [],
    activeRightTabId: null,
    currentThemeName: 'dark',
    leftPaneRenderMode: 'edit',
    _fileReloadVersion: 0,
  });
}

// ── 1. Session persistence ──

// T-0320-SP-01: Save round-trip — focusedCardSlug
describe('SP-01: focusedCardSlug round-trip', () => {
  beforeEach(resetStore);
  afterEach(() => { delete (window as any).electronAPI; });

  it('saves focusedCardSlug on quit, restores on start if slug matches napkin', async () => {
    // Set up model with a napkin
    const napkin = makeNapkin({ id: '0100-explore', slug: '0100-explore' });
    useNapStore.setState({ napkins: [napkin], focusedCardSlug: '0100-explore', cardViewMode: 'focused' });

    // Capture saved state
    let savedState: any = null;
    (window as any).electronAPI = {
      saveUiState: (s: any) => { savedState = s; },
    };

    persistFullUiState();
    expect(savedState).not.toBeNull();
    expect(savedState.focusedCardSlug).toBe('0100-explore');

    // Reset store, mock loadUiState to return saved value
    resetStore();
    useNapStore.setState({ napkins: [napkin] }); // model must be loaded first

    (window as any).electronAPI = {
      loadUiState: vi.fn().mockResolvedValue(savedState),
      fileRead: vi.fn().mockResolvedValue(null),
    };

    await loadPersistedUiState();
    expect(useNapStore.getState().focusedCardSlug).toBe('0100-explore');
    expect(useNapStore.getState().cardViewMode).toBe('focused');
  });

  it('saves focusedCardSlug, restores when slug matches architect', async () => {
    const arch = makeAgent({ id: 'uuid-arch', role: 'architect' });
    useNapStore.setState({ architects: [arch], focusedCardSlug: 'uuid-arch', cardViewMode: 'focused' });

    let savedState: any = null;
    (window as any).electronAPI = {
      saveUiState: (s: any) => { savedState = s; },
    };

    persistFullUiState();
    expect(savedState.focusedCardSlug).toBe('uuid-arch');

    resetStore();
    useNapStore.setState({ architects: [arch] });
    (window as any).electronAPI = {
      loadUiState: vi.fn().mockResolvedValue(savedState),
      fileRead: vi.fn().mockResolvedValue(null),
    };

    await loadPersistedUiState();
    expect(useNapStore.getState().focusedCardSlug).toBe('uuid-arch');
  });

  it('ignores focusedCardSlug when slug matches nothing in model', async () => {
    (window as any).electronAPI = {
      loadUiState: vi.fn().mockResolvedValue({ focusedCardSlug: 'nonexistent-slug' }),
      fileRead: vi.fn().mockResolvedValue(null),
    };

    await loadPersistedUiState();
    expect(useNapStore.getState().focusedCardSlug).toBeNull();
  });

  it('saves and restores cardViewMode: extended', async () => {
    const napkin = makeNapkin({ id: '0100-explore', slug: '0100-explore' });
    useNapStore.setState({ napkins: [napkin], focusedCardSlug: '0100-explore', cardViewMode: 'extended' });

    let savedState: any = null;
    (window as any).electronAPI = {
      saveUiState: (s: any) => { savedState = s; },
    };

    persistFullUiState();
    expect(savedState.cardViewMode).toBe('extended');

    resetStore();
    useNapStore.setState({ napkins: [napkin] });
    (window as any).electronAPI = {
      loadUiState: vi.fn().mockResolvedValue(savedState),
      fileRead: vi.fn().mockResolvedValue(null),
    };

    await loadPersistedUiState();
    expect(useNapStore.getState().cardViewMode).toBe('extended');
  });

  it('defaults to focused when cardViewMode is invalid', async () => {
    const napkin = makeNapkin({ id: '0100-explore', slug: '0100-explore' });
    useNapStore.setState({ napkins: [napkin] });
    (window as any).electronAPI = {
      loadUiState: vi.fn().mockResolvedValue({
        focusedCardSlug: '0100-explore',
        cardViewMode: 'garbage',
      }),
      fileRead: vi.fn().mockResolvedValue(null),
    };

    await loadPersistedUiState();
    expect(useNapStore.getState().cardViewMode).toBe('focused');
  });

  it('does not restore cardViewMode when slug has no match', async () => {
    (window as any).electronAPI = {
      loadUiState: vi.fn().mockResolvedValue({
        focusedCardSlug: 'nonexistent',
        cardViewMode: 'extended',
      }),
      fileRead: vi.fn().mockResolvedValue(null),
    };

    await loadPersistedUiState();
    expect(useNapStore.getState().cardViewMode).toBe('collapsed');
  });
});

// T-0320-SP-02: Save round-trip — activeTerminalId
describe('SP-02: activeTerminalId round-trip', () => {
  beforeEach(resetStore);
  afterEach(() => { delete (window as any).electronAPI; });

  it('saves terminal UUID, restores when matching agent exists', async () => {
    const arch = makeAgent({ id: 'uuid-arch', name: '001-architect', role: 'architect', started: true });
    useNapStore.setState({ architects: [arch] });
    useNapStore.getState().setActiveTerminal('uuid-arch');

    let savedState: any = null;
    (window as any).electronAPI = {
      saveUiState: (s: any) => { savedState = s; },
    };

    persistFullUiState();
    expect(savedState.activeTerminalId).toBe('uuid-arch');

    // Restore
    resetStore();
    useNapStore.setState({ architects: [arch] });
    (window as any).electronAPI = {
      loadUiState: vi.fn().mockResolvedValue(savedState),
      fileRead: vi.fn().mockResolvedValue(null),
    };

    await loadPersistedUiState();
    expect(useNapStore.getState().activeTerminalId).toBe('uuid-arch');
  });

  it('ignores activeTerminalId when agent not found in model', async () => {
    (window as any).electronAPI = {
      loadUiState: vi.fn().mockResolvedValue({ activeTerminalId: 'uuid-deleted' }),
      fileRead: vi.fn().mockResolvedValue(null),
    };

    await loadPersistedUiState();
    expect(useNapStore.getState().activeTerminalId).toBeNull();
  });
});

// T-0320-SP-03: Save round-trip — leftTabs + activeLeftTabId
describe('SP-03: leftTabs + activeLeftTabId round-trip', () => {
  beforeEach(resetStore);
  afterEach(() => { delete (window as any).electronAPI; });

  it('saves tabs in order, restores with correct paths and ephemeral flags', async () => {
    // Create 3 tabs: 2 pinned, 1 ephemeral
    useNapStore.getState().openDoc('/a.md');
    useNapStore.getState().pinTab('left', useNapStore.getState().leftTabs[0].id);
    useNapStore.getState().openDoc('/b.md');
    useNapStore.getState().pinTab('left', useNapStore.getState().leftTabs[1].id);
    useNapStore.getState().openDoc('/c.md'); // ephemeral

    let savedState: any = null;
    (window as any).electronAPI = {
      saveUiState: (s: any) => { savedState = s; },
    };

    persistFullUiState();
    expect(savedState.leftTabs).toHaveLength(3);
    expect(savedState.leftTabs[0].path).toBe('/a.md');
    expect(savedState.leftTabs[0].ephemeral).toBe(false);
    expect(savedState.leftTabs[1].path).toBe('/b.md');
    expect(savedState.leftTabs[1].ephemeral).toBe(false);
    expect(savedState.leftTabs[2].path).toBe('/c.md');
    expect(savedState.leftTabs[2].ephemeral).toBe(true);

    // Restore
    resetStore();
    (window as any).electronAPI = {
      loadUiState: vi.fn().mockResolvedValue(savedState),
      fileRead: vi.fn().mockResolvedValue('file content'),
      watchGhost: vi.fn(),
    };

    await loadPersistedUiState();
    const s = useNapStore.getState();
    expect(s.leftTabs).toHaveLength(3);
    expect(s.leftTabs[0].path).toBe('/a.md');
    expect(s.leftTabs[0].ephemeral).toBe(false);
    expect(s.leftTabs[1].path).toBe('/b.md');
    expect(s.leftTabs[1].ephemeral).toBe(false);
    expect(s.leftTabs[2].path).toBe('/c.md');
    expect(s.leftTabs[2].ephemeral).toBe(true);

    // Active tab matched by path
    const activeTab = s.leftTabs.find((t) => t.id === s.activeLeftTabId);
    expect(activeTab).toBeDefined();
    expect(activeTab!.path).toBe(savedState.activeLeftTabPath);
  });
});

// T-0320-SP-04: Save round-trip — rightTabs + terminal reconstruction
describe('SP-04: rightTabs + terminal reconstruction', () => {
  beforeEach(resetStore);
  afterEach(() => { delete (window as any).electronAPI; });

  it('terminal tab __terminal__ is NOT saved in rightTabs', () => {
    const arch = makeAgent({ id: 'uuid-arch', name: '001-architect', role: 'architect', started: true });
    useNapStore.setState({ architects: [arch] });
    useNapStore.getState().setActiveTerminal('uuid-arch');
    useNapStore.getState().openCode({ path: '/src/a.ts' });
    useNapStore.getState().openCode({ path: '/src/b.ts' });

    let savedState: any = null;
    (window as any).electronAPI = {
      saveUiState: (s: any) => { savedState = s; },
    };

    persistFullUiState();

    // Terminal tab excluded
    const savedPaths = savedState.rightTabs.map((t: any) => t.path);
    expect(savedPaths).not.toContain(TERMINAL_TAB_ID);
    // Only file tabs saved — ephemeral reuses, so only 1 file tab
    expect(savedState.rightTabs).toHaveLength(1);
    expect(savedState.rightTabs[0].path).toBe('/src/b.ts');
  });

  it('on restore, terminal is reconstructed from activeTerminalId at position 0', async () => {
    const arch = makeAgent({ id: 'uuid-arch', name: '001-architect', role: 'architect', started: true });

    // Save state with terminal + file tabs
    const savedState = {
      activeTerminalId: 'uuid-arch',
      rightTabs: [{ path: '/src/code.ts', ephemeral: true }],
      activeRightTabPath: null,
    };

    resetStore();
    useNapStore.setState({ architects: [arch] });
    (window as any).electronAPI = {
      loadUiState: vi.fn().mockResolvedValue(savedState),
      fileRead: vi.fn().mockResolvedValue('code content'),
      watchGhost: vi.fn(),
    };

    await loadPersistedUiState();
    const s = useNapStore.getState();

    // Terminal tab should exist (reconstructed via setActiveTerminal)
    const termTab = s.rightTabs.find((t) => t.id === TERMINAL_TAB_ID);
    expect(termTab).toBeDefined();
    expect(termTab!.type).toBe('terminal');

    // File tab should also exist
    const fileTab = s.rightTabs.find((t) => t.type === 'file');
    expect(fileTab).toBeDefined();
    expect(fileTab!.path).toBe('/src/code.ts');

    // Terminal at position 0
    expect(s.rightTabs[0].id).toBe(TERMINAL_TAB_ID);
  });
});

// T-0320-SP-05: Ghost tab — file missing on restore
describe('SP-05: ghost tab — file missing on restore', () => {
  beforeEach(resetStore);
  afterEach(() => { delete (window as any).electronAPI; });

  it('creates ghost tab when file missing, live tabs have content', async () => {
    const watchGhost = vi.fn();

    (window as any).electronAPI = {
      loadUiState: vi.fn().mockResolvedValue({
        leftTabs: [
          { path: '/a.md', ephemeral: false },
          { path: '/missing.md', ephemeral: false },
          { path: '/c.md', ephemeral: false },
        ],
        activeLeftTabPath: '/a.md',
      }),
      fileRead: vi.fn().mockImplementation((path: string) => {
        if (path === '/missing.md') return Promise.resolve(null);
        return Promise.resolve('content of ' + path);
      }),
      watchGhost,
    };

    await loadPersistedUiState();
    const s = useNapStore.getState();

    // All 3 tabs in bar
    expect(s.leftTabs).toHaveLength(3);

    // Middle tab is ghost
    expect(s.leftTabs[1].path).toBe('/missing.md');
    expect(s.leftTabs[1].ghost).toBe(true);

    // Other tabs are NOT ghost
    expect(s.leftTabs[0].ghost).toBeFalsy();
    expect(s.leftTabs[2].ghost).toBeFalsy();

    // Ghost watcher started for missing file
    expect(watchGhost).toHaveBeenCalledWith('/missing.md');

    // Active tab is NOT the ghost tab
    const activeTab = s.leftTabs.find((t) => t.id === s.activeLeftTabId);
    expect(activeTab).toBeDefined();
    expect(activeTab!.ghost).toBeFalsy();
  });
});

// T-0320-SP-07: Restore ordering — ghost tabs interspersed with live tabs
describe('SP-07: restore ordering preserves ghost tab positions', () => {
  beforeEach(resetStore);
  afterEach(() => { delete (window as any).electronAPI; });

  it('tabs appear in saved order: [live, ghost, live, ghost, live]', async () => {
    (window as any).electronAPI = {
      loadUiState: vi.fn().mockResolvedValue({
        leftTabs: [
          { path: '/a.md', ephemeral: false },
          { path: '/b-missing.md', ephemeral: false },
          { path: '/c.md', ephemeral: false },
          { path: '/d-missing.md', ephemeral: true },
          { path: '/e.md', ephemeral: false },
        ],
        activeLeftTabPath: '/b-missing.md', // saved active is a ghost
      }),
      fileRead: vi.fn().mockImplementation((path: string) => {
        if (path.includes('missing')) return Promise.resolve(null);
        return Promise.resolve('content');
      }),
      watchGhost: vi.fn(),
    };

    await loadPersistedUiState();
    const s = useNapStore.getState();

    expect(s.leftTabs).toHaveLength(5);
    expect(s.leftTabs[0].path).toBe('/a.md');
    expect(s.leftTabs[0].ghost).toBeFalsy();
    expect(s.leftTabs[1].path).toBe('/b-missing.md');
    expect(s.leftTabs[1].ghost).toBe(true);
    expect(s.leftTabs[2].path).toBe('/c.md');
    expect(s.leftTabs[2].ghost).toBeFalsy();
    expect(s.leftTabs[3].path).toBe('/d-missing.md');
    expect(s.leftTabs[3].ghost).toBe(true);
    expect(s.leftTabs[4].path).toBe('/e.md');
    expect(s.leftTabs[4].ghost).toBeFalsy();

    // Active tab falls back to first live tab since saved active is ghost
    const activeTab = s.leftTabs.find((t) => t.id === s.activeLeftTabId);
    expect(activeTab).toBeDefined();
    expect(activeTab!.ghost).toBeFalsy();
    expect(activeTab!.path).toBe('/a.md');
  });
});

// T-0320-SP-08: leftPaneRenderMode persistence (extends RM-07)
describe('SP-08: leftPaneRenderMode persists alongside new session fields', () => {
  beforeEach(resetStore);
  afterEach(() => { delete (window as any).electronAPI; });

  it('rendered mode survives alongside focusedCardSlug and tabs', async () => {
    const napkin = makeNapkin({ id: '0100-explore', slug: '0100-explore' });
    useNapStore.setState({
      napkins: [napkin],
      focusedCardSlug: '0100-explore',
      leftPaneRenderMode: 'rendered',
    });
    useNapStore.getState().openDoc('/file.md');

    let savedState: any = null;
    (window as any).electronAPI = {
      saveUiState: (s: any) => { savedState = s; },
    };

    persistFullUiState();
    expect(savedState.leftPaneRenderMode).toBe('rendered');
    expect(savedState.focusedCardSlug).toBe('0100-explore');
    expect(savedState.leftTabs).toHaveLength(1);

    // Restore
    resetStore();
    useNapStore.setState({ napkins: [napkin] });
    (window as any).electronAPI = {
      loadUiState: vi.fn().mockResolvedValue(savedState),
      fileRead: vi.fn().mockResolvedValue('content'),
      watchGhost: vi.fn(),
    };

    await loadPersistedUiState();
    const s = useNapStore.getState();
    expect(s.leftPaneRenderMode).toBe('rendered');
    expect(s.focusedCardSlug).toBe('0100-explore');
    expect(s.leftTabs).toHaveLength(1);
  });
});

// ── 2. Rendered mode refresh on tab switch ──

// T-0320-RR-03: Tab switch in edit mode does NOT trigger re-render
describe('RR-03: tab switch in edit mode does NOT trigger re-render', () => {
  beforeEach(resetStore);

  it('mode stays edit, no render call occurs on tab switch', () => {
    // Mode is edit (default)
    expect(useNapStore.getState().leftPaneRenderMode).toBe('edit');

    useNapStore.getState().openDoc('/file-a.md');
    useNapStore.getState().pinTab('left', useNapStore.getState().leftTabs[0].id);
    useNapStore.getState().openDoc('/file-b.md');

    // Mode should still be edit — no render mode change
    expect(useNapStore.getState().leftPaneRenderMode).toBe('edit');
    // activeFilePath changed, but since mode is edit, no rendering needed
    expect(useNapStore.getState().activeFilePath).toBe('/file-b.md');
  });
});

// ── 3. Scroll sync ──

// T-0320-SS-05: data-source-line closest-match algorithm
describe('SS-05: findClosestSourceLine algorithm', () => {
  let dom: JSDOM;
  let container: HTMLElement;

  function setup(lines: number[]) {
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>');
    container = dom.window.document.getElementById('root')!;
    for (const line of lines) {
      const el = dom.window.document.createElement('p');
      el.setAttribute('data-source-line', String(line));
      el.textContent = `Line ${line}`;
      container.appendChild(el);
    }
  }

  it('returns exact match when available', () => {
    setup([1, 5, 12, 20]);
    const el = findClosestSourceLine(container, 12);
    expect(el).not.toBeNull();
    expect(el!.getAttribute('data-source-line')).toBe('12');
  });

  it('returns largest data-source-line <= target (prefers containing block)', () => {
    setup([1, 5, 12, 20]);
    const el = findClosestSourceLine(container, 7);
    expect(el).not.toBeNull();
    // Should return 5, not 12 — prefers the block that contains line 7
    expect(el!.getAttribute('data-source-line')).toBe('5');
  });

  it('returns last element when target exceeds all source lines', () => {
    setup([1, 5, 12, 20]);
    const el = findClosestSourceLine(container, 25);
    expect(el).not.toBeNull();
    expect(el!.getAttribute('data-source-line')).toBe('20');
  });

  it('returns first element when all source lines are after target', () => {
    setup([10, 20, 30]);
    const el = findClosestSourceLine(container, 3);
    expect(el).not.toBeNull();
    // All blocks are after target — fallback to first element
    expect(el!.getAttribute('data-source-line')).toBe('10');
  });

  it('returns null for empty container', () => {
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>');
    container = dom.window.document.getElementById('root')!;
    const el = findClosestSourceLine(container, 5);
    expect(el).toBeNull();
  });
});

// ── 4. Auto-save ──

describe('Auto-save: debounced session persistence', () => {
  let saveSpy: ReturnType<typeof vi.fn>;
  let stopAutoSave: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    resetStore();
    saveSpy = vi.fn();
    (window as any).electronAPI = { saveUiState: saveSpy };
    stopAutoSave = startAutoSave();
  });

  afterEach(() => {
    stopAutoSave();
    vi.useRealTimers();
    delete (window as any).electronAPI;
  });

  it('fires saveUiState after 500ms when focusedCardSlug changes', () => {
    useNapStore.setState({ focusedCardSlug: '0100-explore', cardViewMode: 'focused' });
    expect(saveSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy.mock.calls[0][0]).toHaveProperty('focusedCardSlug', '0100-explore');
  });

  it('fires when leftTabs change (openDoc)', () => {
    useNapStore.getState().openDoc('/file.md');
    vi.advanceTimersByTime(500);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    const payload = saveSpy.mock.calls[0][0];
    expect(payload.leftTabs).toHaveLength(1);
    expect(payload.leftTabs[0].path).toBe('/file.md');
  });

  it('fires when activeTerminalId changes', () => {
    useNapStore.getState().setActiveTerminal('uuid-1');
    vi.advanceTimersByTime(500);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy.mock.calls[0][0]).toHaveProperty('activeTerminalId', 'uuid-1');
  });

  it('fires when leftPaneRenderMode changes', () => {
    useNapStore.getState().toggleRenderMode();
    vi.advanceTimersByTime(500);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy.mock.calls[0][0]).toHaveProperty('leftPaneRenderMode', 'rendered');
  });

  it('fires when currentThemeName changes', () => {
    useNapStore.setState({ currentThemeName: 'light-blue' });
    vi.advanceTimersByTime(500);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy.mock.calls[0][0]).toHaveProperty('theme', 'light-blue');
  });

  it('does NOT fire on applySnapshot (model updates only)', () => {
    useNapStore.getState().applySnapshot(makeSnapshot({
      activeNepicId: 'test',
      napkins: [makeNapkin({ id: 'n1', slug: 'n1' })],
    }));
    vi.advanceTimersByTime(500);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('batches rapid tab opens into one save', () => {
    useNapStore.getState().openDoc('/a.md');
    useNapStore.getState().pinTab('left', useNapStore.getState().leftTabs[0].id);
    useNapStore.getState().openDoc('/b.md');
    useNapStore.getState().pinTab('left', useNapStore.getState().leftTabs[1].id);
    useNapStore.getState().openDoc('/c.md');

    // All 5 state changes happened within the debounce window
    vi.advanceTimersByTime(500);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    // The single save should have the final state
    const payload = saveSpy.mock.calls[0][0];
    expect(payload.leftTabs).toHaveLength(3);
  });

  it('payload has all session fields', () => {
    useNapStore.setState({ focusedCardSlug: 'test-slug' });
    vi.advanceTimersByTime(500);
    const payload = saveSpy.mock.calls[0][0];
    expect(payload).toHaveProperty('focusedCardSlug');
    expect(payload).toHaveProperty('cardViewMode');
    expect(payload).toHaveProperty('activeTerminalId');
    expect(payload).toHaveProperty('leftPaneRenderMode');
    expect(payload).toHaveProperty('leftTabs');
    expect(payload).toHaveProperty('rightTabs');
    expect(payload).toHaveProperty('activeLeftTabPath');
    expect(payload).toHaveProperty('activeRightTabPath');
    expect(payload).toHaveProperty('theme');
    expect(payload).toHaveProperty('debugPanelCollapsed');
    expect(payload).toHaveProperty('debugPanelTab');
  });
});

// T-0320-SS-06: Scroll sync with empty document
describe('SS-06: scroll sync with empty document', () => {
  it('findClosestSourceLine returns null for empty container', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>');
    const container = dom.window.document.getElementById('root')!;
    expect(findClosestSourceLine(container, 1)).toBeNull();
  });

  it('findTopmostVisibleSourceLine returns null for empty container', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>');
    const container = dom.window.document.getElementById('root')!;
    expect(findTopmostVisibleSourceLine(container)).toBeNull();
  });
});
