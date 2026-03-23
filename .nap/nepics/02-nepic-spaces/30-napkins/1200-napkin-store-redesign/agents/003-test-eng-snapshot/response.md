## Results

- `npm run test:small` — 17 test files, 130 tests pass (1 skipped)
- `npm run test:medium` — 218 tests pass (4 skipped), 1.3m
- `tsc --noEmit` — zero errors (both src and tests tsconfigs)

## New test files

### tests/snapshot-redesign.test.ts (small, vitest + jsdom)

| Test | What it verifies |
|------|-----------------|
| T-1200-07 | store merges NapkinSnapshot preserving status — status before fs, fs before status, absPath set |
| T-1200-08 | deriveNapkinCards matches agents to terminals by index, renders status dots |
| T-1200-09 | [terminal] virtual entry only rendered for agents with terminalId (1 terminal → 1 [terminal], not 2) |
| T-1200-13 | kanban cards work with entries[] shape — badge derivation from file names, agent dots, column counts |
| T-1200-17 | napkinsBasePath removed — no property on store state, no setNapkinsBasePath action, NapkinEntry uses absPath+entries |

### tests/snapshot-redesign.spec.ts (medium, Playwright + Electron)

| Test | What it verifies |
|------|-----------------|
| T-1200-01 | readNapkinDir returns all files — random.txt, notes.log included as type='file' |
| T-1200-02 | absPath on every entry — snapshot.absPath absolute, all entries/nested files have correct absolute absPath |
| T-1200-03 | agents/ children promoted as NapkinAgentEntry with files[], agents/ dir absent from entries |
| T-1200-04 | non-agent subdirs captured as type='dir' with nested NapkinFileEntry |
| T-1200-05 | napkinBullets extracted from .nap.md — top-level only, nested excluded |
| T-1200-06 | empty napkin dir — entries=[], napkinBullets=[], absPath set |
| T-1200-10 | NapkinBrowser renders arbitrary files (random.txt, scratch.py) in focused view |
| T-1200-11 | extended view file rows have copy/open controls, copy writes entry.absPath to clipboard |
| T-1200-12 | agent files (prompt.md, response.md) render with copy/open controls in extended view |
| T-1200-15 | fs.watch — new non-agent subdir appears in store as type='dir' with nested files |
| T-1200-16 | full scan sends NapkinSnapshot array — entries[], absPath, napkinBullets on each |
| T-1200-18 | 40 napkins (5 files + 2 agents x 3 files + 1 subdir x 2 files each) scanned in <100ms |

## Already covered by existing updated tests

| T-1200 case | Covered by | Notes |
|-------------|-----------|-------|
| T-1200-01 | T-0500-01 | Already checks random.txt/notes.log included |
| T-1200-02 | T-0500-15 | Already checks absPath on every entry |
| T-1200-03 | T-0500-02 | Already checks agent names — new test adds files[] verification |
| T-1200-05 | T-0500-03 | Already checks bullet extraction |
| T-1200-06 | T-0500-12 | Already checks empty dir |
| T-1200-07 | store-merge.test.ts | Already tests status+fs merge in both orders |
| T-1200-13 | kanban-render.test.ts | Already tests badges, dots with new shape |
| T-1200-14 | T-0600-15 | Already tests arbitrary file via fs.watch |
| T-1200-16 | T-0500-06 | Already tests full scan NapkinSnapshot array |

I wrote the tests anyway to have explicit T-1200-* test IDs for traceability.

## Skipped tests (not applicable)

- T-1200-11 clipboard test: `navigator.clipboard.writeText` mocked inline in the test since Playwright Electron doesn't grant clipboard permission by default. The mock verifies the correct absPath is passed.

## Notes

- T-1200-18 performance: Date.now() used for timing (perf_hooks.performance.now() unavailable in bundled main process evaluate). Elapsed time consistently <100ms (typically 40-80ms).
- T-1200-09 is the critical seam test: one terminal → one [terminal] virtual entry. Agent B (no terminal) gets no [terminal]. Verified by counting `[terminal]` text nodes and checking per-agent parent elements.
