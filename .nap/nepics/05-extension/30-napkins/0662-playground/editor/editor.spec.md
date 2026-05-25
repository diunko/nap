# monaco command — spec

## Custom shell command

Register via `defineCommand('monaco', ...)` — same pattern as git-command.ts. The command function receives `(args, ctx)` where `ctx.cwd` is the current working directory.

## Path resolution

```typescript
function resolvePath(cwd: string, arg: string): string {
  if (arg.startsWith('/')) return arg;  // absolute
  return normalizePath(cwd + '/' + arg);  // relative to cwd
}
```

`normalizePath` handles `..` and `.` segments. The adapter's `resolvePath` already does this.

## File existence check

Before opening: `await adapter.exists(resolvedPath)`. If not found: return `{ stderr: 'monaco: <file>: no such file', exitCode: 1 }`. Don't open a tab.

## Opening

Call a function exposed by the panel (not the store directly — the command runs inside the shell which is inside the terminal). The command needs a way to tell the panel "open this file as permanent tab."

Options:
- Callback passed to the command factory: `makeMonacoCommand(openFileFn)`
- Custom event: `dispatchEvent(new CustomEvent('monaco-open', { detail: { path } }))`
- Direct store access: if the store is accessible from the command context

The store approach is simplest — the command factory receives the store (same as git-command receives lfs).

```typescript
function makeMonacoCommand(store: NapStoreApi, adapter: LightningFsAdapter) {
  return defineCommand('monaco', async (args, ctx) => {
    if (args[0] === '--help' || args.length === 0) {
      return { stdout: 'usage: monaco <file>  — open file in editor\n', stderr: '', exitCode: 0 };
    }
    const resolved = resolvePath(ctx.cwd, args[0]);
    if (!await adapter.exists(resolved)) {
      return { stdout: '', stderr: `monaco: ${args[0]}: no such file\n`, exitCode: 1 };
    }
    store.getState().openDoc(resolved);
    store.getState().pinActiveEphemeral();  // make it permanent
    store.getState().setActiveSurface('editor');
    return { stdout: '', stderr: '', exitCode: 0 };
  });
}
```

## What "done" looks like

* `monaco playground.yaml` opens the file in a permanent editor tab
* `monaco --help` shows usage
* `monaco nonexistent` shows error, no tab
* relative paths work from any cwd
* the file is editable, auto-saves to LFS
