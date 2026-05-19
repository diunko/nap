# proposed extension architecture v2

* same stack as the app
  * React + Zustand + Vite
  * same runtime (browser), same build tool, same state management
  * no "adaptation" needed — port the components

* what the extension doesn't have
  * no Electron main process — no IPC, no preload
  * no node filesystem — LightningFS (IDB) instead of fs/promises
  * no PTY manager — wterm + just-bash instead of node-pty
  * no socket server — no CLI, terminal IS the user's CLI
  * no fs.watch — LightningFS has no watch API
    * but all writes go through our code (editor auto-save, git commands)
    * emit change events at point of write instead of watching
    * // can we include fs watching too?
      * // e.g. someone does cat > agent.json or smth
      * // or mkdir etc
      * // how hard would it be?
        * //A: easy — instrument the adapter we already own
          * LightningFsAdapter (fs-adapter.ts) handles all bash file ops
          * add an event emitter: writeFile/mkdir/rm → emit { type, path }
          * isomorphic-git writes directly to raw LFS (not adapter) — already handled via onCommandComplete
          * no polling, no IDB watching — just emit at point of write

* new package: packages/ext-react/
  * clean break — packages/extension/ gets deprecated and removed
  * no imports between them — copy I/O modules (fs-adapter, git-command, shell, etc.) into ext-react
  * same pattern as original extension copied from bash-poc
  * React + Zustand from the start
  * port app tests alongside app components
  * port relevant extension Playwright tests (ux-e2e, lifecycle) with updated selectors

* what the extension has that the app doesn't
  * content.ts on github.com — trigger button, nav messages
  * background.ts service worker — registers side panel
  * chrome.tabs.update — navigate the GitHub tab from the panel
  * chrome.storage.sync — persist settings, zoom, state-key
  * URL hash parsing — #nap-repo=... entry point

* the component mapping — port, don't reinvent

  | app | extension | what to do |
  |---|---|---|
  | store.ts (Zustand) | store.ts (Zustand) | port — same Tab interface, upsertTab, removeTab, openDoc, closeTab, pinTab, expandCard, saveTabScroll. drop: nepic memory (single context for v0), PTY tracking, ghost tabs |
  | Sidebar.tsx | Sidebar.tsx | port — NapkinCard, ArchitectCard, EntryTree, FileRow, AgentDot. adapt: data comes from LightningFS parse instead of snapshot, nav on right not left |
  | ContentPane.tsx | ContentPane.tsx | port — Monaco setup, auto-save, role decorations, link click handling. adapt: file I/O via LightningFS instead of electronAPI, no git gutter for v0, no rendered mode for v0 |
  | TabBar.tsx | TabBar.tsx | port — copy nearly verbatim, same props interface |
  | TerminalPane.tsx | TerminalPane.tsx | adapt — wterm instead of xterm, dark theme, no code editor pane (GitHub IS the code viewer) |
  | index.tsx | index.tsx | adapt — layout: [ContentPane | ResizeHandle | Sidebar], no Gutter, no KanbanOverlay, no DebugPanel. add: header bar, settings overlay, zoom |
  | content-link-provider.ts | content-link-provider.ts | port — same detectLinks, same handleLinkClick. adapt: openCode → chrome.tabs.update instead of store.openCode |
  | role-palette.ts | role-palette.ts | already ported |
  | themes.ts | themes.ts | already ported (lightBlue only) |
  | napkin-markdown.ts | napkin-markdown.ts | already ported |

* the I/O layer (already clean, keep as-is)
  * fs-adapter.ts — LightningFS → IFileSystem adapter
  * git-command.ts — isomorphic-git wrapper
  * shell.ts — BashShell with onCommandComplete callback
  * nav-tree.ts — parseNavTree pure function
  * link-routing.ts — routeLink, buildGitHubUrl
  * dot-style.ts — getDotStyle pure function

* store.ts for the extension
  * Zustand, same as app
  * state shape (subset of app):
    * tabs: Tab[] — same interface as app (id, path, type, ephemeral, scrollPos, cursorPos)
    * activeTabId: string | null
    * activeFilePath: string | null
    * focusedCardSlug: string | null
    * cardViewMode: 'collapsed' | 'focused' | 'extended'
    * navSections: NavNode[] — from parseNavTree
    * mainRepoConfig: { owner, repo, branch } | null
    * zoom: number
    * settingsVisible: boolean
    * activeSurface: 'editor' | 'terminal'
  * actions: same pure functions as app
    * openDoc(path) → upsertTab + set activeFilePath
    * closeTab(tabId) → removeTab + pick neighbor
    * pinTab(tabId) → flip ephemeral to false
    * pinActiveEphemeral() → pin current if ephemeral
    * expandCard(slug) → toggle focus
    * refreshNav(lfs) → parseNavTree from LightningFS → set navSections
  * what the extension adds:
    * setMainRepo(config) → persist to chrome.storage
    * setZoom(scale) → persist to chrome.storage
    * navigateGitHub(url) → chrome.tabs.update

* file I/O — LightningFS replaces electronAPI
  * app: window.electronAPI.fileRead(path) → main process → fs.readFile
  * extension: lfs.promises.readFile(path, 'utf8') — direct, no IPC
  * app: window.electronAPI.fileWrite(path, content) → main process → fs.writeFile
  * extension: lfs.promises.writeFile(path, content) — direct
  * simpler than the app — no process boundary, no echo suppression needed
    * but: auto-save should still use suppressExternal pattern for refresh-on-focus

* change detection — emit, don't watch
  * every write path we control:
    * editor auto-save → lfs.writeFile → emit 'file-changed'
    * git clone/pull/checkout → onCommandComplete → emit 'repo-changed'
    * editor model.setValue (on file open) → no emit (we initiated it)
  * store subscribes to these events → refreshNav, reload editor content
  * no polling, no watcher — deterministic, triggered by our own actions

* what this means for the rewrite
  * throw away: side-panel.ts, side-panel.html, tab-manager.ts, nav-renderer.ts
  * keep: every file in the I/O and logic layers
  * add: React, Zustand, react-dom to package.json
  * write: store.ts (~150 lines), index.tsx (~100 lines), Sidebar.tsx (~400 lines), ContentPane.tsx (~300 lines), TerminalPane.tsx (~100 lines), TabBar.tsx (~100 lines)
  * total new code: ~1150 lines, most of it ported from app with s/electronAPI/lfs/
