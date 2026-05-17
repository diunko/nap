# response — fs-eng-v0

## What was built

`packages/extension/` — Chrome extension (Manifest V3) with side panel containing:

### Extension scaffold
- `manifest.json` — MV3, sidePanel + storage + tabs permissions
- `background.ts` — registers side panel via `chrome.sidePanel.setPanelBehavior` (guarded — Playwright's Chromium may lack this API)
- `content.ts` — injected on github.com, handles `navigate` messages from side panel
- `side-panel.html` + `side-panel.ts` — the app (all surfaces wired)
- `popup.html` + `popup.ts` — settings: PAT input, main repo config, test button

### Monaco editor surface
- Monaco boots with napkin-markdown tokenizer (copied from v3)
- Worker loading via `import.meta.url` approach (Vite bundles the worker module)
- lightBlue theme only (bg #f0f4f8, text #2e3440)
- Config: wordWrap on, no minimap, no line numbers, scrollBeyondLastLine false, fontSize 14
- Shift-enter continuation (copied from v3)
- Auto-save: `editor.onDidChangeModelContent` → 1s debounce → `lfs.promises.writeFile`
- Refresh-on-focus: when switching to editor tab, re-reads from LFS if content changed

### Terminal surface
- Copied from bash-poc: `fs-adapter.ts`, `git-command.ts`, `shell.ts`
- Shared LightningFS instance (store name: `'nap-ext'`)
- Buffer polyfill before isomorphic-git imports
- wterm CSS inlined in side-panel.html (lightBlue palette, not dark)
- git push support added (with onAuth callback from chrome.storage PAT)

### Nav tree
- Pure function parser (`parseNavTree`) — separately importable for vitest
- Interprets .nap directory conventions: 20-architects, 30-napkins + status, agents
- Numeric prefix sorting (T4.2)
- Click .md → opens in editor
- Explicit refresh via `window.__refreshNavTree()` (no filesystem watcher)

### Tab bar
- Two tabs: Terminal | Editor
- Switching preserves state (visibility toggle, not destroy/recreate)

### Link routing
- Copied `parseLinkHref` from v3, new `buildGitHubUrl` for main code repo
- Monaco link provider registered for Cmd+click
- Routes: .md → load in editor, code → GitHub blob URL, https → new tab
- Main repo config (owner/repo/branch) from chrome.storage popup settings

### Theme
- lightBlue only, no dark mode
- CSS variables on document root (--nap-bg, --nap-text, etc.)
- Shell CSS vars from ThemeDef applied at startup

### Auth
- PAT in chrome.storage.sync
- Settings popup: paste token, test button (API call to github.com/user)
- Main repo config: owner/repo + branch for GitHub URL builder
- isomorphic-git onAuth callback reads from chrome.storage

### Build tooling
- Vite for bundling (multi-entry: side-panel HTML, background, content, popup HTML)
- node:zlib stub for just-bash browser bundle (gunzipSync, gzipSync, constants)
- Build output: `dist/` directory, loadable as unpacked extension
- `npm run build` → `vite build && cp manifest.json dist/`
- TypeScript strict, `tsc --noEmit` passes with zero errors
- Added to root workspace

### Testability
- `window.__editor` — Monaco editor instance
- `window.__lfs` — LightningFS instance
- `window.__fs` — IFileSystem adapter
- `window.__openFile(path)` — open file in editor
- `window.__refreshNavTree()` — refresh nav tree
- Nav tree parser is a pure function exported from `nav-tree.ts`

## Tests — all passing

### Small tests (vitest) — 29 tests, 3 files, 0.2s
- **nav-tree.test.ts** — T4.1 (directory convention parsing: 4 sections, architects, napkins with status, agents nested), T4.2 (numeric prefix sort, edge case 2 vs 10)
- **link-routing.test.ts** — T5.1 (GitHub URL builder: #L anchor, :line, bare path, placeholder defaults), T5.2 (.md → openDoc), T5.3 (https → openExternal), code link routing
- **theme.test.ts** — T7.1 (CSS variable generation, camelToKebab)

### E2E tests (Playwright) — 8 tests, 10.9s, all green
- **test-0**: side-panel.html loads (#app visible)
- **test-1**: Monaco boots (exists in DOM, visible after tab switch)
- **test-2**: terminal prompt visible
- **test-3**: terminal echo command works
- **test-4**: LFS file → Monaco model (write to LFS, openFile, verify editor content)
- **test-5**: auto-save (edit in Monaco, wait 1.5s debounce, read from LFS)
- **test-6**: editor → terminal bidirectional (edit → auto-save → cat from terminal)
- **test-7**: theme CSS variables applied (--nap-bg=#f0f4f8)

All tests have extensive `console.log` statements for debugging.

## Critical: CSP findings (debugged during e2e testing)

The manifest CSP was the single biggest blocker for e2e tests. Three findings:

1. **`blob:` in `worker-src` kills extension loading in Playwright's Chromium.** The extension silently fails to install — service worker never registers, `waitForEvent('serviceworker')` hangs forever. No error message anywhere.
   - Broken: `worker-src 'self' blob:;`
   - Working: `worker-src 'self';`

2. **`wasm-unsafe-eval` required in `script-src`.** wterm uses WebAssembly. Without it: `WebAssembly.instantiate() violates CSP`.
   - Working: `script-src 'self' 'wasm-unsafe-eval';`

3. **`chrome.sidePanel` may not exist in Playwright's Chromium.** background.ts must guard the call or the service worker crashes on load and never registers.

Final working CSP: `script-src 'self' 'wasm-unsafe-eval'; worker-src 'self';`

## Playwright test setup for test-eng

### Fixture pattern
Uses official Playwright docs pattern: `e2e/tests/fixtures.ts`
- `chromium.launchPersistentContext('', { channel: 'chromium', args: [...] })`
- Extension ID from `context.serviceWorkers()[0].url().split('/')[2]`
- No projects in playwright.config.ts — fixture manages the browser

### Layout gotchas
- Monaco editor surface starts hidden (terminal tab is default). Use `toHaveCount(1)` to check existence, click `.tab[data-tab="editor"]` to make visible
- `window.__openFile()` auto-switches to editor tab. Must click `.tab[data-tab="terminal"]` before interacting with `.wterm`

### Build before test
`npm run build` from `packages/extension/` → outputs to `dist/`. Extension loads from `dist/`.

## Decisions

1. **Monaco worker loading** — used `new Worker(new URL(..., import.meta.url), { type: 'module' })`. Vite resolves the worker URL at build time. No blob: needed in CSP.

2. **node:zlib stub** — `just-bash` bundles node:zlib imports. Created minimal stub exporting `gunzipSync`, `gzipSync`, `constants`. The gzip/gunzip shell commands won't work, but they're not needed (git, cat, echo, ls are sufficient).

3. **Nav tree refresh** — no filesystem watcher. Explicit trigger after clone or manual call.

4. **Manifest in dist/** — build copies manifest.json into dist/. Extension loaded from dist/.

5. **Theme** — stripped role-palette dependency from v3's themes.ts. Simplified to just lightBlue + CSS variable generation.

## What to review

- The side-panel.js bundle is 4.8MB (Monaco is large). Could code-split Monaco language workers for smaller initial load.
- git push is added but untested — CORS proxy may block push operations.
- Monaco workers work without blob: CSP because Vite bundles them as module imports. If this breaks in real Chrome (not Playwright's), may need to revisit CSP or use getWorkerUrl fallback.
