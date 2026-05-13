# 0310 — spec

## What

Fix the `file:git-diff` IPC handler to use `dirname(filePath)` as cwd instead of `projectCwd`. This makes git gutter work when `.nap/` is a separate git repository.

## Constraint

In `src/main/main.ts`, the `file:git-diff` handler has two `execFile` calls (one for `git ls-files`, one for `git diff`). Both use `{ cwd: projectCwd }`. Change both to `{ cwd: path.dirname(filePath) }`.

No other files change. No UI changes. No store changes.
