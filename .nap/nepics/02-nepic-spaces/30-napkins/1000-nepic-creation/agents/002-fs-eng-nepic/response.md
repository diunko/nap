## What was built

Nepic creation — the (+) button that creates a fresh nepic space. Full flow from UI click through filesystem scaffold, SQLite persistence, architect pty spawn, and gutter re-render.

### Files modified

1. **`src/main/session-store.ts`** — added `createNepicRow()` (deactivates all, inserts new with is_active=1) and `getAllNepics()` (returns all nepics ordered by slug)

2. **`src/main/main.ts`** — added:
   - `handleNepicCreate(name)` function: slug generation (NN-name from fs scan), directory scaffold (10-docs through 40-board with all subdirs), prompt.md template, SQLite operations, architect session creation, pty spawn with `--session-id` and `--verbose`, ui_state update, napkin watcher restart
   - `nepic:create` IPC handler (invoke, returns result to renderer)
   - `get-nepics` IPC handler (returns all nepics for startup hydration)
   - Exposed `createNepicRow`, `getAllNepics`, `handleNepicCreate` in `__napTest`

3. **`src/main/preload.ts`** — exposed `createNepic()` and `getNepics()` via context bridge

4. **`src/types/electron-api.d.ts`** — added `NepicInfo`, `CreateNepicResult` interfaces and `createNepic`/`getNepics` to `ElectronAPI`

5. **`src/types/nap-test.d.ts`** — added `createNepicRow`, `getAllNepics`, `handleNepicCreate` to `NapTestHelpers`

6. **`src/renderer/store.ts`** — added `NepicInfo` type, `nepics` state array, `setNepics()` and `addNepic()` actions. Changed `activeNepicId` default from `'spaces'` to `''`

7. **`src/renderer/components/Gutter.tsx`** — rewrote to use real nepic data from store instead of MOCK_NEPICS. (+) button shows inline text input overlay. On Enter: calls `createNepic` IPC, adds nepic to store, switches active nepic, adds architect terminal, sets it active

8. **`src/renderer/index.tsx`** — added `getNepics()` call during startup hydration to populate store with existing nepics

### Decisions

- **Slug generation**: scans `.nap/nepics/` for numeric prefixes, takes max+1, zero-pads to 2 digits. Handles first nepic (01-), duplicates (distinct NN), gaps
- **Architect command**: `claude --session-id <uuid> --verbose "read prompt.md and follow its instructions"` — uses existing `injectSessionId()` utility
- **Renderer notification**: nepic:create returns data to renderer (not socket:terminal-created event) — renderer calls `addSocketTerminal` directly to avoid race conditions
- **Name input**: inline overlay positioned next to (+) button, Escape to cancel, blur to cancel. Simple and matches the "minimal text input" spec

### Test seams

- `handleNepicCreate(name)` exposed on `__napTest` for direct invocation from Playwright
- All SQLite helpers (`createNepicRow`, `getAllNepics`) also exposed
- Gutter uses `data-testid="nepic-icon"` for existing nepics, `data-testid="nepic-add"` for (+), `data-testid="nepic-name-input"` for input

### Zero type errors

`npm run typecheck` passes clean.
