# Architecture

## Package structure

```
packages/ext-react/
  src/
    session.ts            session factory, React context, useSession/useNapStore hooks
    state-store.ts        IndexedDB adapter for Zustand persist
    store.ts              createNapStore factory, Tab/NapStore types, pure functions
    model.ts              data pipeline: adapter events → debounce → store
    index.tsx             App shell: SessionContext.Provider, Panel, HeaderBar, SurfaceTabBar
    ContentPane.tsx       Monaco editor: file load, auto-save, role decorations, link clicks
    Sidebar.tsx           nav tree: NapkinCard, AgentDot, FileRow, NodeTree
    TerminalPane.tsx      wterm + BashShell
    TabBar.tsx            ephemeral/permanent tabs
    fs-adapter.ts         LightningFS → IFileSystem adapter + change event emitter
    nav-tree.ts           parseNavTree pure function, NavNode types
    link-routing.ts       routeLink: .md → openDoc, code → openCode, https → openExternal
    content-link-provider.ts  detectLinks (3 regex types)
    ...
  docs/                   you are here
  e2e/                    Playwright integration tests
  src/__tests__/          vitest unit tests
```

## Key abstractions

### Session (session.ts)

The top-level isolation unit. One key → one independent context.

```typescript
interface Session {
  key: string;
  lfs: LightningFS;           // filesystem in IndexedDB
  adapter: LightningFsAdapter; // wraps LFS, emits change events
  store: NapStoreApi;          // Zustand store, persists to IndexedDB
  model: NapModel;             // data pipeline between adapter and store
}
```

Created by `createSession(key)`. Provided to components via `SessionContext`. Panel has `key={session.key}` — remounts cleanly on session change.

### Store (store.ts)

Zustand store created by `createNapStore(key?, storage?)`. Two modes:
- No args: plain store for vitest (no persistence)
- With key + storage: persisted via Zustand `persist` middleware

State shape:
- **Nav**: `navSections: NavNode[]` (derived from filesystem, not persisted)
- **UI**: `activeFilePath`, `focusedCardSlug`, `cardViewMode`, `activeSurface`, `sidebarVisible`
- **Tabs**: `tabs: Tab[]`, `activeTabId`
- **Config**: `mainRepoConfig`, `zoom`, `settingsVisible`

`partialize` controls what gets persisted. `navSections` is excluded — rebuilt from LFS scan.

### Model (model.ts)

Sits between the adapter (filesystem events) and the store (UI state). Responsibilities:
- Subscribe to adapter change events
- Debounce rapid writes (200ms)
- Echo suppression (skip re-read for own writes)
- Scan for nepic root on startup and after git commands
- Parse nav tree and dispatch to store

Created with injected `adapter` and `store` — no singleton imports.

### Adapter (fs-adapter.ts)

LightningFS wrapper implementing `IFileSystem` (from just-bash). Adds:
- Change event emitter: every `writeFile`/`mkdir`/`rm`/`appendFile` emits `{ type, path }`
- Model subscribes to these events for the push data flow

### NavNode (nav-tree.ts)

Tree model for the sidebar. Pure function `parseNavTree` takes a base path and readDir/readJson callbacks, returns `NavNode[]`. No DOM, no LFS — testable in vitest.

Agent metadata from `.agent.nap.json` stored on `NavNode.metadata`. Read by `extractRole` and `extractAgentStatus` in the sidebar.

## Component hierarchy

```
App
  SessionContext.Provider value={session}
    Panel key={session.key}
      HeaderBar
      SurfaceTabBar
        TabBar (file tabs)
        Terminal tab
      SettingsOverlay
      #editor-surface (visibility toggles)
        ContentPane
      #terminal-surface (visibility toggles)
        TerminalPane
      ResizeHandle
      Sidebar
        NapkinCard
          NodeTree → FileRow, DirRow
          AgentRow → AgentDot
```

Editor and terminal are both always mounted. Switching surfaces toggles `visibility` and `pointerEvents`. Monaco needs `editor.layout()` after `setModel` (deferred one frame via `requestAnimationFrame`).

## Chrome extension plumbing

- `manifest.json`: permissions, CSP (`wasm-unsafe-eval` for wterm)
- `background.ts`: sidePanel registration
- `content.ts`: trigger button on GitHub pages, URL hash detection
- Side panel: `side-panel.html` → `side-panel.js` (the React app)
