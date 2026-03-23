# Test Architecture: 1200-napkin-store-redesign

## Summary

Replacing filtered NapkinData (4 known extensions, agent names only, no absolute paths) with NapkinSnapshot (all files, all subdirs, absPath on every entry). The seams are: watcher produces correct snapshots, store merges terminalId into agents, renderer consumes new shape without path reconstruction, kanban adapts.

Three layers of tests:
- **Small** (vitest + jsdom): store merge logic with new NapkinSnapshot types
- **Medium** (Playwright + Electron): readNapkinDir producing snapshots, IPC flow, fs.watch updates, rendered output
- Existing tests: update to new type shapes or replace entirely

---

## Test Cases

### T-1200-01: readNapkinDir returns all files, not just known extensions
- **Size:** medium
- **Flow:** Create napkin dir with .nap.md, .spec.md, random.txt, notes.log → call readNapkinDir → assert entries include all 4 files as type='file'
- **Subsystems:** napkin-watcher.ts readNapkinDir
- **Expected:** entries contains NapkinFileEntry for every file in the dir, not just KNOWN_ARTIFACTS
- **Breaks when:** Extension allowlist reintroduced, readdir filtered, or file-type detection added that skips unknown types
- **Verification:** `app.evaluate` → call readNapkinDir → check `entries.filter(e => e.type === 'file')` includes 'random.txt' and 'notes.log'

### T-1200-02: readNapkinDir sets absPath on every entry
- **Size:** medium
- **Flow:** Create napkin dir with files and agents → call readNapkinDir → assert every entry (file, agent, dir) has correct absPath
- **Subsystems:** napkin-watcher.ts readNapkinDir
- **Expected:** Each entry's absPath is an absolute path joining napkinsDir + slug + relative path. Snapshot's own absPath is the napkin dir.
- **Breaks when:** absPath constructed with wrong separator, relative instead of absolute, or omitted from some entry types
- **Verification:** `app.evaluate` → check `result.absPath.startsWith('/')`, each entry.absPath starts with result.absPath

### T-1200-03: agent dirs promoted as type='agent' with nested files
- **Size:** medium
- **Flow:** Create napkin dir with `agents/001-test-arch/` containing prompt.md, response.md → call readNapkinDir → assert agents/ children appear as top-level entries with type='agent' and files[]
- **Subsystems:** napkin-watcher.ts readNapkinDir
- **Expected:** entries has NapkinAgentEntry with name='001-test-arch', type='agent', files containing NapkinFileEntry for prompt.md and response.md. No entry for the `agents/` directory itself.
- **Breaks when:** agents/ dir appears as type='dir' instead of being promoted, agent files missing or returned as bare strings instead of NapkinFileEntry, agents/ itself leaks into entries
- **Verification:** `app.evaluate` → `result.entries.find(e => e.name === '001-test-arch')` has type='agent', files.length === 2, each file has absPath

### T-1200-04: non-agent subdirs captured as type='dir'
- **Size:** medium
- **Flow:** Create napkin dir with `research/` subdir containing competitor-analysis.md → call readNapkinDir
- **Subsystems:** napkin-watcher.ts readNapkinDir
- **Expected:** entries has NapkinDirEntry with name='research', type='dir', files containing NapkinFileEntry for competitor-analysis.md
- **Breaks when:** Non-agent subdirs silently skipped (old behavior), or treated as agents, or flattened into top-level files
- **Verification:** `app.evaluate` → `result.entries.find(e => e.name === 'research')` has type='dir', files[0].name === 'competitor-analysis.md'

### T-1200-05: napkinBullets still extracted from .nap.md
- **Size:** medium
- **Flow:** Create napkin dir with .nap.md containing `* bullet one\n* bullet two\n  * nested\n` → call readNapkinDir
- **Subsystems:** napkin-watcher.ts readNapkinDir
- **Expected:** napkinBullets = ['bullet one', 'bullet two'] — nested excluded, same as before
- **Breaks when:** Bullet extraction removed, regex changed, or .nap.md file not found among new all-files scan
- **Verification:** `app.evaluate` → `result.napkinBullets` deep equals expected array
- **Note:** This is a regression guard — behavior unchanged from pre-redesign

### T-1200-06: empty napkin dir returns empty entries
- **Size:** medium
- **Flow:** Create empty napkin dir (no files, no subdirs) → call readNapkinDir
- **Subsystems:** napkin-watcher.ts readNapkinDir
- **Expected:** entries = [], napkinBullets = [], absPath set correctly
- **Breaks when:** readdir throws on empty dir, or missing .nap.md causes error instead of graceful empty

### T-1200-07: store merges NapkinSnapshot preserving status
- **Size:** small
- **Flow:** Set status via mergeNapkinStatus('0100-alpha', 'doing') → then setNapkinData with NapkinSnapshot shape → read store
- **Subsystems:** store.ts setNapkinData, mergeNapkinStatus
- **Expected:** Merged napkin has status='doing' from SQLite and entries from filesystem snapshot
- **Breaks when:** setNapkinData overwrites status with default, or new type shape not accepted by setNapkinData
- **Verification:** Direct store state assertion in vitest

### T-1200-08: store enriches agent entries with terminalId from sessions
- **Size:** small
- **Flow:** Add terminal with napkinSlug='0100-alpha' and role matching agent → setNapkinData with agent entry → read derived data
- **Subsystems:** store.ts merge logic or NapkinBrowser.tsx deriveNapkinCards
- **Expected:** Agent entry enriched with terminalId from matching terminal in store
- **Breaks when:** Terminal-to-agent matching logic broken by type change (was index-based matching of agent name array, now needs to match NapkinAgentEntry), or terminalId not propagated
- **Verification:** Store state or derived card data has agent.terminalId matching the terminal ID
- **Note:** This is the critical seam — the enrichment logic is what makes [terminal] appear/disappear

### T-1200-09: [terminal] virtual entry only when agent has live session
- **Size:** small (DOM render via jsdom) or medium (Playwright)
- **Flow:** Render NapkinBrowser in extended view. Agent A has terminalId (running session), Agent B does not.
- **Subsystems:** NapkinBrowser.tsx extended view rendering
- **Expected:** Agent A shows [terminal] virtual entry, Agent B does not
- **Breaks when:** [terminal] always rendered (old behavior showed it for all agents), or never rendered, or rendered based on wrong condition
- **Verification:** Query DOM for `[terminal]` text nodes — count matches number of agents with live sessions
- **Note:** Old code renders [terminal] unconditionally. New code must gate on terminalId presence.

### T-1200-10: NapkinBrowser renders arbitrary files in focused view
- **Size:** medium
- **Flow:** Set store with NapkinSnapshot containing 'random.txt' and '.nap.md' → expand card → check DOM
- **Subsystems:** NapkinBrowser.tsx focused view
- **Expected:** Both files visible as `*` bullet items. Not just known extensions.
- **Breaks when:** Renderer filters entries by extension, or only shows artifacts array
- **Verification:** `page.evaluate` → query DOM for file name text content, assert 'random.txt' visible

### T-1200-11: extended view shows hover controls (copy, open) with absPath
- **Size:** medium
- **Flow:** Set store with snapshot → expand card → extend (Cmd+E) → hover over file → assert controls visible, click copy → verify clipboard gets absPath
- **Subsystems:** NapkinBrowser.tsx extended view, absPath from entries
- **Expected:** Hover shows ⎘ (copy) and ↗ (open). Copy writes entry.absPath to clipboard, not reconstructed path.
- **Breaks when:** Controls still reconstruct path from slug + extension (old logic), or absPath undefined on entries
- **Verification:** `page.evaluate` → simulate hover → check control visibility → click copy → read clipboard

### T-1200-12: extended view shows agent files with hover controls
- **Size:** medium
- **Flow:** Set store with snapshot containing agent with files [prompt.md, response.md] → extend card → check agent file lines have hover controls
- **Subsystems:** NapkinBrowser.tsx extended view agent rendering
- **Expected:** Each agent file renders with ⎘ and ↗ controls. Files come from agent.files[] which are now NapkinFileEntry with absPath.
- **Breaks when:** Agent files rendered without controls (old behavior: no absPath available), or file entries lack absPath
- **Verification:** DOM query for agent file rows → check hover control elements exist

### T-1200-13: kanban still works with new type shape
- **Size:** small (jsdom render)
- **Flow:** Set store with NapkinSnapshot-shaped napkins (entries instead of artifacts, agent entries instead of AgentEntry) → render KanbanOverlay → assert columns, cards, badges
- **Subsystems:** KanbanOverlay.tsx, store.ts NapkinEntry type
- **Expected:** Kanban cards display correctly — badge presence derived from entries (files ending in known extensions), agent dots from agent entries, napkinBullets from snapshot
- **Breaks when:** KanbanOverlay still reads `artifacts` array (old shape), or badge derivation breaks because artifacts are now full filenames instead of extensions
- **Verification:** Render kanban → check column counts, expanded card badges, agent dot count

### T-1200-14: fs.watch incremental update — new arbitrary file appears in store
- **Size:** medium
- **Flow:** Start watcher → write 'scratch.md' into napkin dir → wait for IPC → check store
- **Subsystems:** napkin-watcher.ts fs.watch → readNapkinDir → IPC → store
- **Expected:** New file appears in store's napkin entries as NapkinFileEntry with correct absPath
- **Breaks when:** Watcher still filters by extension, or incremental update doesn't include new files
- **Verification:** `page.waitForFunction` → store napkin entries include 'scratch.md'

### T-1200-15: fs.watch incremental update — new non-agent subdir appears
- **Size:** medium
- **Flow:** Start watcher → create `notes/` subdir with file → wait → check store
- **Subsystems:** napkin-watcher.ts fs.watch → readNapkinDir → IPC → store
- **Expected:** New dir entry appears in store with type='dir' and nested files
- **Breaks when:** Watcher only re-reads files, not subdirs, or new subdir treated as agent

### T-1200-16: full scan sends NapkinSnapshot array on startup
- **Size:** medium
- **Flow:** Create napkin dirs → startNapkinWatcher → capture IPC → verify payload shape
- **Subsystems:** napkin-watcher.ts fullScan → IPC
- **Expected:** Initial IPC payload is array of NapkinSnapshot objects with entries[], absPath, napkinBullets
- **Breaks when:** fullScan still returns old NapkinData shape
- **Verification:** IPC capture → check `data[0].entries` exists and is array, `data[0].absPath` is string

### T-1200-17: napkinsBasePath plumbing removed
- **Size:** small
- **Flow:** Check store type and NapkinBrowser props — napkinsBasePath should not exist
- **Subsystems:** store.ts, NapkinBrowser.tsx
- **Expected:** No napkinsBasePath in store state, no napkinsBasePath prop on NapkinCard, no path reconstruction in renderer
- **Breaks when:** Old plumbing left in place alongside new absPath (dead code), or renderer still reads napkinsBasePath
- **Verification:** TypeScript compilation (type-level), plus runtime: `useTerminalStore.getState()` does not have `napkinsBasePath`

### T-1200-18: performance — 40 napkins scan completes in <100ms
- **Size:** medium
- **Flow:** Create 40 napkin dirs each with 5 files, 2 agents (3 files each), 1 subdir (2 files) → time fullScan
- **Subsystems:** napkin-watcher.ts fullScan/readNapkinDir
- **Expected:** Total scan time < 100ms
- **Breaks when:** readNapkinDir does synchronous I/O, or nested reads are not parallelized, or absPath computation is expensive
- **Verification:** `app.evaluate` → `performance.now()` before/after fullScan → assert delta < 100

---

## Existing Tests to Update

### napkin-watcher.spec.ts (T-0500-01 through T-0500-18)
- **T-0500-01:** Update assertions — readNapkinDir now returns entries[] not artifacts[]. 'random.txt' should now appear in entries (was correctly excluded before, now correctly included).
- **T-0500-02:** Update — agents returned as NapkinAgentEntry with files[], not bare string names.
- **T-0500-03 through T-0500-05:** napkinBullets and edge cases — same behavior, update type assertions.
- **T-0500-06 through T-0500-18:** fs.watch + IPC tests — update expected shapes from NapkinData to NapkinSnapshot. Change `result.artifacts` assertions to `result.entries.filter(e => e.type === 'file')`, `result.agents` to `result.entries.filter(e => e.type === 'agent')`.

### live-wiring/store-merge.test.ts (T-0600-18)
- Update setNapkinData calls from `{ slug, artifacts, agents, napkinBullets }` to `{ slug, entries, napkinBullets, absPath }` (new NapkinSnapshot shape).
- Assertions change from checking `artifacts` array to checking `entries`.

### live-wiring/kanban-render.test.ts (T-0600-07 through T-0600-10)
- Update store.napkins shape from NapkinEntry (artifacts/agents) to new shape with entries[].
- Badge derivation may change — badges now derived from file names in entries, not extension strings.

### live-wiring/live-wiring.spec.ts (T-0600-01 through T-0600-17)
- All tests that check `napkin.artifacts` or `napkin.agents` update to check entries.
- setupNapkinDir helper may need update (already creates real dirs, but assertions need new shape).
- T-0600-15 (fs.watch artifact update) becomes more interesting — arbitrary files now appear.
- T-0600-16 (new agent dir) — agents now returned as NapkinAgentEntry with files.

---

## What NOT to test

- Visual styling of dots, colors, padding — manual territory
- Happy path where everything is a known extension (that's the old behavior; new code treats all files equally)
- Internal readdir implementation details
- [diff] virtual entry — future scope per spec
