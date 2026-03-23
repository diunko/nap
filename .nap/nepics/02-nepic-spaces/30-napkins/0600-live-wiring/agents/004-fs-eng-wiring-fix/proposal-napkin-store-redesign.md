# Proposal: napkin store as full filesystem snapshot

## Problem

Current architecture splits napkin data across multiple concerns:
- `artifacts: string[]` — only known extensions (.nap.md, .spec.md, .test.md, .journeys.md)
- `agents: { name: string; files: string[] }[]` — agent dirs, files have no paths
- `napkinBullets: string[]` — extracted from .nap.md

Consequences:
- Arbitrary files in napkin dirs are invisible (research notes, scratch files, feedback)
- Subdirectories other than `agents/` are invisible
- Agent files have no copy/open controls (no absolute paths)
- Renderer reconstructs paths from slugs — fragile, duplicates filesystem knowledge
- Adding a new file type requires changing the watcher's allowlist

## Proposed model

```typescript
// A file entry with everything the renderer needs
interface NapkinFileEntry {
  name: string;       // "0100-design-sprint.nap.md"
  absPath: string;    // "/Users/.../30-napkins/0100-design-sprint/0100-design-sprint.nap.md"
  type: 'file';
}

// Agent dir promoted to top level (agents/ parent hidden)
interface NapkinAgentEntry {
  name: string;       // "001-test-arch"
  absPath: string;    // "/Users/.../30-napkins/0100-design-sprint/agents/001-test-arch"
  type: 'agent';
  files: NapkinFileEntry[];
}

// A non-agent subdirectory
interface NapkinDirEntry {
  name: string;       // "research"
  absPath: string;
  type: 'dir';
  files: NapkinFileEntry[];
}

// Complete napkin snapshot — single source of truth
interface NapkinSnapshot {
  slug: string;
  absPath: string;    // "/Users/.../30-napkins/0100-design-sprint"
  entries: (NapkinFileEntry | NapkinAgentEntry | NapkinDirEntry)[];
  napkinBullets: string[];   // still extracted for kanban card display
  status: NapkinPhase;       // from SQLite, merged by store
}
```

## Data flow

```
filesystem change
  → napkin-watcher scans dir, produces NapkinSnapshot (with abs paths)
  → IPC napkin:update sends snapshot to renderer
  → store.setNapkinData merges snapshot (preserves status from SQLite)
  → NapkinBrowser/KanbanOverlay render directly from store — zero path logic
```

## What changes

### napkin-watcher.ts
- `readNapkinDir` returns `NapkinSnapshot` instead of `NapkinData`
- Reads ALL files in napkin dir (not just known extensions)
- Reads ALL subdirs (not just `agents/`)
- `agents/` subdir is special: its children are promoted to top-level entries as `type: 'agent'`
- Other subdirs become `type: 'dir'` entries
- Every entry includes `absPath`
- `napkinBullets` still extracted from `.nap.md` for kanban

### store.ts
- `NapkinEntry` replaced by `NapkinSnapshot` (or similar)
- `setNapkinData` accepts snapshots, merges status
- `napkinsBasePath` no longer needed (paths are in the data)

### NapkinBrowser.tsx
- Renders `entries` directly — no `deriveNapkinCards` path reconstruction
- Every file gets copy/open controls (absPath is right there)
- `type: 'agent'` entries render with status dot bullet + nested files
- `type: 'dir'` entries render as collapsible groups
- `type: 'file'` entries render with `*` bullet + file name

### KanbanOverlay.tsx
- Uses `napkinBullets` and agent count from snapshot
- No path logic needed

### preload.ts / electron-api.d.ts
- Update types to match new snapshot shape
- Remove `napkinsBasePath` from IPC responses

## What stays the same

- Watcher's debounce + incremental update logic
- SQLite status merge pattern (status before/after filesystem — both orderings work)
- Kanban card rendering (uses napkinBullets + agent entries)
- IPC channel names (napkin:update, napkin:status-changed, get-napkin-data)

## Rendering rules

Collapsed card (click to focus):
```
* 0100-design-sprint    ●●○  review
```

Focused card (click again to collapse):
```
* 0100-design-sprint    ●●○  review
  * 0100-design-sprint.nap.md
  * 0100-design-sprint.spec.md
  * research-notes.md              ← NEW: arbitrary files visible
  ● 001-test-arch/          done
  ● 002-fs-eng/              run
  ○ 003-test-eng/             nap
```

Extended card (Cmd+E):
```
* 0100-design-sprint    ●●○  review
  * 0100-design-sprint.nap.md      ⎘ ↗   ← hover controls, abs path
  * 0100-design-sprint.spec.md     ⎘ ↗
  * research-notes.md              ⎘ ↗   ← any file gets controls
  * research/                             ← non-agent subdir
    * competitor-analysis.md       ⎘ ↗
  ● 001-test-arch/          done
    * [terminal]
    * [diff]
    * prompt.md                    ⎘ ↗
    * response.md                  ⎘ ↗
  ● 002-fs-eng/              run
    * [terminal]
    * [diff]
    * prompt.md                    ⎘ ↗
```

## Migration path

1. Update `NapkinData` type in napkin-watcher → `NapkinSnapshot` with abs paths and all files
2. Update store type + merge logic
3. Update NapkinBrowser to render from entries (remove `deriveNapkinCards` path construction)
4. Update KanbanOverlay for new type shape
5. Remove `napkinsBasePath` plumbing (no longer needed)
6. Update tests
