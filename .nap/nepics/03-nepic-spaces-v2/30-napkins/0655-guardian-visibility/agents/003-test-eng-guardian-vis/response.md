## Test results: 0655 guardian visibility

### Summary

- **17 test cases from the TA spec**: 15 small implemented, 3 medium implemented
- **Small tests**: 15/15 pass (vitest)
- **Medium tests**: 3/3 pass (Playwright + Electron) — **but only after `npm run build`**
- **tsc --noEmit**: clean

### What was implemented

**Small tests** (`guardian-visibility.test.ts`):
- T-0655-01 through T-0655-08, T-0655-10, T-0655-11, T-0655-13, T-0655-14 — these existed from the FS engineer. All pass.
- **T-0655-09** (new): nepic switch — guardian visible before AND after switch, no duplication. Uses `model.switchNepic()`. Passes.
- **T-0655-12** (new): permission hook poke reaches cross-loaded guardian. Uses `createRequestHandler` + spy on `enqueue`. Verifies the poke message includes agent name, tool, and command. Passes.
- **NodeFileSystem isolation test** (new): same cross-load logic against real disk (not MemoryFileSystem). Proves the model code is correct with real filesystem. Passes.

**Medium tests** (`guardian-visibility.spec.ts`):
- **T-0655-15**: guardian visible in store after loading non-home nepic. Boots Electron with multi-nepic fixture, verifies model and store both contain cross-loaded guardian with correct nepicId and id.
- **T-0655-16**: guardian terminal selectable from non-home nepic. Sets guardian as active terminal via store action, verifies it's accessible.
- **T-0655-17**: full permission cycle with cross-loaded guardian. Sends `hook-permission-request` via socket, resolves via `permission-response`, verifies hook returns `{ decision: "allow" }`.

### Bug found and root-caused: stale build output

**Symptom**: all 15 small tests pass, but all 3 medium tests fail — the guardian never appears in the model inside the Electron app.

**Investigation trail**:
1. Medium tests fail: `model.getArchitects()` returns only the active nepic's architect, no guardian.
2. Filesystem confirmed correct: `01-v1/20-architects/002-guardian/.agent.nap.json` exists with `role: "guardian"`.
3. Model's `getNepics()` returns `[01-v1, 02-spaces]` — cross-load conditions ARE met.
4. Created a NodeFileSystem isolation test (vitest, real disk, same paths) — **passes**. The `loadFromFilesystem` logic is correct.
5. Even forcing `model.loadFromFilesystem(model.getNepicDir())` from `app.evaluate` inside Electron — still no guardian. The model code itself works, but not in this Electron process.
6. Checked `out/main/main.js` for cross-load code: **not present**. The compiled build output was stale — built before the FS engineer added the cross-load logic.

**Root cause**: the Electron app loads compiled JavaScript from `out/`, not TypeScript source. Vitest imports TypeScript directly via its transform pipeline. The `out/` directory was never rebuilt after the FS engineer's changes to `src/main/model.ts`. Running `npm run build` regenerates `out/`, and all medium tests pass.

**Fix**: `npm run build` before running medium tests. The FS engineer's response should note that the build step is required, or the build should be wired into a pre-test hook.

### Test infrastructure added

**Fixtures** (in `fixtures.ts` — already existed from FS engineer):
- `createGuardianCrossLoadFixture` — 2 nepics, guardian in first only
- `createGuardianBothNepicsFixture` — guardian in both nepics
- `createNoGuardianFixture` — neither nepic has guardian
- `createThreeNepicGuardianFixture` — 3 nepics, guardian in first only

**Medium test fixture** (in `guardian-visibility.spec.ts`):
- `F_GUARDIAN_MULTI` — real-filesystem fixture for multi-nepic Electron tests
- `createMultiNepicTestDir` — writes multi-nepic fixture to tmpDir (unlike `createTestNepicDir` which creates a single nepic)

### Manual test cases

None marked manual in the `.test.md`.
