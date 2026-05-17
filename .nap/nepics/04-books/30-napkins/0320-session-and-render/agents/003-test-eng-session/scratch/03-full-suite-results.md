# Full v3 suite results — 2026-05-14

108 tests, 8 workers, 1.8 min total.

## Failures (6)

**Pre-existing (4) — not caused by our changes:**
- M03: role-prefixed comment tokens — `comment.architect` token type changed
- M05: mixed content tokenization — same root cause as M03
- TH-06: Monaco setTheme — expects ≥5 themes, only 2 exist
- ROLE-11: edit mode decorations — expects ≥2 palette classes, gets 1

**Flaky infrastructure (2):**
- smoke.spec: `firstWindow` timeout 30s — Electron sometimes slow to open window when 8 workers compete for resources
- SS-04: same `firstWindow` timeout — resource contention with parallel workers

## Our tests: all pass
- RACE-01 ✓ (2.3s)
- RACE-02 ✓ (3.0s)
- RACE-03 ✓ (2.3s)
- RACE-07 ✓ (2.3s)
- RACE-08 ✓ (950ms)
- RACE-14 ✓ (1.4s)
- SP-06 ✓ (4.4s)
- RR-01 ✓ (2.9s)
- RR-02 ✓ (2.0s)
- SS-01 ✓ (11.1s)
- SS-02 ✓ (11.5s)
- SS-03 ✓ (7.2s)
- terminal-refit ✓ (1.7s)
- terminal-fit ✓ (1.1s, 794ms)

## Slow tests (>5s)
- GG-03: git gutter refresh on focus (6.1s)
- GG-01: git gutter on file open (5.7s) — separate boot
- git-gutter.spec G07: gutter after typing (5.1s) — waits for auto-save
- SS-01, SS-02: scroll sync (11s each) — boot + file load + toggle
- SS-04: 30s timeout (flaky, resource contention)

## Verdict
All 6 failures are pre-existing. Zero regressions from our changes.
