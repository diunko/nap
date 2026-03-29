import { Terminal } from '@xterm/xterm';

export type ScrollLockMode = 'off' | 'follow' | 'read';

export interface ScrollLockController {
  setMode(mode: ScrollLockMode, pinnedY?: number): void;
  getMode(): ScrollLockMode;
  dispose(): void;
}

export function setupScrollLock(terminal: Terminal): ScrollLockController {
  let mode: ScrollLockMode = 'off';
  let lockedY = 0;

  // In xterm v5, terminal.onScroll does NOT fire for user viewport scrolling
  // (suppressScrollEvent: true in Viewport._handleScroll). So we listen to
  // the DOM scroll event on the viewport element directly to detect user scrolls.
  //
  // Problem: scrollToLine() in onWriteParsed triggers syncScrollArea() which
  // schedules a RAF. The RAF runs _innerRefresh which sets DOM scrollTop,
  // firing a DOM scroll event. By the time that RAF fires, any microtask-based
  // flag (writeJustParsed) has long been cleared.
  //
  // Solution: check if viewportY differs from lockedY. If it does, a real user
  // scroll happened. If it matches, it's our own restore echoing back.
  let viewportEl: HTMLElement | null = null;

  function onViewportScroll(): void {
    if (mode !== 'read') return;
    const pos = terminal.buffer.active.viewportY;
    if (pos !== lockedY) {
      lockedY = pos;
    }
  }

  const d1 = terminal.onWriteParsed(() => {
    if (mode === 'follow') {
      terminal.scrollToBottom();
    } else if (mode === 'read') {
      terminal.scrollToLine(lockedY);
    }
  });

  // Still keep onScroll for follow mode (works for write-triggered scrolls)
  const d2 = terminal.onScroll(() => {
    if (mode === 'follow') {
      terminal.scrollToBottom();
    }
  });

  function attachViewportListener(): void {
    detachViewportListener();
    viewportEl = terminal.element?.querySelector('.xterm-viewport') as HTMLElement | null;
    viewportEl?.addEventListener('scroll', onViewportScroll, { passive: true });
  }

  function detachViewportListener(): void {
    viewportEl?.removeEventListener('scroll', onViewportScroll);
    viewportEl = null;
  }

  return {
    setMode(newMode: ScrollLockMode, pinnedY?: number) {
      mode = newMode;
      if (mode === 'follow') {
        terminal.options.scrollOnUserInput = false;
        terminal.scrollToBottom();
        detachViewportListener();
      } else if (mode === 'read') {
        terminal.options.scrollOnUserInput = false;
        lockedY = pinnedY ?? terminal.buffer.active.viewportY;
        attachViewportListener();
      } else {
        terminal.options.scrollOnUserInput = true;
        detachViewportListener();
      }
    },
    getMode() {
      return mode;
    },
    dispose() {
      d1.dispose();
      d2.dispose();
      detachViewportListener();
    },
  };
}
