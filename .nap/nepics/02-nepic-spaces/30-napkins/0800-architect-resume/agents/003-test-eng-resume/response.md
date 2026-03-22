# 0800 — Architect Resume: Test Results

## Summary

All 12 test cases implemented. **All pass.** 9 small (vitest), 13 medium (Playwright) test assertions across 12 test IDs.

- `npm run test:small` — 123 passed, 1 skipped (9 new)
- `npm run test:medium` — 165 passed, 4 skipped (13 new)

## Bug Found and Fixed

**Orphaned terminals block `activeTerminalId` on relaunch.** When orphaned sessions are added to the renderer store before the shell terminal, `createTerminal`'s `isFirst` check is `false` (terminals array not empty), so `activeTerminalId` stays `null`. Additionally, restoring `savedState.activeTerminalId` that points to an orphaned terminal (no xterm) makes `waitForShellReady` hang forever.

**Root cause**: `index.tsx` startup adds orphaned terminals to the store before creating the shell, but `createTerminal` only activates the first terminal ever added.

**Fix** (in `src/renderer/index.tsx`):
1. Fallback: if no terminal is active after creating the shell, explicitly activate it
2. Skip orphaned terminals when restoring `activeTerminalId` (they have no xterm)

This also fixed pre-existing T-0700-05 and T-0700-07 which were broken by the 0800 implementation.

## Other Code Change

Added `resume: vi.fn()` to `tests/setup.ts` mock — the `pty.resume` API added in 0800 wasn't mocked, causing `resumeOrphanedTerminal` to throw in vitest.

## Test-by-Test Results

| ID | Size | Result | Notes |
|----|------|--------|-------|
| T-0800-01 | medium | pass | Needed nepic FK rows for `createSession` |
| T-0800-02 | medium | pass | Seeded db, verified live pty + resume data |
| T-0800-03 | medium | pass | NULL cc_session_uuid → fresh claude spawn |
| T-0800-04 | medium | pass | Bogus UUID exits fast, fallback respawns |
| T-0800-05 | medium | pass | Non-architect session → orphaned in renderer |
| T-0800-06 | small | pass | 9 assertions on dot helpers + store actions |
| T-0800-07 | medium | pass | Done architect ignored, running one resumed |
| T-0800-08 | medium | pass | Resumed architect becomes active terminal |
| T-0800-09 | medium | pass | resumeOrphanedTerminal clears flag, spawns pty |
| T-0800-10 | medium | pass | Only architect auto-resumed, others orphaned |
| T-0800-11 | medium | pass | Empty sessions → normal launch, no resume |
| T-0800-12 | medium | pass | Seeded architect + sidebar=false, all restored |

## Files Changed

| File | Change |
|------|--------|
| `tests/architect-resume/orphaned-dot.test.ts` | New — 9 small tests for T-0800-06 |
| `tests/architect-resume/architect-resume.spec.ts` | New — 13 medium tests for T-01–05, 07–12 |
| `tests/setup.ts` | Added `resume: vi.fn()` to pty mock |
| `src/renderer/index.tsx` | Bug fix: orphaned terminal activation fallback |

## Recommendation for Test Engineer Role Description

**Run failing tests in isolation, not the full suite on every iteration.** Use `--grep` or `:line` filters to target one test at a time. Only run the full suite once at the end. This is basic debug hygiene — waiting for 169 tests to finish when you're fixing one is pure waste. Suggest adding to `test-eng.md`:
> When a test fails, run only that test until it passes: `npx playwright test --grep "T-XXXX-YY"` or `vitest run --testPathPattern pattern`. Run the full suite once at the end to check for regressions.
