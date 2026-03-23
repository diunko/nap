## What was built

Replaced the filtered `NapkinData` model with full filesystem snapshots (`NapkinSnapshot`). The watcher reads everything in each napkin dir, the store is the single source of truth, and the renderer does zero path logic.

### New types

- `NapkinFileEntry` — `{ name, absPath, type: 'file' }`
- `NapkinAgentEntry` — `{ name, absPath, type: 'agent', files: NapkinFileEntry[] }`
- `NapkinDirEntry` — `{ name, absPath, type: 'dir', files: NapkinFileEntry[] }`
- `NapkinSnapshot` — `{ slug, absPath, entries[], napkinBullets[] }`

### Changes by file

**napkin-watcher.ts** — `readNapkinDir` rewritten to scan ALL files/dirs:
- No extension allowlist (removed `KNOWN_ARTIFACTS`)
- `agents/` children promoted to top-level as `type: 'agent'`
- Other subdirs captured as `type: 'dir'`
- Every entry has `absPath`
- Removed `getActiveNapkinsPath()` — no longer needed

**store.ts** — New `NapkinEntry` type with `entries[]` + `absPath`:
- Removed `napkinsBasePath` from store state
- Removed `setNapkinsBasePath` action
- `setNapkinData` accepts `NapkinSnapshot` shape
- `mergeNapkinStatus` creates placeholder with new shape

**NapkinBrowser.tsx** — Renders from entries directly:
- `deriveNapkinCards` splits entries by type (file/agent/dir)
- Files render with `*` bullet + absPath for copy/open controls
- Agents render with status dot — terminal matching preserved (index-based)
- `[terminal]` virtual entry only when `agent.terminalId` is present
- `[diff]` removed (future scope per spec)
- Non-agent subdirs render as collapsible groups in extended view
- Extracted `FileRow` component for hover controls (⎘ copy absPath, ↗ open)
- Removed `napkinsBasePath` prop

**KanbanOverlay.tsx** — Adapted to new type shape:
- Badge presence derived from file entry names (`*.nap.md` → 'nap')
- Agent dots from `entries.filter(type === 'agent')`

**preload.ts / electron-api.d.ts** — Updated types, removed `napkinsBasePath`

**main.ts** — Removed `getActiveNapkinsPath` import and `napkinsBasePath` from IPC responses

**renderer/index.tsx** — Removed `napkinsBasePath` handling

### Tests updated

- `store-merge.test.ts` — All assertions use new `entries` shape
- `kanban-render.test.ts` — Napkin data uses `entries` with file entries for badges
- `napkin-watcher.spec.ts` — Assertions check `entries.filter(type)` instead of `artifacts`/`agents`
- `live-wiring.spec.ts` — All `setNapkinData` calls and assertions updated
- `layout-mock.spec.ts` — `setNapkinData` calls updated
- `polish.spec.ts` — `setNapkinData` calls updated

### Results

- `npm run typecheck` — zero errors (both src and tests tsconfigs)
- `npx vitest run` — 16 test files pass, 123 tests pass

### Design decisions

1. **Agent entries stay enriched at render time** — `deriveNapkinCards` matches agents to terminals by index (same as before). The store doesn't persist `terminalId` — it's derived when terminals change.
2. **Badge derivation in kanban** — `badgeFromFileName` checks if a file name ends with `.nap.md`, `.spec.md`, etc. This replaces the old `badgeFromExt` that operated on extension strings.
3. **`[diff]` removed from render** — spec says future scope, so it's not rendered but the data model supports adding it later.
