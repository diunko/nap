import React, { useEffect, useRef } from 'react';
import type LightningFS from '@isomorphic-git/lightning-fs';
import { WTerm } from '@wterm/dom';
import { BashShell } from './shell';
import { LightningFsAdapter } from './fs-adapter';
import { createGitCommand } from './git-command';

interface TerminalPaneProps {
  lfs: InstanceType<typeof LightningFS> | null;
  adapter: LightningFsAdapter | null;
  onCommandComplete?: (command: string) => void;
  getAuth?: () => Promise<{ username: string; password: string } | undefined>;
}

export function TerminalPane({ lfs, adapter, onCommandComplete, getAuth }: TerminalPaneProps) {
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

    const shell = new BashShell({
      fs: adapter,
      cwd: '/home/user',
      customCommands: [gitCommand],
      onCommandComplete: (cmd) => {
        onCommandComplete?.(cmd);
      },
    });
    shellRef.current = shell;

    // Init wterm and wire shell
    term.init().then(async () => {
      console.log('[terminal] wterm initialized');
      await shell.attach((data: string) => term.write(data));
      term.onData = (data: string) => shell.handleInput(data);
      term.element.focus();
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
