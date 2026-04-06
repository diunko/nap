import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

export interface TerminalEntry {
  terminal: Terminal;
  fitAddon: FitAddon;
  opened: boolean;
  following: boolean;
  disposeFollow?: () => void;
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

  // Don't call open() yet — xterm buffers writes internally.
  // Will be opened when first displayed (see openTerminal).
  const entry: TerminalEntry = { terminal, fitAddon, opened: false, following: false };
  registry.set(id, entry);
  return entry;
}

export function openTerminal(id: string, container: HTMLElement): void {
  const entry = registry.get(id);
  if (!entry || entry.opened) return;

  entry.terminal.open(container);
  entry.opened = true;

  // DOM renderer (Canvas addon removed in xterm 6.0, WebGL has CSP issues)
}

export function getTerminal(id: string): TerminalEntry | undefined {
  return registry.get(id);
}

export function toggleFollow(id: string): boolean {
  const entry = registry.get(id);
  if (!entry) return false;

  if (entry.following) {
    // Turn off
    entry.following = false;
    if (entry.disposeFollow) {
      entry.disposeFollow();
      entry.disposeFollow = undefined;
    }
    return false;
  }

  // Turn on
  entry.following = true;
  entry.terminal.scrollToBottom();

  const d1 = entry.terminal.onWriteParsed(() => {
    entry.terminal.scrollToBottom();
  });
  const d2 = entry.terminal.onScroll(() => {
    if (entry.following) entry.terminal.scrollToBottom();
  });

  entry.disposeFollow = () => {
    d1.dispose();
    d2.dispose();
  };

  return true;
}

export function disposeTerminal(id: string): void {
  const entry = registry.get(id);
  if (entry) {
    entry.terminal.dispose();
    registry.delete(id);
  }
}
