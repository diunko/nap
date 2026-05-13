import { describe, it, expect, beforeEach } from 'vitest';
import { useNapStore, _resetNepicTerminalMemory } from '../src/renderer/store';

// ── 2. Right pane mixed surface — store tests (small) ──

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

describe('Right pane — store state', () => {
  beforeEach(resetStore);

  // T-0200-P01: rightPaneMode defaults to 'terminal'
  it('P01: rightPaneMode defaults to terminal', () => {
    expect(useNapStore.getState().rightPaneMode).toBe('terminal');
  });

  // T-0200-P02: openCode sets rightPaneMode + rightFilePath + rightFileLine
  describe('P02: openCode sets all three fields atomically', () => {
    it('sets rightPaneMode, rightFilePath, and rightFileLine', () => {
      useNapStore.getState().openCode({ path: '/abs/file.ts', line: 42 });
      const s = useNapStore.getState();
      expect(s.rightPaneMode).toBe('code');
      expect(s.rightFilePath).toBe('/abs/file.ts');
      expect(s.rightFileLine).toBe(42);
    });

    it('sets rightFileLine to null when line not provided', () => {
      useNapStore.getState().openCode({ path: '/abs/file.ts' });
      const s = useNapStore.getState();
      expect(s.rightPaneMode).toBe('code');
      expect(s.rightFilePath).toBe('/abs/file.ts');
      expect(s.rightFileLine).toBeNull();
    });
  });

  // T-0200-P03: setActiveTerminal resets rightPaneMode to 'terminal'
  it('P03: setActiveTerminal resets rightPaneMode to terminal', () => {
    useNapStore.getState().openCode({ path: '/file.ts', line: 10 });
    expect(useNapStore.getState().rightPaneMode).toBe('code');

    useNapStore.getState().setActiveTerminal('uuid-1');
    expect(useNapStore.getState().rightPaneMode).toBe('terminal');
  });

  // T-0200-P04: openCode does NOT change activeTerminalId
  it('P04: openCode does NOT change activeTerminalId', () => {
    useNapStore.getState().setActiveTerminal('uuid-1');
    expect(useNapStore.getState().activeTerminalId).toBe('uuid-1');

    useNapStore.getState().openCode({ path: '/file.ts', line: 5 });
    expect(useNapStore.getState().activeTerminalId).toBe('uuid-1');
  });
});
