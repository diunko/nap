## 0500 — kanban overlay + gutter + nepic switching: response

### What was built

All three features implemented and tested:

1. **Kanban quake console (Cmd+`)**
   - KanbanOverlay.tsx — five columns (BACKLOG/TODO/DOING/REVIEW/DONE)
   - Cards collapsed by default, click to expand (napkin bullets + artifact badges + agent chips)
   - → navigation: dismisses kanban, forces sidebar visible, focuses card, switches terminal to best agent
   - bestAgent heuristic: running > done > exited, falls back to architect
   - Cmd+` via keydown handler (fallback for macOS system shortcut conflict)
   - Styles ported verbatim from v2 KanbanOverlay.tsx

2. **Gutter (left column, 60px)**
   - Gutter.tsx — vertical nepic switcher
   - nepicLabel: strips numeric prefix, takes first char uppercase (01-v1 → V)
   - Active nepic: white left bar, highlighted background
   - (+) button: inline input overlay, Enter creates, Escape/blur dismisses
   - Empty name validation (no-op on blank)
   - Styles ported verbatim from v2 Gutter.tsx

3. **Nepic switching**
   - model.switchNepic: stops watcher, loads new nepic dir, starts watcher, persists activeNepicId to ui-state.json
   - model.getNepics: reads parent nepics/ dir, returns NepicInfo[] with derived names
   - model.createNepic: scaffolds dirs + architect stub (already existed from 0210, now wired to gutter)
   - IPC: nepic:switch and nepic:create handlers in main.ts
   - Store: switchNepic calls IPC, snapshot updates nepics list automatically

### Data layer changes

- **bridge-types.ts**: Added `NepicInfo`, `napkinBullets: string[]` to NapkinState, `nepics: NepicInfo[]` to AppSnapshot
- **filesystem.ts**: Added `readFile` method (for parsing .nap.md bullet content)
- **model.ts**: parseBullets from .nap.md, nepicList caching, switchNepic, getNepics, getActiveNepicId
- **bridge.ts**: wireModelToBridge now gets activeNepicId from model (not hardcoded param)
- **store.ts**: kanbanVisible, toggleKanban, nepics, switchNepic, focusCard (non-toggling variant for kanban navigation)
- **preload.ts**: switchNepic + createNepic IPC channels

### Decisions

- **No Electron menu accelerator for Cmd+`** — used keydown handler only (same as Cmd+B, Cmd+D, Cmd+K, Cmd+E). The menu approach requires building a full Electron Menu which is a bigger change and the keydown handler is the actual fix for the macOS system shortcut conflict anyway.
- **focusCard vs expandCard** — added `focusCard(slug)` that always focuses without toggling. Kanban navigation uses this so clicking → always focuses the card, never collapses it. Also forces sidebar visible if hidden.
- **nepicList from model** — the model loads the nepic list during `loadFromFilesystem` by reading the parent directory. This means every reload refreshes the nepic list. wireModelToBridge was updated to drop the `activeNepicId` parameter since the model now tracks it internally.
- **MemoryFileSystem widened** — accepts `string` values in addition to `object | null`, enabling .nap.md content storage in test fixtures.
- **Gutter conditionally rendered** — only shows when `nepics.length > 0` to avoid empty gutter in single-nepic or no-nepic scenarios.

### Test coverage

- **20 small tests** (vitest): kanban data derivation (grouping, bullets, dots, badges), nepicLabel, bestAgent heuristic, nepic switching model tests (switchNepic, watcher restart, ui-state persistence), createNepic scaffold, store state tests, edge cases
- **8 medium tests** (Playwright): Cmd+` toggle, five columns, cards collapsed default, card expansion, → navigation, full round-trip, sidebar visibility
- **0 regressions**: all 114 existing small tests pass, all 21 existing medium tests pass

### What to review

- The bridge.test.ts was updated: `wireModelToBridge` no longer takes `activeNepicId` param, test assertion changed from `'nepic-01'` to `'nepic'` (derived from dir name)
- The MemoryFileSystem type change (`object | null` → `object | string | null`) is backward compatible but worth noting
