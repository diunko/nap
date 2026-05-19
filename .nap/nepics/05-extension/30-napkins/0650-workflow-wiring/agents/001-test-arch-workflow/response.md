# test-architect response — 0650-workflow-wiring

## What I produced

`0650-workflow-wiring.test.md` in the napkin directory. 17 test cases across three tiers.

## Structure

- **7 small tests (WW-S01..S07):** pure logic in vitest — hash parsing, key derivation, clone URL, hunk range parsing, SHA256 anchors, routing decisions, prDiffRanges persistence
- **4 medium vitest tests (WW-M01..M04):** seams with mocks — content→panel message flow, auto-clone trigger, fetch latest sequence, GitHub API fetch→parse
- **7 medium Playwright tests (WW-P01..P07):** real browser — hash→session, auto-clone gate test, return visit, session switch, diff/blob link routing, fetch latest

## The gate test

WW-P02 (auto-clone on first visit) is the gate test. It proves the entire pipeline: hash parse → config message → session switch → auto-clone → nav populates → napkin focused. Stories W1, W2, W7, W8 all depend on this working. Run it first after building phases 1-3.

## Key design decisions

1. **Inside-out testing order.** Pure logic (S01-S06) first, then mocked seams (M01-M04), then real browser (P01-P07). The fs-eng builds incrementally and has a test to run at each phase.

2. **SHA256 golden test.** WW-S05 compares computed anchor against a real GitHub anchor from the fixture PR. This catches encoding mismatches that would silently break diff-view navigation.

3. **Separated routing decision from URL construction.** WW-S06 tests the decision logic (diff vs blob) independently from the URL builder. This makes the logic testable without crypto.subtle.

4. **Explicit debugging scenarios.** The test.md includes a "Debugging scenarios for the fs-eng" section with expected log traces for each build phase. This is how the fs-eng verifies wiring before moving on.

## Risks I flagged

- SHA256 anchor mismatch with GitHub (encoding)
- Content script timing (hash parse before panel opens)
- GitHub API `patch` format differs from `git diff --unified=0`
- `partialize` must include `prDiffRanges` for persistence
- GitHub SPA navigation may not fire `hashchange`

All have specific test cases that catch them.
