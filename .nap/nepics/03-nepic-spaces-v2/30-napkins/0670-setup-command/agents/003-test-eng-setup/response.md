# Test Engineer Response — 0670 Setup Command

## Summary

30 test cases from the TA's spec: 28 small, 2 medium. All implemented. All green.

- **273 small tests pass** (245 existing + 28 new for 0670)
- **45 medium tests pass** (43 existing + 2 new for 0670)
- **Zero type errors** (`tsc --noEmit`)

## What was implemented

### Small tests (28) — `packages/v3/tests/cli-setup.test.ts`

| Test | Description | Status |
|------|-------------|--------|
| T-0670-01 | Setup without .nap/ → error | PASS |
| T-0670-02 | --guardian creates agent dir + marker | PASS |
| T-0670-03 | --guardian copies prompt.md from template | PASS |
| T-0670-04 | --guardian writes settings.json with hook config | PASS |
| T-0670-05 | --guardian merges into existing settings.json | PASS |
| T-0670-06 | --guardian idempotent (second run no-op) | PASS |
| T-0670-07 | --skills copies napkin + napkin-format | PASS |
| T-0670-08 | --skills overwrites existing (canary removed) | PASS |
| T-0670-09 | --skills --user installs to ~/.claude/skills/ | PASS |
| T-0670-10 | --import creates napkin markers | PASS |
| T-0670-11 | --import skips napkins with existing markers | PASS |
| T-0670-12 | --import creates agent markers with correct fields | PASS |
| T-0670-13 | --import role inference (strips digits+hyphen) | PASS |
| T-0670-14 | --import detects done from response.md | PASS |
| T-0670-15 | --import skips empty agent dirs | PASS |
| T-0670-16 | --import skips agents with existing markers | PASS |
| T-0670-17 | --import creates architect markers (no napkin) | PASS |
| T-0670-18 | --import unique UUIDs per agent | PASS |
| T-0670-19 | --import walks multiple nepics | PASS |
| T-0670-20 | --import never deletes files | PASS |
| T-0670-21 | Combined flags (--guardian --skills --import) | PASS |
| T-0670-22 | No flags → usage/error | PASS |
| T-0670-23 | Agent with only response.md (no prompt.md) | PASS |
| T-0670-24 | init --guardian = setup --guardian (same logic) | PASS |
| T-0670-25 | Multi-nepic: guardian in active nepic | PASS |
| T-0670-26 | Role inference: no numeric prefix → full name | PASS |
| T-0670-29 | Deeply nested nepic structure | PASS |
| T-0670-30 | Timestamps monotonically increasing | PASS |

### Medium tests (2) — `packages/v3/tests/cli-setup.spec.ts`

| Test | Description | Status |
|------|-------------|--------|
| T-0670-27 | Imported project loads in Electron app | PASS |
| T-0670-28 | Guardian via setup works with permission hook | PASS |

## What I added

The FS engineer wrote 27 of the 28 small tests. I implemented:

1. **T-0670-09** — `--skills --user` installs to `~/.claude/skills/`. Backs up any existing global skills, verifies install targets global dir and NOT local `.claude/skills/`, then restores originals. Tricky test because it writes to the user's real home directory — cleanup logic handles all cases (skills existed before, didn't exist before).

2. **T-0670-27** (medium) — Creates a project manually (napkin dir + two agent dirs with prompt/response files, no markers), runs `setup --import`, launches Electron. Verifies store shows the imported napkin with status "backlog", both agents with correct roles, and done/not-done status matching response.md presence.

3. **T-0670-28** (medium) — Creates a project, runs `setup --guardian`, launches Electron. Marks agents as running, sends `hook-permission-request` via socket, verifies `pendingApproval` is set on the target agent (confirming the full hook flow works with a setup-installed guardian), then resolves via `permission-response` and confirms the hook connection gets `{ decision: "allow" }`.

## Bugs found

None. All 30 test cases pass against the FS engineer's implementation. The code correctly handles:

- Guard clause (no .nap/ → error)
- Guardian creation, merge, idempotency
- Skills copy, overwrite, global install
- Import: napkin/agent/architect markers, role inference, done detection, empty skip, additive guarantee
- Combined flags
- Edge cases (no prefix, deep nesting, timestamps)
- Medium: imported markers load into Electron model, guardian permission hook flow works end-to-end

## Manual tests

None marked manual in the TA spec.
