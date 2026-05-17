You're the fullstack engineer building the Chrome extension v0. Read your role in `.nap/00-org/40-roles/fullstack-eng.md` — every line matters.

## Required reading

Org docs:
1. `.nap/00-org/10-promise.nap.md` — why we work this way
2. `.nap/00-org/20-workflow.nap.md` — the pipeline
3. `.nap/00-org/30-structure.nap.md` — directory layout

The feature:
4. `.nap/nepics/05-extension/30-napkins/0100-v0/0100-v0.nap.md` — the napkin (full v0 scope)
5. `.nap/nepics/05-extension/30-napkins/0100-v0/0100-v0.spec.md` — constraints you WILL get wrong if you skip this
6. `.nap/nepics/05-extension/30-napkins/0100-v0/0100-v0.stories.md` — 13 scenarios defining "working"
7. `.nap/nepics/05-extension/30-napkins/0100-v0/0100-v0.test.md` — test architecture (20 cases, 8 seams — shape code for these tests)

## The POC to reuse

The terminal surface is already built and proven. Read and reuse:
8. `packages/bash-poc/src/main.ts` — wiring pattern (LightningFS → adapter → shell → terminal)
9. `packages/bash-poc/src/fs-adapter.ts` — COPY into extension (LightningFS → IFileSystem adapter)
10. `packages/bash-poc/src/git-command.ts` — COPY into extension (isomorphic-git wrapper)
11. `packages/bash-poc/src/shell.ts` — COPY into extension (BashShell with fs + customCommands)
12. `packages/bash-poc/index.html` — wterm CSS is inlined here (not in npm package — you need it)
13. `packages/bash-poc/package.json` — dependencies to replicate
14. `packages/bash-poc/e2e/tests/terminal.spec.ts` — test patterns (cmd() helper, prompt counting)
15. `packages/bash-poc/vite.config.ts` — build config reference

## The v3 code to copy (not import)

Copy and adapt for Chrome extension context:
16. `packages/v3/src/renderer/napkin-markdown.ts` — tokenizer + shift-enter registration
17. `packages/v3/src/renderer/themes.ts` — ThemeDef + lightBlue theme ONLY (no dark mode)
18. `packages/v3/src/renderer/routing-rules.ts` — link classification (routeLink, parseLinkHref)

## What to build

Create `packages/extension/` — a Chrome extension (Manifest V3) with a side panel containing:

### 1. Extension scaffold
- `manifest.json` — Manifest V3, side_panel permission, CSP allowing Monaco workers (see spec)
- `background.ts` — register side panel via chrome.sidePanel
- `content.ts` — inject on github.com, handle link navigation messages from side panel
- `side-panel.html` + `side-panel.ts` — the app

### 2. Terminal surface (copy from bash-poc)
- Copy fs-adapter.ts, git-command.ts, shell.ts from bash-poc
- Wire with shared LightningFS instance (store name: 'nap-ext')
- Buffer polyfill before isomorphic-git imports
- Include wterm CSS

### 3. Editor surface (THE KEY RISK)
- Monaco with napkin-markdown tokenizer (from v3)
- MonacoEnvironment.getWorkerUrl configured for extension CSP (bundle editor.worker.js)
- Read files from LightningFS: `lfs.promises.readFile(path, 'utf8')` → `monaco.editor.createModel(content, 'napkin-markdown')`
- Auto-save: `editor.onDidChangeModelContent` → debounced (1s) `lfs.promises.writeFile(path, content)`
- Refresh-on-focus: when editor tab activates and file was modified externally, re-read from LFS
- Shift-enter continuation (registerShiftEnter from v3)
- Config: wordWrap on, no minimap, no line numbers, scrollBeyondLastLine false, fontSize 14

### 4. Nav tree (nap.app style)
- Read .nap/ directory structure from LightningFS
- Parse conventions: 20-architects/, 30-napkins/ with .napkin.nap.json status, agents/
- Sort by numeric prefix
- Click .md → open in editor
- Refresh after git clone (explicit trigger, no filesystem watcher)
- Expose nav tree parser as pure function (small-testable per T4.1)

### 5. Tab bar
- Two tabs: Terminal | Editor
- Switching preserves state in both (don't destroy terminal when viewing editor)

### 6. Link routing
- Copy routeLink + parseLinkHref from v3's routing-rules.ts
- NEW: GitHub URL builder for file:line → `https://github.com/{owner}/{repo}/blob/{branch}/{path}#L{line}`
  - {owner}/{repo} for links = main code repo (NOT .nap repo) — where does this come from? TBD — for now, make it configurable (stored alongside PAT, or derived from mini-book content)
- Register Monaco link provider for Cmd+click
- .md links → load in editor from IDB
- .ts/.tsx → chrome.tabs (single-click reuse, double-click new)
- https:// → chrome.tabs.create

### 7. Theme
- lightBlue theme only (editor bg #f0f4f8)
- CSS variables on panel root (--nap-bg, --nap-text, etc.)
- No dark mode detection

### 8. Auth
- Settings in extension popup: PAT input, test button
- chrome.storage.sync for PAT
- isomorphic-git onAuth callback

## Build tooling
- vite for bundling (same as bash-poc)
- TypeScript strict, `tsc --noEmit` must pass
- Add `packages/extension` to root workspace

## Critical: testability

The test architecture (0100-v0.test.md) expects these to be accessible from Playwright via page.evaluate:
- `window.__editor` — Monaco editor instance
- `window.__lfs` — LightningFS instance
- `window.__fs` — IFileSystem adapter

Expose them on window so tests can inspect state. The nav tree parser should be a pure function exported separately (importable by vitest for small tests T4.1, T4.2).

## Priority order

Build in this order (matches test gates):
1. Extension scaffold + Monaco boots (T1.1 gate)
2. Monaco reads from LFS (T2.1 gate)
3. Auto-save to LFS (T2.2 gate)
4. Terminal surface (copy from bash-poc)
5. Bidirectional LFS sharing (T3.1, T3.2)
6. Nav tree (T4.1-T4.3)
7. Tab bar
8. Link routing (T5.1-T5.4)
9. Theme (T7.1-T7.2)
10. Auth

If Monaco can't boot in the extension (T1.1 fails), STOP and write questions.md describing what went wrong. Don't build around it.

CRITICAL: when you are done, write your response to `.nap/nepics/05-extension/30-napkins/0100-v0/agents/002-fs-eng-v0/response.md`, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
