# 0500 — bash-poc build report

## What was built

`packages/bash-poc/` — TypeScript + vite project wiring wterm, just-bash, lightning-fs, and isomorphic-git into a browser terminal with git support. All four stories work.

### Files

- `src/fs-adapter.ts` — LightningFS → IFileSystem adapter (~180 lines). Maps lightning-fs `.promises` API to just-bash's IFileSystem interface. Implements: readFile, writeFile, appendFile (read+concat+write), exists (try stat+catch), mkdir (recursive), readdir, rm (recursive), cp (recursive), mv, chmod/utimes (no-op), symlink, readlink, realpath, resolvePath, getAllPaths.
- `src/git-command.ts` — `defineCommand("git")` wrapping isomorphic-git (~130 lines). Subcommands: clone, log (--oneline, -n), status, add (single file or `.`), commit (-m), diff. Uses `cors.isomorphic-git.org` as CORS proxy.
- `src/shell.ts` — BashShell fork from `@wterm/just-bash` (~280 lines). Added `fs?: IFileSystem` and `customCommands?: CustomCommand[]` to constructor options, passed through to `new Bash()`. Fixed cwd tracking (see decisions below).
- `src/main.ts` — Entry point: mounts wterm, inits lightning-fs, creates adapter, registers git command, wires I/O.
- `index.html` — Full-page terminal, dark background.
- `e2e/playwright.config.ts` — Playwright config with vite webServer integration.
- `e2e/tests/terminal.spec.ts` — 14 tests: 10 incremental debug tests + 4 story tests. All pass.

### Setup

- Added `packages/bash-poc` to root `package.json` workspaces.
- `npm run dev` serves on `http://localhost:5173`.
- `tsc --noEmit` — zero errors.
- Playwright tests: `npx playwright test --config e2e/playwright.config.ts` — 14/14 pass (~32s).

## Decisions

### 1. Buffer polyfill

isomorphic-git requires `Buffer` in the browser. Added `buffer` npm package and set `globalThis.Buffer` in main.ts before any isomorphic-git import.

### 2. CWD tracking via `result.env.PWD` instead of pwd re-execution

The original BashShell from @wterm/just-bash tracks cwd by re-executing the user's command with `>/dev/null 2>&1; pwd` appended. This fails in our setup because:
- just-bash's `pwd` command tries to access `/dev` which doesn't exist in LightningFS → throws `ENOENT: /dev`
- The re-execution also re-runs side-effectful commands (like `git clone`) a second time

Fixed by reading `result.env.PWD` from the `BashExecResult` returned by `bash.exec()`. just-bash tracks `PWD` internally via its `cd` builtin, so `result.env` always has the correct post-execution cwd. This is simpler and avoids the double-execution problem entirely.

Note: `bash.getCwd()` does NOT work for this — it returns the bash instance's initial cwd (`/`), not the cwd as modified by `cd` within an `exec()` call. The `cd` inside `exec()` only affects that execution's scope.

### 3. Test repo: `abs0luty/rightpad`

`nicedoc/microlink` returns 401 from the CORS proxy (repo likely doesn't exist or is private). Switched to `abs0luty/rightpad` — tiny public repo, single commit, works reliably.

### 4. Prompt-counting for test synchronization

The test `cmd()` helper counts `$ ` occurrences in the terminal before and after a command. It waits for the count to increase, ensuring the shell has fully finished (including cwd update) before typing the next command. Without this, fast-typing tests would race ahead of async shell operations.

## Things to review

- **CORS proxy**: `cors.isomorphic-git.org` works for POC but is unreliable for production. Plan own proxy.
- **Debug logging**: Left `console.log` statements in shell.ts, git-command.ts, main.ts for ongoing development visibility. Remove before shipping to extension.
- **`ENOENT: /dev`**: just-bash expects `/dev` to exist. Shows as stderr noise in the terminal. Could be silenced by creating `/dev` in LightningFS, but it's cosmetic for POC.
- **Tab completion**: Uses `ls -1a` and `compgen -c` from just-bash — works but `compgen` may not be available in the browser build.
