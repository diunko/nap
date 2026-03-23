## Why

The napkin browser shows a filtered view of the filesystem — only 4 known extensions, agent dir names without contents, no absolute paths. Arbitrary files are invisible. The renderer reconstructs paths from slugs. This is brittle and limits what the UI can show.

## What

Replace the filtered `NapkinData` model with full filesystem snapshots (`NapkinSnapshot`). The watcher reads everything in the napkin dir. The store is the single source of truth. The renderer renders directly from store entries with no path logic.

## Constraints

* Watcher reads ALL files and subdirs in each napkin dir — no extension allowlist
* Every entry includes `absPath` — renderer uses it for copy/open, no reconstruction
* `agents/` subdir is special: its children promoted to top-level entries with `type: 'agent'`
* Other subdirs become `type: 'dir'` entries (collapsible in extended view)
* Agent entries enriched in store merge with `terminalId` from SQLite sessions
  * `terminalId` present → `[terminal]` virtual entry rendered
  * `terminalId` absent → no virtual entry, just files
* `[diff]` is future scope — don't implement, but the data model shouldn't prevent it
* `napkinBullets` still extracted from `.nap.md` — needed for kanban card content
* Existing rendering rules preserved:
  * `*` bullet for files, `●/◌` dot for agents
  * Hover controls (⎘ ↗) on extended view only
  * Same indentation hierarchy as design sprint screenshots
* IPC channel names unchanged: `napkin:update`, `napkin:status-changed`, `get-napkin-data`
* All existing tests must pass or be updated to new types
* Performance: 40 napkins × (files + agents × agent files) should complete in <100ms

## What to read

**Design reference:**
1. Screenshots: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/01.png` through `04.png`
2. Voiceover: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/voiceover.nap.md`
3. HTML mock: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/mocks/v2-final.html`

**Code:**
* `src/main/napkin-watcher.ts` — rewrite readNapkinDir
* `src/renderer/store.ts` — new types, merge logic
* `src/renderer/components/NapkinBrowser.tsx` — render from entries
* `src/renderer/components/KanbanOverlay.tsx` — adapt types
* `src/main/preload.ts` — update types
* `src/types/electron-api.d.ts` — update types

**Proposal:**
* `.nap/nepics/02-nepic-spaces/30-napkins/0600-live-wiring/agents/004-fs-eng-wiring-fix/proposal-napkin-store-redesign.md`

**Test project:**
* `~/dvl/aibanana/test-nap/` — realistic napkin structure for manual testing
* Run dev mode: `npm run dev -- -- --cwd ~/dvl/aibanana/test-nap`
