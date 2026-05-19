# proposed extension architecture

* the same pattern as the app, adapted for extension context
  * app has: model (main) → snapshot → store (renderer) → React
  * extension has: NO main process, NO IPC, NO filesystem watcher
  * but the same principle: one model, one store, rendering driven by state

* two event sources (not three)
  * app has: filesystem, CLI, renderer
  * extension has: LightningFS (via terminal commands), renderer (user clicks/edits)
  * no CLI — terminal IS the CLI
  * no filesystem watcher — LightningFS has no watch API
  * instead: explicit refresh triggers (after git clone/pull/checkout, after file save)

* the flow

```
  github.com tab              side panel
       |                         |
  content.ts               store.ts (state)
  (open panel,                   |
   nav messages)            +----+----+
       |                    |         |
       v                    v         v
  chrome.tabs           renderer   I/O layer
  (link nav)          (reads state, (LightningFS,
                       renders DOM,  git-command,
                       dispatches    shell, wterm)
                       actions)         |
                            |           |
                            +-----+-----+
                                  |
                             actions mutate store
                                  |
                             store.notify()
                                  |
                             renderer re-renders
```

* store.ts — ported from app, adapted for extension
  * owns ALL state:
    * tabs: Tab[] with ephemeral/permanent, scroll/cursor per tab
    * activeFilePath, focusedCardSlug, cardViewMode
    * navTree: NavNode[] (from parseNavTree)
    * mainRepoConfig: owner/repo/branch
    * panelZoom: number
  * pure helper functions: upsertTab, removeTab (from app store.ts:104-144)
  * actions: openFile, closeTab, pinTab, expandCard, setMainRepo, refreshNav, setZoom
  * NOT zustand (no React) — simple observable: state object + subscribe(listener)
  * state changes → notify listeners → re-render affected DOM

* renderer — NOT React, but state-driven
  * the extension doesn't use React (no build step for JSX, extension is vanilla TS)
  * instead: thin rendering functions that read state and produce DOM
  * on state change: diff what changed, update only affected elements
  * or simpler: re-render the affected section (nav, tabs, editor surface switch)
  * the point is: rendering reads state, never mutates it directly

* what changes from current
  * side-panel.ts shrinks from 873 lines to ~200 (orchestration only)
  * tab-manager.ts → replaced by store actions (openFile, closeTab, pinTab)
  * nav-renderer.ts → reads store state, renders cards (keeps rendering logic, loses state)
  * Monaco wiring → reads activeFilePath from store, loads content from LFS
  * auto-save → on content change, debounce → write to LFS → pin ephemeral (store action)
  * link clicks → action dispatches through store (openDoc → store.openFile, openCode → chrome.tabs.update)

* what stays the same
  * LightningFS, fs-adapter, git-command, shell — I/O layer, unchanged
  * content.ts, background.ts — chrome extension plumbing, unchanged
  * nav-tree.ts (parser), link-routing.ts, content-link-provider.ts — pure logic, unchanged
  * role-palette.ts, dot-style.ts, theme.ts, napkin-markdown.ts — pure logic, unchanged
  * wterm — terminal surface, unchanged
  * Monaco — editor surface, unchanged (just wired to store instead of ad-hoc)

* the app vs extension mapping

  | app component | extension equivalent |
  |---|---|
  | model.ts (main process) | LightningFS + git-command (I/O) |
  | main.ts (orchestrator) | side-panel.ts (slimmed, wiring only) |
  | store.ts (zustand) | store.ts (simple observable) |
  | Sidebar.tsx (React) | nav-renderer.ts (reads store, renders DOM) |
  | ContentPane.tsx (React) | editor setup in side-panel.ts (reads store) |
  | TabBar.tsx (React) | tab rendering in side-panel.ts (reads store) |
  | TerminalPane.tsx (React) | terminal setup in side-panel.ts (reads store) |
  | preload.ts (IPC bridge) | not needed (no process boundary) |
  | fs.watch → model reload | git clone/pull → store.refreshNav() |
  | content-watcher.ts | auto-save debounce + refresh-on-focus |

* the extension-specific parts (no app equivalent)
  * content.ts: injected on github.com — trigger button, navigation messages
  * background.ts: service worker — registers side panel, routes messages
  * URL hash parsing: #nap-repo=... → state-key → which LFS instance
  * chrome.storage.sync: persist state-key map, PAT, zoom, main-repo config
  * chrome.tabs.update: navigate GitHub tab from side panel

* state-key (from workflow napkin) — the multi-PR concern
  * each PR gets its own state: own LightningFS name, own tabs, own nav, own focused card
  * state-key := main-repo / main-branch / PR-num / nap-repo / nap-branch
  * switching PRs = switching state context
  * for v0: ONE state context (manual clone, manual settings). state-key is the architecture.
  * for v1: multiple state contexts, keyed by URL hash, auto-clone on entry
