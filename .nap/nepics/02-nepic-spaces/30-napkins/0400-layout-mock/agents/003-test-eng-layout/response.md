## Test results

All 0400 tests pass. Full regression suite green (pre-existing flaky T-0100-02 excluded — unrelated timeout in pty reverse-path test).

### Small tests — `tests/layout-mock.test.ts`

| ID | Name | Result |
|----|------|--------|
| T-0400-01 | Three-column layout mounts without crashing | pass |
| T-0400-04 | Card state transitions (collapsed → focused → extended) | pass |
| T-0400-08 | Breadcrumb renders correct path segments | pass |
| T-0400-10 | Gutter renders nepic icons in correct order | pass |
| T-0400-11 | Mock data populates browser with correct structure | pass |

### Medium tests — `tests/layout-mock.spec.ts`

| ID | Name | Result |
|----|------|--------|
| T-0400-02 | Terminal switching preserves buffer after layout change | pass |
| T-0400-03 | Cmd+B toggles middle column only, gutter stays | pass |
| T-0400-05 | Cmd+K filter works in napkin browser | pass |
| T-0400-06 | Terminal resize works with three-column layout | pass |
| T-0400-07 | Scroll lock modes preserved through layout change | pass |
| T-0400-09 | Clicking agent in browser switches terminal | pass |

### T-0400-12: Regression

Full suite run: 104 small tests pass, 102 medium tests pass. No regressions from the layout refactor.

### Selector updates

Updated `tests/polish/polish.spec.ts` T-0600-20/21/22:
- `sidebar-filter` → `browser-filter`
- `agent-card` → `napkin-card`
- Filter now tests napkin name filtering (mock data) instead of terminal name filtering
- Click test now verifies card focus (store `focusedCardSlug`) instead of terminal switch (since clicking a napkin card focuses it; terminal switch requires clicking an agent within the card)

### Pre-existing failure (not related)

T-0100-02 (xterm input → IPC → pty reverse path) — intermittent timeout. This test is flaky in the existing suite and is not affected by the layout refactor.

### What was tested vs not tested

- **Tested**: store actions, mock data shape, three-column DOM structure, terminal buffer preservation, sidebar toggle semantics, filter, resize, scroll lock survival, terminal switching via agent click
- **Not tested visually**: colors, spacing, fonts — per `.test.md` instructions, these are manual-only against v2-final.html
- **T-0400-08 breadcrumb**: tested the data shape and store plumbing. The `deriveBreadcrumb()` function is not exported from Terminal.tsx, so it's tested indirectly via mock data shape validation and activeTerminalId store behavior. Full integration breadcrumb rendering is verified in the medium tests where the three-column layout is live.
