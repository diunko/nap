import { describe, test, expect, vi, beforeEach } from 'vitest';
import { setupScrollLock } from '../../src/renderer/scroll-lock';
import type { Terminal } from '@xterm/xterm';

/** Create a mock Terminal with spies and event firing hooks */
function createMockTerminal() {
  let onWriteParsedCb: (() => void) | null = null;
  let onScrollCb: (() => void) | null = null;
  let d1Disposed = false;
  let d2Disposed = false;

  const terminal = {
    scrollToBottom: vi.fn(),
    scrollToLine: vi.fn(),
    buffer: {
      active: {
        viewportY: 0,
      },
    },
    onWriteParsed: vi.fn((cb: () => void) => {
      onWriteParsedCb = cb;
      return {
        dispose: () => {
          d1Disposed = true;
          onWriteParsedCb = null;
        },
      };
    }),
    onScroll: vi.fn((cb: () => void) => {
      onScrollCb = cb;
      return {
        dispose: () => {
          d2Disposed = true;
          onScrollCb = null;
        },
      };
    }),
    options: {
      scrollOnUserInput: true,
    },
  };

  return {
    terminal: terminal as unknown as Terminal,
    fireWriteParsed: () => onWriteParsedCb?.(),
    fireScroll: () => onScrollCb?.(),
    isD1Disposed: () => d1Disposed,
    isD2Disposed: () => d2Disposed,
  };
}

// T1: State machine — mode transitions
describe('T1: State machine — mode transitions', () => {
  test('off → follow → read → off', () => {
    const { terminal } = createMockTerminal();
    const sl = setupScrollLock(terminal);

    expect(sl.getMode()).toBe('off');

    sl.setMode('follow');
    expect(sl.getMode()).toBe('follow');

    sl.setMode('read');
    expect(sl.getMode()).toBe('read');

    sl.setMode('off');
    expect(sl.getMode()).toBe('off');
  });
});

// T2: Follow lock — sets scrollOnUserInput to false
describe('T2: Follow lock — sets scrollOnUserInput to false', () => {
  test('setMode("follow") disables scrollOnUserInput', () => {
    const { terminal } = createMockTerminal();
    const sl = setupScrollLock(terminal);

    sl.setMode('follow');
    expect(terminal.options.scrollOnUserInput).toBe(false);
  });
});

// T3: Read lock — captures viewportY on entry
describe('T3: Read lock — captures viewportY on entry', () => {
  test('onWriteParsed scrolls to pinned line (viewportY at setMode time)', () => {
    const { terminal, fireWriteParsed } = createMockTerminal();
    (terminal.buffer.active as any).viewportY = 42;
    const sl = setupScrollLock(terminal);

    sl.setMode('read');
    fireWriteParsed();

    expect(terminal.scrollToLine).toHaveBeenCalledWith(42);
  });
});

// T4: Off mode — restores scrollOnUserInput to true
describe('T4: Off mode — restores scrollOnUserInput to true', () => {
  test('follow → off restores scrollOnUserInput', () => {
    const { terminal } = createMockTerminal();
    const sl = setupScrollLock(terminal);

    sl.setMode('follow');
    expect(terminal.options.scrollOnUserInput).toBe(false);

    sl.setMode('off');
    expect(terminal.options.scrollOnUserInput).toBe(true);
  });
});

// T5: Follow lock — onWriteParsed calls scrollToBottom
describe('T5: Follow lock — onWriteParsed calls scrollToBottom', () => {
  test('scrollToBottom fires on each write in follow mode', () => {
    const { terminal, fireWriteParsed } = createMockTerminal();
    const sl = setupScrollLock(terminal);

    sl.setMode('follow');
    // scrollToBottom is called once during setMode('follow') itself
    const callsBefore = (terminal.scrollToBottom as ReturnType<typeof vi.fn>).mock.calls.length;

    fireWriteParsed();
    expect((terminal.scrollToBottom as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      callsBefore + 1,
    );
  });
});

// T6: Read lock — user scroll updates locked position
describe('T6: Read lock — user scroll updates locked position', () => {
  test.skip('onScroll without write updates lockedY (allows user scrolling)', async () => {
    const { terminal, fireScroll, fireWriteParsed } = createMockTerminal();
    (terminal.buffer.active as any).viewportY = 100;
    const sl = setupScrollLock(terminal);

    sl.setMode('read');
    (terminal.scrollToLine as ReturnType<typeof vi.fn>).mockClear();

    // Simulate user scroll to line 120
    (terminal.buffer.active as any).viewportY = 120;
    fireScroll();

    // scrollToLine should NOT be called for user scroll
    expect(terminal.scrollToLine).not.toHaveBeenCalled();

    // Wait for microtask to update lockedY
    await new Promise<void>((r) => queueMicrotask(r));

    // Now a write should restore to the user's new scroll position (120)
    fireWriteParsed();
    expect(terminal.scrollToLine).toHaveBeenCalledWith(120);
  });
});

// T7: Off mode — listeners are no-ops
describe('T7: Off mode — listeners are no-ops', () => {
  test('firing events in off mode does not scroll', () => {
    const { terminal, fireWriteParsed, fireScroll } = createMockTerminal();
    setupScrollLock(terminal);

    fireWriteParsed();
    fireScroll();

    expect(terminal.scrollToBottom).not.toHaveBeenCalled();
    expect(terminal.scrollToLine).not.toHaveBeenCalled();
  });
});

// T8: Dispose — cleans up listeners
describe('T8: Dispose — cleans up listeners', () => {
  test('dispose calls disposable.dispose() on both listeners', () => {
    const mock = createMockTerminal();
    const sl = setupScrollLock(mock.terminal);

    sl.dispose();

    expect(mock.isD1Disposed()).toBe(true);
    expect(mock.isD2Disposed()).toBe(true);
  });

  test('events after dispose do not scroll', () => {
    const mock = createMockTerminal();
    const sl = setupScrollLock(mock.terminal);

    sl.setMode('follow');
    (mock.terminal.scrollToBottom as ReturnType<typeof vi.fn>).mockClear();

    sl.dispose();
    mock.fireWriteParsed();
    mock.fireScroll();

    expect(mock.terminal.scrollToBottom).not.toHaveBeenCalled();
    expect(mock.terminal.scrollToLine).not.toHaveBeenCalled();
  });
});
