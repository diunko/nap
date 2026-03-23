* napkin store redesign — full filesystem snapshots, not filtered extensions

* the problem
  * watcher only knows 4 file extensions (.nap.md, .spec.md, .test.md, .journeys.md)
  * arbitrary files invisible (research notes, scratch, feedback)
  * renderer reconstructs paths from slugs — fragile, duplicates filesystem knowledge
  * adding a new file type requires changing watcher's allowlist
  * agent files have no absolute paths — copy/open controls can't work

* the fix: watcher produces full filesystem snapshots
  * reads ALL files in napkin dir, not just known extensions
  * reads ALL subdirs, not just agents/
  * every entry has absolute path — renderer does zero path logic
  * `agents/` is special: children promoted to top-level as type='agent'
  * other subdirs become type='dir' (collapsible groups)

* data model
  * NapkinSnapshot replaces NapkinData
    * slug, absPath
    * entries: array of file | agent | dir
    * napkinBullets: still extracted from .nap.md for kanban
    * status: merged from SQLite
  * NapkinFileEntry: name, absPath, type='file'
  * NapkinAgentEntry: name, absPath, type='agent', files[]
    * enriched by store merge: terminalId from SQLite session data
    * terminalId present → render [terminal] virtual entry
    * terminalId absent → no virtual entry
  * NapkinDirEntry: name, absPath, type='dir', files[]

* data flow
  * fs change → watcher scans → NapkinSnapshot (with abs paths)
  * IPC napkin:update → renderer store
  * store merges: snapshot + SQLite status + session data (terminal IDs)
  * components render directly from store — no path reconstruction

* rendering rules (must match design sprint screenshots)
  * collapsed: `* name ●●◌ status`
  * focused
    * `*` files — ALL files in napkin dir, not just known ones
    * `●` agent dirs with status dot bullet + status label
  * extended (Cmd+E)
    * files get hover controls: ⎘ copy absPath, ↗ open in editor
    * agent dirs expand to show their files
      * `[terminal]` — only if agent has live session (italic, bracketed)
      * prompt.md, response.md, etc. with hover controls
    * non-agent subdirs expand as collapsible groups

* what changes
  * napkin-watcher.ts — readNapkinDir returns NapkinSnapshot
  * store.ts — new types, merge enriches agents with terminalId
  * NapkinBrowser.tsx — renders from entries, removes path reconstruction
  * KanbanOverlay.tsx — adapts to new type shape
  * preload.ts / electron-api.d.ts — updated types
  * remove napkinsBasePath plumbing

* what stays the same
  * watcher debounce + incremental updates
  * SQLite status merge pattern
  * IPC channel names
  * kanban card rendering (uses napkinBullets)

* reference
  * original proposal: `30-napkins/0600-live-wiring/agents/004-fs-eng-wiring-fix/proposal-napkin-store-redesign.md`
  * design screenshots: `30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/`
  * HTML mock: `30-napkins/0100-design-sprint/mocks/v2-final.html`
