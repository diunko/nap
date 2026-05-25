import React, { useEffect, useRef } from 'react';
import type LightningFS from '@isomorphic-git/lightning-fs';
import { WTerm } from '@wterm/dom';
import { BashShell } from './shell';
import { LightningFsAdapter } from './fs-adapter';
import { createGitCommand } from './git-command';
import { createMonacoCommand } from './monaco-command';
import type { NapStoreApi } from './store';

interface TerminalPaneProps {
  lfs: InstanceType<typeof LightningFS> | null;
  adapter: LightningFsAdapter | null;
  store?: NapStoreApi | null;
  onCommandComplete?: (command: string) => void;
  getAuth?: () => Promise<{ username: string; password: string } | undefined>;
  /** Called when the shell is ready to accept input. */
  onShellReady?: (input: (data: string) => Promise<void>) => void;
}

export function TerminalPane({ lfs, adapter, store, onCommandComplete, getAuth, onShellReady }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<WTerm | null>(null);
  const shellRef = useRef<BashShell | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || !lfs || !adapter || initRef.current) return;
    initRef.current = true;

    console.log('[terminal] initializing wterm');

    const container = containerRef.current;
    const term = new WTerm(container, { cols: 80, rows: 24, autoResize: true });
    termRef.current = term;

    const gitCommand = createGitCommand(lfs, getAuth);
    const customCommands = [gitCommand];
    if (store) {
      customCommands.push(createMonacoCommand(store, adapter));
    }

    const shell = new BashShell({
      fs: adapter,
      cwd: '/home/user',
      customCommands,
      onCommandComplete: (cmd) => {
        onCommandComplete?.(cmd);
      },
    });
    shellRef.current = shell;

    // Init wterm and wire shell
    term.init().then(async () => {
      console.log('[terminal] wterm initialized');
      await shell.attach((data: string) => term.write(data));
      console.log('[terminal] shell attached — prompt written');
      term.onData = (data: string) => shell.handleInput(data);
      term.element.focus();
      onShellReady?.((data: string) => shell.handleInput(data));
    }).catch((e) => {
      console.error('[terminal] init failed:', e);
    });

    return () => {
      console.log('[terminal] disposing');
      initRef.current = false;
    };
  }, [lfs, adapter]);

  return (
    <div
      data-testid="terminal-pane"
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#1e1e1e',
      }}
    />
  );
}
