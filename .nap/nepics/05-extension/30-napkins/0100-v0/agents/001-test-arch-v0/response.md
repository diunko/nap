# 001-test-arch-v0 — response

## Produced

`0100-v0.test.md` — 20 test cases across 8 seams.

## Key decisions

**Gate structure.** T1.1 (Monaco boots) gates everything. If CSP blocks workers, no amount of other testing matters. T2.1/T2.2 (LFS ↔ Monaco) gate the editor. The test priority section enforces this order.

**Two-repo link routing needs new code.** v3's `routeLink` resolves to filesystem paths. The extension needs a GitHub URL builder that maps file:line to `https://github.com/{owner}/{main-repo}/blob/{branch}/{path}#L{line}`. T5.1 tests this as pure logic (small). The {owner}/{repo} source is still TBD in the spec — flagging for the architect.

**Bidirectional LFS is the architecture test.** T3.1 + T3.2 together prove the single-instance contract. If editor writes and terminal reads from the same IDB, the architecture works. T3.2 (terminal → editor) has a subtlety: does Monaco reload from LFS when a tab re-activates, or only on first open? This is a design decision the fs-eng needs to make. The test is designed to surface it.

**Nav tree parser is small-testable.** The convention parsing (20-architects/, 30-napkins/, .napkin.nap.json status) is pure logic. T4.1 covers it in vitest without a browser.

**Panel lifecycle (T8.1) may need manual verification.** The chrome-extension:// URL workaround loses the side panel frame, so we can't test Chrome's side panel lifecycle behavior automatically. Documented as such.

## Risks surfaced

1. Monaco worker loading under extension CSP — the scariest unknown, first thing to prove
2. Editor model staleness — if file changes externally (terminal write), does Monaco know? Needs explicit refresh-on-focus or file watching
3. Two-repo URL construction — new logic not in v3, needs design before implementation
4. Nav tree refresh after clone — no filesystem watcher in LightningFS, needs explicit trigger

## What I did NOT test

- Visual layout (manual)
- Monaco internals (cursor movement, selection, undo)
- Shift-enter continuation logic (already proven in v3, small test of `detectLinePattern` is fine but not a seam)
- Auth/PAT flow (S11) — popup interaction, chrome.storage.sync, onAuth callback. This is plumbing, not a seam. Test manually.
