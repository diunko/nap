# Test engineer response 2 — monaco command

## Results

* **192 vitest (small) — all pass.** 14 test files, 0 regressions.
* **2 Playwright (medium) — all pass.** MC-M01, MC-M02.
* **Build — clean.** `vite build` succeeds.
* **Bugs found: 0.**

## Playwright tests implemented

| Test | Story | What it proves |
|---|---|---|
| MC-M01 | MC1 | `monaco playground.yaml` in terminal → surface switches to editor, new permanent tab (not ephemeral), tab bar shows filename, editor contains YAML content with `steps:` and `parse URL` |
| MC-M02 | MC4 | `monaco doesnt-exist.txt` → terminal shows `no such file` error with filename, no new tab created, surface stays on terminal |

## Story coverage

| Story | Covered by |
|---|---|
| MC1: open file by name | MC-M01 (Playwright) + MC-S01, MC-S07 (vitest) |
| MC2: relative path from repo dir | MC-S01, MC-S03 (vitest) — path resolution tested |
| MC3: absolute path | MC-S02 (vitest) |
| MC4: file doesn't exist | MC-M02 (Playwright) + MC-S04 (vitest) |
| MC5: --help | MC-S05 (vitest) |
| MC6: no args | MC-S06 (vitest) |

## What I verified

* Command registered with shell — `monaco` recognized and executed from terminal
* Path resolution uses `adapter.resolvePath(cwd, arg)` — handles relative, absolute, `..` paths (vitest MC-S01..S03)
* Existence check works — missing files return stderr with filename + "no such file", exitCode 1
* Store call order: `openDoc(path)` → `pinActiveEphemeral()` → `setActiveSurface('editor')` (vitest MC-S07)
* Tab is permanent after `monaco` — pinActiveEphemeral promotes the ephemeral tab created by openDoc
* Surface switches to editor after successful open
* No side effects on `--help` or no args — store methods not called

## Surprises

None. The fs-eng's implementation matches the test architecture exactly. The `defineCommand` + `adapter.resolvePath` + store call pattern is clean and testable.

## Files added

* `packages/ext-react/e2e/tests/mc-monaco-command.test.ts` — 2 Playwright tests (MC-M01, MC-M02)
