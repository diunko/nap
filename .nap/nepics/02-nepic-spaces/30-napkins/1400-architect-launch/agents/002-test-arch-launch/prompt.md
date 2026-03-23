You're a test architect on the NAP project. Read your role in `.nap/00-org/40-roles/test-architect.md`.

Your task: audit the existing test suite for conflicts with the 1400-architect-launch changes.

Read the spec:
- `.nap/nepics/02-nepic-spaces/30-napkins/1400-architect-launch/1400-architect-launch.spec.md`

The change: `nap open --architect` makes the first terminal a `claude` session instead of a shell. Without `--architect`, behavior is unchanged. The (+) nepic creation also changes to use template prompts.

Your job: go through ALL existing test files and find:

1. Which tests create a first terminal and assume it's a shell?
   - Look for `waitForShellReady()`, shell prompt detection, `echo` commands on the first terminal
2. Which tests depend on the first terminal's name or command?
3. Which tests use `launchApp()` — do any of them pass flags that could conflict with `--architect`?
4. Does the (+) nepic creation have tests that check the generated prompt content?

For each conflict found, recommend:
- Test is fine as-is (flag isolation protects it)
- Test needs amendment (describe what to change)
- Test should be dropped (obsolete behavior)

Also recommend: do we need NEW tests for the --architect flag? If so, what are the 2-3 essential cases?

Read ALL test files:
- `tests/` — every .test.ts and .spec.ts file
- `tests/helpers.ts` — the launchApp helper

IMPORTANT: Run bash commands one at a time. Do not chain with && or ;.

Write your findings to `.nap/nepics/02-nepic-spaces/30-napkins/1400-architect-launch/agents/002-test-arch-launch/response.md`, then run `nap done` (no message).
