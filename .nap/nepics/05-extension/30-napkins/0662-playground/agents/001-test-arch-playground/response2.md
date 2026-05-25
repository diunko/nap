# Test architect response 2 — monaco command

## Delivered

`editor/editor.test.md` — 8 small tests + 2 medium tests.

## Design rationale

**This is a thin command.** The spec shows ~15 lines of real logic: parse args, resolve path, check exists, call three store methods. The interesting seams are few:

1. **Path resolution** (MC-S01..S03) — uses existing `resolvePath` from fs-adapter.ts. Tests confirm the command passes the right inputs. Not re-testing `normalizePath` itself.

2. **Error path** (MC-S04) — the "file doesn't exist" case. Must NOT open a tab. This is the only branch where behavior diverges.

3. **Three-call sequence** (MC-S07) — openDoc + pinActiveEphemeral + setActiveSurface. All three must happen, in order. Missing any one breaks a story (tab stays ephemeral, or surface doesn't switch).

**8 small tests is proportional.** The command follows the exact same pattern as git-command.ts. The small tests cover args parsing exhaustively (help, no args, relative, absolute, `..`, missing file, success return value). All run against mocked store + adapter — no browser needed.

**2 medium tests.** MC-M01 proves the real wiring: terminal command → editor tab with content. MC-M02 proves the error path renders in the terminal. That's it — the store actions themselves are already tested in IS-01.

## What the fullstack engineer should know

- Follow the `createGitCommand` pattern in git-command.ts — `defineCommand('monaco', async (args, ctx) => {...})`
- Use `adapter.resolvePath(ctx.cwd, args[0])` for path resolution — it already handles absolute vs relative and `..`
- The factory receives store + adapter (same injection pattern as git-command receives lfs)
- Return `{ stdout, stderr, exitCode }` — keep stderr messages in `monaco: <file>: <error>` format (Unix convention)
