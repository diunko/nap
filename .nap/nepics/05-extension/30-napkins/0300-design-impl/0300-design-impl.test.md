# design impl — test migration plan

## inventory: 48 tests, three categories

### A. pure logic — untouched (29 tests)

These test exported functions with no DOM, no browser, no selectors. The UI redesign does not affect them at all.

**nav-tree.test.ts** (11 tests)
- `numericPrefix` — extracts leading digits, Infinity for none
- `sortByPrefix` — numeric sort, mixed digit lengths, numeric-vs-string edge
- `parseNavTree` — four section types, architect structure, napkin status labels, napkin sort order, agents nested under napkin, missing .napkin.nap.json

**link-routing.test.ts** (14 tests)
- `parseLinkHref` — #L anchor, :line suffix, bare path
- `buildGitHubUrl` — correct URL, strip slash, bare path, placeholder defaults, .ts/.tsx
- `routeLink .md` — relative sibling, path separator
- `routeLink external` — https://, http://
- `routeLink code` — .ts → GitHub URL, .tsx with :line

**theme.test.ts** (4 tests)
- `shellToCssVars` — CSS variable names, count, --nap- prefix
- `camelToKebab` — multi-word keys

**Migration action: none.** These run in vitest with mocked I/O. Don't touch them.

---

### B. DOM-dependent but stable selectors — minor updates (15 tests)

These are Playwright tests that interact with elements whose IDs/classes survive the redesign. The selectors they use (`#app`, `.monaco-editor`, `.wterm`, `.tab[data-tab="..."]`, `#settings-*`, `window.__*` hooks) exist in both old and mock-e layouts.

**happy-path-debug.spec.ts** (9 tests)

| Test | Selectors used | Changes needed |
|---|---|---|
| test-0: real side panel opens | `#app` | none |
| test-1: Monaco boots | `.monaco-editor`, `.tab[data-tab="editor"]` | none |
| test-2: terminal prompt | `.wterm` | none |
| test-3: terminal echo | `.wterm` | none |
| test-4: LFS → Monaco | `.monaco-editor`, `window.__lfs/openFile/editor` | none |
| test-5: auto-save | `.monaco-editor`, `window.__lfs/openFile/editor` | none |
| test-6: editor ↔ terminal | `.wterm`, `.monaco-editor`, `.tab[data-tab="terminal"]` | none |
| test-7: theme CSS vars | `.monaco-editor`, `--nap-bg` CSS var | none |
| test-8: chrome.tabs.query | `#app` | none |

**gap-tests.spec.ts** (4 of 5 tests)

| Test | Selectors used | Changes needed |
|---|---|---|
| T1.2: tokenizer | `.monaco-editor`, `window.__monaco` | none |
| T3.2: refresh-on-focus | `.wterm`, `.monaco-editor`, `.tab[data-tab="*"]` | none |
| T5.4: file:line → github | `.monaco-editor`, `window.__setMainRepoConfig`, `cmdClickLink` | none |
| L4: code links reuse tab | `.monaco-editor`, `window.__setMainRepoConfig`, `cmdClickLink` | none |

**lifecycle.spec.ts** (2 of 4 tests)

| Test | Selectors used | Changes needed |
|---|---|---|
| L2: edit, commit, verify | `.wterm`, `.tab[data-tab="terminal"]` | none |
| L3: navigate .md links | `.wterm` | none |

**Migration action: verify they still pass after the layout swap.** The selectors are stable but the DOM order changes (main is now left, nav is right). No selector edits expected, but run them to confirm.

---

### C. DOM-dependent with breaking selectors — needs updating (4 tests)

These tests use nav tree selectors or `#nav-tree` in ways that break when the flat-list rendering is replaced with the card system.

#### C1: tests that read `#nav-tree` text content (3 tests)

| Test | File | What it does | What breaks |
|---|---|---|---|
| L1 | lifecycle.spec.ts | `panel.locator('#nav-tree').textContent()` — checks `contains('napkins')` | **Maybe safe.** If `#nav-tree` id is preserved (or becomes `#nav-scroll`) and the rendered card system still contains the word "napkins", this works. But the rendering changes from flat `.nav-section-header` to `.napkin-card .card-header` — the text might no longer contain the literal string "napkins" if cards show napkin *names* instead of the section label. |
| L5 | gap-tests.spec.ts | Same `#nav-tree` textContent check | Same issue as L1 |
| L6 | lifecycle.spec.ts | Same `#nav-tree` textContent check | Same issue as L1 |

**Migration action:**
- Keep `#nav-tree` as the id for the nav tree container (or alias it inside `#nav-scroll`)
- The card system renders napkin names like "0100-delivery-pipeline" and "feature" — verify that the textContent check (`contains('napkins')` or similar) still matches, or update the assertion to match card content (e.g. `contains('delivery-pipeline')`)
- These are low-risk — the assertion is loose (just checking non-empty + contains a keyword)

#### C2: UX E2E with nav tree interaction (1 test)

| Test | File | What it does | What breaks |
|---|---|---|---|
| E2E-UX-1 | ux-e2e.spec.ts | Full user journey: settings → clone → nav tree → click chapter → editor → link → github | **Multiple selectors break** |

**Detailed selector migration for E2E-UX-1:**

| Line | Old selector | Purpose | New selector (mock-e) |
|---|---|---|---|
| 59 | `#settings-btn` | open settings | `#settings-btn` (moves to `#header` but id stays) — **safe** |
| 61 | `#main-repo-input` | fill repo | `#main-repo-input` — **safe** |
| 62 | `#main-branch-input` | fill branch | `#main-branch-input` — **safe** |
| 63 | `#settings-save` | save | `#settings-save` — **safe** |
| 67 | `#settings-overlay` | verify closed | `#settings-overlay` — **safe** |
| 78 | `#nav-tree` | wait for non-empty | keep id or change to `#nav-scroll` — **low risk** |
| 88 | `.nav-entry.expandable` hasText 'feature' | expand napkin | **BREAKS** → `.napkin-card .card-header` or `.napkin-card` hasText 'feature' |
| 91 | `.expanded` class check | is already expanded? | **BREAKS** → `.napkin-card.focused` (mock-e uses "focused" not "expanded") |
| 100 | `.nav-file` hasText '01-copy-pipeline.md' | click chapter | **BREAKS** → `.file-row` hasText '01-copy-pipeline.md' or `.file-row .fname` hasText |
| 108 | `.tab[data-tab="editor"]` | verify active | **safe** |

**Migration action for E2E-UX-1:**
1. Replace `.nav-entry.expandable` → `.napkin-card` (the card is the clickable container)
2. Replace `.expanded` check → `.focused` check (mock-e terminology)
3. Replace `.nav-file` → `.file-row` (mock-e uses file-row class with `*` bullet + fname)
4. Verify `#nav-tree` or rename to `#nav-scroll`
5. The click-to-focus behavior changes: old = expand/collapse children; new = focus card (shows body, blue accent border). The test logic (click header → children visible → click file) stays the same, just different class names.

---

## selector migration table (complete)

| Old (side-panel.html) | New (mock-e) | Used by tests | Action |
|---|---|---|---|
| `#app` | `#app` | test-0, test-8 | none |
| `#nav` | `#nav` (now right side) | — | none |
| `#nav-tree` | `#nav-scroll` (or keep `#nav-tree` as child) | L1, L5, L6, UX-E2E | keep id or add alias |
| `#nav-empty` | keep or adapt | — | not tested directly |
| `#resize-handle` | `#nav-drag` (on nav's left edge) | — | not tested directly |
| `#main` | `#main` (now left side) | — | none |
| `#tab-bar` | `#tab-bar` | — | none |
| `.tab[data-tab="editor"]` | `.tab[data-tab="editor"]` | test-1, T3.2, UX-E2E | none |
| `.tab[data-tab="terminal"]` | `.tab[data-tab="terminal"]` | test-6, L2, T3.2 | none |
| `#content` | `#content` | — | none |
| `#editor-surface` | `#editor-surface` | — | none |
| `#terminal-surface` | `#terminal-surface` | — | none |
| `.monaco-editor` | `.monaco-editor` (Monaco-generated) | test-1,4,5,6,7, T1.2, T3.2, T5.4, L4, L5 | none |
| `.wterm` | `.wterm` (WTerm-generated) | test-2,3,6, L1-3,5-6, T3.2, UX-E2E | none |
| `#settings-btn` | `#settings-btn` (in `#header` now) | UX-E2E | none |
| `#settings-overlay` | `#settings-overlay` | UX-E2E | none |
| `#main-repo-input` | `#main-repo-input` | UX-E2E | none |
| `#main-branch-input` | `#main-branch-input` | UX-E2E | none |
| `#settings-save` | `#settings-save` | UX-E2E | none |
| `.nav-entry.expandable` | `.napkin-card .card-header` | UX-E2E | **update** |
| `.expanded` (on `.nav-entry`) | `.focused` (on `.napkin-card`) | UX-E2E | **update** |
| `.nav-file` | `.file-row` | UX-E2E | **update** |
| `.nav-section-header` | (removed — replaced by card headers) | — | not tested |
| `.nav-children` | `.card-body` | — | not tested |

---

## coverage gaps: stories vs existing tests

### S1: first impression matches mock-e
- **Covered:** test-7 verifies `--nap-bg` CSS var is correct
- **Gap:** no test checks overall layout structure (editor left, nav right, header bar exists)
- **Gap:** no test checks terminal has dark theme (bg `#1e1e1e`, not the current light `#f0f4f8`)
- **Recommendation:** add one small assertion to an existing test (e.g. test-0 or test-7):
  - verify `#header` exists
  - verify nav is to the right of main (or just verify `#nav` and `#main` both exist)
  - verify terminal surface has dark bg: `getComputedStyle(terminalSurface).background === '#1e1e1e'`
  - this is a structural smoke test, not a pixel-perfect check

### S2: nav tree shows real .nap structure
- **Covered:** nav-tree.test.ts covers parsing logic (11 vitest tests); L1/L5/L6 check nav tree populates after clone; UX-E2E clicks a file in the nav
- **Gap:** no e2e test verifies card system rendering (focused card with blue accent, agent dots with role colors, agents at same indent as files)
- **Recommendation:** skip. Card rendering is visual — manual testing. The parsing logic is fully tested. The seam that matters (click file → opens in editor) is tested by UX-E2E. Testing that a dot is orange vs green is testing the DOM, not the behavior.

### S3: the reading experience
- **Covered:** T1.2 tests tokenizer (heading + comment types); T5.4 and UX-E2E test Cmd+click file:line → github navigation; L3 tests chapter navigation
- **Gap:** no test does a real Cmd+click on an `.md` link (L3 uses `window.__openFile` directly)
- **Recommendation:** consider adding a Cmd+click-on-.md-link step to L3 or UX-E2E using the existing `cmdClickLink` helper. Low priority — the routing logic is tested in vitest, and `openFile` is the same code path.

### S4: tab behavior
- **Covered:** test-1, test-6, T3.2, L2 all switch between editor and terminal tabs
- **Gap:** ephemeral vs permanent tab behavior is not tested (italic → permanent on edit)
- **Gap:** terminal dark theme is not verified (see S1)
- **Recommendation:** ephemeral/permanent tabs are new UI behavior introduced by mock-e. Add one focused test after implementation:
  - click file in nav → tab shows italic (ephemeral)
  - click another file → same tab slot reused
  - trigger edit → tab becomes non-italic (permanent)
  - click third file → new ephemeral tab appears, permanent tab stays
  - this is a medium test (needs real panel). Add to gap-tests.spec.ts or a new tab-behavior.spec.ts.

### S5: nav resize and collapse
- **Covered:** nothing tests resize or collapse
- **Gap:** resize handle drag, nav collapse toggle
- **Recommendation:** skip. Resize and collapse are pure CSS/JS interaction — low bug surface, high test maintenance. The resize handle code is <20 lines. Manual testing is appropriate here.

### S6: the full UX journey
- **Covered:** UX-E2E is exactly this story
- **Gap:** none conceptually — just selector updates needed (see section C2 above)
- **Recommendation:** update UX-E2E selectors per the migration table. This is the most important test — get it passing first.

---

## migration priority

1. **Update UX-E2E selectors** — this is the critical path. 3 selector changes. Get it green first.
2. **Verify L1/L5/L6 `#nav-tree` assertions** — keep the id or update to `#nav-scroll`. Low risk.
3. **Run all 15 "stable selector" Playwright tests** — they should pass unchanged, but verify.
4. **Add terminal dark theme assertion** — one line in test-7: check `--term-bg` or terminal surface background.
5. **Add ephemeral/permanent tab test** — new test, after tab bar implementation is complete.
6. **Consider .md link Cmd+click test** — low priority, nice to have.

---

## fixture note

The spec mentions fixtures need `nepics/` wrapping. The lifecycle and UX-E2E tests clone from `diunko/nap-test-nap` — a real remote repo. If that repo's structure changes to `nepics/01-v1/30-napkins/...`, the hardcoded paths in `panel.evaluate()` blocks (L1, L2, L3) will break. But the nav tree scanner in `side-panel.ts` already handles `nepics/` discovery. The path changes in test code are straightforward — update the chapter path from `/home/user/${napRepo}/30-napkins/...` to `/home/user/${napRepo}/nepics/01-v1/30-napkins/...`. This is a fixture migration, not a test logic change.

## summary

- **29 tests untouched** (pure logic — vitest)
- **15 tests likely stable** (Playwright, selectors survive — verify by running)
- **4 tests need selector updates** (3 minor `#nav-tree` checks, 1 significant UX-E2E rewrite)
- **2 new tests recommended** (terminal dark theme assertion, ephemeral/permanent tab behavior)
- **0 tests need rethinking** — every existing test tests something real
