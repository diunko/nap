import { describe, test, expect, beforeEach } from 'vitest';
import { useTerminalStore, dotColor, isDotHollow, isDotPulsing, terminalStatusToAgent } from '../../src/renderer/store';
import { disposeTerminal } from '../../src/renderer/terminal-registry';

// Reset store between tests
beforeEach(() => {
  const state = useTerminalStore.getState();
  for (const t of state.terminals) {
    disposeTerminal(t.id);
  }
  useTerminalStore.setState({
    terminals: [],
    activeTerminalId: null,
    sidebarVisible: true,
    focusedCardSlug: null,
    cardViewMode: 'collapsed',
    activeNepicId: 'spaces',
    browserFilterText: '',
    browserFilterVisible: false,
    napkins: [],
    kanbanVisible: false,
  });
});

// ---------------------------------------------------------------------------
// T-0800-06: orphaned dot renders with correct visual
// ---------------------------------------------------------------------------
describe('T-0800-06: orphaned dot renders with correct visual', () => {
  test('terminalStatusToAgent returns orphaned when isOrphaned=true', () => {
    expect(terminalStatusToAgent('running', true)).toBe('orphaned');
    expect(terminalStatusToAgent('running', false)).toBe('run');
    expect(terminalStatusToAgent('running')).toBe('run');
  });

  test('orphaned dot color is gray (#6b7280)', () => {
    expect(dotColor('orphaned')).toBe('#6b7280');
  });

  test('orphaned dot is not hollow (isDotHollow=false)', () => {
    expect(isDotHollow('orphaned')).toBe(false);
  });

  test('orphaned dot is not pulsing', () => {
    expect(isDotPulsing('orphaned')).toBe(false);
  });

  test('orphaned is visually distinct from running (green, filled, pulsing)', () => {
    // Running: green, solid fill, pulsing
    expect(dotColor('run')).toBe('#22c55e');
    expect(isDotHollow('run')).toBe(false);
    expect(isDotPulsing('run')).toBe(true);

    // Orphaned: gray, transparent (dashed border), no pulse
    expect(dotColor('orphaned')).toBe('#6b7280');
    expect(isDotPulsing('orphaned')).toBe(false);
  });

  test('orphaned is visually distinct from exit (gray, hollow solid border)', () => {
    // Exit: gray, hollow (solid border)
    expect(dotColor('exit')).toBe('#6b7280');
    expect(isDotHollow('exit')).toBe(true);

    // Orphaned: gray but NOT hollow (uses dashed border via separate path)
    expect(isDotHollow('orphaned')).toBe(false);
  });

  test('addOrphanedTerminal sets isOrphaned=true and stores ccSessionUuid', () => {
    const store = useTerminalStore.getState();
    store.addOrphanedTerminal('orphan-1', 'test-eng', {
      role: 'test-eng',
      napkinSlug: '0200-foo',
      ccSessionUuid: 'uuid-abc-123',
      parentId: 'parent-1',
      cwd: '/tmp/test',
    });

    const terminal = useTerminalStore.getState().terminals.find((t) => t.id === 'orphan-1');
    expect(terminal).toBeDefined();
    expect(terminal!.isOrphaned).toBe(true);
    expect(terminal!.ccSessionUuid).toBe('uuid-abc-123');
    expect(terminal!.role).toBe('test-eng');
    expect(terminal!.napkinSlug).toBe('0200-foo');
    expect(terminal!.status).toBe('running'); // SQLite status preserved
  });

  test('resumeOrphanedTerminal clears isOrphaned flag', () => {
    const store = useTerminalStore.getState();
    store.addOrphanedTerminal('orphan-2', 'fs-eng', {
      role: 'fs-eng',
      ccSessionUuid: 'uuid-def-456',
    });

    // Before resume
    let terminal = useTerminalStore.getState().terminals.find((t) => t.id === 'orphan-2');
    expect(terminal!.isOrphaned).toBe(true);

    // Resume
    store.resumeOrphanedTerminal('orphan-2');

    // After resume
    terminal = useTerminalStore.getState().terminals.find((t) => t.id === 'orphan-2');
    expect(terminal!.isOrphaned).toBe(false);
  });

  test('resumeOrphanedTerminal is no-op without ccSessionUuid', () => {
    const store = useTerminalStore.getState();
    store.addOrphanedTerminal('orphan-3', 'no-uuid', {
      role: 'test-eng',
      // no ccSessionUuid
    });

    store.resumeOrphanedTerminal('orphan-3');

    // Still orphaned — resume was a no-op
    const terminal = useTerminalStore.getState().terminals.find((t) => t.id === 'orphan-3');
    expect(terminal!.isOrphaned).toBe(true);
  });
});
