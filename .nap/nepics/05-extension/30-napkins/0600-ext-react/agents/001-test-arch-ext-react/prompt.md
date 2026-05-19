Read your role: `.nap/00-org/40-roles/test-architect.md` — it tells you to read org docs. Do that first.

## Project context

Read all of these. They define what we're building, why, and what the approved design looks like.

- `.nap/nepics/05-extension/10-docs/02-app-ux.nap.md` — how nap works: navigation/map/territory, the comprehension problem, sidebar cards, Monaco editor, terminal, two-repo bridge
- `.nap/nepics/05-extension/10-docs/context/design-spec.nap.md` — approved design decisions
- `.nap/nepics/05-extension/10-docs/context/mock-e-screenshot.png` — what it should look like

## The feature

- `.nap/nepics/05-extension/30-napkins/0600-ext-react/0600-ext-react.nap.md` — what we're building
- `.nap/nepics/05-extension/30-napkins/0600-ext-react/0600-ext-react.spec.md` — constraints
- `.nap/nepics/05-extension/30-napkins/0600-ext-react/0600-ext-react.stories.md` — 15 user stories

## The architecture docs

- `.nap/nepics/05-extension/20-architects/001-architect/scratch/v0-components/01-app-architecture.nap.md` — how the app's data flows
- `.nap/nepics/05-extension/20-architects/001-architect/scratch/v0-components/04-extension-proposed.nap.md` — proposed extension architecture (React + Zustand, push data flow)
- `.nap/nepics/05-extension/20-architects/001-architect/scratch/v0-components/05-extension-contracts.nap.md` — extension-specific interfaces

## What you MUST read in the app

The extension is a port of the app's renderer. You need to understand how the app tests its behavior to design tests for the extension. Read these deeply:

**App source (understand what's being ported):**
- `packages/v3/src/renderer/store.ts` — state architecture, Tab, upsertTab, removeTab, all actions
- `packages/v3/src/renderer/Sidebar.tsx` — nav cards, dots, EntryTree, file clicks
- `packages/v3/src/renderer/ContentPane.tsx` — Monaco, auto-save, role decorations, link handling
- `packages/v3/src/renderer/TabBar.tsx` — tab rendering
- `packages/v3/src/renderer/content-link-provider.ts` — link detection

**App tests (understand what's already tested and how):**
- `packages/v3/tests/tabs-store.test.ts` — 12 store-level tab tests
- `packages/v3/tests/tabs.spec.ts` — 3 UI-level tab tests
- `packages/v3/tests/content-nav.spec.ts` — 6 navigation tests
- `packages/v3/tests/content-monaco.spec.ts` — Monaco integration
- `packages/v3/tests/session-persist.test.ts` — state persistence

**Existing extension tests (understand what was tested before):**
- `packages/extension/e2e/tests/ux-e2e.spec.ts` — the real user journey
- `packages/extension/e2e/tests/happy-path-debug.spec.ts` — basic integration
- `packages/extension/e2e/tests/lifecycle.spec.ts` — clone, nav, commit
- `packages/extension/e2e/tests/gap-tests.spec.ts` — seam coverage
- `packages/extension/e2e/tests/fixtures.ts` — Playwright fixture (PW_CHROMIUM_ATTACH_TO_OTHER, real side panel)
- `packages/extension/src/__tests__/` — vitest suites (nav-tree, link-routing, theme, role-palette, detectLinks)

## Your task

You own the test architecture for this rewrite. Not following instructions — owning it. Design the testing strategy that gives the fullstack engineer the best chance of building something that actually works.

Think about three things:

### 1. Debugging scenarios for the fs-eng

The fs-eng builds in phases (scaffold → store + rendering → wire surfaces → chrome plumbing). At each phase they need to verify the data flow pipeline is correct — not by eyeballing, but by running a Playwright test that exercises a scenario and reading the log trace.

Design these debugging scenarios. What should the fs-eng run after each phase? What log trace should they expect? These are not final tests — they're development-time verification. Think of them as the fs-eng's "did I wire this correctly?" checks.

The Playwright fixture already pipes browser console to test output via `panel.on('console', ...)`. The fs-eng will tag every state transition with `[store]`, `[adapter]`, `[model]`, etc. The debugging scenarios should describe: do X → expect to see Y in the log trace.

### 2. Integration tests (the backbone)

The push data flow (adapter emitter → model → store → React) is the architecture. If it works, everything works. If it breaks, everything breaks. Design integration tests that verify this chain end-to-end.

Study the app's tests — they show what matters. The app tests the store at the vitest level (tabs-store.test.ts) and the UI at the Playwright level (content-nav.spec.ts, tabs.spec.ts). The extension needs both layers.

But don't just list tests. Think about which tests catch real bugs vs which tests provide false confidence. The previous extension had 51 tests and was broken — because the tests bypassed user actions with `window.__` hooks. Don't repeat that mistake.

### 3. Story-driven tests

The 15 stories in the stories file describe what a user does. Some of these map directly to existing extension Playwright tests that can be adapted. Some need new tests. Some overlap with the integration tests.

Your job: decide which stories get their own test, which are covered by integration tests, and which are verified by the fs-eng's debugging scenarios (and don't need a separate test).

## What to produce

Write `0600-ext-react.test.md` in the napkin directory. Structure it however makes sense — you're the test architect, organize it the way that's most useful to the fs-eng and TE.

The fs-eng will read this before building. It shapes how they structure the code (what needs to be testable, what interfaces need to be exposed). The TE will read this after the build and implement the test cases you designed.

CRITICAL: when you are done, write your response to `.nap/nepics/05-extension/30-napkins/0600-ext-react/agents/001-test-arch-ext-react/response.md`, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
