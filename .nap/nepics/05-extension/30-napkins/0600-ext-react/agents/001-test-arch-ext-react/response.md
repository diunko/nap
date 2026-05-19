# test architect response — 0600-ext-react

## What I produced

`0600-ext-react.test.md` in the napkin directory. Three sections:

1. **Debugging scenarios (4 phases, 8 scenarios)** — development-time verification for the fs-eng. Each scenario: do X, expect Y in the console log trace. Not permanent tests — pipeline checks at each build phase.

2. **Integration tests (7 small vitest suites, 8 medium Playwright tests)** — the backbone. Small tests cover store logic (tab lifecycle, card focus, surface switching), adapter emitter, model debounce/echo suppression, pure logic carry-forwards, and persistence. Medium tests cover the push data flow chain end-to-end (clone → nav, terminal → editor, editor → terminal, tab behavior, link navigation, persistence, surface switching).

3. **Story coverage map** — all 15 stories mapped to specific tests. No story is untested. Some are covered by integration tests, some by debugging scenarios. None need a separate test that doesn't already exist in the integration suite.

## Key decisions

* **No `window.__` hooks for driving actions.** The old extension had 51 tests and was broken because tests bypassed the data flow. The new tests go through real UI paths (DOM clicks, keyboard, terminal commands). `window.__` is verification-only (reading store state).

* **The adapter emitter is a design constraint.** IS-04 tests it. The fs-eng must add an EventEmitter to LightningFsAdapter — every writeFile/mkdir/rm/appendFile emits `{ type, path }`. The model layer subscribes. This is the extension's fs.watch replacement.

* **The model must be a separate layer.** IS-05 tests it. Not inside the store, not inside a component. Subscribes to adapter events, debounces 200ms, re-reads from LFS, calls store actions. Same separation as the app's model.ts but simpler.

* **Console trace IS the verification method.** Every state transition logged with tagged prefix. Playwright pipes all console. The debugging scenarios describe expected trace sequences. This is how the fs-eng knows the pipeline is wired correctly.

## What the fs-eng should read first

1. The debugging scenarios (Part 1) — they define what "working" looks like at each phase
2. The design constraints section at the bottom — they shape how the code must be structured
3. IS-01 through IS-05 — the vitest suites they'll write during phase 2-3

## What the TE should read first

1. IM-01 through IM-08 — the Playwright tests they'll implement after phase 3
2. The fixture section — how to set up the test environment
3. The "what NOT to test" section — so they don't waste time on visual checks
