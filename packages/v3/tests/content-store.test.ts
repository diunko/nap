import { describe, it, expect, beforeEach } from 'vitest';
import { useNapStore, _resetNepicTerminalMemory } from '../src/renderer/store';
import type { AppSnapshot, AgentState } from '../src/shared/bridge-types';

function makeAgent(overrides: Partial<AgentState>): AgentState {
  return {
    id: '',
    name: '',
    role: '',
    nepicId: '',
    napkinId: null,
    parentName: null,
    parentId: null,
    createdAt: 0,
    started: false,
    exited: false,
    running: false,
    done: false,
    archived: false,
    pendingApproval: null,
    homePath: '',
    entries: [],
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<AppSnapshot>): AppSnapshot {
  return {
    napkins: [],
    architects: [],
    activeNepicId: '',
    nepics: [],
    ...overrides,
  };
}

describe('Content store — activeFilePath', () => {
  beforeEach(() => {
    _resetNepicTerminalMemory();
    useNapStore.setState({
      napkins: [],
      architects: [],
      activeNepicId: '',
      activeTerminalId: null,
      activeFilePath: null,
      nepics: [],
      watcherEvents: [],
    });
  });

  // T-0100-S01: openFile sets activeFilePath
  it('S01: openFile sets activeFilePath', () => {
    useNapStore.getState().openFile('/some/file.md');
    expect(useNapStore.getState().activeFilePath).toBe('/some/file.md');
  });

  // T-0100-S02: openFile does NOT change activeTerminalId
  it('S02: openFile does NOT change activeTerminalId', () => {
    useNapStore.getState().setActiveTerminal('uuid-1');
    useNapStore.getState().openFile('/some/file.md');
    expect(useNapStore.getState().activeTerminalId).toBe('uuid-1');
  });

  // T-0100-S03: setActiveTerminal does NOT change activeFilePath
  it('S03: setActiveTerminal does NOT change activeFilePath', () => {
    useNapStore.getState().openFile('/some/file.md');
    useNapStore.getState().setActiveTerminal('uuid-1');
    expect(useNapStore.getState().activeFilePath).toBe('/some/file.md');
  });

  // T-0100-S04: Both panes track state simultaneously
  it('S04: both panes track state simultaneously', () => {
    useNapStore.getState().openFile('/file-a.md');
    useNapStore.getState().setActiveTerminal('uuid-1');

    expect(useNapStore.getState().activeFilePath).toBe('/file-a.md');
    expect(useNapStore.getState().activeTerminalId).toBe('uuid-1');

    // Change file, terminal should stay
    useNapStore.getState().openFile('/file-b.md');
    expect(useNapStore.getState().activeFilePath).toBe('/file-b.md');
    expect(useNapStore.getState().activeTerminalId).toBe('uuid-1');
  });

  // T-0100-S05: openFile replaces previous file (ephemeral behavior)
  it('S05: openFile replaces previous file (ephemeral)', () => {
    useNapStore.getState().openFile('/file-a.md');
    useNapStore.getState().openFile('/file-b.md');
    expect(useNapStore.getState().activeFilePath).toBe('/file-b.md');
  });

  // T-0100-S06: Nepic switch behavior for activeFilePath
  it('S06: nepic switch saves and restores activeFilePath', () => {
    const arch1 = makeAgent({ id: 'uuid-v1-arch', role: 'architect', started: true, running: true });
    const arch2 = makeAgent({ id: 'uuid-v2-arch', role: 'architect', started: true, running: true });
    const snap1 = makeSnapshot({ activeNepicId: '01-v1', architects: [arch1] });
    const snap2 = makeSnapshot({ activeNepicId: '02-ttt', architects: [arch2] });

    // Load v1, open a file
    useNapStore.getState().applySnapshot(snap1);
    useNapStore.getState().openFile('/v1/file.md');

    // Switch to v2 — v1's file path saved
    useNapStore.getState().applySnapshot(snap2);
    expect(useNapStore.getState().activeFilePath).toBeNull();

    // Switch back to v1 — restores file path
    useNapStore.getState().applySnapshot(snap1);
    expect(useNapStore.getState().activeFilePath).toBe('/v1/file.md');
  });

  it('S06b: nepic switch clears activeFilePath when target has no remembered file', () => {
    const arch1 = makeAgent({ id: 'uuid-v1-arch', role: 'architect', started: true, running: true });
    const arch2 = makeAgent({ id: 'uuid-v2-arch', role: 'architect', started: true, running: true });

    // Load v1
    useNapStore.getState().applySnapshot(makeSnapshot({
      activeNepicId: '01-v1',
      architects: [arch1],
    }));
    useNapStore.getState().openFile('/v1/file.md');

    // Switch to v2 (no remembered file)
    useNapStore.getState().applySnapshot(makeSnapshot({
      activeNepicId: '02-ttt',
      architects: [arch2],
    }));

    expect(useNapStore.getState().activeFilePath).toBeNull();
  });

  // T-0100-S07: applySnapshot preserves activeFilePath
  it('S07: same-nepic snapshot preserves activeFilePath', () => {
    const arch = makeAgent({ id: 'uuid-arch', role: 'architect', started: true, running: true });

    useNapStore.getState().applySnapshot(makeSnapshot({
      activeNepicId: '01-v1',
      architects: [arch],
    }));
    useNapStore.getState().openFile('/some/file.md');

    // Another snapshot for same nepic — should NOT touch activeFilePath
    useNapStore.getState().applySnapshot(makeSnapshot({
      activeNepicId: '01-v1',
      architects: [arch],
    }));

    expect(useNapStore.getState().activeFilePath).toBe('/some/file.md');
  });
});
