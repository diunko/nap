# Response: xterm.js 5.5.0 → 6.0.0 upgrade

## What changed

### package.json (`packages/v3/`)
- `@xterm/xterm`: `^5.0.0` → `^6.0.0` (installed 6.0.0)
- `@xterm/addon-fit`: `^0.10.0` → `^0.11.0` (installed 0.11.0)
- `@xterm/addon-webgl`: `^0.18.0` → `^0.19.0` (kept as dep, not actively loaded)
- **Removed** `@xterm/addon-canvas` — package was discontinued upstream in 6.0.0

### terminal-registry.ts
- Removed `CanvasAddon` import and `loadAddon(new CanvasAddon())` call
- Terminal now uses the built-in DOM renderer (no addon needed)
- Chose DOM over WebGL to stay consistent with the prior design decision (comment: "WebGL removed — simpler, fewer CSP issues")

### No other files changed
- All existing xterm APIs we use (`Terminal`, `FitAddon`, `open`, `write`, `onData`, `onWriteParsed`, `onScroll`, `scrollToBottom`, `registerLinkProvider`, `loadAddon`, `dispose`, `element`, `cols`, `rows`, `focus`) are unchanged in 6.0.0
- CSS import path (`@xterm/xterm/css/xterm.css`) unchanged
- Terminal constructor options unchanged

## Verification: xterm 6.0.0 is actually bundled

npm workspaces hoists deps — the root `node_modules/@xterm/xterm` stays at 5.5.0 (v2's `^5.0.0` constraint). But `packages/v3/node_modules/@xterm/xterm` has 6.0.0. Vite resolves from the package root, so v3 gets 6.0.0.

Confirmed by grepping the built renderer bundle:
- `xterm-scrollable-element` (6.0-only CSS) **present** in `out/renderer/assets/index-*.css`
- `xterm-scroll-area` (5.x-only CSS) **absent** from all output files

## Tests (verified against xterm 6.0.0 bundle)
- **177/177 unit tests pass** (`test:v3:small`)
- **35/35 e2e tests pass** (`test:v3:medium`) — all 35 including survivability, CLI integration, archived-agents
- TypeScript typecheck passes with zero errors

## Scroll bug notes

xterm 6.0.0 completely rewrote the viewport/scrollbar system (#5096), replacing the custom `Viewport` class with VS Code's `SmoothScrollableElement`. This is a major internal change that includes fixes for:
- Scrollbar teleport after exiting alt buffer (#5390)
- Scroll dimensions when switching buffers (#5127)
- Viewport refresh after clear or ED (#5328)
- Page scrolling prevention in alt buffer (#5437)
- Smooth scroll running more than once per frame (#5037)

This rewrite is the most likely candidate to fix the viewport-jumps-to-first-line bug during rapid tool calls. Needs manual verification in a live session with Claude Code running.

## Decisions
- **DOM renderer over WebGL**: the prior code explicitly chose canvas over WebGL for CSP simplicity. With canvas gone, DOM is the simpler equivalent. WebGL addon is still in deps if we want to switch later.
- **No new theme properties added**: xterm 6.0.0 adds `scrollbarSliderBackground`, `scrollbarSliderHoverBackground`, `scrollbarSliderActiveBackground` to `ITheme`. Leaving defaults for now — they look fine with our dark theme.
