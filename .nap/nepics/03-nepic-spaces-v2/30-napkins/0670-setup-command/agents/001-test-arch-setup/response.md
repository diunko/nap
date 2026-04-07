# Test Architect Response — 0670 Setup Command

## Summary

30 test cases designed. 28 small, 2 medium.

## Seam analysis

The setup command is filesystem-only — no socket, no Electron, no pty. The critical seams are:

1. **--import marker correctness** — role inference regex, done detection from response.md, correct nepic/napkin slug wiring from directory paths. This is where most bugs will live.
2. **--guardian merge** — merging hook config into existing settings.json without destroying other settings. Most likely real-world bug.
3. **--import additive guarantee** — never modifying existing markers, never deleting. Hard to verify exhaustively but critical contract.
4. **--skills overwrite vs --guardian skip** — skills should overwrite (template update path), guardian should skip (idempotent). These are opposite behaviors on second run — easy to get backwards.

## What I didn't test

- **Renderer/UI integration with imported markers** — beyond the two medium tests, visual correctness of imported agents in sidebar/kanban is manual testing territory.
- **--import with corrupted markers** — if existing `.agent.nap.json` is malformed JSON, does import crash or skip? Could add a test but it's defensive coding, not a spec requirement.
- **Performance with hundreds of agents** — the walk-and-create logic should be fast but there's no spec requirement for performance bounds.

## Risks

- **Role inference regex**: the spec says "strip leading digits + hyphen" (`001-test-arch` → `test-arch`). But what about `01-two-digit`, `1-single`, or `no-prefix`? T-0670-26 covers the edge case explicitly.
- **Active nepic detection**: T-0670-25 tests that --guardian uses ui-state.json to find the active nepic. If setup doesn't read ui-state.json, it'll create guardian in the wrong place.
- **Import + guardian interaction**: T-0670-21 tests combined flags. If --guardian creates `002-guardian/` first, then --import runs, import should NOT create a duplicate marker for the guardian (it already has one from --guardian). Order of operations matters.

## File

Test cases written to `0670-setup-command.test.md`.
