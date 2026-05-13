import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock monaco-editor (store → themes → monaco)
vi.mock('monaco-editor', () => ({
  default: {},
  editor: {
    defineTheme: vi.fn(),
    setTheme: vi.fn(),
  },
}));

import { useNapStore, TERMINAL_TAB_ID, _resetNepicTerminalMemory } from '../src/renderer/store';
import type { AgentState } from '../src/shared/bridge-types';

// ── Terminal tab refactor — small tests ──

function makeAgent(overrides: Partial<AgentState>): AgentState {
  return {
    id: '', name: '', role: '', nepicId: '', napkinId: null,
    parentName: null, parentId: null, createdAt: 0,
    started: false, exited: false, running: false, done: false,
    archived: false, pendingApproval: null, homePath: '', entries: [],
    ...overrides,
  };
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

// T-0300-TT-01: Single terminal tab — no accumulation
describe('TT-01: Single terminal tab — no accumulation', () => {
  beforeEach(resetStore);

  it('first setActiveTerminal creates exactly 1 terminal tab', () => {
    useNapStore.getState().setActiveTerminal('agent-1');
    const tabs = useNapStore.getState().rightTabs;
    expect(tabs.filter((t) => t.type === 'terminal')).toHaveLength(1);
  });

  it('three setActiveTerminal calls still produce exactly 1 terminal tab', () => {
    useNapStore.getState().setActiveTerminal('agent-1');
    expect(useNapStore.getState().rightTabs.filter((t) => t.type === 'terminal')).toHaveLength(1);

    useNapStore.getState().setActiveTerminal('agent-2');
    expect(useNapStore.getState().rightTabs.filter((t) => t.type === 'terminal')).toHaveLength(1);

    useNapStore.getState().setActiveTerminal('agent-3');
    expect(useNapStore.getState().rightTabs.filter((t) => t.type === 'terminal')).toHaveLength(1);
  });

  it('terminal tab has the sentinel ID', () => {
    useNapStore.getState().setActiveTerminal('agent-1');
    const termTab = useNapStore.getState().rightTabs.find((t) => t.type === 'terminal');
    expect(termTab?.id).toBe(TERMINAL_TAB_ID);
  });

  it('terminal tab path updates to latest agent ID', () => {
    useNapStore.getState().setActiveTerminal('agent-1');
    expect(useNapStore.getState().rightTabs[0].path).toBe('agent-1');

    useNapStore.getState().setActiveTerminal('agent-2');
    expect(useNapStore.getState().rightTabs[0].path).toBe('agent-2');
  });
});

// T-0300-TT-02: Terminal tab always at position 0
describe('TT-02: Terminal tab always at position 0', () => {
  beforeEach(resetStore);

  it('terminal tab is at index 0 even when file tab opened first', () => {
    useNapStore.getState().openCode({ path: '/src/file.ts', line: 1 });
    expect(useNapStore.getState().rightTabs[0].type).toBe('file');

    useNapStore.getState().setActiveTerminal('agent-1');
    const tabs = useNapStore.getState().rightTabs;
    expect(tabs[0].type).toBe('terminal');
    expect(tabs[0].id).toBe(TERMINAL_TAB_ID);
  });

  it('file tabs appear after terminal tab', () => {
    useNapStore.getState().setActiveTerminal('agent-1');
    useNapStore.getState().openCode({ path: '/src/a.ts' });
    useNapStore.getState().openCode({ path: '/src/b.ts' });

    const tabs = useNapStore.getState().rightTabs;
    expect(tabs[0].type).toBe('terminal');
    // File tabs after terminal
    const fileTabs = tabs.filter((t) => t.type === 'file');
    expect(fileTabs.length).toBeGreaterThan(0);
    for (const ft of fileTabs) {
      expect(tabs.indexOf(ft)).toBeGreaterThan(0);
    }
  });
});

// T-0300-TT-03: Terminal tab title shows agent name
describe('TT-03: Terminal tab title shows agent name', () => {
  beforeEach(resetStore);

  it('title is agent name when agent is in architects', () => {
    const agent = makeAgent({ id: 'uuid-arch-1', name: '001-architect', role: 'architect', started: true, running: true });
    useNapStore.setState({ architects: [agent] });

    useNapStore.getState().setActiveTerminal('uuid-arch-1');
    const termTab = useNapStore.getState().rightTabs.find((t) => t.id === TERMINAL_TAB_ID);
    expect(termTab?.title).toBe('001-architect');
  });

  it('title is agent name when agent is in napkin agents', () => {
    useNapStore.setState({
      napkins: [{
        slug: '0100-explore',
        nepicId: 'test-nepic',
        status: 'doing',
        agents: [makeAgent({ id: 'uuid-te-1', name: '003-test-eng', role: 'test-eng', started: true, running: true })],
      }] as any,
    });

    useNapStore.getState().setActiveTerminal('uuid-te-1');
    const termTab = useNapStore.getState().rightTabs.find((t) => t.id === TERMINAL_TAB_ID);
    expect(termTab?.title).toBe('003-test-eng');
  });

  it('title falls back to ID when agent not found', () => {
    useNapStore.getState().setActiveTerminal('unknown-uuid');
    const termTab = useNapStore.getState().rightTabs.find((t) => t.id === TERMINAL_TAB_ID);
    expect(termTab?.title).toBe('unknown-uuid');
  });

  it('title updates on subsequent setActiveTerminal calls', () => {
    const agent1 = makeAgent({ id: 'uuid-1', name: '001-architect', started: true, running: true });
    const agent2 = makeAgent({ id: 'uuid-2', name: '002-fs-eng', started: true, running: true });
    useNapStore.setState({ architects: [agent1, agent2] });

    useNapStore.getState().setActiveTerminal('uuid-1');
    expect(useNapStore.getState().rightTabs.find((t) => t.id === TERMINAL_TAB_ID)?.title).toBe('001-architect');

    useNapStore.getState().setActiveTerminal('uuid-2');
    expect(useNapStore.getState().rightTabs.find((t) => t.id === TERMINAL_TAB_ID)?.title).toBe('002-fs-eng');
  });
});

// T-0300-TT-04: Terminal tab can't be closed
describe('TT-04: Terminal tab can\'t be closed', () => {
  beforeEach(resetStore);

  it('closeTab on terminal sentinel is a no-op', () => {
    useNapStore.getState().setActiveTerminal('agent-1');
    expect(useNapStore.getState().rightTabs).toHaveLength(1);

    useNapStore.getState().closeTab('right', TERMINAL_TAB_ID);
    expect(useNapStore.getState().rightTabs).toHaveLength(1);
    expect(useNapStore.getState().rightTabs[0].id).toBe(TERMINAL_TAB_ID);
  });

  it('terminal tab persists regardless of agent state', () => {
    // No agents set — terminal tab still can't be closed
    useNapStore.getState().setActiveTerminal('agent-1');
    useNapStore.getState().closeTab('right', TERMINAL_TAB_ID);
    expect(useNapStore.getState().rightTabs.filter((t) => t.id === TERMINAL_TAB_ID)).toHaveLength(1);
  });
});

// T-0300-TT-05: File tabs unaffected by terminal switches
describe('TT-05: File tabs unaffected by terminal switches', () => {
  beforeEach(resetStore);

  it('file tab survives multiple terminal switches', () => {
    useNapStore.getState().openCode({ path: '/src/a.ts', line: 10 });
    const fileTab = useNapStore.getState().rightTabs.find((t) => t.type === 'file');
    const originalPath = fileTab?.path;
    const originalId = fileTab?.id;

    // Pin the file tab so it doesn't get reused
    useNapStore.getState().pinTab('right', originalId!);

    useNapStore.getState().setActiveTerminal('agent-1');
    useNapStore.getState().setActiveTerminal('agent-2');

    const s = useNapStore.getState();
    const fileTabAfter = s.rightTabs.find((t) => t.id === originalId);
    expect(fileTabAfter).toBeDefined();
    expect(fileTabAfter?.path).toBe(originalPath);
    expect(fileTabAfter?.type).toBe('file');
    expect(fileTabAfter?.ephemeral).toBe(false);
  });

  it('file tab properties unchanged after terminal switches', () => {
    useNapStore.getState().openCode({ path: '/src/b.ts', line: 5 });
    const tabId = useNapStore.getState().rightTabs.find((t) => t.type === 'file')!.id;
    useNapStore.getState().pinTab('right', tabId);

    // Save scroll position
    useNapStore.getState().saveTabScroll('right', tabId, 150, { lineNumber: 5, column: 1 });
    const before = useNapStore.getState().rightTabs.find((t) => t.id === tabId)!;

    useNapStore.getState().setActiveTerminal('agent-x');
    useNapStore.getState().setActiveTerminal('agent-y');

    const after = useNapStore.getState().rightTabs.find((t) => t.id === tabId)!;
    expect(after.path).toBe(before.path);
    expect(after.ephemeral).toBe(before.ephemeral);
    expect(after.scrollPos).toBe(before.scrollPos);
    expect(after.cursorPos).toEqual(before.cursorPos);
  });
});
