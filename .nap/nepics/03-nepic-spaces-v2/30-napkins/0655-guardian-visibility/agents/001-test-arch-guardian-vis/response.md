## Test architecture: 0655 guardian visibility

### The seam

`loadFromFilesystem` loads architects from the active nepic's `20-architects/`. Guardian lives in the first nepic. Switching nepics drops the guardian. The fix appends guardian from the first nepic when missing. The seam is: **active nepic dir ≠ first nepic dir during architect loading**.

### Test strategy

**17 test cases: 14 small, 3 medium.**

Small tests (vitest, model layer):
- T-01 through T-05: core cross-load logic (loaded from other nepic, no duplicate, no-op when absent, active takes precedence, empty nepicList guard)
- T-06: findAgentByRole finds cross-loaded guardian
- T-07–T-08: cross-loaded guardian survives reload + preserves ephemeral flags
- T-09: nepic switch preserves guardian in all directions
- T-10–T-11: nepicId and homePath point to home nepic, not active
- T-12: permission hook pokes cross-loaded guardian (socket + model + mq)
- T-13: guardian's entries populated (file tree reads)
- T-14: three nepics — always from first

Medium tests (Playwright + Electron):
- T-15: sidebar shows guardian dot after nepic switch
- T-16: guardian terminal accessible from non-home nepic
- T-17: full permission cycle works from non-home nepic

### Fixture needed

New fixture: `createMultiNepicGuardianFixture()` — two (or three) nepics with guardian in first nepic's `20-architects/002-guardian/`. Second nepic has only `001-architect`. Pattern follows `createMultiNepicFixture()` (F15) but adds guardian marker to first nepic.

### Risks flagged

1. **Ephemeral state restoration** — cross-loaded guardian gets a different agent object on reload. The `runningAgents` / `pendingApprovals` sets key on `agent.id`, so this works IF the ID survives reload. Verify in T-08.
2. **homePath construction** — must point to first nepic's physical directory, not relative to active nepic. Verify in T-11.
3. **nepicId defaulting** — if guardian marker has no `nepic` field, `loadAgents` defaults to `defaultNepicId` (= active nepic slug). The cross-load code must either read the marker's nepic field or force-set it to the first nepic's slug. Verify in T-10.
