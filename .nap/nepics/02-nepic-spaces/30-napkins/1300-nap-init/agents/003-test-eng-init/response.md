# 003-test-eng-init — Response

## Test file

`tests/nap-init/nap-init.test.ts` — 5 test cases, 10 test assertions total.

## Results

All pass. `npm run test:small` — 18 files, 140 passed, 1 skipped (pre-existing).

| Case | Description | Status |
|------|------------|--------|
| T-1300-01 | Happy path — full directory structure | pass |
| T-1300-02 | Guard — fails if .nap/ exists | pass |
| T-1300-03 | SQLite — schema and seed data (4 subtests) | pass |
| T-1300-04 | Skills flags (3 sub-cases) | pass |
| T-1300-05 | nap open — fails without .nap/ | pass |

## Implementation notes

- `runInit(tmpdir, ...flags)` helper spawns `node out/cli/cli/nap.js init` as child process
- Each test gets a fresh `mkdtempSync` dir, cleaned up in `afterEach`
- T-1300-03 queries SQLite via `sqlite3` CLI (`execFileSync`), no `better-sqlite3` import
- T-1300-04 `--user` sub-case overrides `HOME` env var to a separate temp dir, verifies skills land there and NOT in project `.claude/skills/`
- T-1300-05 passes tmpDir as positional arg to `nap open` to test against a dir with no `.nap/`

## Typecheck

`tsc --noEmit -p tests/tsconfig.json` — zero errors.

## No issues found

All 5 test cases implemented as designed. No untestable cases, no failures.
