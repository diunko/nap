# ext-react — rewrite extension with React + Zustand

* what: new package `packages/ext-react/` replacing `packages/extension/`
  * React + Zustand — same stack as the app (packages/v3)
  * port app components directly — Sidebar, ContentPane, TabBar, store
  * wire LightningFS underneath instead of electronAPI
  * same data flow direction as the app: change → model → store → React

* why: the current extension is a patched POC
  * 873-line god file (side-panel.ts) with ad-hoc state
  * no model, no store — state scattered across global variables
  * every fix requires understanding the whole file
  * tests pass but the product doesn't work (proven by manual testing)
  * the app already solved these problems — port the solutions, don't reinvent

* what stays from the current extension
  * I/O modules (copy into ext-react, don't import):
    * fs-adapter.ts — LightningFS → IFileSystem adapter + event emitter for change detection
    * git-command.ts — isomorphic-git wrapper
    * shell.ts — BashShell with onCommandComplete callback
    * nav-tree.ts — parseNavTree pure function
    * link-routing.ts — routeLink, buildGitHubUrl, parseLinkHref
    * content-link-provider.ts — detectLinks with three regex types + priority
    * role-palette.ts — hashPrefix, roleDecoClass, generatePaletteCss
    * dot-style.ts — getDotStyle pure function
    * theme.ts — lightBlue theme + CSS variable generation
    * napkin-markdown.ts — Monaco tokenizer + shift-enter
  * chrome extension plumbing:
    * manifest.json (same permissions, same CSP)
    * background.ts (sidePanel registration, open handler)
    * content.ts (trigger button, nav messages, data-nap-loaded marker)
  * proven findings:
    * CSP: `script-src 'self' 'wasm-unsafe-eval'; worker-src 'self';` (no blob:)
    * Monaco workers via import.meta.url (Vite resolves at build time)
    * no CORS proxy (host_permissions bypass CORS)
    * Buffer polyfill before isomorphic-git
    * wterm CSS not in npm package (inline)
    * Playwright: PW_CHROMIUM_ATTACH_TO_OTHER=1 for real side panel testing

* data flow — push, same direction as the app

  ```
  bash commands (cat >, echo >>)     git commands (clone, pull)
           |                                  |
  adapter emitter                    onCommandComplete
  { type: 'write', path }           'repo-changed'
           |                                  |
           +----------------+-----------------+
                            |
                     debounce (200ms)
                            |
                  model re-reads from LFS
                            |
                     store update
                            |
                   React re-renders
  ```

  * same as app: filesystem change → model → store → view
  * adapter instrumented: every writeFile/mkdir/rm emits change event
  * git commands: onCommandComplete emits repo-changed (bulk refresh)
  * echo suppression: flag during auto-save writes, skip re-read for own writes
  * components never pull — they subscribe to the store

* component mapping — port, don't reinvent

  | app component | ext-react component | adaptation |
  |---|---|---|
  | store.ts (Zustand) | store.ts (Zustand) | same Tab, upsertTab, removeTab. drop: nepic memory, ghost tabs. add: mainRepoConfig, zoom, activeSurface |
  | Sidebar.tsx | Sidebar.tsx | same cards, dots, EntryTree. adapt: nav on right, data from LFS parse, no Cmd+K filter for v0 |
  | ContentPane.tsx | ContentPane.tsx | same Monaco setup, auto-save, role decorations. adapt: file I/O via LFS, no git gutter for v0, no rendered mode for v0 |
  | TabBar.tsx | TabBar.tsx | near-verbatim copy |
  | TerminalPane.tsx | TerminalPane.tsx | adapt: wterm instead of xterm, one terminal, no code editor pane |
  | index.tsx | index.tsx | adapt: layout [ContentPane | ResizeHandle | Sidebar], header bar, settings, zoom, no Gutter/Kanban/DebugPanel |
  | content-link-provider.ts | content-link-provider.ts | same detectLinks. adapt: openCode → chrome.tabs.update |

* extension-specific contracts (no app equivalent)

  * side panel ↔ content script
    * chrome.tabs.update for link navigation (no content script needed)
    * content script reads URL hash, stores in chrome.storage.session
    * trigger button for Playwright testing

  * store ↔ LightningFS (replaces electronAPI)
    * ExtensionFS interface: readFile, writeFile, readdir, stat, exists
    * implemented by adapter — components never touch lfs.promises directly
    * mockable for vitest

  * store ↔ chrome.storage (persistence)
    * persist: mainRepoConfig, PAT, zoom, tabs, focused card
    * debounced auto-save (500ms) + flush on beforeunload
    * restore on panel open

  * adapter filesystem events (replaces fs.watch)
    * emitter on adapter: writeFile/mkdir/rm → emit { type, path }
    * model subscribes: debounce 200ms → re-read → update store
    * git commands: onCommandComplete → bulk refresh

* build phases (for fs-eng)

  * phase 1: scaffold
    * packages/ext-react/ with React, Zustand, Vite, TypeScript
    * copy I/O modules from packages/extension/src/
    * copy manifest.json, background.ts, content.ts
    * npm run build succeeds, extension loads in Chrome

  * phase 2: store + basic rendering
    * store.ts: Tab, upsertTab, removeTab, openDoc, closeTab, pinTab, expandCard
    * index.tsx: layout [ContentPane | ResizeHandle | Sidebar], header bar
    * TabBar.tsx: near-verbatim port from app
    * stub components: Sidebar shows "nav", ContentPane shows "editor", TerminalPane shows "terminal"
    * React renders in the side panel
    * verification scenario: open panel → see layout with stubs → Playwright console shows [store] init, [render] mounted

  * phase 3: wire the surfaces
    * ContentPane: Monaco with napkin-markdown, auto-save, role decorations, link clicks
    * TerminalPane: wterm with dark theme, onCommandComplete → store.refreshNav
    * Sidebar: nav tree with cards, dots, EntryTree, file click → store.openDoc
    * adapter emitter: writeFile/mkdir/rm → change events → model → store
    * verification scenario: clone repo → console shows [adapter] repo-changed → [store] refreshNav → [sidebar] re-render with cards. click file → [store] openDoc → [contentpane] loadFile → [monaco] setModel

  * phase 4: chrome plumbing
    * settings overlay (inline, same as current)
    * zoom (Ctrl+Shift+/-, CSS zoom, persist)
    * link navigation (chrome.tabs.update from store action)
    * verification scenario: Cmd+click link → console shows [links] detected → [store] navigateGitHub → [chrome.tabs] update → github tab URL changed

* debugging approach
  * every state transition logged with tagged prefix: [store], [adapter], [model], [contentpane], [sidebar], [terminal], [links], [shell], [git]
  * Playwright pipes all browser console via panel.on('console', ...)
  * fs-eng runs scenarios via Playwright, reads the trace
  * the trace IS the verification — if the log sequence matches expectations, the pipeline works
  * fix pipeline before moving to next phase
  * no separate "debug mode" — logs are always on during development

* testing strategy
  * vitest (store logic): port app's tabs-store.test.ts pattern
    * openDoc creates ephemeral tab
    * second openDoc reuses ephemeral slot
    * pinTab, closeTab, expandCard — same tests as app
    * new: adapter emitter tests (emit on write, debounce)
  * vitest (pure logic): carry forward from existing extension
    * nav-tree, link-routing, role-palette, theme, detectLinks
  * Playwright (real panel): port from existing extension
    * UX e2e test (the real user journey — no window.__ hooks)
    * happy-path tests (Monaco boots, LFS read/write, auto-save)
    * lifecycle tests (clone, nav populates, editor loads, link navigates)
    * new: tab behavior tests ported from app (ephemeral reuse, pin on edit, close neighbor)
  * the fs-eng writes the store vitests during phase 2
  * the TE ports and validates Playwright tests after phase 3

* what's NOT in this napkin
  * state-key per PR (0400 — builds on top of the store from this napkin)
  * URL hash parsing and auto-clone (0400)
  * rendered mode Cmd+J (v2)
  * workflowy zoom (v2)
  * git gutter decorations (v2)
  * ghost tabs (not needed — extension doesn't watch for file appearance)
