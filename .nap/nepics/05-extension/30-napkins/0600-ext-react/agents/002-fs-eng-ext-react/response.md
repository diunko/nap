# fs-eng response — 0600-ext-react

## What I built

`packages/ext-react/` — a new Chrome extension replacing `packages/extension/`. React + Zustand, same stack as the app.

### Package structure

```
packages/ext-react/
  package.json           — React, Zustand, Vite, TypeScript + all extension deps
  tsconfig.json          — strict, jsx: react-jsx
  vite.config.ts         — multi-entry (side-panel, background, content), node:zlib stub
  vitest.config.ts       — excludes e2e/ from vitest
  manifest.json          — same permissions/CSP as old extension
  side-panel.html        — React root + wterm CSS inline + theme CSS vars

  src/
    index.tsx            — App shell: HeaderBar, SurfaceTabBar, ContentPane/TerminalPane surfaces, Sidebar, ResizeHandle, SettingsOverlay, zoom shortcuts, keyboard shortcuts
    store.ts             — Zustand: Tab, upsertTab, removeTab, openDoc, closeTab, pinTab, pinActiveEphemeral, expandCard, extendCard, activeSurface, refreshNav, zoom, settings
    model.ts             — Adapter event → debounce → store. Echo suppression. onRepoChanged.
    TabBar.tsx            — Near-verbatim port from app. Ephemeral italic, close on hover, middle-click close, double-click pin.
    ContentPane.tsx       — Monaco with napkin-markdown, auto-save (1s debounce), role decorations (deltaDecorations), echo suppression, link clicks (3 regex types), scroll/cursor preservation.
    TerminalPane.tsx      — WTerm (wterm/dom), dark theme, onCommandComplete callback.
    Sidebar.tsx           — NavNode-based. NapkinCard (header + body, focused accent), AgentDot (role color × status shape), FileRow (* bullet, main bold, .md link color), DirRow, NodeTree (recursive). Resizable (drag handle on left edge).

    # I/O modules (copied from extension, adapter enhanced):
    fs-adapter.ts         — LightningFS adapter + event emitter (onChange, emit on write/mkdir/rm/appendFile)
    git-command.ts        — isomorphic-git wrapper (clone, log, status, add, commit, push, diff)
    shell.ts              — BashShell with onCommandComplete
    nav-tree.ts           — parseNavTree pure function
    link-routing.ts       — routeLink, buildGitHubUrl, parseLinkHref
    content-link-provider.ts — detectLinks (3 regex types, priority)
    dot-style.ts          — getDotStyle, getRoleColor, getPhaseColor
    theme.ts              — lightBlue Monaco theme + CSS vars
    napkin-markdown.ts    — Monarch tokenizer + shift-enter
    role-palette.ts       — hashPrefix, roleDecoClass, generatePaletteCss
    background.ts         — sidePanel registration + open handler
    content.ts            — trigger button, nav messages
    chrome.d.ts           — Chrome API type declarations
    stubs/zlib.ts         — node:zlib stub for browser

  src/__tests__/
    store.test.ts         — IS-01 (tab lifecycle, 9 tests), IS-02 (card focus, 5 tests), IS-03 (activeSurface, 3 tests)
    adapter-emitter.test.ts — IS-04 (adapter emitter, 5 tests)
    model.test.ts         — IS-05 (debounce + echo suppression, 3 tests)
    persistence.test.ts   — IS-07 (persistence round-trip, 3 tests)

  e2e/
    playwright.config.ts
    tests/
      fixtures.ts         — PW_CHROMIUM_ATTACH_TO_OTHER=1, openSidePanel, openGitHub, cmdClickLink
      im-01-clone-nav.test.ts — Gate test: clone → nav auto-populates
```

### Verification

- `npm run build` — succeeds (side-panel.html, background.js, content.js, side-panel.js, manifest.json)
- `npm run typecheck` — zero type errors
- `npm run test:small` — 28 tests pass (4 test files, IS-01 through IS-07)
- Extension loads in Chrome, side panel opens with correct layout

### Test results

```
28 tests pass across 4 suites:
  IS-01: Store — tab lifecycle (9 tests)
  IS-02: Store — card focus (5 tests)
  IS-03: Store — activeSurface (3 tests)
  IS-04: Adapter emitter (5 tests)
  IS-05: Model — debounce + echo suppression (3 tests)
  IS-07: Store — persistence round-trip (3 tests)
```

### Architecture decisions

1. **Single pane, not left/right.** The extension has one editor area + one terminal area, switched by activeSurface. No left/right tab split — simpler than the app, matches the side panel constraint.

2. **NavNode-based Sidebar, not NapkinState/AgentState.** The app's Sidebar uses rich model types from the main process. The extension's Sidebar uses NavNode from nav-tree.ts — the same pure parser, fed by LFS directory reads. Agent metadata (role, status) is extracted from naming conventions and .agent.nap.json reads.

3. **Event emitter on adapter, not fs.watch.** Added onChange/emit to LightningFsAdapter. Every writeFile/mkdir/rm/appendFile emits `{ type, path }`. Model subscribes with 200ms debounce. isomorphic-git writes handled by onCommandComplete → bulk refresh. Same push direction as the app.

4. **Model as separate layer.** Not inside store, not inside components. createModel() subscribes to adapter events, debounces, re-reads from LFS, dispatches to store. Echo suppression via flag (same as app's pendingContentWrites pattern).

5. **Terminal surface, not terminal tab.** activeSurface: 'editor' | 'terminal' controls which surface is visible. Terminal tab in the tab bar is always present. File tabs appear alongside it. Clicking Terminal tab → setActiveSurface('terminal'). Clicking file tab → openDoc → setActiveSurface('editor').

6. **Tagged logging throughout.** Every state transition logged with prefix: [store], [adapter], [model], [contentpane], [sidebar], [terminal], [links], [chrome]. Console traces are the verification method.

### What the TE should know

- IM-01 gate test is written in `e2e/tests/im-01-clone-nav.test.ts` — runs with `npx playwright test --config e2e/playwright.config.ts`
- Fixture pattern ported: PW_CHROMIUM_ATTACH_TO_OTHER=1, openSidePanel helper, console pipe
- cmdClickLink helper ported for link navigation tests
- Store exposed as `window.__napStore__` and Monaco as `window.__monaco__` for Playwright assertions
- All console logging is always on — no separate debug mode

### What's NOT done (as specified)

- IM-02 through IM-08 Playwright tests — TE implements these
- URL hash parsing and auto-clone (napkin 0400)
- chrome.storage persistence wiring (the store shapes are ready, just needs chrome.storage.sync calls)
- Zoom persistence to chrome.storage (setZoom applies CSS zoom, persistence hook not wired)
