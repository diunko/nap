# design impl — spec

## What this is

Replace the current extension prototype with the approved design (mock-e). The internals work — Monaco, LightningFS, terminal, link routing, auto-save are all proven. The UI around them doesn't match what was designed.

## Source of truth

* mock-e HTML: `.nap/nepics/05-extension/30-napkins/0200-design-sprint/mocks/mock-e.html`
* design spec: `.nap/nepics/05-extension/10-docs/context/design-spec.nap.md`
* screenshot: `.nap/nepics/05-extension/10-docs/context/mock-e-screenshot.png`

The mock is interactive — open it in a browser. Study it. The implementation should match what you see.

## Constraints

* existing 48 tests are the safety net — they define what "working" means for the internals
* vitest tests (nav-tree, link-routing, theme) test pure logic — they shouldn't need changes
* playwright tests depend on DOM selectors — they will need updating to match the new layout
* the UX e2e test (`ux-e2e.spec.ts`) is the most important — it does what a real user does
* fixtures need `nepics/` directory wrapping to match prod .nap repo structure

## What "done" looks like

* the extension side panel looks and behaves like mock-e
* all existing test scenarios still pass (with updated selectors where needed)
* the UX e2e journey still works: open panel → settings → clone → nav tree → open chapter → click link → GitHub navigates
