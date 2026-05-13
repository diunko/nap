You're the test architect for the 0100-content-pane feature. Read your role in `.nap/00-org/40-roles/test-architect.md` — every line matters.

Then read the org docs:
1. `.nap/00-org/10-promise.nap.md`
2. `.nap/00-org/20-workflow.nap.md`
3. `.nap/00-org/30-structure.nap.md`
4. `.nap/00-org/50-internals.md` — understand how the app, model, renderer, and pty system work

Read the feature docs:
1. `.nap/nepics/04-books/30-napkins/0100-content-pane/0100-content-pane.nap.md` — the napkin
2. `.nap/nepics/04-books/30-napkins/0100-content-pane/0100-content-pane.spec.md` — the spec
3. `.nap/nepics/04-books/30-napkins/0100-content-pane/0100-content-pane.stories.md` — user journeys

Read the existing test infrastructure to understand patterns:
- `packages/v3/tests/` — look at existing .test.ts and .spec.ts files to understand what's small vs medium
- `packages/v3/src/main/filesystem.ts` — MemoryFileSystem (used in small tests)
- `packages/v3/src/main/pty-spawner.ts` — FakePtySpawner (used in small tests)
- `packages/v3/src/main/bridge.ts` — FakeBridge (used in small tests)

Explore the codebase broadly. Understand the current renderer architecture (index.tsx, store.ts, Sidebar.tsx, Terminal.tsx) before designing tests.

## What to produce

Write `0100-content-pane.test.md` at:
`.nap/nepics/04-books/30-napkins/0100-content-pane/0100-content-pane.test.md`

Design strategic test cases for the three-pane layout + left content pane feature. Focus on:

- **Routing rules** (pure function, small tests) — file paths route to correct pane/surface
- **Store changes** (small tests) — activeFilePath + activeTerminalId independence
- **Monaco integration** (medium tests) — editor loads, tokenizer applies styles, file content displays
- **File watching** (small + medium) — external file changes update Monaco model
- **Layout** (medium tests) — three panes render, resize handles work
- **Nav routing** (medium tests) — sidebar clicks open correct pane

Each test case should specify: the flow being tested, subsystems involved, expected behavior, where it's likely to break, test size (small or medium), and verification method.

CRITICAL: when you are done, write your response to .nap/nepics/04-books/30-napkins/0100-content-pane/agents/001-test-arch-content/response.md, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
