# 0500 — research findings

## 1. just-bash

* version: 3.0.1 (npm), Apache-2.0
* author: Malte Ubl (Vercel), 319 of 351 commits
* last commit: 2026-05-15 (2 days ago) — actively maintained, not an experiment
* contributors: 10+, external PRs merged regularly

### filesystem interface

* defines its own `IFileSystem` — async-only, 20+ methods
  * `Bash.ts:118` — constructor accepts `fs?: IFileSystem`
  * `fs/interface.ts:118-286` — full interface definition
* three built-in implementations:
  * `InMemoryFs` — default, works in browser
  * `OverlayFs` — copy-on-write over Node `fs` (Node only)
  * `ReadWriteFs` — direct Node `fs` (Node only)
* NOT compatible with lightning-fs out of the box
  * different method signatures (IFileSystem uses `readFile(path, opts?) → Promise<string>`, lightning-fs uses `readFile(path, opts, cb)` or `.promises.readFile()`)
  * IFileSystem has methods lightning-fs lacks: `exists()`, `cp()`, `mv()`, `chmod()`, `link()`, `getAllPaths()`, `resolvePath()`, `readdirWithFileTypes()`
  * lightning-fs has methods IFileSystem lacks: `du()`, `backFile()`
* **adapter feasibility**: DOABLE, ~150-200 lines
  * both are async — no sync/async mismatch
  * core overlap: readFile, writeFile, mkdir, readdir, stat, lstat, symlink, readlink, unlink→rm
  * missing methods can be implemented on top: `exists()` → try stat + catch, `cp/mv` → read+write+unlink, `getAllPaths()` → recursive readdir, `chmod/link/utimes` → no-op or throw
  * `readFileBuffer()` → `fs.promises.readFile(path)` returns Uint8Array already
  * `appendFile()` → read + concat + write (lightning-fs lacks native append)

### command registration

* clean first-class API, no fork needed
  * `defineCommand(name, execute)` — `custom-commands.ts:1-68`
  * pass `customCommands: [cmd]` to Bash constructor
  * custom commands override built-ins with same name
  * `registerCommand()` also available post-init
* command interface: `{ name, execute(args, ctx) → Promise<{ stdout, stderr, exitCode }> }`
* `CommandContext` provides `fs`, `cwd`, `env`, `stdin` — everything needed

### browser built-ins

* browser entry: `dist/bundle/browser.js` (1.1MB)
  * excludes: tar, yq, xan, sqlite3, python3 (Node/WASM deps)
* working in browser:
  * **file ops**: ls, cat, head, tail, cp, mv, rm, mkdir, touch, chmod, ln, find, du, tree, wc, tee — YES
  * **text**: echo, printf, grep, sed, awk, sort, uniq, cut, paste, tr, fold, fmt, nl, column — YES
  * **shell builtins**: cd, pwd, export, local, declare, read, source, alias, type, hash — YES
  * **data**: jq, base64, md5sum, sha256sum, xxd — YES
  * **piping**: YES, full pipeline execution (`pipeline-execution.ts`)
  * **redirection**: YES — `>`, `>>`, `2>`, `&>`, here-docs, here-strings (`redirections.ts`)
  * **variables**: YES — scalar, arrays, associative arrays, parameter expansion, special vars
  * **control flow**: YES — if/for/while/until/case, functions, subshells, command substitution
  * **globbing**: YES — `*`, `?`, `[abc]`, brace expansion via minimatch

### bundle size

* browser.js: 1.1MB (uncompressed)
* chunks/: 2.0MB (189 files, lazy-loaded — most are commands loaded on demand)
* gzip estimate: ~300KB core + lazy chunks
* acceptable for Chrome extension (extensions routinely ship 5-10MB)

---

## 2. wterm

* version: 0.3.0 (npm), Apache-2.0
* author: Chris Tate, 54 of 57 commits
* last commit: 2026-04-30 (17 days ago) — actively maintained
* monorepo: @wterm/core, @wterm/dom, @wterm/react, @wterm/vue, @wterm/just-bash, @wterm/ghostty, @wterm/markdown

### mount API

```typescript
const container = document.getElementById("terminal");
const term = new WTerm(container, { cols: 80, rows: 24, autoResize: true });
await term.init();
```

* `wterm.ts:50-126` — constructor + init()
* options: cols, rows, autoResize (default true), cursorBlink, debug, onData, onTitle, onResize
* React: `<Terminal ref={ref} cols={80} rows={24} autoResize onData={handleData} />`

### I/O flow

* **input**: hidden textarea → keyDown handler → `keyToSequence()` → `onData` callback → shell
  * `input.ts:59-238` — full pipeline
  * maps: arrows, Ctrl+letter, F-keys, Enter=`\r`, Backspace=`\x7f`, Ctrl+C=`\x03`
  * paste: bracketed paste mode (`\x1b[200~...\x1b[201~`)
* **output**: shell calls `write(data)` → WASM bridge processes escape sequences → `requestAnimationFrame` → renderer reads grid → DOM update
  * dirty-row tracking: only changed rows re-rendered
  * WASM core: Zig → ~12KB .wasm (inline base64)

### ANSI support

* comprehensive — `renderer.ts:1-198`
  * 16 basic colors + 256-color palette + 24-bit true color (fg/bg RGB)
  * bold, dim, italic, underline, reverse, invisible, strikethrough
  * cursor movement: arrow keys, home/end, page up/down
  * alt screen buffer, cursor key application mode
  * block drawing characters (U+2580-U+259F) via CSS gradients

### narrow div (~400px)

* works — auto-resize via `ResizeObserver` (`wterm.ts:282-305`)
  * at 14px default font: ~400px = ~40 columns (workable)
  * dynamically measures char width via probe element
  * min: 1 col × 1 row
  * padding: 12px

### connection to just-bash

* `@wterm/just-bash` package — `BashShell` class
  * peer dependency: `just-bash@^2` — **STALE** (published is v3.0.1)
  * but API surface used is stable: only `new Bash({files, env, network})` + `bash.exec(cmd)`
  * **fix**: override peer dep version or fork `@wterm/just-bash` with `^3`
* wiring:
  ```typescript
  const shell = new BashShell({ files, env, cwd, greeting, prompt });
  shell.attach(term.write.bind(term));
  term.onData = (data) => shell.handleInput(data);
  ```
* `BashShell` features: line editing, history (↑↓), tab completion, Ctrl+A/E/U/C/L, backspace, multi-line (\\)
* **critical gap**: `BashShell.attach()` creates `new Bash({files, env, network})` — does NOT pass `fs` option
  * `@wterm/just-bash/src/index.ts:64` — hardcoded constructor call
  * need to: (a) fork/patch to add `fs` passthrough, or (b) subclass and override attach, or (c) construct Bash externally and inject

### DOM structure (queryable by Playwright)

```
.wterm (root container)
  └── .term-grid (white-space: pre)
      ├── .term-row (each row)
      │   └── <span> (text runs with inline styles)
      │       └── .term-cursor (current position)
      └── .term-scrollback-row (history rows)
```

* real DOM, not canvas — Playwright can `.toContainText()`, `.textContent()`, query `.term-row`
* CSS classes: `.wterm.focused`, `.wterm.has-scrollback`, `.wterm.theme-{name}`

---

## 3. lightning-fs + isomorphic-git

### lightning-fs (v4.6.2)

* `new LightningFS('name')` → IDB store named 'name' ✓
* methods: readFile, writeFile, mkdir, readdir, rmdir, unlink, stat, lstat, symlink, readlink, du, flush
* both callback and `.promises` interface
* IDB backend: `@isomorphic-git/idb-keyval` wrapper, superblock at key `"!root"`, files by inode
* CacheFS: in-memory directory tree — mkdir, stat, readdir are pure in-memory (0ms)
* 500ms debounce for IDB persistence

### isomorphic-git (v1.38.0)

* accepts lightning-fs as `fs` parameter ✓ (via FsClient interface — callback or .promises)
* browser HTTP client: `import http from 'isomorphic-git/http/web'` (uses native fetch)
* `git.clone({ fs, http, dir, url, corsProxy?, depth?, singleBranch?, onProgress? })`
* `git.log({ fs, dir })`, `git.statusMatrix({ fs, dir })`, `git.add({ fs, dir, filepath })`
* `git.commit({ fs, dir, message, author: { name, email } })`

### CORS situation

* browser → GitHub HTTPS = blocked by CORS
* options:
  1. `cors.isomorphic-git.org` — public proxy, free, works for POC
     * not reliable for production (single point of failure, no SLA)
  2. own CORS proxy — simple Express/Cloudflare Worker, ~20 lines
  3. GitHub API as transport — isomorphic-git doesn't natively support GitHub API protocol
     * would need custom HTTP adapter wrapping the GitHub REST/GraphQL API
     * much more complex, not worth it for this use case
* **recommendation**: use `cors.isomorphic-git.org` for POC, plan own proxy for production

### shared filesystem concerns

* CAN share one LightningFS instance between just-bash adapter and Monaco
  * same instance = one cache, one mutex — fine
  * two instances with same name = separate caches, mutex contention — avoid
* but: just-bash uses its own `IFileSystem`, not lightning-fs directly
  * adapter wraps lightning-fs → both consumers go through same LightningFS instance ✓
  * Monaco reads IDB directly or via lightning-fs — no conflict if same instance

### performance estimate

* git clone of small repo (~1MB) into IDB: 2-5 seconds (network-bound, plus IDB writes)
* file operations (ls, cat): <10ms (CacheFS is in-memory)
* git log: <100ms (reads pack files from IDB cache)

---

## 4. Playwright testability

### confirmed by wterm's own E2E tests (`e2e/tests/terminal.spec.ts`)

**setup**:
```typescript
await page.goto("/");
await page.waitForSelector(".wterm .term-grid .term-row");
```

**typing commands**:
```typescript
const terminal = page.locator(".wterm");
await terminal.click(); // focus
await page.keyboard.type("echo hello", { delay: 30 });
await page.keyboard.press("Enter");
```

**asserting output**:
```typescript
await expect(terminal).toContainText("hello", { timeout: 5000 });
```

**waiting for async ops** (git clone):
```typescript
// wait for specific output text with generous timeout
await expect(terminal).toContainText("Cloning into", { timeout: 30000 });
// or poll for completion marker
await expect(terminal).toContainText("$", { timeout: 30000 }); // prompt reappears
```

### proposed test structure for each story

**Story 1 — clone + ls + cat**:
```typescript
test("clone repo and browse files", async ({ page }) => {
  const term = page.locator(".wterm");
  await term.click();
  await page.keyboard.type("git clone https://github.com/user/repo", { delay: 10 });
  await page.keyboard.press("Enter");
  await expect(term).toContainText("$", { timeout: 30000 }); // wait for prompt

  await page.keyboard.type("ls", { delay: 10 });
  await page.keyboard.press("Enter");
  await expect(term).toContainText("repo");

  await page.keyboard.type("cd repo && cat README.md", { delay: 10 });
  await page.keyboard.press("Enter");
  await expect(term).toContainText(/README|#/, { timeout: 5000 });
});
```

**Story 2 — git log**:
```typescript
test("git log shows history", async ({ page }) => {
  // ... after clone ...
  await page.keyboard.type("git log --oneline", { delay: 10 });
  await page.keyboard.press("Enter");
  await expect(term).toContainText(/[0-9a-f]{7}/, { timeout: 5000 }); // commit hash
});
```

**Story 3 — edit + status**:
```typescript
test("edit file and check status", async ({ page }) => {
  // ... after clone + cd ...
  await page.keyboard.type('echo "hello" >> README.md', { delay: 10 });
  await page.keyboard.press("Enter");
  await page.keyboard.type("git status", { delay: 10 });
  await page.keyboard.press("Enter");
  await expect(term).toContainText("modified", { timeout: 5000 });
});
```

**Story 4 — commit + log**:
```typescript
test("commit and verify in log", async ({ page }) => {
  // ... after edit ...
  await page.keyboard.type("git add .", { delay: 10 });
  await page.keyboard.press("Enter");
  await page.keyboard.type('git commit -m "test commit"', { delay: 10 });
  await page.keyboard.press("Enter");
  await expect(term).toContainText("test commit", { timeout: 5000 });

  await page.keyboard.type("git log --oneline -1", { delay: 10 });
  await page.keyboard.press("Enter");
  await expect(term).toContainText("test commit", { timeout: 5000 });
});
```

### wait strategy

* prompt reappearance (`$`) is the natural completion signal
* for git clone: use `timeout: 30000` — network + IDB writes
* for local ops (ls, cat, status): `timeout: 5000` is plenty
* avoid `waitForTimeout()` — use `toContainText()` with timeout (auto-retrying)

---

## 5. Bundle sizes

| library | on-disk | browser bundle (est.) | gzipped (est.) |
|---------|---------|----------------------|----------------|
| just-bash | 21MB (npm package) | 1.1MB core + 2MB lazy chunks | ~300KB core |
| isomorphic-git | 4.7MB | ~800KB (tree-shaken) | ~200KB |
| lightning-fs | 136KB | ~40KB | ~12KB |
| wterm (@wterm/dom + core) | ~150KB | ~50KB + 12KB wasm | ~20KB |
| **total** | — | **~2MB core + 2MB lazy** | **~530KB** |

* acceptable for Chrome extension — well within 5-10MB norm
* just-bash chunks are lazy-loaded (only commands you use get loaded)
* biggest item is just-bash, but its browser bundle is code-split

---

## 6. Integration shape

### wiring pseudocode

```typescript
import LightningFS from '@isomorphic-git/lightning-fs';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { WTerm } from '@wterm/dom';
import { Bash, defineCommand, InMemoryFs } from 'just-bash';

// 1. filesystem
const lfs = new LightningFS('napkin-fs');
const fs = new LightningFsAdapter(lfs);  // implements IFileSystem

// 2. git command
const gitCommand = defineCommand("git", async (args, ctx) => {
  const subcommand = args[0];
  const dir = ctx.cwd;

  if (subcommand === "clone") {
    await git.clone({ fs: lfs, http, dir: `${dir}/${repoName(args[1])}`, url: args[1],
      corsProxy: 'https://cors.isomorphic-git.org', singleBranch: true, depth: 10 });
    return { stdout: "", stderr: "", exitCode: 0 };
  }
  if (subcommand === "log") {
    const commits = await git.log({ fs: lfs, dir });
    const lines = commits.map(c => `${c.oid.slice(0,7)} ${c.commit.message.split('\n')[0]}`);
    return { stdout: lines.join('\n') + '\n', stderr: "", exitCode: 0 };
  }
  // ... status, add, commit ...
});

// 3. bash instance
const bash = new Bash({ fs, customCommands: [gitCommand] });

// 4. terminal
const container = document.getElementById("terminal")!;
const term = new WTerm(container, { cols: 80, rows: 24, autoResize: true });
await term.init();

// 5. wire I/O (inline, not using BashShell — because BashShell doesn't pass fs)
// option A: fork @wterm/just-bash to pass fs
// option B: write a thin shell loop (~80 lines) that does line editing + history
//           and calls bash.exec() directly

term.onData = async (data) => { /* line editing + bash.exec() */ };
```

### lines of glue code estimate

| piece | lines |
|-------|-------|
| LightningFS → IFileSystem adapter | ~150-200 |
| git command (clone, log, status, add, commit) | ~120 |
| shell loop (line editing, history, prompt) | ~80 (or 0 if forking @wterm/just-bash) |
| vite entry + HTML | ~30 |
| **total** | **~380-430** |

### global state / singleton concerns

* just-bash: per-instance — `new Bash()` creates isolated state, no globals
* lightning-fs: per-instance IDB store — no globals
* isomorphic-git: stateless functions — takes fs/http as params, no globals
* wterm: per-instance — `new WTerm(element)` is scoped to its container
* **no conflicts with Monaco** — all four libraries are instance-scoped

---

## 7. Verdict

**VIABLE WITH CAVEATS**

The stack works. All four libraries are actively maintained, browser-compatible, instance-scoped, and have clean APIs. The integration is feasible with ~400 lines of glue code.

### caveats

1. **IFileSystem adapter required** (~150-200 lines)
   * just-bash does NOT use lightning-fs natively — must write adapter
   * adapter is straightforward (method mapping, no fundamental incompatibility)
   * `appendFile` needs manual read+concat+write (lightning-fs lacks append)
   * some methods need polyfill: `exists()`, `cp()`, `mv()`, `getAllPaths()`

2. **@wterm/just-bash peer dep is stale** (`^2` vs published `3.0.1`)
   * API surface used by BashShell is unchanged in v3
   * fix: npm override or fork with updated peer dep
   * low risk

3. **@wterm/just-bash doesn't pass `fs` to Bash constructor**
   * `BashShell.attach()` hardcodes `new Bash({files, env, network})`
   * need to: fork and add `fs` passthrough, OR write own shell loop (~80 lines), OR subclass
   * recommend: fork `@wterm/just-bash` — it's only 324 lines, trivial to maintain

4. **CORS proxy for git clone**
   * `cors.isomorphic-git.org` works for POC
   * need own proxy for production (Cloudflare Worker, ~20 lines)

5. **isomorphic-git uses lightning-fs API, git command uses both**
   * git commands must call isomorphic-git with the raw `lfs` (LightningFS instance)
   * bash built-ins (ls, cat) go through the IFileSystem adapter
   * both hit the same IDB store — consistent view

### non-issues

* bundle size: ~530KB gzipped — fine for extension
* Playwright: DOM-based, queryable, proven E2E patterns exist
* narrow div: auto-resize works at 400px (~40 cols)
* ANSI colors: full support
* piping/redirection: works in browser
* concurrent access: single LightningFS instance, no mutex contention

---

## 8. Implementation proposal

### `packages/bash-poc/`

```
packages/bash-poc/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.ts              — entry: mount terminal, init fs, wire everything
│   ├── fs-adapter.ts        — LightningFS → IFileSystem adapter
│   ├── git-command.ts       — defineCommand("git") wrapping isomorphic-git
│   ├── shell.ts             — line editing + history + prompt (fork of BashShell with fs support)
│   └── types.ts             — shared types
└── e2e/
    ├── playwright.config.ts
    └── tests/
        └── terminal.spec.ts — four stories as Playwright tests
```

### package.json deps

```json
{
  "dependencies": {
    "just-bash": "^3.0.1",
    "@wterm/dom": "^0.3.0",
    "@wterm/core": "^0.3.0",
    "@isomorphic-git/lightning-fs": "^4.6.2",
    "isomorphic-git": "^1.38.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vite": "^6.0.0",
    "@playwright/test": "^1.45.0"
  }
}
```

### vite.config.ts

```typescript
import { defineConfig } from 'vite';
export default defineConfig({
  root: '.',
  build: { target: 'esnext' },
  optimizeDeps: { include: ['just-bash', 'isomorphic-git'] }
});
```

### key decision: don't use @wterm/just-bash

* copy BashShell (~324 lines) into `shell.ts`
* add `fs?: IFileSystem` to constructor options
* pass it through to `new Bash({ fs, files, env, network })`
* avoids: peer dep mismatch, inability to pass custom fs, external dependency
* total extra code: ~0 (copying, not writing from scratch)

### build steps

1. write `fs-adapter.ts` — map lightning-fs `.promises` to IFileSystem interface
2. write `git-command.ts` — 5 subcommands via defineCommand
3. copy + modify BashShell into `shell.ts` — add `fs` passthrough + `customCommands`
4. write `main.ts` — mount, wire, go
5. write Playwright tests for 4 stories
6. add `packages/bash-poc` to root workspace
