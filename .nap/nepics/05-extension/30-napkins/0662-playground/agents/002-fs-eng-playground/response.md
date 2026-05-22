# Fullstack engineer response — 0662-playground

## What I built

### 1. YAML parsing + fake steps (`playground.ts`)
- `parsePlaygroundYaml(text)` — never throws, returns `{ ok, config }` or `{ ok: false, error }`. Handles empty, whitespace, partial, and invalid YAML.
- `yamlToSteps(config, conditionState)` — converts parsed config to `StepDef[]` for the existing pipeline runner. Each step: sleep(delay) → check conditions from mutable `conditionState` reference → ok or error from `on_fail`.
- `extractConditionState(config)` — extracts per-step, per-condition initial boolean values from YAML.
- `DEFAULT_PLAYGROUND_YAML` — 6 steps mirroring real boot: parse URL, create session, clone repo (token_present=false, network_available=true), scan repo, load navigation, fetch PR diff. Clone has a false condition so first run shows failure.

### 2. Condition state lifecycle
- `conditionState` is a plain mutable object (Record<string, Record<string, boolean>>).
- Steps read it live at execution time via closure over the reference — NOT snapshotted at `yamlToSteps` or `run()` time.
- Toggle = mutate the object. Re-parse YAML = create new object from `extractConditionState`.
- This is what makes toggle-then-retry work (PG-S09, PG-S10, PG-S13).

### 3. PlaygroundPane component (`PlaygroundPane.tsx`)
- Reads `/home/user/playground.yaml` on mount and on LFS changes (subscribes to `adapter.onChange`).
- Before first run: shows step preview with pending circles and condition checkboxes.
- After run: renders `LoadingGate` (reused from 0660) + condition panel with live checkboxes.
- [run] button creates a new pipeline from `yamlToSteps`, runs it.
- Parse error state: shows error message, no crash.
- Destroys previous pipeline on re-run and on unmount.

### 4. File seeding (`pipeline-steps.ts`)
- In `makeInitFsStep`, after creating `/home/user`: checks `adapter.exists('/home/user/playground.yaml')`, writes `DEFAULT_PLAYGROUND_YAML` if missing.
- Idempotent — never overwrites user's edits.

### 5. Surface switching
- `store.ts`: `activeSurface` type extended to `'editor' | 'terminal' | 'playground'`.
- `index.tsx`: Playground tab added to `SurfaceTabBar`, playground surface div added to `Panel` with same visibility toggle pattern as editor/terminal.

### 6. Tests — 19 passing (vitest)
- PG-S01..S04: YAML parsing — valid, invalid, partial, empty
- PG-S05..S07: yamlToSteps — mapping, conditions true/false
- PG-S08: initial condition extraction
- PG-S09: toggle overrides initial
- PG-S10: live read at execution time (key architectural property)
- PG-S11: re-parse resets conditions
- PG-S12: multiple conditions, first unmet wins
- PG-S13: toggle → retry → pass (the core interaction)
- PG-S14: DEFAULT_PLAYGROUND_YAML is valid with a false condition
- PG-S15: file seeding idempotency

### 7. Regressions
- All 184 tests pass (13 files). Zero regressions.
- `tsc --noEmit` clean — zero type errors.

## Decisions

- **Condition state is a plain mutable object, not React state.** Steps read it via closure. React state would snapshot on render, breaking the "live read" guarantee. Force-updates trigger re-renders when checkboxes change.
- **`handleRun` resets conditions from config.** Per spec: "new run after YAML change → re-parse → reset." Since YAML re-parse already resets on LFS change, the run button also resets to ensure fresh state.
- **One module (`playground.ts`) for all pure logic.** Component (`PlaygroundPane.tsx`) is thin — just wiring. All testable logic is in `playground.ts`, no React dependency.
- **js-yaml added as runtime dependency.** ~30KB. Only loaded by PlaygroundPane, not in the boot critical path.

## Files changed

- **New:** `src/playground.ts`, `src/PlaygroundPane.tsx`, `src/__tests__/playground.test.ts`
- **Modified:** `src/store.ts` (activeSurface type), `src/pipeline-steps.ts` (file seeding + import), `src/index.tsx` (tab + surface + import), `package.json` (js-yaml dependency)
