# 0500 — bash-poc build report

## What was built

`packages/bash-poc/` — TypeScript + vite project wiring wterm, just-bash, lightning-fs, and isomorphic-git into a browser terminal with git support. All four stories work.

### Files

- `src/fs-adapter.ts` — LightningFS → IFileSystem adapter (~180 lines). Maps lightning-fs `.promises` API to just-bash's IFileSystem interface. Implements: readFile, writeFile, appendFile (read+concat+write), exists (try stat+catch), mkdir (recursive), readdir, rm (recursive), cp (recursive), mv, chmod/utimes (no-op), symlink, readlink, realpath, resolvePath, getAllPaths.
- `src/git-command.ts` — `defineCommand("git")` wrapping isomorphic-git (~130 lines). Subcommands: clone, log (--oneline, -n), status, add (single file or `.`), commit (-m), diff. Uses `cors.isomorphic-git.org` as CORS proxy.
- `src/shell.ts` — BashShell fork from `@wterm/just-bash` (~310 lines). Changes from original listed below.
- `src/main.ts` — Entry point: mounts wterm, inits lightning-fs, creates adapter, registers git command, wires I/O.
- `index.html` — Full-page terminal with wterm's `terminal.css` inlined (cursor, row layout, blink animation) and dark palette matched to v3's theme system.
- `e2e/playwright.config.ts` — Playwright config with vite webServer integration.
- `e2e/tests/terminal.spec.ts` — 16 tests: 12 incremental debug tests + 4 story tests. All pass.

### Setup

- Added `packages/bash-poc` to root `package.json` workspaces.
- `npm run dev` serves on `http://localhost:5173`.
- `tsc --noEmit` — zero errors.
- Playwright tests: `npx playwright test --config e2e/playwright.config.ts` — 16/16 pass (~33s).

## Decisions

### 1. Buffer polyfill

isomorphic-git requires `Buffer` in the browser. Added `buffer` npm package and set `globalThis.Buffer` in main.ts before any isomorphic-git import.

### 2. CWD tracking via `result.env.PWD` instead of pwd re-execution

The original BashShell from @wterm/just-bash tracks cwd by re-executing the user's command with `>/dev/null 2>&1; pwd` appended. This fails in our setup because:
- just-bash's `pwd` command tries to access `/dev` which doesn't exist in LightningFS → throws `ENOENT: /dev`
- The re-execution also re-runs side-effectful commands (like `git clone`) a second time

Fixed by reading `result.env.PWD` from the `BashExecResult` returned by `bash.exec()`. just-bash tracks `PWD` internally via its `cd` builtin, so `result.env` always has the correct post-execution cwd. This is simpler and avoids the double-execution problem entirely.

Note: `bash.getCwd()` does NOT work for this — it returns the bash instance's initial cwd (`/`), not the cwd as modified by `cd` within an `exec()` call. The `cd` inside `exec()` only affects that execution's scope. Discovered via incremental debug tests (`debug: bash.getCwd() vs cd in exec`).

### 3. Heredoc support (bug fix — exists in upstream @wterm/just-bash too)

The original BashShell only buffers continuation lines when a line ends with `\`. Heredocs (`<<EOF`) were sent to bash.exec() immediately without the body, producing empty output.

Added heredoc detection in the interactive shell layer:
- When a line matches `<<WORD` (also `<<'WORD'`, `<<"WORD"`, `<<-WORD`), set a delimiter and show `> ` continuation prompts
- Buffer lines until a line matching the delimiter appears
- Send the accumulated buffer (command + body + delimiter) as one string to `bash.exec()`
- just-bash's parser handles the actual heredoc semantics — the fix is purely in the interactive line-buffering layer

Bug in initial implementation: the closing delimiter line was appended to the buffer AND then appended again via `const cmd = this._buffer + cur`, producing `cat <<EOF\n...\nEOF\nEOF` — the extra `EOF` was parsed as a command (`bash: EOF: command not found`). Fixed by having the heredoc-close path execute directly from the buffer.

### 4. Test repo: `abs0luty/rightpad`

`nicedoc/microlink` returns 401 from the CORS proxy (repo likely doesn't exist or is private). Switched to `abs0luty/rightpad` — tiny public repo, single commit, works reliably.

### 5. Terminal styling

wterm's `terminal.css` is a source file not bundled in the npm package — cursor, row layout, and blink animation were invisible without it. Inlined the essential CSS into `index.html`.

Palette uses CSS custom properties (`--term-color-0` through `--term-color-15`) matched to `packages/v3/src/renderer/themes.ts` dark theme:
- `--term-fg: #e5e5e5` (v3 `shell.text`)
- `--term-bg: #1e1e1e` (v3 `shell.bg`)
- `--term-color-2: #22c55e` (v3 comment green)
- Font: `Menlo, Monaco, Consolas, DejaVu Sans Mono, monospace` at 14px — same as v3's xterm config in `terminal-registry.ts`

### 6. Test assertion strategy

Initial tests used `toContainText()` against the whole terminal — this matches typed input, not just command output. Caught when the heredoc file-write test passed despite the file not existing (the assertion matched `'hello from heredoc'` from the typed heredoc body, not from `cat` output).

Fixed: `cmd()` extracts output by finding `$ <command>` in the terminal text, taking everything between it and the next `$ ` prompt. Assertions run against this extracted output only.

Additional sync mechanism: prompt-counting. `cmd()` counts `$ ` occurrences before typing and waits for the count to increase. This ensures the shell has fully finished (including cwd update) before the next command types. Without this, fast-typing tests race ahead of async shell operations.

Tests that don't need output assertions (like `cd dirname`) omit the `waitFor` parameter — they still wait for completion via prompt counting.

## Bugs found in upstream @wterm/just-bash

1. **No heredoc support** — interactive shell sends `cat <<EOF` immediately without buffering body. Same code we forked from.
2. **pwd re-execution runs commands twice** — `cd "/home/user" 2>/dev/null; git clone ... >/dev/null 2>&1; pwd` clones the repo a second time. Not just slow — can cause side effects.

## Things to review

- **CORS proxy**: `cors.isomorphic-git.org` works for POC but is unreliable for production. Plan own proxy.
- **Debug logging**: Left `console.log` statements in shell.ts, git-command.ts, main.ts for ongoing development visibility. Remove before shipping to extension.
- **`ENOENT: /dev`**: just-bash expects `/dev` to exist. Shows as stderr noise in the terminal. Could be silenced by creating `/dev` in LightningFS, but it's cosmetic for POC.
- **Tab completion**: Uses `ls -1a` and `compgen -c` from just-bash — works but `compgen` may not be available in the browser build.
