import { describe, it, expect, beforeEach } from 'vitest';
import { useNapStore, _resetNepicTerminalMemory } from '../src/renderer/store';
import type { AppSnapshot, AgentState } from '../src/shared/bridge-types';

// ── 3. Tabs — store tests (small) ──

function makeAgent(overrides: Partial<AgentState>): AgentState {
  return {
    id: '', name: '', role: '', nepicId: '', napkinId: null,
    parentName: null, parentId: null, createdAt: 0,
    started: false, exited: false, running: false, done: false,
    archived: false, pendingApproval: null, homePath: '', entries: [],
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
    nepics: [],
    watcherEvents: [],
    rightPaneMode: 'terminal',
    rightFilePath: null,
    rightFileLine: null,
    leftTabs: [],
    activeLeftTabId: null,
    rightTabs: [],
    activeRightTabId: null,
  });
}

describe('Tabs — store state', () => {
  beforeEach(resetStore);

  // T-0200-T01: Single-click creates ephemeral tab
  it('T01: openDoc creates ephemeral tab in left pane', () => {
    useNapStore.getState().openDoc('/file-a.md');
    const s = useNapStore.getState();
    expect(s.leftTabs).toHaveLength(1);
    expect(s.leftTabs[0].ephemeral).toBe(true);
    expect(s.leftTabs[0].path).toBe('/file-a.md');
    expect(s.activeLeftTabId).toBe(s.leftTabs[0].id);
  });

  // T-0200-T02: Ephemeral tab reuse — second single-click replaces
  it('T02: second openDoc reuses ephemeral slot', () => {
    useNapStore.getState().openDoc('/file-a.md');
    const idAfterA = useNapStore.getState().leftTabs[0].id;

    useNapStore.getState().openDoc('/file-b.md');
    const s = useNapStore.getState();
    expect(s.leftTabs).toHaveLength(1);
    expect(s.leftTabs[0].path).toBe('/file-b.md');
    expect(s.leftTabs[0].id).toBe(idAfterA); // same tab reused
    expect(s.leftTabs[0].ephemeral).toBe(true);
  });

  // T-0200-T03: Double-click pins an ephemeral tab
  describe('T03: pinning ephemeral tabs', () => {
    it('pinTab flips ephemeral to false', () => {
      useNapStore.getState().openDoc('/file-a.md');
      const tabId = useNapStore.getState().leftTabs[0].id;

      useNapStore.getState().pinTab('left', tabId);
      expect(useNapStore.getState().leftTabs[0].ephemeral).toBe(false);
    });

    it('pinned tab survives next single-click', () => {
      useNapStore.getState().openDoc('/file-a.md');
      const tabId = useNapStore.getState().leftTabs[0].id;
      useNapStore.getState().pinTab('left', tabId);

      useNapStore.getState().openDoc('/file-b.md');
      const s = useNapStore.getState();
      expect(s.leftTabs).toHaveLength(2);
      expect(s.leftTabs[0].path).toBe('/file-a.md');
      expect(s.leftTabs[0].ephemeral).toBe(false);
      expect(s.leftTabs[1].path).toBe('/file-b.md');
      expect(s.leftTabs[1].ephemeral).toBe(true);
    });
  });

  // T-0200-T04: Pinned + ephemeral coexist
  it('T04: pinned + ephemeral coexist, ephemeral always rightmost', () => {
    // Pin A
    useNapStore.getState().openDoc('/a.md');
    useNapStore.getState().pinTab('left', useNapStore.getState().leftTabs[0].id);

    // Ephemeral B
    useNapStore.getState().openDoc('/b.md');
    expect(useNapStore.getState().leftTabs).toHaveLength(2);

    // Ephemeral slot reuses to C
    useNapStore.getState().openDoc('/c.md');
    expect(useNapStore.getState().leftTabs).toHaveLength(2);
    expect(useNapStore.getState().leftTabs[1].path).toBe('/c.md');

    // Pin C
    useNapStore.getState().pinTab('left', useNapStore.getState().leftTabs[1].id);

    // Ephemeral D
    useNapStore.getState().openDoc('/d.md');

    const s = useNapStore.getState();
    expect(s.leftTabs).toHaveLength(3);
    expect(s.leftTabs[0].path).toBe('/a.md');
    expect(s.leftTabs[0].ephemeral).toBe(false);
    expect(s.leftTabs[1].path).toBe('/c.md');
    expect(s.leftTabs[1].ephemeral).toBe(false);
    expect(s.leftTabs[2].path).toBe('/d.md');
    expect(s.leftTabs[2].ephemeral).toBe(true);
  });

  // T-0200-T05: Terminal tab — always pinned, can't close while agent running
  describe('T05: terminal tab behavior', () => {
    it('setActiveTerminal creates pinned terminal tab', () => {
      useNapStore.getState().setActiveTerminal('agent-uuid-1');
      const s = useNapStore.getState();
      expect(s.rightTabs).toHaveLength(1);
      expect(s.rightTabs[0].type).toBe('terminal');
      expect(s.rightTabs[0].ephemeral).toBe(false);
      expect(s.rightTabs[0].path).toBe('agent-uuid-1');
    });

    it('cannot close terminal tab while agent is running', () => {
      const agent = makeAgent({ id: 'agent-uuid-1', started: true, running: true });
      useNapStore.setState({
        architects: [agent],
      });
      useNapStore.getState().setActiveTerminal('agent-uuid-1');
      const tabId = useNapStore.getState().rightTabs[0].id;

      // Try to close — should be denied
      useNapStore.getState().closeTab('right', tabId);
      expect(useNapStore.getState().rightTabs).toHaveLength(1);
    });

    it('can close terminal tab when agent is not running', () => {
      const agent = makeAgent({ id: 'agent-uuid-1', started: true, running: false, exited: true });
      useNapStore.setState({
        architects: [agent],
      });
      useNapStore.getState().setActiveTerminal('agent-uuid-1');
      const tabId = useNapStore.getState().rightTabs[0].id;

      useNapStore.getState().closeTab('right', tabId);
      expect(useNapStore.getState().rightTabs).toHaveLength(0);
    });
  });

  // T-0200-T06: Cmd-W closes active tab
  describe('T06: closeActiveTab', () => {
    it('closes active tab and activates neighbor', () => {
      // Pin two tabs
      useNapStore.getState().openDoc('/a.md');
      useNapStore.getState().pinTab('left', useNapStore.getState().leftTabs[0].id);
      useNapStore.getState().openDoc('/b.md');
      useNapStore.getState().pinTab('left', useNapStore.getState().leftTabs[1].id);

      // Activate A
      const tabA = useNapStore.getState().leftTabs[0];
      useNapStore.getState().openDoc(tabA.path); // re-activates A (existing tab found)

      // Close active (should be A since we just opened it — but since A already exists
      // it just activates it, so activeLeftTabId = A's id)
      useNapStore.setState({ activeLeftTabId: tabA.id });
      useNapStore.getState().closeActiveTab('left');
      const s = useNapStore.getState();
      expect(s.leftTabs).toHaveLength(1);
      expect(s.leftTabs[0].path).toBe('/b.md');
      expect(s.activeLeftTabId).toBe(s.leftTabs[0].id);
    });

    it('closing last tab → activeTabId null', () => {
      useNapStore.getState().openDoc('/only.md');
      useNapStore.getState().closeActiveTab('left');
      const s = useNapStore.getState();
      expect(s.leftTabs).toHaveLength(0);
      expect(s.activeLeftTabId).toBeNull();
      expect(s.activeFilePath).toBeNull();
    });
  });

  // T-0200-T08: Per-nepic tab memory — save and restore
  describe('T08: per-nepic tab memory', () => {
    it('saves and restores tabs on nepic switch', () => {
      const arch1 = makeAgent({ id: 'uuid-arch-1', role: 'architect', started: true, running: true });
      const arch2 = makeAgent({ id: 'uuid-arch-2', role: 'architect', started: true, running: true });
      const snap1 = makeSnapshot({ activeNepicId: 'nepic-1', architects: [arch1] });
      const snap2 = makeSnapshot({ activeNepicId: 'nepic-2', architects: [arch2] });

      // Load nepic 1
      useNapStore.getState().applySnapshot(snap1);

      // Open and pin two tabs
      useNapStore.getState().openDoc('/nepic1/a.md');
      useNapStore.getState().pinTab('left', useNapStore.getState().leftTabs[0].id);
      useNapStore.getState().openDoc('/nepic1/b.md');
      useNapStore.getState().pinTab('left', useNapStore.getState().leftTabs[1].id);
      const tabsBefore = useNapStore.getState().leftTabs;

      // Switch to nepic 2
      useNapStore.getState().applySnapshot(snap2);
      expect(useNapStore.getState().leftTabs).toHaveLength(0);

      // Switch back to nepic 1
      useNapStore.getState().applySnapshot(snap1);
      const s = useNapStore.getState();
      expect(s.leftTabs).toHaveLength(2);
      expect(s.leftTabs[0].path).toBe('/nepic1/a.md');
      expect(s.leftTabs[1].path).toBe('/nepic1/b.md');
      expect(s.leftTabs[0].ephemeral).toBe(false);
      expect(s.leftTabs[1].ephemeral).toBe(false);
    });
  });
});

describe('Tabs — right pane (openCode)', () => {
  beforeEach(resetStore);

  it('openCode creates ephemeral file tab in right pane', () => {
    useNapStore.getState().openCode({ path: '/src/file.ts', line: 10 });
    const s = useNapStore.getState();
    expect(s.rightTabs).toHaveLength(1);
    expect(s.rightTabs[0].type).toBe('file');
    expect(s.rightTabs[0].ephemeral).toBe(true);
    expect(s.rightTabs[0].path).toBe('/src/file.ts');
  });

  it('second openCode reuses ephemeral file tab', () => {
    useNapStore.getState().openCode({ path: '/src/a.ts' });
    useNapStore.getState().openCode({ path: '/src/b.ts' });
    const s = useNapStore.getState();
    expect(s.rightTabs).toHaveLength(1);
    expect(s.rightTabs[0].path).toBe('/src/b.ts');
  });

  it('terminal tab + code file tab coexist', () => {
    useNapStore.getState().setActiveTerminal('agent-1');
    useNapStore.getState().openCode({ path: '/src/file.ts', line: 5 });
    const s = useNapStore.getState();
    expect(s.rightTabs).toHaveLength(2);
    expect(s.rightTabs.find((t) => t.type === 'terminal')).toBeDefined();
    expect(s.rightTabs.find((t) => t.type === 'file')).toBeDefined();
  });
});
