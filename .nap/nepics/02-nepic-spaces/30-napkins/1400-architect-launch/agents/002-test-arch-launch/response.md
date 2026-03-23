# 1400-architect-launch — Test Audit

## TL;DR

Flag isolation protects all existing tests. `launchApp()` never passes `--architect`, so every medium test still gets a shell as terminal[0]. One test needs amendment for the (+) template change. Three new tests are essential.

---

## Audit: existing test files

### 1. Tests that create a first terminal and assume it's a shell

Every medium test (Playwright+Electron) calls `launchApp()` or a local `launchIsolated()`. Both use `waitForShellReady()` which polls for non-empty xterm buffer output — works for both shell prompts and claude output. The following tests then write shell commands (`echo`, `seq`, `sleep`, `exit`, `tput`) to `terminals[0]`:

| File | Tests | Shell assumption |
|---|---|---|
| `tests/electron/terminal.spec.ts` | T-0100-01 through T-0100-07 | `echo hello`, `printf`, `sleep 999`, `exit`, `tput cols` on active terminal |
| `tests/multi-terminal/multi-terminal.spec.ts` | T-0200-01 through T-0200-06 | `seq`, `echo MARKER_*`, `exit` on `terminals[0]` |
| `tests/scroll-lock/scroll-lock.spec.ts` | T9–T20 | `seq 1 N`, `echo follow_recovery` on active terminal |
| `tests/cmd-w-close/close-active.spec.ts` | T-0700-08, T-0700-09 | Creates 2nd terminal, writes `exit` |
| `tests/socket-cli/socket-cli.spec.ts` | T-0300-05 | Writes `echo NAP_ID=$NAP_SESSION_ID` to first terminal |
| `tests/integration-stress/integration.spec.ts` | T-0500-01, T-0500-02 | Checks sessions list contains `shell` |
| `tests/poke-nap-done/poke-nap-done.spec.ts` | T-0400-* | Uses `waitForShellReady()`, but commands go to socket-started terminals |
| `tests/architect-resume/architect-resume.spec.ts` | T-0800-* | `waitForShellReady()`, checks `terminals[0].name === 'shell'` in T-0800-11 |

**Verdict: ALL FINE.** `launchApp()` does not pass `--architect`. Without the flag, behavior is unchanged per spec. Shell assumption holds.

### 2. Tests that depend on first terminal's name or command

| File | Test | Dependency |
|---|---|---|
| `tests/architect-resume/architect-resume.spec.ts` | T-0800-11 | Asserts `terminals[0].name === 'shell'` |
| `tests/integration-stress/integration.spec.ts` | T-0500-01 | Asserts `sessions.map(s => s.name)` contains `'shell'` |

**Verdict: FINE.** These tests launch without `--architect`, so the first terminal IS named `shell`. No conflict.

### 3. Tests that use `launchApp()` — flag conflicts?

`launchApp()` in `helpers.ts:27-34` passes: `[APP_DIR, '--cwd', tmpDir]`. No `--architect` flag.

Local variants (`launchIsolated()` in architect-resume, socket-cli, clean-quit, etc.) also never pass `--architect`.

**Verdict: FINE.** No flag conflicts.

### 4. (+) nepic creation tests that check generated prompt content

| File | Test | What it checks |
|---|---|---|
| `tests/nepic-creation/nepic-creation.spec.ts` | T-1000-09 | `prompt.md` exists, is non-empty, contains nepic name |

Currently `handleNepicCreate` writes a hardcoded prompt. The spec changes this to copy from `src/templates/nepic/20-architects/001-architect/prompt.md`.

**Verdict: NEEDS AMENDMENT.** The assertion `containsNepicName` checks that the prompt includes the nepic name (e.g., `'prompt-test'`). If the template is a static file that doesn't interpolate the nepic name, this assertion will fail. Two options:

- **If templates interpolate** (e.g., `{{name}}` → `prompt-test`): test is fine as-is
- **If templates are static** (no interpolation): drop the `containsNepicName` assertion, or update it to check for template-specific content instead

---

## Summary per test

| Test | Verdict | Reason |
|---|---|---|
| `electron/terminal.spec.ts` | Fine as-is | Flag isolation — no `--architect` |
| `multi-terminal/multi-terminal.spec.ts` | Fine as-is | Flag isolation |
| `scroll-lock/scroll-lock.spec.ts` | Fine as-is | Flag isolation |
| `cmd-w-close/close-active.spec.ts` | Fine as-is | Flag isolation |
| `cmd-w-close/close-active.test.ts` | Fine as-is | Small test, pure store logic |
| `socket-cli/socket-cli.spec.ts` | Fine as-is | Flag isolation |
| `socket-cli/ndjson.test.ts` | Fine as-is | Small test, no Electron |
| `socket-cli/cli-not-running.test.ts` | Fine as-is | Small test, no Electron |
| `socket-cli/name-resolver.test.ts` | Fine as-is | Small test, no Electron |
| `sqlite-setup.spec.ts` | Fine as-is | Flag isolation, tests store/UI state |
| `clean-quit.spec.ts` | Fine as-is | Flag isolation |
| `integration-stress/integration.spec.ts` | Fine as-is | Flag isolation; `shell` name still valid |
| `integration-stress/stress.spec.ts` | Fine as-is | Flag isolation |
| `architect-resume/architect-resume.spec.ts` | Fine as-is | Flag isolation; T-0800-11 `shell` name valid |
| `architect-resume/orphaned-dot.test.ts` | Fine as-is | Small test, pure store logic |
| `reconciliation/reconciliation.spec.ts` | Fine as-is | Tests SQLite reconciliation, no terminal assumptions |
| `poke-nap-done/poke-nap-done.spec.ts` | Fine as-is | Flag isolation |
| `poke-nap-done/done-no-session.test.ts` | Fine as-is | Small test |
| `nepic-creation/nepic-creation.spec.ts` | **Needs amendment** | T-1000-09: `containsNepicName` may fail if template is static |
| `nepic-switching/nepic-switching.spec.ts` | Fine as-is | Tests SQLite/store, no first-terminal shell assumption |
| `live-wiring/*.test.ts` | Fine as-is | Small tests |
| `live-wiring/live-wiring.spec.ts` | Fine as-is | Flag isolation |
| `polish/*.spec.ts` | Fine as-is | Small/medium, no first-terminal assumption |
| `napkin-watcher.spec.ts` | Fine as-is | Flag isolation |
| `snapshot-redesign.*` | Fine as-is | Layout tests |
| `layout-mock.*` | Fine as-is | Layout tests |
| `status-api.*` | Fine as-is | API tests |
| `inject-session-id.test.ts` | Fine as-is | Small test |
| `multi-terminal/store-registry.test.ts` | Fine as-is | Small test |
| `nap-init/nap-init.test.ts` | Fine as-is | CLI test, no Electron |

---

## T-1000-09 amendment

```
Current assertion:
  expect(result.containsNepicName).toBe(true);

If template is static (no interpolation):
  - Remove containsNepicName check
  - Add: expect(result.content).toContain('read') — verify it's a real prompt template
  - Or: check content length > some threshold (e.g., 50 chars)

If template interpolates {{name}}:
  - No change needed
```

---

## New tests for --architect

### Essential cases (3)

**1. T-1400-01: `--architect` spawns claude as first terminal (medium)**

- What: launch with `--architect` flag, verify first terminal is a claude session
- Subsystems: argv parsing → SQLite lookup → pty spawn
- Expected: `terminals[0].name` starts with `[Architect]`, pty command includes `claude`
- Where it breaks: argv parsing misses the flag, getArchitectForNepic returns null, command construction
- Verification: `app.evaluate()` to check terminal name and live pty ID; assert name matches `[Architect]` pattern
- Requires: pre-seeded SQLite with nepic + architect session (same pattern as architect-resume tests)

**2. T-1400-02: `--architect` with no architect session falls back to shell (medium)**

- What: launch with `--architect` but empty SQLite (no sessions), verify fallback
- Subsystems: argv parsing → SQLite lookup (miss) → fallback to shell
- Expected: first terminal is `shell`, warning logged
- Where it breaks: missing fallback path, crash on null architect session
- Verification: `terminals[0].name === 'shell'`, check console for warning log

**3. T-1400-03: `nap open` without `--architect` still spawns shell — regression guard (medium)**

- What: launch WITHOUT `--architect` (default), verify first terminal is shell
- Subsystems: argv parsing → no flag → default behavior
- Expected: `terminals[0].name === 'shell'`, no claude process
- Where it breaks: accidental default-to-architect if flag parsing has a bug
- Verification: same as T-0800-11 but explicitly scoped as regression guard for 1400
- Note: T-0800-11 already covers this implicitly, but an explicit regression test is cheap insurance
