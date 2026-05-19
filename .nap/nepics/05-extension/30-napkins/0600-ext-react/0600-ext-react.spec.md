# ext-react — spec

## Read the app source before building

Not optional. The app's renderer code is what you're porting. Read these files in full — understand how they work, not just what they export:

- `packages/v3/src/renderer/store.ts` — the state architecture. Tab interface, upsertTab/removeTab helpers, openDoc/closeTab/pinTab actions, per-nepic memory, session persistence.
- `packages/v3/src/renderer/Sidebar.tsx` — NapkinCard, ArchitectCard, EntryTree (recursive, maxDepth), FileRow, AgentDot. How cards focus/extend. How agents flatten. How the `*` bullet renders.
- `packages/v3/src/renderer/ContentPane.tsx` — Monaco creation config, auto-save with echo suppression, refreshRoleDecorations (deltaDecorations), onMouseDown link click handling, file loading lifecycle, cursor/scroll preservation.
- `packages/v3/src/renderer/TabBar.tsx` — stateless component, ephemeral italic, ghost opacity, middle-click close, double-click pin, maxWidth 180 with ellipsis.
- `packages/v3/src/renderer/TerminalPane.tsx` — surface switching between terminal and code.
- `packages/v3/src/renderer/content-link-provider.ts` — detectLinks (three regex types, priority via seen set), nap-link:// protocol for resolveLink.
- `packages/v3/src/renderer/index.tsx` — layout, keyboard shortcuts, IPC wiring.

Also read the app's tests to understand what behaviors are tested:
- `packages/v3/tests/tabs-store.test.ts` — 12 tab tests (your store tests should pass the same cases)
- `packages/v3/tests/content-nav.spec.ts` — 6 navigation tests
- `packages/v3/tests/tabs.spec.ts` — 3 UI tab tests

## The design target

The extension should look and behave like mock-e:
- Mock HTML: `.nap/nepics/05-extension/30-napkins/0200-design-sprint/mocks/mock-e.html`
- Design spec: `.nap/nepics/05-extension/10-docs/context/design-spec.nap.md`
- Screenshot: `.nap/nepics/05-extension/10-docs/context/mock-e-screenshot.png`

## Extension CSP (proven, don't change)

```json
"content_security_policy": {
  "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; worker-src 'self';"
}
```

- `wasm-unsafe-eval` needed for wterm's WASM
- NO `blob:` in worker-src (silently kills extension loading)
- Monaco workers via `import.meta.url` (Vite resolves at build time)

## LightningFS replaces electronAPI

The app's components call `window.electronAPI.fileRead(path)`. The extension calls `lfs.promises.readFile(path, 'utf8')`. Same interface shape, different implementation.

Provide an `ExtensionFS` interface that mirrors the electronAPI file methods. Components call this interface. Implementation uses the LightningFS adapter. Tests can mock it.

One LightningFS instance, store name `'nap-ext'`. Three consumers: editor (via ExtensionFS), terminal (via adapter → just-bash), nav tree (via ExtensionFS for parsing).

## Adapter event emitter (the extension's fs.watch)

The LightningFsAdapter must emit change events on every write operation:
- `writeFile` → `{ type: 'write', path }`
- `mkdir` → `{ type: 'mkdir', path }`
- `rm` → `{ type: 'rm', path }`
- `appendFile` → `{ type: 'write', path }`

The model layer subscribes, debounces (200ms), re-reads affected areas from LFS, and updates the store. Same pattern as the app's fs.watch → model.loadFromFilesystem → notify.

isomorphic-git writes to raw LFS (not adapter). These are handled by onCommandComplete — shell callback after git clone/pull/checkout emits 'repo-changed' → bulk nav refresh.

## Echo suppression

When the editor auto-saves (writes content to LFS), the adapter emits a change event. The model would re-read the file and push it back to the editor — causing a cursor jump. Suppress this with a pending-writes flag (same as app's `pendingContentWrites` pattern in main.ts:229-241).

## Monaco config (match the app)

```typescript
{
  language: 'napkin-markdown',
  theme: 'light-blue',
  wordWrap: 'on',
  minimap: { enabled: false },
  lineNumbers: 'off',
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  tabSize: 2,
  insertSpaces: true,
  fontSize: 13,
  fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
  scrollBeyondLastLine: false,
  renderLineHighlight: 'none',
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  folding: false,
  glyphMargin: true,
  lineDecorationsWidth: 8,
  padding: { top: 12, bottom: 12 },
}
```

## Terminal is dark, always

bg #1e1e1e, fg #e5e5e5, prompt green #22c55e. Reference: `packages/bash-poc/index.html`. When terminal surface is active, the content area goes dark. Tab bar stays light.

## Zoom

Ctrl+Shift+= (in), Ctrl+Shift+- (out), Ctrl+Shift+0 (reset). NOT Cmd+/- (Chrome intercepts those). CSS `document.documentElement.style.zoom`. Persist to chrome.storage.sync, restore on load. Clamp 0.5–2.0.

## Debugging: log every state transition

Every state transition must be logged with a tagged prefix:
- `[store]` — store actions (openDoc, closeTab, expandCard)
- `[adapter]` — LFS operations (readFile, writeFile, emit)
- `[model]` — model re-reads (refreshNav, reloadFile)
- `[contentpane]` — Monaco operations (setModel, autoSave, roleDecorations)
- `[sidebar]` — nav rendering (cards, dots, focus)
- `[terminal]` — shell operations (exec, commandComplete)
- `[links]` — link detection and routing
- `[chrome]` — chrome API calls (tabs.update, storage.sync)

Playwright pipes all browser console via `panel.on('console', ...)`. The fs-eng runs scenarios and reads the trace to verify the pipeline. Fix the pipeline before moving to the next phase.

## Phase verification scenarios (run via Playwright)

Each phase has scenarios the fs-eng runs to verify the pipeline before moving on:

**Phase 2 (store + basic rendering):**
- Open panel → log shows `[store] initialized`, React mounts, stubs visible
- Call store.openDoc('test.md') from console → log shows `[store] openDoc → upsertTab → activeFilePath changed`

**Phase 3 (wire surfaces):**
- Clone repo in terminal → log shows `[terminal] commandComplete git clone → [model] repo-changed → [store] refreshNav → [sidebar] render 2 napkins`
- Click file in nav → log shows `[sidebar] fileClick → [store] openDoc → [contentpane] loadFile → [adapter] readFile → [monaco] setModel`
- Type in editor → log shows `[contentpane] contentChanged → [store] pinActiveEphemeral → [adapter] writeFile (debounced) → [adapter] emit write (suppressed — own write)`
- `echo "text" >> file` in terminal → log shows `[adapter] appendFile → [adapter] emit write → [model] debounce → [contentpane] reloadFile`

**Phase 4 (chrome plumbing):**
- Cmd+click file:line link → log shows `[links] detectLinks → routeLink openCode → [chrome] tabs.update → github tab navigated`
- Ctrl+Shift+= → log shows `[chrome] zoom 1.0 → 1.1 → storage.sync.set`

## Fixture content

Use `fixtures/{main,.nap}/` for testing. The .nap fixture has `nepics/01-v1/` with the space-pizza delivery pipeline — 5 chapters, 3 agents, 2 napkins.

Run `fixtures/sync.sh` if the GitHub repos need updating.

## What "done" looks like

- `npm run build` succeeds
- Extension loads in Chrome, side panel opens
- The panel looks like mock-e (cards, dots, tabs, dark terminal, light editor)
- Clone fixture repo → nav auto-populates (push, not manual refresh)
- Click file → editor shows content with role-colored // comments
- Click another file → ephemeral tab reuses. Edit → tab pins. Click third → new ephemeral.
- Cmd+click file:line → GitHub tab navigates
- Switch to terminal → dark. Switch back → editor preserved.
- Ctrl+Shift+/- → zoom works
- Store vitest tests pass (same patterns as app's tabs-store.test.ts)
- Playwright UX e2e test passes (same journey as existing, updated selectors)
