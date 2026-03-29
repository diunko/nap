# The Codebase

## Source Layout

```
src/
  main/                    Electron main process
    main.ts                Hub: window, ptys, IPC, socket, menus, startup resume
    preload.ts             IPC bridge (contextBridge)
    socket-server.ts       Unix socket server
    session-store.ts       SQLite-backed session registry
    database.ts            SQLite init, schema, singleton
    napkin-store.ts        Napkin status changes (SQLite + symlinks)
    napkin-watcher.ts      Filesystem watcher for 30-napkins/ and 20-architects/
    reconcile.ts           Filesystem vs SQLite reconciliation on launch
    name-resolver.ts       Name lookup with fuzzy matching
    message-queue.ts       Per-terminal poke delivery (three-step: text → Escape → CR)
    inject-session-id.ts   Pure function: inject --session-id into claude commands

  renderer/                React app
    index.tsx              App root, IPC listeners, terminal creation, kanban toggle
    store.ts               Zustand — terminals, napkins, UI state
    terminal-registry.ts   xterm.js instances in a Map (outside React)
    scroll-lock.ts         Follow/read lock
    file-link-provider.ts  Clickable file paths
    mock-data.ts           Development mock data (may still be referenced)
    components/
      Terminal.tsx          Container, DOM reparenting, resize, breadcrumb header
      NapkinBrowser.tsx     Sidebar: napkin cards, architect cards, filter
      Gutter.tsx            Left column: nepic switcher, (+) button
      KanbanOverlay.tsx     Cmd+` overlay: kanban board

  cli/
    nap.ts                 Standalone CLI (no electron deps)

  shared/
    constants.ts           Socket path, walk-up discovery
    ndjson.ts              Parser + serializer
    protocol.ts            Socket request/response types

  templates/               Bundled templates for nap init
    00-org/                Workflow, roles, structure
    nepic/                 Feedback templates, architect prompt
    skills/                napkin, napkin-format skills

  types/
    electron-api.d.ts      window.electronAPI declarations
    nap-test.d.ts          Test helper type declarations
```

## Key Files to Read First

1. `src/main/main.ts` — everything connects here. Startup, pty lifecycle, socket handlers, resume logic.
2. `src/renderer/store.ts` — the data model. Terminals, napkins, UI state.
3. `src/cli/nap.ts` — the full CLI. Shows all socket commands + nap init.
4. `src/shared/protocol.ts` — the protocol types.
5. `src/renderer/components/NapkinBrowser.tsx` — the sidebar. Most complex renderer component.

## Stable App vs Development

The human runs a stable build from `~/nap-app/` (a clone of this repo). Development happens here. To update:
```bash
cd ~/nap-app && git pull origin main && npm run build && npm run build:cli
```

Test against a separate project:
```bash
npm run dev -- -- --cwd ~/dvl/aibanana/test-nap
```

## Test Rules

- **Small tests (vitest):** pure TS, no native modules. NEVER import better-sqlite3 or node-pty.
- **Medium tests (playwright):** real Electron app. All native module tests go here.
- **Each medium test suite gets its own temp dir** for DB isolation.
- **Run commands one at a time** in bash — no && chaining.
