# response — test-eng-v0

## Step 1: Small tests (vitest)

**29/29 pass** — 205ms total.

- `nav-tree.test.ts` — 11 tests: T4.1 (directory conventions, 4 sections, architects, napkins with status, agents nested), T4.2 (numeric prefix sort, 2 vs 10 edge case)
- `link-routing.test.ts` — 14 tests: T5.1 (GitHub URL builder, #L anchor, :line suffix, bare path, placeholders), T5.2 (.md → openDoc relative resolution), T5.3 (https → openExternal), code link routing
- `theme.test.ts` — 4 tests: T7.1 (CSS variable generation, camelToKebab)

No failures.

## Step 2: Build

`npm run build` succeeds. Output in `dist/`. Side-panel bundle is 4.8MB (Monaco).

## Step 3: Medium tests (Playwright)

### Fixed before running

1. **`e2e/playwright.config.ts`** — original used `__dirname` (not available in ESM). fs-eng already fixed this + switched to the official Playwright persistent context fixture pattern.
2. **`manifest.json` CSP** — fixed by fs-eng: `script-src 'self' 'wasm-unsafe-eval'; worker-src 'self';` (NO `blob:` — that was blocking extension load).
3. **`background.ts`** — fs-eng added `if (chrome.sidePanel)` guard (Playwright Chromium may not have it).
4. **Old `side-panel.spec.ts`** — used `context.serviceWorkers()` from non-persistent context, which hangs. The new `fixtures.ts` uses `chromium.launchPersistentContext` (official pattern).

### Results: `happy-path-debug.spec.ts`

**8/8 pass** — 11.2s total.

| Test | What it proves | Time | Result |
|------|---------------|------|--------|
| test-0: side-panel.html loads | Extension loads, #app visible | 1.0s | PASS |
| test-1: Monaco boots | .monaco-editor in DOM, visible after tab switch | 0.7s | PASS |
| test-2: terminal prompt | wterm shows `$` prompt | 0.8s | PASS |
| test-3: terminal echo | echo command → output visible | 1.0s | PASS |
| test-4: LFS → Monaco | writeFile → openFile → model.getValue() matches | 0.9s | PASS |
| test-5: auto-save | editor edit → 1s debounce → LFS readFile matches | 2.5s | PASS |
| test-6: editor → terminal | editor edit → auto-save → cat from terminal sees it | 3.1s | PASS |
| test-7: theme CSS vars | --nap-bg = #f0f4f8 on document root | 0.7s | PASS |

### Old `side-panel.spec.ts` — NOT runnable

Superseded by `happy-path-debug.spec.ts` + `fixtures.ts`. Recommend deleting.

## Step 4: Coverage against test.md (20 cases)

### Covered by existing tests

| test.md case | Covered by | Size |
|---|---|---|
| T1.1 — Monaco boots, no CSP errors | test-1 (medium) ✅ | medium |
| T2.1 — LFS file → Monaco model | test-4 (medium) ✅ | medium |
| T2.2 — edit → auto-save → LFS | test-5 (medium) ✅ | medium |
| T3.1 — editor write → terminal reads | test-6 (medium) ✅ | medium |
| T4.1 — directory convention parsing | nav-tree.test.ts (6 tests) ✅ | small |
| T4.2 — numeric sort order | nav-tree.test.ts (3 tests) ✅ | small |
| T5.1 — file:line → GitHub blob URL | link-routing.test.ts (5+2 tests) ✅ | small |
| T5.2 — .md link → openDoc (small part) | link-routing.test.ts (2 tests) ✅ | small |
| T5.3 — https:// → new tab | link-routing.test.ts (2 tests) ✅ | small |
| T7.1 — CSS variable generation | theme.test.ts (4 tests) ✅ | small |
| T7.2 — theme visually applied | test-7 (medium) ✅ | medium |

**11 of 20 test.md cases covered.**

### NOT covered — plan to cover all 9

#### Group A: add to happy-path-debug.spec.ts (no network, ~30 lines)

| Case | How | Effort |
|---|---|---|
| T1.2 — tokenizer registered | `monaco.editor.tokenize('# heading', 'napkin-markdown')`, assert `heading` token type | ~10 lines |
| T3.2 — terminal → editor | `echo "// note" >> file`, click editor tab (triggers refresh-on-focus), check editorContent() | ~15 lines |
| T5.2 medium — .md link opens in editor | Write two .md files to LFS, openFile first, then openFile second via link resolution, assert content switches | ~10 lines |

#### Group B: clone integration test (uses https://github.com/diunko/nap-fixture)

One sequential test covering T4.3 + T6.1 + T6.2 + T6.3 (~40 lines):

1. `git clone https://github.com/diunko/nap-fixture` via cmd()
2. `refreshNavTree()` → assert DOM has "architects", "napkins", status labels "doing"/"backlog" **(T4.3, T6.1)**
3. Open file in editor, edit, wait auto-save → `git status` shows modified **(T6.2)**
4. `git add .` → `git commit -m "test"` → `git log --oneline -1` shows "test" **(T6.3)**

Adds ~10s (network clone via CORS proxy).

#### Group C: Cmd+click routing — T5.4 (~20 lines)

Use `editor.action.openLink` to trigger Monaco's link pipeline programmatically:
- `.md` link → assert editorContent() changed to target file
- code link → need small test hook (`window.__lastNavigateUrl`) to capture the URL the link provider produces, or intercept `page.on('popup')`

#### Group D: real side panel tests — T8.1 + more (~4-5 tests, new file)

**Key insight:** use `channel: 'chrome'` (real Chrome, not bundled Chromium) to get `chrome.sidePanel` support.

**What's needed:**
1. Add keyboard shortcut to `manifest.json`:
   ```json
   "commands": { "_execute_action": { "suggested_key": { "default": "Ctrl+Shift+Y" } } }
   ```
2. New fixture (`e2e/tests/panel-fixtures.ts`) using `channel: 'chrome'`
3. New test file `e2e/tests/panel.spec.ts`

**Test flow:**
```
page.goto('https://github.com') → keyboard shortcut → side panel opens
→ panelPage = context.pages().find(p => p.url().includes('side-panel.html'))
→ interact with panelPage (panel) and page (main tab) independently
```

**T8.1 test:** panel open with file in editor → navigate main tab to different GitHub URL → check panel editor content preserved, nav tree intact.

**Also unlocks real T5.4:** Cmd+click code link in panel → main tab navigates to GitHub blob URL (content script receives the message, actually navigates). This is the true end-to-end path.

**Risks:** requires Chrome installed (macOS: usually yes). `context.pages()` picking up the panel page needs proving — if it doesn't, CDP `context.newCDPSession()` can enumerate targets. github.com load adds a few seconds per test.

**IDB persistence variant (no real Chrome needed):**
Even without real side panel, T8.1's core question (does IDB survive?) is testable:
```
write files to LFS → page.reload() → read files from LFS → they persist
```
In-memory state (Monaco models, terminal history) is expected to be lost. IDB is the load-bearing concern.

## Step 5: Fixes applied

1. **`e2e/playwright.config.ts`** — fixed `__dirname` → `import.meta.url` (ESM compat). Reduced timeout 60s → 30s.
2. **`e2e/tests/smoke.spec.ts`** — created during debugging, can be deleted.

No code bugs found in the source. All failures were test infrastructure issues, already fixed by fs-eng.

## Fixture repo created

https://github.com/diunko/nap-fixture — public, 9 files:
```
10-docs/01-readme.nap.md
15-feedback/issues.md
20-architects/001-architect/prompt.md
30-napkins/0100-feature/.napkin.nap.json  (status: "doing")
30-napkins/0100-feature/0100-feature.nap.md
30-napkins/0100-feature/0100-feature.spec.md
30-napkins/0100-feature/agents/001-test-arch/prompt.md
30-napkins/0200-other/.napkin.nap.json  (status: "backlog")
30-napkins/0200-other/0200-other.nap.md
```

## Summary

- **Small tests: 29/29 pass**
- **Medium tests: 8/8 pass** (happy-path-debug.spec.ts, 11.2s)
- **11/20 test.md cases covered now**
- **9 uncovered — all have concrete plans:**
  - Group A: 3 tests, ~30 lines, no network
  - Group B: 1 test covering 4 cases, ~40 lines, needs nap-fixture clone
  - Group C: 1 test, ~20 lines, programmatic link action
  - Group D: 4-5 tests, new file, uses real Chrome for side panel frame — unlocks T8.1 and real T5.4
- **No code bugs found**
- **Old side-panel.spec.ts should be deleted**
- **Fixture repo ready:** https://github.com/diunko/nap-fixture
