## Debug session report — v3 first live test

### Status: in progress (pausing, not done)

Human is testing the v3 app live with `raft-viz` template project. App is running, architect is actively building. Session paused for human to work with architect — will resume for more bug fixing.

### What was done

**Prior session fixes recovered and committed (9 commits):**
- Snapshot race in preload — buffered IPC before React mount
- did-finish-load ordering — register before async model load
- Ephemeral running/done flags survive filesystem reloads
- PTY cwd falls back to NAP_CWD
- Terminal created on demand when switching
- Sidebar cards and agent dots made clickable
- HMR version counter in sidebar header
- Workflow doc CLI examples fixed to create+start flow
- Architect prompt split for template vs freeform init

**This session fixes (6 commits):**
- Sidebar redesigned to match v2 mock — #252526 bg, 300px width, Menlo font, blue left border on active card, hover states (#2a2d2e), separator between architects/napkins, dots inline with header row
- Terminal breadcrumb resolves agent names — shows `S > napkin-slug > agent-name running` instead of raw UUID
- Done agent dots — dashed circle with SVG checkmark inside, aligned via structural border trick
- Debug panel — right-side draggable panel showing color-coded JSON dump of model state, no-wrap with vertical scroll
- File link provider — copied from v2, file paths in terminal output are clickable, opens in default editor via shell.openPath
- Cmd+G follow mode — toggles scroll-to-bottom lock per terminal, blue bottom border indicator

### Known remaining issues

- Dot colors based on role not status (running test-arch shows amber instead of green)
- No pulsing animation on running dots
- No gutter/nepic switcher
- No filter bar (Cmd+K)
- No card expand/focus/extended states
- No sidebar toggle
- No kanban overlay

### Test result

App boots, loads model, spawns agents, shows sidebar with napkins and architects, terminals are interactive, clicking between agents works, `nap done` propagates, `nap3 nap` wait works. The raft-viz project is actively being built by the architect and agents as of this report.
