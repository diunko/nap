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

describe('Nepic terminal switching', () => {
  beforeEach(() => {
    _resetNepicTerminalMemory();
    useNapStore.setState({
      napkins: [],
      architects: [],
      activeNepicId: '',
      activeTerminalId: null,
      nepics: [],
      watcherEvents: [],
    });
  });

  it('first snapshot does not change activeTerminalId', () => {
    const arch = makeAgent({ id: 'uuid-arch', role: 'architect', started: true, running: true });
    useNapStore.getState().applySnapshot(makeSnapshot({
      activeNepicId: '01-v1',
      architects: [arch],
    }));
    // First load (prev activeNepicId was '') — should NOT auto-select
    expect(useNapStore.getState().activeTerminalId).toBeNull();
  });

  it('nepic switch picks architect when no remembered terminal', () => {
    const arch1 = makeAgent({ id: 'uuid-v1-arch', role: 'architect', started: true, running: true });
    const arch2 = makeAgent({ id: 'uuid-v2-arch', role: 'architect', started: true, running: true });

    // Load first nepic
    useNapStore.getState().applySnapshot(makeSnapshot({
      activeNepicId: '01-v1',
      architects: [arch1],
    }));

    // Switch to second nepic
    useNapStore.getState().applySnapshot(makeSnapshot({
      activeNepicId: '02-ttt',
      architects: [arch2],
    }));

    expect(useNapStore.getState().activeTerminalId).toBe('uuid-v2-arch');
  });

  it('nepic switch restores remembered terminal', () => {
    const arch1 = makeAgent({ id: 'uuid-v1-arch', role: 'architect', started: true, running: true });
    const arch2 = makeAgent({ id: 'uuid-v2-arch', role: 'architect', started: true, running: true });

    // Load first nepic, set active terminal to a napkin agent
    useNapStore.getState().applySnapshot(makeSnapshot({
      activeNepicId: '01-v1',
      architects: [arch1],
    }));
    useNapStore.getState().setActiveTerminal('uuid-v1-fs-eng');

    // Switch to second nepic — saves 'uuid-v1-fs-eng' for 01-v1
    useNapStore.getState().applySnapshot(makeSnapshot({
      activeNepicId: '02-ttt',
      architects: [arch2],
    }));
    expect(useNapStore.getState().activeTerminalId).toBe('uuid-v2-arch');

    // Switch back to first nepic — restores 'uuid-v1-fs-eng'
    useNapStore.getState().applySnapshot(makeSnapshot({
      activeNepicId: '01-v1',
      architects: [arch1],
    }));
    expect(useNapStore.getState().activeTerminalId).toBe('uuid-v1-fs-eng');
  });

  it('nepic switch falls back to started architect if none running', () => {
    const arch1 = makeAgent({ id: 'uuid-v1-arch', role: 'architect', started: true, running: true });
    const arch2 = makeAgent({ id: 'uuid-v2-arch', role: 'architect', started: true, running: false });

    useNapStore.getState().applySnapshot(makeSnapshot({
      activeNepicId: '01-v1',
      architects: [arch1],
    }));

    useNapStore.getState().applySnapshot(makeSnapshot({
      activeNepicId: '02-ttt',
      architects: [arch2],
    }));

    expect(useNapStore.getState().activeTerminalId).toBe('uuid-v2-arch');
  });

  it('nepic switch to empty nepic sets null terminal', () => {
    const arch1 = makeAgent({ id: 'uuid-v1-arch', role: 'architect', started: true, running: true });

    useNapStore.getState().applySnapshot(makeSnapshot({
      activeNepicId: '01-v1',
      architects: [arch1],
    }));

    // Switch to nepic with no architects
    useNapStore.getState().applySnapshot(makeSnapshot({
      activeNepicId: '02-ttt',
      architects: [],
    }));

    expect(useNapStore.getState().activeTerminalId).toBeNull();
  });

  it('same-nepic snapshot does not change activeTerminalId', () => {
    const arch = makeAgent({ id: 'uuid-arch', role: 'architect', started: true, running: true });

    useNapStore.getState().applySnapshot(makeSnapshot({
      activeNepicId: '01-v1',
      architects: [arch],
    }));
    useNapStore.getState().setActiveTerminal('uuid-some-agent');

    // Another snapshot for same nepic — should NOT touch terminal
    useNapStore.getState().applySnapshot(makeSnapshot({
      activeNepicId: '01-v1',
      architects: [arch],
    }));

    expect(useNapStore.getState().activeTerminalId).toBe('uuid-some-agent');
  });

  it('round-trip: v1 → v2 → v1 → v2 preserves both terminals', () => {
    const arch1 = makeAgent({ id: 'uuid-v1-arch', role: 'architect', started: true, running: true });
    const arch2 = makeAgent({ id: 'uuid-v2-arch', role: 'architect', started: true, running: true });
    const snap1 = makeSnapshot({ activeNepicId: '01-v1', architects: [arch1] });
    const snap2 = makeSnapshot({ activeNepicId: '02-ttt', architects: [arch2] });

    // Load v1
    useNapStore.getState().applySnapshot(snap1);
    useNapStore.getState().setActiveTerminal('uuid-v1-agent');

    // Switch to v2
    useNapStore.getState().applySnapshot(snap2);
    useNapStore.getState().setActiveTerminal('uuid-v2-agent');

    // Switch to v1 — restores v1's agent
    useNapStore.getState().applySnapshot(snap1);
    expect(useNapStore.getState().activeTerminalId).toBe('uuid-v1-agent');

    // Switch to v2 — restores v2's agent
    useNapStore.getState().applySnapshot(snap2);
    expect(useNapStore.getState().activeTerminalId).toBe('uuid-v2-agent');
  });
});

describe('Nepic focused card switching', () => {
  beforeEach(() => {
    _resetNepicTerminalMemory();
    useNapStore.setState({
      napkins: [],
      architects: [],
      activeNepicId: '',
      activeTerminalId: null,
      focusedCardSlug: null,
      cardViewMode: 'collapsed' as const,
      nepics: [],
      watcherEvents: [],
    });
  });

  it('nepic switch defaults to architect card focused', () => {
    const arch1 = makeAgent({ id: 'uuid-v1-arch', role: 'architect', started: true, running: true });
    const arch2 = makeAgent({ id: 'uuid-v2-arch', role: 'architect', started: true, running: true });

    useNapStore.getState().applySnapshot(makeSnapshot({
      activeNepicId: '01-v1',
      architects: [arch1],
    }));

    useNapStore.getState().applySnapshot(makeSnapshot({
      activeNepicId: '02-ttt',
      architects: [arch2],
    }));

    expect(useNapStore.getState().focusedCardSlug).toBe('uuid-v2-arch');
    expect(useNapStore.getState().cardViewMode).toBe('focused');
  });

  it('nepic switch restores remembered focused card', () => {
    const arch1 = makeAgent({ id: 'uuid-v1-arch', role: 'architect', started: true, running: true });
    const arch2 = makeAgent({ id: 'uuid-v2-arch', role: 'architect', started: true, running: true });
    const snap1 = makeSnapshot({ activeNepicId: '01-v1', architects: [arch1] });
    const snap2 = makeSnapshot({ activeNepicId: '02-ttt', architects: [arch2] });

    // Load v1, focus a napkin card
    useNapStore.getState().applySnapshot(snap1);
    useNapStore.getState().expandCard('0100-explore');
    expect(useNapStore.getState().focusedCardSlug).toBe('0100-explore');

    // Switch to v2 — v1's focused card saved
    useNapStore.getState().applySnapshot(snap2);
    expect(useNapStore.getState().focusedCardSlug).toBe('uuid-v2-arch');

    // Switch back to v1 — restores '0100-explore'
    useNapStore.getState().applySnapshot(snap1);
    expect(useNapStore.getState().focusedCardSlug).toBe('0100-explore');
    expect(useNapStore.getState().cardViewMode).toBe('focused');
  });

  it('same-nepic snapshot does not change focusedCardSlug', () => {
    const arch = makeAgent({ id: 'uuid-arch', role: 'architect', started: true, running: true });

    useNapStore.getState().applySnapshot(makeSnapshot({
      activeNepicId: '01-v1',
      architects: [arch],
    }));
    useNapStore.getState().expandCard('my-napkin');

    // Another snapshot for same nepic
    useNapStore.getState().applySnapshot(makeSnapshot({
      activeNepicId: '01-v1',
      architects: [arch],
    }));

    expect(useNapStore.getState().focusedCardSlug).toBe('my-napkin');
  });

  it('round-trip preserves focused cards for both nepics', () => {
    const arch1 = makeAgent({ id: 'uuid-v1-arch', role: 'architect', started: true, running: true });
    const arch2 = makeAgent({ id: 'uuid-v2-arch', role: 'architect', started: true, running: true });
    const snap1 = makeSnapshot({ activeNepicId: '01-v1', architects: [arch1] });
    const snap2 = makeSnapshot({ activeNepicId: '02-ttt', architects: [arch2] });

    // v1: focus napkin-a
    useNapStore.getState().applySnapshot(snap1);
    useNapStore.getState().expandCard('napkin-a');

    // v2: focus napkin-b
    useNapStore.getState().applySnapshot(snap2);
    useNapStore.getState().expandCard('napkin-b');

    // Back to v1
    useNapStore.getState().applySnapshot(snap1);
    expect(useNapStore.getState().focusedCardSlug).toBe('napkin-a');

    // Back to v2
    useNapStore.getState().applySnapshot(snap2);
    expect(useNapStore.getState().focusedCardSlug).toBe('napkin-b');
  });
});
