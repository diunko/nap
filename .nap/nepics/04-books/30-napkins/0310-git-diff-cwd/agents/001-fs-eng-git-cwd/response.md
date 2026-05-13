# 0310 — response

## What changed

**`packages/v3/src/main/main.ts`**

- Added `dirname` to the `path` import
- Changed `cwd: projectCwd` → `cwd: dirname(filePath)` in both `execFile` calls inside the `file:git-diff` IPC handler:
  1. `git ls-files --error-unmatch` call
  2. `git diff --unified=0 HEAD --` call

## Test

**`packages/v3/tests/git-diff-cwd.test.ts`** — 3 tests:

1. **T-01:** `git ls-files` resolves the correct repo when cwd is `dirname(filePath)` — creates two independent temp git repos, verifies both tracked files are found
2. **T-02:** `git diff` returns correct diff output per-repo — modifies committed files in both repos, verifies each diff contains the right content
3. **Cross-check:** Using the wrong repo's cwd fails `ls-files`, proving that cwd selection matters

## Verification

- `tsc --noEmit` — clean
- `npx vitest run tests/git-diff-cwd.test.ts` — 3/3 pass
