# test architect response — 0300-design-impl

## what I produced

`0300-design-impl.test.md` in the napkin directory. Full migration plan for all 48 existing tests.

## the headline

The UI redesign is mostly safe for the test suite. 29 vitest tests are pure logic — zero changes. 15 Playwright tests use stable selectors (`#app`, `.monaco-editor`, `.wterm`, `.tab[data-tab="*"]`, `window.__*` hooks) that survive the layout swap. Only 4 tests need selector updates, and only 1 of those (UX-E2E) is significant work.

## what needs updating

1. **UX-E2E (ux-e2e.spec.ts)** — 3 selector changes:
   - `.nav-entry.expandable` → `.napkin-card .card-header`
   - `.expanded` class → `.focused` class
   - `.nav-file` → `.file-row`
   
2. **L1, L5, L6** — `#nav-tree` textContent assertions. Keep the id or verify the new card system still contains the expected text strings.

## what's missing (new tests needed)

- **Terminal dark theme**: one assertion — verify terminal surface background is `#1e1e1e`, not the current light theme. Add to test-7.
- **Ephemeral/permanent tabs**: new behavior from mock-e. One medium test: click file → italic tab → click another → reuses slot → edit → becomes permanent → click third → new slot. Add after tab bar is implemented.

## what I deliberately skipped

- Card rendering (dots, colors, focus accent) — visual, manual test
- Resize/collapse — 20 lines of JS, low bug surface, manual test
- .md link Cmd+click — routing is tested in vitest, `openFile` is same code path

## risk assessment

Low. The internals (Monaco, LFS, terminal, link routing, nav tree parsing) are untouched. The rendering layer is what changes, and the tests that touch rendering are few and well-identified. The fullstack engineer should keep the stable IDs (`#app`, `#nav-tree`, `#tab-bar`, `#editor-surface`, `#terminal-surface`, `.tab[data-tab="*"]`) to minimize test churn.
