/**
 * `monaco` custom command for just-bash.
 * Opens a file in the Monaco editor tab from the terminal.
 */

import { defineCommand } from 'just-bash';
import type { LightningFsAdapter } from './fs-adapter';
import type { NapStoreApi } from './store';

const HELP = 'usage: monaco <file>  \u2014 open file in editor\n';

export function createMonacoCommand(store: NapStoreApi, adapter: LightningFsAdapter) {
  return defineCommand('monaco', async (args, ctx) => {
    if (args.length === 0 || args[0] === '--help') {
      return { stdout: HELP, stderr: '', exitCode: 0 };
    }

    const resolved = adapter.resolvePath(ctx.cwd, args[0]);

    if (!await adapter.exists(resolved)) {
      return { stdout: '', stderr: `monaco: ${args[0]}: no such file\n`, exitCode: 1 };
    }

    store.getState().openDoc(resolved);
    store.getState().pinActiveEphemeral();
    store.getState().setActiveSurface('editor');

    return { stdout: '', stderr: '', exitCode: 0 };
  });
}
