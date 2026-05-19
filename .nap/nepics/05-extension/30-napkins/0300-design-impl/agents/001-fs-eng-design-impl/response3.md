# response3 — 001-fs-eng-design-impl (round 3)

## status: done

## v3 source studied

Read full files (not just referenced lines):
- `ContentPane.tsx` (678 lines) — editor creation, auto-save with suppressExternal, refreshRoleDecorations via deltaDecorations, onMouseDown with three regex types (markdown > URL > bare path), ghost tab handling, scroll sync between edit/rendered modes
- `content-link-provider.ts` (150 lines) — `detectLinks` with seen-set priority, `nap-link://` protocol for resolveLink, `handleLinkClick` decoder
- `role-palette.ts` (78 lines) — djb2 hash, 20 hue palette, 5 known prefixes with fixed colors, `generatePaletteCss` for both rendered and deco classes
- `Sidebar.tsx` (746 lines) — NapkinCard/ArchitectCard, EntryTree recursive renderer (sort: main first, files, dirs), AgentDot with click-to-terminal, resize/filter, Cmd+E extended toggle
- `TabBar.tsx` (98 lines) — stateless, ephemeral italic, ghost opacity, middle-click close
- `store.ts` (357+ lines) — upsertTab with ephemeral slot reuse, removeTab neighbor pick, saveTabScroll cursor/scroll per tab
- `dot-style.ts` (60 lines) — role color map, archived/exited override to gray

## what was built

### fix 1: role prefix decorations
- **New file: `role-palette.ts`** — ported from v3. Pure functions: `hashPrefix` (djb2), `roleColor` (known prefixes → fixed colors, unknown → HSL by hash), `roleDecoClass` (CSS class names), `generatePaletteCss` (20 hue rules + 5 known overrides with `!important`)
- **In `side-panel.ts`**: inject palette `<style>` at startup, `refreshRoleDecorations()` called on every `onDidChangeModelContent` and after file load. Near-copy of ContentPane.tsx:277-305 — scans for `//(\w+):`, applies `inlineClassName` via `deltaDecorations`, one role per line, colors from match to end of line
- Result: `//DU:` green, `//A:` blue, `//TA:` orange, unknown prefixes hash to deterministic hue

### fix 2: nav tree subdirectories
- **In `nav-tree.ts`**: added loop in `parseNapkins` for non-agents directories — filters `napkinEntries` for `isDirectory && name !== 'agents' && !name.startsWith('.')`, recurses via existing `parseFileDir`
- Result: `mini-book/`, `scratch/`, etc. now appear in nav tree under focused napkin card

### fix 3: Monaco config alignment
- **In `side-panel.ts`**: updated editor creation to match ContentPane.tsx:184-205: `tabSize: 2`, `insertSpaces: true`, `quickSuggestions: false`, `suggestOnTriggerCharacters: false`, `glyphMargin: true`, `lineDecorationsWidth: 8`, `hideCursorInOverviewRuler: true`, `padding: { top: 12, bottom: 12 }`

### fix 4: zoom
- **In `side-panel.ts`**: `setupZoom()` — Ctrl+Shift+= (in), Ctrl+Shift+- (out), Ctrl+Shift+0 (reset). Applies `document.documentElement.style.zoom`. Persists to `chrome.storage.sync`, restores on load. Clamped 0.5–2.0.

### fix 5: link provider upgrade
- **New file: `content-link-provider.ts`** — ported `detectLinks` from v3. Three regex types with priority via `seen` set: markdown `[text](href)` > bare URLs `https://...` > bare file paths `src/main.ts:42`. URL-inside-bare-path rejection (walk back for `http://` prefix)
- **In `side-panel.ts`**: link provider's `provideLinks` now uses `detectLinks` instead of inline regexes. `findLinkAtPosition` (used by onMouseDown) also delegates to `detectLinks` for consistent priority

### fixture path updates
- All e2e tests updated for the remote repo's current structure: `nepics/01-v1/30-napkins/0100-delivery-pipeline/mini-book/01-order-routing.md` (was `30-napkins/0100-feature/01-copy-pipeline.md`)
- Content assertions updated: "Order" / "order-router.ts:54" (was "Copy Pipeline" / "copy_document.ts:51")
- Nav tree text assertions updated: `0100-delivery-pipeline` (was `0100-feature`)

## tests

### new vitest suites (3)
1. **`role-palette.test.ts`** (12 tests) — `roleDecoClass` known/unknown, `hashPrefix` determinism and range, `roleColor` known/unknown/dark, `generatePaletteCss` 20 hues + known overrides + !important
2. **`nav-tree.test.ts`** (+1 test) — "includes non-agents subdirectories (mini-book/)" with 2 chapter files
3. **`content-link-provider.test.ts`** (11 tests) — bare paths, markdown priority, URL priority, overlap prevention, relative paths, no false positives

### results
- **vitest**: 54/54 passed (0.6s)
- **Playwright**: 22/22 passed (64s)
- **tsc --noEmit**: zero errors

## post-round fix: agent dots all blue

**Bug:** all agent dots rendered blue (architect default). The `NavNode` type has no agent-specific fields — `nav-tree.ts:parseAgents` never read `.agent.nap.json`. The renderer's `extractAgentMeta` looked up the jsonCache and got `undefined` → defaulted to `role: 'architect'` → blue.

**Fix applied:** threaded `readJson` into `parseAgents`, added `await readJson(\`${agentPath}/.agent.nap.json\`)` per agent. The `readJsonLfsCached` callback stores it in the cache, which `NavRenderer.extractAgentMeta` reads at render time.

**Architectural note — how this differs from the app:**

In the app, `model.ts:loadAgents()` reads `.agent.nap.json` and constructs `AgentState` objects with `role`, `running`, `done`, `exited` as first-class fields stored in `NapkinState.agents[]`. The Zustand store holds this rich state. `Sidebar.tsx` receives `AgentState` directly — `napkin.agents.map(a => <AgentDot agent={a} />)`. Role is resolved before rendering. No JSON lookup at render time.

In the extension, `nav-tree.ts` produces generic `NavNode[]` with no agent-specific fields. The renderer reconstructs agent metadata by looking up `.agent.nap.json` from a side-channel `Map<string, Record<string, unknown>>` cache. This works but is fragile — the cache must be populated during parsing, and the renderer must know the JSON path convention.

**The proper fix (future):** add agent-specific fields to `NavNode` when `type === 'agent'` (role, started, exited, done), populated by the parser. The renderer reads them directly, same as the app. This eliminates the cache indirection and makes the data flow explicit. Deferred because it changes the `NavNode` interface, which would require updating all the nav-tree tests.

## missing features (noted for next round)

**Nav double-click → permanent tab:** currently every nav file click opens an ephemeral tab. There's no double-click handler on nav file rows to open as permanent. The tab manager has `openPermanent()` — just needs wiring. Single-click = ephemeral (current), double-click = permanent.

**Code link: new tab vs reuse tab:** Cmd+click on a file:line link always reuses the active GitHub tab (`chrome.tabs.update`). No way to open in a new tab. Proposed: Cmd+click = reuse (current), Cmd+Shift+click = new tab (`chrome.tabs.create`).

**Model-based testing:** the app has a proper model layer (`model.ts`) that holds rich `AgentState` and `NapkinState` objects with all fields resolved. Tests can exercise the model directly — create agents, change status, verify state. The extension doesn't have this. `nav-tree.ts` is a parser that returns a generic tree, and agent metadata lives in a side-channel JSON cache. This means the extension's tests either test the parser (pure, but doesn't cover dot rendering logic) or test the full Playwright panel (expensive, brittle). Migrating toward a model — where parsed data becomes typed state objects before reaching the renderer — would let us write fast vitest-level tests for things like "agent done → dashed-check dot" without booting a browser. This is an interesting migration question: do we port the app's model.ts pattern, or build a lighter extension-specific model? Either way, the renderer should consume typed state, not raw JSON cache lookups.

---

**No live updates:** the app has `model.ts:startWatching()` — a file watcher on the `.nap` directory. When `.agent.nap.json` changes (agent starts, finishes, exits), the model updates `AgentState`, the Zustand store fires, and dots re-render live. The extension has no watcher. The nav tree only refreshes after `git clone`/`pull`/`checkout` (via `onCommandComplete` in shell) or manual `__refreshNavTree()`. No polling, no push. This is by design for v0 — the workflow doc says "fetch latest" is the update mechanism. The extension is a reader: clone, read, push comments. Live agent status updates are a v1+ concern.
