import { Terminal } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import { CanvasAddon } from '@xterm/addon-canvas';
import { FitAddon } from '@xterm/addon-fit';
import { setupScrollLock, ScrollLockController } from './scroll-lock';

export interface TerminalEntry {
  terminal: Terminal;
  fitAddon: FitAddon;
  scrollLock: ScrollLockController;
  opened: boolean;
}

const registry = new Map<string, TerminalEntry>();

const TERMINAL_OPTIONS = {
  scrollback: 100000,
  cursorBlink: true,
  theme: {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    cursor: '#d4d4d4',
    cursorAccent: '#1e1e1e',
    selectionBackground: '#264f78',
  },
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  fontSize: 14,
} as const;

export function createTerminalInstance(id: string): TerminalEntry {
  const terminal = new Terminal(TERMINAL_OPTIONS);
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  const scrollLock = setupScrollLock(terminal);

  // Don't call open() yet — xterm buffers writes internally.
  // Will be opened when first displayed (see openTerminal).
  const entry: TerminalEntry = { terminal, fitAddon, scrollLock, opened: false };
  registry.set(id, entry);
  return entry;
}

export function openTerminal(id: string, container: HTMLElement): void {
  const entry = registry.get(id);
  if (!entry || entry.opened) return;

  entry.terminal.open(container);
  entry.opened = true;

  // WebGL renderer with canvas fallback
  try {
    const webglAddon = new WebglAddon();
    webglAddon.onContextLoss(() => {
      webglAddon.dispose();
      try {
        entry.terminal.loadAddon(new CanvasAddon());
      } catch (e) {
        console.warn('Canvas fallback failed after WebGL context loss:', e);
      }
    });
    entry.terminal.loadAddon(webglAddon);
  } catch (e) {
    console.warn('WebGL addon failed, falling back to canvas:', e);
    try {
      entry.terminal.loadAddon(new CanvasAddon());
    } catch (e2) {
      console.warn('Canvas addon also failed, using DOM renderer:', e2);
    }
  }
}

export function getTerminal(id: string): TerminalEntry | undefined {
  return registry.get(id);
}

export function disposeTerminal(id: string): void {
  const entry = registry.get(id);
  if (entry) {
    entry.scrollLock.dispose();
    entry.terminal.dispose();
    registry.delete(id);
  }
}
