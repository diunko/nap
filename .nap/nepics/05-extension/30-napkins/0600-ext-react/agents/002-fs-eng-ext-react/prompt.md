Read your role: `.nap/00-org/40-roles/fullstack-eng.md` — it tells you to read org docs. Do that first.

## Project context

Read all of these before touching any code.

- `.nap/nepics/05-extension/10-docs/02-app-ux.nap.md` — how nap works: navigation/map/territory, the comprehension problem, sidebar cards, Monaco editor, terminal, two-repo bridge
- `.nap/nepics/05-extension/10-docs/context/design-spec.nap.md` — approved design decisions
- `.nap/nepics/05-extension/10-docs/context/mock-e-screenshot.png` — what it should look like
- `.nap/nepics/05-extension/10-docs/context/02-workflow.nap.md` — reviewer workflow

## The feature

- `.nap/nepics/05-extension/30-napkins/0600-ext-react/0600-ext-react.nap.md` — what to build
- `.nap/nepics/05-extension/30-napkins/0600-ext-react/0600-ext-react.spec.md` — constraints
- `.nap/nepics/05-extension/30-napkins/0600-ext-react/0600-ext-react.stories.md` — 15 user stories

## The architecture

- `.nap/nepics/05-extension/20-architects/001-architect/scratch/v0-components/01-app-architecture.nap.md` — how the app's data flows
- `.nap/nepics/05-extension/20-architects/001-architect/scratch/v0-components/04-extension-proposed.nap.md` — proposed extension architecture
- `.nap/nepics/05-extension/20-architects/001-architect/scratch/v0-components/05-extension-contracts.nap.md` — extension-specific interfaces

## The test architecture

- `.nap/nepics/05-extension/30-napkins/0600-ext-react/0600-ext-react.test.md` — test plan from the test architect. Read this BEFORE building — it defines design constraints your code must satisfy (adapter emitter, model as separate layer, echo suppression pattern, tagged logging).
- `.nap/nepics/05-extension/30-napkins/0600-ext-react/agents/001-test-arch-ext-react/response.md` — TA's reasoning

## CRITICAL: Read the app source deeply before building

You are porting the app's renderer to a Chrome extension. You cannot port what you don't understand. Read these files yourself — not summaries, not agent reports, the actual source code line by line:

**App renderer (what you're porting):**
- `packages/v3/src/renderer/store.ts` (635 lines) — the state architecture. Understand upsertTab, removeTab, openDoc, closeTab, pinTab, saveTabScroll, applySnapshot, per-nepic memory. This is what your store.ts is based on.
- `packages/v3/src/renderer/Sidebar.tsx` (745 lines) — NapkinCard, ArchitectCard, EntryTree (recursive, maxDepth, sort order), FileRow (the `*` bullet at 10px), AgentDot (SVG checkmark, role colors). This is what your Sidebar.tsx is based on.
- `packages/v3/src/renderer/ContentPane.tsx` (677 lines) — Monaco creation config, auto-save with echo suppression (suppressExternalRef), refreshRoleDecorations (deltaDecorations with roleDecoClass), onMouseDown link click handling (three regex types), file loading lifecycle. This is what your ContentPane.tsx is based on.
- `packages/v3/src/renderer/TabBar.tsx` (97 lines) — stateless component. Copy this nearly verbatim.
- `packages/v3/src/renderer/content-link-provider.ts` (149 lines) — detectLinks, nap-link:// protocol, handleLinkClick.
- `packages/v3/src/renderer/index.tsx` (281 lines) — layout, keyboard shortcuts, IPC wiring.
- `packages/v3/src/renderer/role-palette.ts` (77 lines) — role decoration classes.

**App tests (understand what behaviors matter):**
- `packages/v3/tests/tabs-store.test.ts` (255 lines) — your store vitest should pass the same cases
- `packages/v3/tests/content-nav.spec.ts` (325 lines) — navigation behavior patterns
- `packages/v3/tests/tabs.spec.ts` (229 lines) — UI tab behavior

**App main process (understand the data flow you're replacing):**
- `packages/v3/src/main/model.ts` — first 160 lines (interface, serialize queue, notify pattern)
- `packages/v3/src/main/main.ts` — lines 100-113 (model.onChange → snapshot → renderer)

Don't limit yourself to these files. Follow imports. If store.ts imports from bridge-types.ts, read it. If Sidebar.tsx uses dot-style.ts, read it. If you see a pattern you don't understand, find where it's used. Spend the tokens — deep understanding now prevents weeks of debugging later.

**Existing extension code (understand what's proven and reusable):**
- `packages/extension/src/` — all I/O modules you're copying (fs-adapter, git-command, shell, nav-tree, etc.)
- `packages/extension/e2e/tests/fixtures.ts` — the Playwright fixture pattern you're porting
- `packages/extension/manifest.json` — CSP and permissions (keep these exact values)

## Your task

Build `packages/ext-react/` — a new Chrome extension that replaces `packages/extension/`. React + Zustand, same stack as the app. Port the app's components, wire LightningFS underneath.

Build in 4 phases. At each phase, run the debugging scenarios from the test.md (Part 1) to verify the pipeline before moving on. Log every state transition with tagged prefixes. Read the console trace. If the trace doesn't match expectations, fix it before proceeding.

**Phase 1: Scaffold**
- packages/ext-react/ with React, Zustand, Vite, TypeScript
- Copy I/O modules from packages/extension/src/
- Copy manifest.json, background.ts, content.ts
- Build succeeds, extension loads in Chrome

**Phase 2: Store + basic rendering**
- Port store.ts from app (Tab, upsertTab, removeTab, openDoc, closeTab, pinTab, expandCard, activeSurface)
- Port index.tsx with layout, TabBar.tsx
- Stub Sidebar, ContentPane, TerminalPane
- Write IS-01 through IS-03 vitest suites (store tests)
- Run DS-P2-01, DS-P2-02 debugging scenarios

**Phase 3: Wire surfaces**
- Port ContentPane (Monaco, auto-save, role decorations, link clicks)
- Port TerminalPane (wterm, dark theme)
- Port Sidebar (cards, dots, EntryTree, file clicks)
- Add adapter event emitter + model layer (separate from store)
- Write IS-04, IS-05 vitest suites (adapter emitter, model debounce)
- Run DS-P3-01 through DS-P3-04 debugging scenarios

**Phase 4: Chrome plumbing**
- Settings overlay, zoom (Ctrl+Shift+/-), link navigation (chrome.tabs.update)
- Write IS-07 vitest (persistence)
- Run DS-P4-01, DS-P4-02 debugging scenarios
- Port Playwright fixture (PW_CHROMIUM_ATTACH_TO_OTHER=1, openSidePanel helper)
- Write IM-01 (clone → nav auto-populates) as the gate test

When IM-01 passes, write response.md and signal done. The TE will implement the remaining Playwright tests (IM-02 through IM-08).

CRITICAL: when you are done, write your response to `.nap/nepics/05-extension/30-napkins/0600-ext-react/agents/002-fs-eng-ext-react/response.md`, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
