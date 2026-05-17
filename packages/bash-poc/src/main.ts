/**
 * Entry point: mount wterm, init lightning-fs, wire everything together.
 */
import { Buffer } from 'buffer';
(globalThis as any).Buffer = Buffer;

import LightningFS from '@isomorphic-git/lightning-fs';
import { WTerm } from '@wterm/dom';
import { LightningFsAdapter } from './fs-adapter';
import { createGitCommand } from './git-command';
import { BashShell } from './shell';

async function main() {
  console.log('[main] starting');

  // 1. Filesystem — single LightningFS instance shared by bash + git
  const lfs = new LightningFS('bash-poc');
  (window as any).__lfs = lfs;
  (window as any).__fs = undefined; // set after adapter created
  console.log('[main] lightning-fs created');

  // Create /home/user so the shell has a home dir
  try { await lfs.promises.mkdir('/home'); } catch { /* exists */ }
  try { await lfs.promises.mkdir('/home/user'); } catch { /* exists */ }
  console.log('[main] /home/user ready');

  // 2. Adapter for just-bash
  const fs = new LightningFsAdapter(lfs);
  (window as any).__fs = fs;
  console.log('[main] fs adapter created');

  // 3. Git command (uses raw lfs for isomorphic-git)
  const gitCommand = createGitCommand(lfs);
  console.log('[main] git command created');

  // 4. Shell with fs + git
  const shell = new BashShell({
    fs,
    customCommands: [gitCommand],
    cwd: '/home/user',
    greeting: 'bash-poc — browser bash + git over IndexedDB',
  });
  console.log('[main] shell created');

  // 5. Terminal
  const container = document.getElementById('terminal')!;
  const term = new WTerm(container, { cols: 80, rows: 24, autoResize: true });
  await term.init();
  console.log('[main] terminal initialized');

  // 6. Wire I/O
  await shell.attach((data: string) => term.write(data));
  term.onData = (data: string) => shell.handleInput(data);
  console.log('[main] shell attached, ready');
}

main().catch(console.error);
