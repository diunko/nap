import { describe, test, expect, beforeEach } from 'vitest';
import { useTerminalStore } from '../../src/renderer/store';
import { getTerminal, disposeTerminal } from '../../src/renderer/terminal-registry';

// Reset store + registry between tests
beforeEach(() => {
  const state = useTerminalStore.getState();
  for (const t of state.terminals) {
    disposeTerminal(t.id);
  }
  useTerminalStore.setState({
    terminals: [],
    activeTerminalId: null,
    sidebarVisible: true,
  });
});

// T-0200-07: terminal objects live outside React render cycle
describe('T-0200-07: terminal objects live outside React render cycle', () => {
  test('store holds metadata, registry holds Terminal instances', () => {
    const id = useTerminalStore.getState().createTerminal('test');
    const entry = getTerminal(id);

    expect(entry).toBeDefined();
    expect(entry!.terminal).toBeDefined();
    expect(entry!.terminal.buffer).toBeDefined();
  });

  test('setStatus changes store but registry entry is referentially identical', () => {
    const id = useTerminalStore.getState().createTerminal('test');
    const entryBefore = getTerminal(id);

    // Mutate store metadata
    useTerminalStore.getState().setStatus(id, 'done');

    // Registry entry must be the exact same object
    const entryAfter = getTerminal(id);
    expect(entryAfter).toBe(entryBefore);
  });

  test('store state change does not reset terminal buffer', () => {
    const id = useTerminalStore.getState().createTerminal('test');
    const entry = getTerminal(id)!;

    // Write to the terminal buffer directly (simulates pty output)
    entry.terminal.write('hello world');
    const bufferLengthBefore = entry.terminal.buffer.active.length;

    // Trigger store update
    useTerminalStore.getState().setStatus(id, 'exited');

    // Buffer must be untouched
    expect(entry.terminal.buffer.active.length).toBe(bufferLengthBefore);
  });

  test('multiple store updates preserve registry identity', () => {
    const id = useTerminalStore.getState().createTerminal('test');
    const entry = getTerminal(id);

    // Several store mutations
    useTerminalStore.getState().setStatus(id, 'done');
    useTerminalStore.getState().toggleSidebar();
    useTerminalStore.getState().toggleSidebar();
    useTerminalStore.getState().setStatus(id, 'exited');

    expect(getTerminal(id)).toBe(entry);
  });
});

// T-0200-08: sidebar card ordering matches creation order
describe('T-0200-08: sidebar card ordering matches creation order', () => {
  test('terminals are stored in creation order', () => {
    const store = useTerminalStore.getState();
    store.createTerminal('first');
    store.createTerminal('second');
    store.createTerminal('third');

    const names = useTerminalStore.getState().terminals.map((t) => t.name);
    expect(names).toEqual(['first', 'second', 'third']);
  });

  test('removing middle terminal preserves order of remaining', () => {
    const store = useTerminalStore.getState();
    store.createTerminal('first');
    const middleId = store.createTerminal('second');
    store.createTerminal('third');

    useTerminalStore.getState().removeTerminal(middleId);

    const names = useTerminalStore.getState().terminals.map((t) => t.name);
    expect(names).toEqual(['first', 'third']);
  });

  test('first created terminal is set as active', () => {
    const store = useTerminalStore.getState();
    const firstId = store.createTerminal('first');
    store.createTerminal('second');

    expect(useTerminalStore.getState().activeTerminalId).toBe(firstId);
  });

  test('removing active terminal falls back to first remaining', () => {
    const store = useTerminalStore.getState();
    const firstId = store.createTerminal('first');
    const secondId = store.createTerminal('second');
    store.createTerminal('third');

    // Make second active, then remove it
    useTerminalStore.getState().setActive(secondId);
    expect(useTerminalStore.getState().activeTerminalId).toBe(secondId);

    useTerminalStore.getState().removeTerminal(secondId);
    expect(useTerminalStore.getState().activeTerminalId).toBe(firstId);
  });
});
