# Testing strategy

## Two layers, different guarantees

| Layer | Runner | What it proves | What it misses |
|---|---|---|---|
| Model (vitest) | Node, no browser | Store logic, factory independence, persistence keying, pure functions | Rendering, layout, real Chrome APIs |
| DOM (Playwright) | Real Chrome + extension | What the user sees — dimensions, visibility, text content, surface switching | Slow (git clone 5-10s per test) |

## The lesson

The first round of tests passed with 100% green. The product was broken — editor rendered nothing. The tests read from `editor.getModel().getValue()` (the data model) instead of checking what was actually on screen.

**Rule: if a human needs to see it, the test needs to check the DOM.**

## Vitest suites (37 tests)

Run: `npm run test:small`

| Suite | Tests | What it covers |
|---|---|---|
| store.test.ts | IS-01 (tabs), IS-02 (cards), IS-03 (surface) | Store actions in isolation |
| adapter-emitter.test.ts | IS-04 | Adapter emits on write/mkdir/rm |
| model.test.ts | IS-05 | Debounce, echo suppression, onCommandComplete |
| persistence.test.ts | IS-07 | Store state round-trip |
| session.test.ts | SS-01, SS-02, SS-03, SS-06 | Factory independence, persistence per key, scoped wipe |

### Session isolation tests (session.test.ts)

These define the contract for keyed state:

- **SS-01**: `createNapStore()` twice → independent instances. State in A doesn't appear in B.
- **SS-02**: Actions in A (openDoc, expandCard, refreshNav) don't affect B.
- **SS-03**: Persist to key 'pr-42', recreate with same key → state hydrated. Create with 'pr-87' → empty.
- **SS-06**: Wipe 'pr-42' → gone. 'pr-87' → untouched.

Uses `createMemoryStorage()` instead of real IndexedDB (vitest runs in Node).

## Playwright suites (18 tests)

Run: `npx playwright test --config e2e/playwright.config.ts`

| Test | What it proves |
|---|---|
| DS-P2-01, DS-P2-02 | Panel renders, store works |
| DS-P3-01..04 | Pipeline: clone→nav, file click→editor, auto-save, terminal write |
| DS-P4-01, DS-P4-02 | Link navigation, zoom |
| IM-01 | Gate test: clone → nav auto-populates |
| IM-02 | Terminal write → editor model updated |
| IM-02-DOM | Four-direction DOM test (the heavy one) |
| IM-03 | Editor write → auto-save → echo suppression |
| IM-04 | Tab lifecycle: ephemeral, pin, reuse, switch |
| IM-05 | Cmd+click file:line → GitHub tab navigates |
| IM-06 | Cmd+click .md → editor loads new file |
| IM-07 | Reopen lifecycle — model level (store, nav, file, terminal) |
| IM-07-DOM | Reopen lifecycle — DOM level (dimensions, visibility, text) |
| IM-08 | Surface switch: editor ↔ terminal, scroll preserved |

### IM-02-DOM: the four-direction DOM test

This one test covers the most ground:

1. **Terminal → editor**: echo into file → view-lines render the text
2. **Editor → filesystem**: type in editor → `cat` in terminal shows it
3. **Napkin metadata**: write `.napkin.nap.json` → card status changes in sidebar
4. **Agent metadata**: write `.agent.nap.json` → agent status changes in sidebar

Every assertion is `toContainText`, `toBeVisible`, `toHaveCSS`, `boundingBox()` — real DOM, not model.

### IM-07-DOM: reopen lifecycle

Closes the panel, reopens, verifies ALL surfaces work:
- Terminal: bounding box > 50px, visible, scrollTop=0, prompt `$`, `ls` works
- Nav: cards, dots, file entries rendered
- Editor: click file → Monaco > 50px height, content in view-lines
- Surface switching: both directions

## cmdClickLink helper

Simulates Cmd+click on a Monaco link:

1. Find link href in editor model
2. Scroll link line into view (`revealLineInCenter`)
3. Find the rendered DOM span containing the display text
4. Measure with `getBoundingClientRect()`
5. Dispatch synthetic mousedown with `metaKey: true` on Monaco's `overflow-guard`

Monaco returns `target=UNKNOWN` for synthetic events (`isTrusted=false`). The ContentPane handler accepts UNKNOWN with metaKey, falling back to cursor position (set before dispatch).

## Console utilities

Switch session:
```javascript
__switchSession__('pr-42')
```

Check state:
```javascript
__napStore__.getState()
```

Wipe everything:
```javascript
const dbs = await indexedDB.databases();
for (const db of dbs.filter(d => d.name?.startsWith('nap-'))) indexedDB.deleteDatabase(db.name);
indexedDB.deleteDatabase('nap-state');
```
