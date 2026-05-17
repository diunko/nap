# response2 — test-eng-v0

## All tests pass

### Small tests (vitest): 29/29 — 0.3s
- nav-tree.test.ts (11), link-routing.test.ts (14), theme.test.ts (4)

### Happy-path e2e (Playwright, real side panel): 9/9 — 20.8s
- test-0: real side panel opens
- test-1: Monaco boots in real panel
- test-2: terminal prompt
- test-3: terminal echo
- test-4: LFS → Monaco
- test-5: auto-save
- test-6: editor → terminal bidirectional
- test-7: theme CSS vars
- test-8: chrome.tabs.query returns github tab (production semantics)

### Lifecycle e2e (Playwright, real side panel + fixture repos): 4/4 — 20.3s
- **L1**: clone nap-test-nap → nav tree shows architects + napkins (doing/backlog) → open 01-copy-pipeline.md → editor shows `copy_document.ts:51` link
- **L2**: clone → open chapter → add `//DU: this looks fragile` → auto-save → `git status` modified → `git add .` → `git commit` → `git log` confirms
- **L3**: open chapter 01 → navigate to chapter 02 → verify `id_universe.ts:12` → navigate back to 01 → no state corruption
- **L6**: clone → close panel → reopen → IDB persists → nav tree repopulates without re-clone

**Total: 42 tests, 0 failures.**

## Coverage against test.md (20 seam tests)

| Case | Status | Covered by |
|---|---|---|
| T1.1 — Monaco boots, no CSP errors | ✅ | happy-path test-1 |
| T1.2 — tokenizer registered | ❌ | not tested in real runtime |
| T2.1 — LFS → Monaco model | ✅ | happy-path test-4 |
| T2.2 — edit → auto-save → LFS | ✅ | happy-path test-5 |
| T3.1 — editor → terminal | ✅ | happy-path test-6 |
| T3.2 — terminal → editor | ❌ | not tested (refresh-on-focus path) |
| T4.1 — directory convention parsing | ✅ | vitest nav-tree (6 tests) |
| T4.2 — numeric sort | ✅ | vitest nav-tree (3 tests) |
| T4.3 — nav tree reflects cloned repo | ✅ | lifecycle L1 |
| T5.1 — file:line → GitHub URL | ✅ | vitest link-routing (7 tests) |
| T5.2 — .md → openDoc (small) | ✅ | vitest link-routing (2 tests) |
| T5.2 — .md → opens in editor (medium) | ✅ | lifecycle L3 |
| T5.3 — https → external | ✅ | vitest link-routing (2 tests) |
| T5.4 — Cmd+click dispatches | ❌ | not tested (link provider action) |
| T6.1 — clone → nav tree | ✅ | lifecycle L1 |
| T6.2 — edit → git status modified | ✅ | lifecycle L2 |
| T6.3 — full commit cycle | ✅ | lifecycle L2 |
| T7.1 — CSS variable generation | ✅ | vitest theme (4 tests) |
| T7.2 — theme visually applied | ✅ | happy-path test-7 |
| T8.1 — panel survives / IDB persists | ✅ | lifecycle L6 |

**17/20 covered. 3 uncovered: T1.2, T3.2, T5.4.**

## Coverage against 0110-v0.tests.md (6 lifecycle tests)

| Case | Status | Notes |
|---|---|---|
| L1 — clone, read, file:line link | ✅ partial | Clone + nav tree + editor load all pass. File:line *click* → github tab navigation not tested (needs main-repo config wired + link action trigger). |
| L2 — edit, commit | ✅ complete | Full cycle: edit → auto-save → git status → add → commit → log |
| L3 — .md navigation loop | ✅ complete | ch01 → ch02 → ch01, content verified each step |
| L4 — tab reuse policy | ❌ | Single vs double click not tested. Open question from test plan. |
| L5 — panel survives browsing | ❌ | Main tab navigation during panel session not tested. |
| L6 — IDB persistence | ✅ complete | Close panel → reopen → IDB has repo → nav tree repopulates |

**4/6 covered. 2 uncovered: L4, L5.**

## What's still missing (5 items)

1. **T1.2 — tokenizer** — easy, ~10 lines: `monaco.editor.tokenize('# heading', 'napkin-markdown')` in real panel, assert token type.

2. **T3.2 — terminal → editor** — easy, ~15 lines: `echo "// note" >> file` via cmd(), click editor tab (triggers refresh-on-focus), check editorContent(). Same pattern as test-6 reversed.

3. **T5.4 / L1 file:line click** — medium, ~20 lines: trigger `editor.action.openLink` from panel, verify github tab navigates via `ghPage.waitForURL()`. Requires main-repo config to be set in the panel (currently only accessible via chrome.storage popup — need `window.__setMainRepoConfig()` test hook or `page.evaluate` to set it directly).

4. **L4 — tab reuse** — blocked on design question: is single-click-reuses / double-click-opens-new a v0 requirement? Monaco's double-click on links is non-trivial.

5. **L5 — panel survives browsing** — medium, ~15 lines: open panel → navigate ghPage to different URL → check panel editor content + nav tree still intact. The fixture supports this (real side panel stays alive during tab navigation). Worth trying.

## No code bugs found

All source code works as specified. The fs-eng's porting work (background.ts message handler, content.ts trigger button, fixtures.ts with PW_CHROMIUM_ATTACH_TO_OTHER) is clean. No test required fixes to prod code.

## Fixture repos confirmed working

- https://github.com/diunko/nap-test-main — code repo (never cloned, link target)
- https://github.com/diunko/nap-test-nap — .nap repo (cloned in tests, has chapters with file:line links)

Both repos clone successfully through CORS proxy in ~2s each.
