You're the fullstack engineer for 0310-git-diff-cwd. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Read the feature docs (all in `.nap/nepics/04-books/30-napkins/0310-git-diff-cwd/`):
1. `0310-git-diff-cwd.nap.md`
2. `0310-git-diff-cwd.spec.md`
3. `0310-git-diff-cwd.test.md`

## The fix

In `packages/v3/src/main/main.ts`, find the `file:git-diff` IPC handler. It has two `execFile` calls:

1. `execFile('git', ['ls-files', '--error-unmatch', filePath], { cwd: projectCwd }, ...)`
2. `execFile('git', ['diff', '--unified=0', 'HEAD', '--', filePath], { cwd: projectCwd, ... }, ...)`

Change both `cwd: projectCwd` to `cwd: path.dirname(filePath)`. Import `path` if not already imported (it likely is — check the existing imports).

That's the entire fix. Two occurrences of `cwd: projectCwd` → `cwd: path.dirname(filePath)` in the git-diff handler.

Then write a small test in `packages/v3/tests/git-diff-cwd.test.ts` that verifies the cwd is derived from the file path, not hardcoded. You can test this by creating two temp dirs (simulating two git repos), initializing git in both, creating a file in each, and running the git diff logic against files in each repo.

Run `tsc --noEmit` and `npx vitest run tests/git-diff-cwd.test.ts` before you're done.

CRITICAL: when you are done, write your response to .nap/nepics/04-books/30-napkins/0310-git-diff-cwd/agents/001-fs-eng-git-cwd/response.md, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
