Read your role: `.nap/00-org/40-roles/fullstack-eng.md` — it tells you to read org docs. Do that first.

## Project context

- `.nap/nepics/05-extension/10-docs/02-app-ux.nap.md` — how nap works
- `.nap/nepics/05-extension/10-docs/ext-react/01-architecture.md` — package architecture
- `.nap/nepics/05-extension/10-docs/ext-react/02-data-flow.md` — push pipeline
- `.nap/nepics/05-extension/10-docs/ext-react/03-session-and-state.md` — keyed isolation
- `.nap/nepics/05-extension/10-docs/ext-react/04-testing.md` — testing strategy

## The feature

- `.nap/nepics/05-extension/30-napkins/0651-panel-boot/0651-panel-boot.nap.md`
- `.nap/nepics/05-extension/30-napkins/0651-panel-boot/0651-panel-boot.spec.md`
- `.nap/nepics/05-extension/30-napkins/0651-panel-boot/0651-panel-boot.stories.md`
- `.nap/nepics/05-extension/30-napkins/0651-panel-boot/0651-panel-boot.test.md` — TA test plan
- `.nap/nepics/05-extension/30-napkins/0651-panel-boot/scratch/00-components.nap.md` — component analysis

## What the previous napkin built (0650)

Read the fs-eng's response to understand what exists:
- `.nap/nepics/05-extension/30-napkins/0650-workflow-wiring/agents/002-fs-eng-workflow/response.md`

## Read the code

Before changing anything, read what's there:

- `packages/ext-react/src/index.tsx` — App + Panel (session management, message handling)
- `packages/ext-react/src/model.ts` — model (applyConfig, checkAutoClone, fetchLatest)
- `packages/ext-react/src/content.ts` — content script (to be trimmed)
- `packages/ext-react/src/store.ts` — store (activeSurface default to change)
- `packages/ext-react/src/ContentPane.tsx` — editor (has "no file open" placeholder)
- `packages/ext-react/src/url-config.ts` — pure URL parsing (stays, used by panel now)
- `packages/ext-react/src/link-routing.ts` — diff-aware routing
- `packages/ext-react/src/session.ts` — session factory

## Your task

This is a simplification. Net negative code. Five components:

1. **tab-url-reader** — `chrome.tabs.query` on mount in App, ~5 lines
2. **boot-gate** — component rendering loading → session | "no nap link" | "open on github"
3. **content-script-trim** — delete hash parsing, config messaging, SPA observer from content.ts
4. **refresh-pr-button** — re-read tab URL, update config, re-fetch diff ranges
5. **idle-pane** — activeSurface defaults to 'editor', show repo/branch when no file open, terminal hidden until clicked

Key changes to model.ts:
- Config is a constructor parameter, not a deferred `applyConfig` call
- `checkAutoClone` simplifies: config always present, two-way race (init/shell) not three-way
- New `refreshPr()` method: re-parse URL, update store config, invalidate + re-fetch diff ranges
- `applyConfig` method can be removed (or kept as internal)

Key changes to index.tsx:
- App reads tab URL via `chrome.tabs.query` on mount
- Gate component before SessionContext.Provider — nothing renders until config resolved
- Session created only after config known
- `__wipeCurrentSession__` console API already added (keep it)

Key changes to content.ts:
- Delete: parseAndSendConfig, hashchange listener, MutationObserver, get-nap-config handler
- Keep: navigate handler, trigger button, napLoaded marker

Link click fallback:
- ContentPane currently sends navigate via chrome.runtime.sendMessage to content script
- Add fallback: if sendMessage fails (content script absent), use chrome.tabs.update(tabId, { url })

Implement PB-S01, PB-S02, PB-M01, PB-M02, PB-M03 vitest tests as you build. Run existing tests to confirm regressions — the TA flagged that `activeSurface` default change breaks IM-02-DOM, IM-07-DOM, IM-08. Fix those.

Run `npm run test:small` after each phase. Run `npx playwright test` at the end.

Write response.md, then `nap3 done`.
