# monaco command — open any LFS file in the editor

* what: `monaco <file>` terminal command opens the file in Monaco editor tab
  * like vim but opens in the editor surface
  * opens as non-ephemeral (permanent tab)
  * respects cwd — relative paths work

* usage
  * `monaco playground.yaml` — opens relative to cwd
  * `monaco /home/user/playground.yaml` — absolute path
  * `monaco --help` — shows usage

* implementation
  * custom shell command via `defineCommand('monaco', ...)`
  * same pattern as git-command.ts
  * resolves path relative to shell cwd
  * calls `store.openDoc(resolvedPath)` + `store.pinTab(tabId)` (non-ephemeral)
  * switches activeSurface to 'editor'
  * returns `{ stdout: '', stderr: '', exitCode: 0 }`

* cwd resolution
  * shell provides `ctx.cwd` in the command context
  * `monaco playground.yaml` with cwd `/home/user` → `/home/user/playground.yaml`
  * `monaco ../other/file.md` → resolves relative to cwd
  * `monaco /absolute/path.md` → used as-is

* what doesn't change
  * editor surface, Monaco setup, auto-save — all existing
  * the command just opens a file — same as clicking in the nav tree, but from terminal
