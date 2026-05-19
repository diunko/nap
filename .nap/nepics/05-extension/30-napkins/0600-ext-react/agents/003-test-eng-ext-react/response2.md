# test-eng response 2 — DOM testing, real bugs, state architecture findings

## Summary

Implemented IM-02 through IM-08. Found the tests were passing but the product was broken — editor rendered nothing visible. Added DOM-level integration tests that caught this and several rendering bugs. Wired agent metadata through to the sidebar. Built comprehensive reopen lifecycle tests. Identified a structural gap: the state system needs per-session keying.

---

## DOM testing revelation

The original IM-02 through IM-08 passed by reading from `editor.getModel().getValue()` — the data model, not rendered pixels. The data pipeline was correct. Monaco never painted anything on screen.

**IM-02-DOM** tests four directions, all via real DOM assertions:

```
Direction 1: terminal echo → editor renders text (view-lines contain it)
Direction 2: type in editor → cat in terminal shows the edit (wterm textContent)
Direction 3: write .napkin.nap.json → sidebar card: "doing" → "shipped"
Direction 4: write .agent.nap.json → agent row: "run" → "exited"
```

Every assertion checks the DOM — bounding boxes, CSS visibility, text content in rendered elements — not store state or Monaco models.

## Reopen lifecycle tests

**IM-07** (model level) verifies after close/reopen:
- Store state restored: tabs, activeFilePath, focusedCardSlug, mainRepoConfig
- Nav populated from IDB scan with agent metadata
- File readable from LFS
- Terminal alive: command executes, onCommandComplete fires

**IM-07-DOM** verifies after close/reopen:
- Terminal: bounding box > 50px, visible in viewport, scrollTop=0, prompt `$` present, `ls` produces output
- Nav: cards rendered, agent dots visible, status text correct
- Editor: click file → Monaco > 50px height, view-lines contain text
- Surface switching works both directions

---

## Bugs found and fixed

### Bug 4: auto-save lost on file switch (ContentPane.tsx)
Pending save timer cleared without flushing in useEffect cleanup. Fix: flush write before switching.

### Bug 5: no startup scan for existing repos (model.ts)
Model only scanned after git clone. Fix: `scanExistingRepos()` in `model.init()`.

### Bug 6: chrome.storage persistence not wired (index.tsx)
Store state in-memory only. Fix: persist + restore via chrome.storage.sync. (To be replaced by IndexedDB — see architecture section.)

### Bug 7: filesystem bootstrap in React layer (model.ts + index.tsx)
`/home/user` mkdir raced with scan — ENOENT on every load. Fix: moved to `model.init()`.

### Bug 8: UNKNOWN mouse target for synthetic Cmd+click (ContentPane.tsx)
Monaco returns UNKNOWN for synthetic events (isTrusted=false). Fix: accept UNKNOWN with metaKey, fall back to cursor position.

### Bug 9: editor content invisible (ContentPane.tsx)
Two issues:
1. ContentPane used `flex: 1` but parent is `position: absolute` (not flex) → height collapsed to 5px. Fix: `width: 100%; height: 100%`.
2. No `layout()` after `setModel`. Fix: `requestAnimationFrame(() => editor.layout())` after setModel in the file load chain — not in a separate effect.

### Bug 10: agent metadata discarded (nav-tree.ts + Sidebar.tsx)
`parseAgents` read `.agent.nap.json` and threw the result away. Fix: store on `NavNode.metadata`, read in `extractRole`/`extractAgentStatus`.

### Bug 11: terminal init errors silently swallowed (TerminalPane.tsx)
`.then()` chain with no `.catch()`. Fix: added `.catch()` + `[terminal] shell attached` log.

### Bug 12: activeSurface not persisted (index.tsx)
On reopen, always landed on terminal even if a file was open. Fix: persist `activeSurface`, restore it.

### Bug 13: Terminal tab position + tab ordering (index.tsx)
Terminal tab was first (leftmost). Fix: moved to rightmost with `marginLeft: auto`. File tabs appear first — the thing you're reading, not the escape hatch.

---

## cmdClickLink fix

The ported helper broke under word wrap (getScrolledVisiblePosition returned gutter coordinates). Fix: find the rendered DOM span containing link text, measure with `getBoundingClientRect()`, dispatch mousedown at its center on Monaco's `overflow-guard`.

---

## Known issues for the fs-eng

### Link visual affordances missing
No pointer cursor on Cmd+hover, no blue underline on links. Fix: register a Monaco `ILinkProvider` — Monaco handles cursor and decoration automatically.

### mainRepoConfig must be set manually
Code links produce `OWNER/REPO` without config. Consider auto-detecting from the clone URL.

---

## Architecture finding: state needs per-session keying

**The problem:** Everything is hardcoded to single keys:
- `LightningFS('nap-ext')` — one filesystem for all PRs
- `chrome.storage.sync` key `napState` — one UI state
- `/home/user` — one shell home

This means you can't review two PRs independently. The side panel persists across Chrome tabs — it doesn't reload when navigating to a different PR.

**What "done" means for this napkin:** input a key, get an isolated state. Change the key, get a different filesystem + different UI state. Two Chrome windows reviewing different PRs = two independent sessions.

**The design:**

```typescript
// session.ts
interface Session {
  key: string;
  lfs: LightningFS;          // LightningFS(`nap-fs-${key}`)
  adapter: LightningFsAdapter;
  store: StoreApi<NapStore>;  // Zustand persist → IDB key `nap-ui-${key}`
}

function createSession(key: string): Session { ... }
```

```
Chrome Window 1                    Chrome Window 2
  Side Panel                         Side Panel
    Session("pr-42")                   Session("pr-87")
      nap-fs-pr-42  (IDB)               nap-fs-pr-87  (IDB)
      nap-ui-pr-42  (IDB)               nap-ui-pr-87  (IDB)
```

**Implementation:**
1. Zustand `persist` middleware with custom IndexedDB storage adapter (replaces chrome.storage.sync)
2. Session context — store created per session, provided via React context (not a module singleton)
3. `getStateKey()` returns `'default'` now, URL hash later
4. Content script signals `pr-changed` → panel creates new session with new key

**This is an fs-eng task.** The store, model, and LFS creation need to move behind the session factory. Every component that imports `useNapStore` switches to `useSession().store`. I can write the tests that verify key isolation — different keys = different states, no cross-contamination.

---

## Final results

```
vitest:      28/28 pass
playwright:  19/19 pass
  8  debug scenarios
  10 integration tests (IM-01 through IM-08, IM-02-DOM, IM-07-DOM)
  1  gate test
errors:      0
stack traces: 0
```

## Story coverage

All 15 stories covered. IM-02-DOM and IM-07-DOM provide the strongest coverage — they prove the product works as a user sees it.
