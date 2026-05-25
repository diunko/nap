# Test architect response — fixes-01

## What I produced

`fixes-01/fixes-01.test.md` — 27 test cases across 4 layers, targeting 4 seams.

## Architecture summary

**The central seam: Zustand → chrome.storage.sync migration.**

Every token read and write in the codebase moves from per-session Zustand to global chrome.storage.sync. Two things can break: tokens not read on boot (clone fails), or tokens not available after session switch (story FX2 regression). The tests attack both.

**4 layers:**

1. **Global debug flag** (4 vitest tests) — flag read/write, survival across sessions, settings toggle. Mock chrome.storage.sync.
2. **Global tokens** (7 vitest tests) — tokens read on boot, survive PR switch, pipeline steps read from global ref, removed from Zustand + PARTIALIZE. This is the highest-risk change.
3. **Error classification** (3 vitest + 1 Playwright) — statusCode precedence over message matching, network vs auth disambiguation, real GitLab error capture test.
4. **Inline token form** (7 vitest + 2 Playwright) — renderer dispatch by step name, provider labels, token-exists vs token-missing branching, save writes to chrome.storage.sync + auto-retry.

## Key design decisions

**Mock chrome.storage.sync in vitest.** Provided a reusable `createMockChromeStorage()` factory that tests share. Playwright uses real chrome.storage.sync.

**Token-exists vs token-missing branching (FX-S33).** When 401 fires AND a token is already set, the form should NOT appear — just show "check your token". This prevents confusion (user entered a token, why is the form showing again?). The form only appears when the token field is empty.

**Error classification: observe before coding (FX-P20).** The spec mandates the fs-eng writes a Playwright discovery test first, captures the real isomorphic-git error object from GitLab, THEN writes classification. FX-P20 is that test. It's not a regression test — it's a learning test.

## What changes in existing tests

- **workflow-wiring.test.ts**, **panel-boot.test.ts**: any test reading `store.getState().githubToken` needs update — field removed from store
- **pipeline-steps tests**: clone step reads from global ref, not store. Mock pattern changes.
- **LoadingGate tests**: extend with custom renderer tests. Default renderer unchanged.
- **Playwright settings tests**: settings writes chrome.storage.sync, not store. May need chrome.storage mock in fixtures.

## Execution order

1. FX-S15/S16 (tokens removed from store) — prove cleanup first
2. FX-S10..S14 (global tokens work) — new path
3. FX-P20 (real GitLab error) — observe before coding classification
4. FX-S20..S22 (error classification) — after observation
5. FX-S01..S04 (debug flag) — independent
6. FX-S30..S36 (inline form) — after tokens
7. FX-P30/P31 (Playwright integration) — last
