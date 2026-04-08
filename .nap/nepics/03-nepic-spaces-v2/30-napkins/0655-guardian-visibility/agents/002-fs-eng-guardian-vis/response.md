## What was built

### Feature: guardian cross-load in `model.ts` (14 lines)

In `loadFromFilesystem`, after the nepic list is loaded (line ~372), added guardian cross-load logic:

1. Check if any loaded architect has `role === 'guardian'`
2. If not, take the first nepic from `nepicList`
3. If first nepic differs from active nepic, read its `20-architects/` using `loadAgents`
4. Find the guardian, apply ephemeral flags (running, done, pendingApproval), push to `architects[]`

Reuses `loadAgents` for clean directory reading — same entry/marker parsing as everything else. Ephemeral flags are applied inline so the cross-loaded guardian behaves identically to a local one.

### Test infrastructure

**Fixtures** (`fixtures.ts`):
- `createGuardianCrossLoadFixture` — 2 nepics, guardian in first only (the core case)
- `createGuardianBothNepicsFixture` — guardian in both nepics
- `createNoGuardianFixture` — neither nepic has guardian
- `createThreeNepicGuardianFixture` — 3 nepics, guardian in first only
- `F19_NEPIC_DIR` — points to second nepic for test loading

**Tests** (`guardian-visibility.test.ts`): 12 small tests covering T-0655-01 through T-0655-14 (excluding medium tests T-0655-09/15/16/17 which need Electron). TE fills in the rest.

### What passes

- All 298 tests pass (21 test files)
- `tsc --noEmit` clean
- No changes to existing code paths — the cross-load is additive, only runs when guardian is missing

### Decisions

- Used `loadAgents` (the shared helper) rather than duplicating the inline architect-loading loop. This gives us proper `entries` population (T-0655-13) and consistent marker parsing for free.
- Ephemeral flags applied directly to the cross-loaded guardian rather than relying on the earlier `getAllAgents()` loop, since that loop runs before `nepicList` is available.
- T-0655-09 (nepic switch) is testable at the model level but I left it for the TE since it exercises `switchNepic` which needs filesystem write support.
