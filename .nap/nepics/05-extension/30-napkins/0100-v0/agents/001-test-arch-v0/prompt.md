You're the test architect for the Chrome extension v0. Read your role in `.nap/00-org/40-roles/test-architect.md` — every line matters.

## Required reading

1. `.nap/00-org/10-promise.nap.md` — why we work this way
2. `.nap/00-org/20-workflow.nap.md` — the pipeline
3. `.nap/00-org/30-structure.nap.md` — directory layout

Then read the feature:

4. `.nap/nepics/05-extension/30-napkins/0100-v0/0100-v0.nap.md` — the napkin (full v0 scope)
5. `.nap/nepics/05-extension/30-napkins/0100-v0/0100-v0.spec.md` — constraints the implementer can't derive
6. `.nap/nepics/05-extension/30-napkins/0100-v0/0100-v0.stories.md` — 13 scenarios defining "working"

## Context you need

This is a Chrome extension (Manifest V3) with a side panel containing three surfaces:

- **Terminal** — wterm + just-bash + lightning-fs + isomorphic-git (proven in packages/bash-poc/, 16 passing Playwright tests)
- **Editor** — Monaco with napkin-markdown tokenizer (UNPROVEN in extension context)
- **Nav tree** — reads from shared LightningFS, maps .nap directory conventions to nap.app-style navigation

The key technical risk is Monaco running in a Chrome extension side panel (CSP + worker loading). The key architectural risk is the shared LightningFS instance — one IDB store, three consumers.

Read the working POC and its tests to understand what's already proven:

7. `packages/bash-poc/src/main.ts` — how LightningFS, shell, and terminal wire together
8. `packages/bash-poc/src/fs-adapter.ts` — LightningFS → IFileSystem adapter
9. `packages/bash-poc/src/git-command.ts` — isomorphic-git wrapper
10. `packages/bash-poc/src/shell.ts` — BashShell fork with fs passthrough
11. `packages/bash-poc/e2e/tests/terminal.spec.ts` — 16 Playwright tests (test patterns to extend)

Also read the v3 code that will be copied (not imported) into the extension:

12. `packages/v3/src/renderer/napkin-markdown.ts` — tokenizer + shift-enter
13. `packages/v3/src/renderer/themes.ts` — lightBlue theme (the only theme for v0)
14. `packages/v3/src/renderer/routing-rules.ts` — link classification patterns

## What to produce

Write `0100-v0.test.md` in the napkin directory:
`.nap/nepics/05-extension/30-napkins/0100-v0/0100-v0.test.md`

Design strategic test cases focused on the seams — not unit tests for obvious things. The big seams are:

1. **Monaco ↔ extension sandbox** — does Monaco boot? Do workers load? CSP?
2. **Monaco ↔ LightningFS** — read file → model, edit → auto-save → file written
3. **Terminal ↔ LightningFS ↔ Editor** — bidirectional sharing (editor write → terminal reads, terminal write → editor reads)
4. **Nav tree ↔ LightningFS** — directory conventions parsed correctly, reflects cloned repo
5. **Link routing** — file:line → GitHub URL (different repo!), .md → editor, https → new tab
6. **Git flow** — clone → nav tree populates, edit → status shows modified, commit → log shows it

For each test case specify: the flow, subsystems involved, expected behavior, where it's likely to break, test size (small or medium), and verification method.

**Test sizes for this feature:**
- **Small tests** (vitest): link URL construction, nav tree convention parsing, theme CSS variable generation — pure logic, no browser
- **Medium tests** (Playwright + Chrome with --load-extension): everything that needs the real extension runtime — Monaco in the side panel, terminal, LightningFS, git operations

The bash-poc Playwright tests use a `cmd()` helper with prompt-counting for reliable terminal assertions. Extend this pattern. Study `packages/bash-poc/e2e/tests/terminal.spec.ts` for the approach.

CRITICAL: when you are done, write your response to `.nap/nepics/05-extension/30-napkins/0100-v0/agents/001-test-arch-v0/response.md`, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
