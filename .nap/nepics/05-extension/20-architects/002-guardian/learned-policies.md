# Learned Policies

## Known Agents & Roles

### test-eng (003-test-eng-*)
- **Always allow**: `NAP_TEST=1 npx playwright test ...` — any spec file, any --grep filter, any --timeout
- **Always allow**: `NAP_TEST=1 npx vitest ...` — small unit test runs
- **Always allow**: temp dir creation (`mktemp -d /tmp/nap-test-*`) + Electron diagnostic launches with cleanup
- **Always allow**: `rm` of temp diagnostic spec files they created (e.g. `*-debug.spec.ts`, `*-diag.spec.ts`)
- **Always allow**: `kill <pid>` for cleaning up stale Electron/test processes
- **Always allow**: `echo` for env var checks
- **Always allow**: read-only git commands (`git status`, `git diff --stat`)
- **Allow with note**: `sed` on `out/` build artifacts for debug logging injection (non-source, rebuild restores)
- **DENY**: hardcoded secrets/tokens in commands — must read from .env (incident: 003-test-eng-gitlab tried glpat token inline, denied, fixed on retry)
- **Watch for**: any `rm` of non-temp files, any git write operations (commit, push, reset)

### fs-eng (002-fs-eng-*)
- **Always allow**: `mkdir -p` within their scratch dir or project structure
- **Always allow**: read-only git commands
- **Watch for**: destructive operations outside their feature scope

### architect (001-architect)
- **Always allow**: `mkdir -p` for napkin/scratch directories
- **Always allow**: `cp` of screenshots/docs into `docs/`
- **Always allow**: read-only git commands
- **Always allow**: `nap3 poke` inter-agent communication (when relayed by other agents)
- **DENY**: any `rm` targeting `~/.claude/` or memory files — these belong to the user, not the project
- **DENY**: any read or write to `~/.claude/` — settings, memory, projects dirs are all off-limits
- **DENY**: any operation on files outside `.nap/` and project source that aren't read-only
- **Watch for**: any destructive operations, any direct code modifications
- **INCIDENT**: architect attempted to delete Claude Code memory files (2026-05-17). Both requests resolved before guardian could deny. Memory files were lost.

## General Policies
- Self-referential permission requests (from 002-guardian) are the hook catching this agent's own bash commands — ignore/auto-resolve
- Bare/empty commands (e.g. `cp` with no args) are harmless — allow
- Repeated identical commands are normal test-debug loops — allow without extra scrutiny
- Test engineers frequently retry the same command 2-4 times during debug cycles
