Read your role: `.nap/00-org/40-roles/fullstack-eng.md` — it tells you to read org docs. Do that first.

## Project context

Read all of these before looking at the feature. They define what we're building, why, and what the approved design looks like.

- `.nap/nepics/05-extension/10-docs/02-app-ux.nap.md` — how nap works: navigation/map/territory model, the comprehension problem, sidebar card system, Monaco editor with napkin-markdown tokenizer, terminal as escape hatch, two-repo bridge. This is the most important doc — it explains what every UI element means.
- `.nap/nepics/05-extension/10-docs/context/10-du-thoughts.nap.md` — the vision: workflowy zoom, decorations, diff layers, @mentions, concurrent cursors. Where the editor surface evolves. Don't make decisions that close off these paths.
- `.nap/nepics/05-extension/10-docs/context/design-spec.nap.md` — every design decision for the extension: layout, nav card system, agent dots, tab bar, editor tokens, terminal dark theme, resize handle, theme variables. This is your implementation spec for the UI.
- `.nap/nepics/05-extension/10-docs/context/mock-e-screenshot.png` — what it should look like, side by side with GitHub.
- `.nap/nepics/05-extension/10-docs/context/02-workflow.nap.md` — how the reviewer enters: link with #fragment, state-key per PR, auto-clone, napkin focus, fetch latest.
- `.nap/nepics/05-extension/30-napkins/0200-design-sprint/mocks/mock-e.html` — THE design target. Open it in a browser. Study every detail — card focus, agent dots, file rows, tab bar, resize handle, token colors. Your implementation must match this.

## The feature

- `.nap/nepics/05-extension/30-napkins/0300-design-impl/0300-design-impl.nap.md` — what to build.

## Your task

Build the extension side panel to match mock-e. The current `packages/extension/side-panel.html` is a throwaway prototype from an earlier spike — don't patch it, replace it.

**Start from mock-e's HTML/CSS.** Take the mock's layout, styles, and structure. Wire the proven internals into it: Monaco editor, wterm terminal, LightningFS, git-command, shell, nav tree parser, link routing, auto-save, settings.

### What to replace (throw away)

- `side-panel.html` — replace entirely with mock-e's layout + CSS
- Nav tree rendering in `side-panel.ts` — replace flat list with card system from mock-e
- Tab bar — replace simple toggle with mock-e's tab bar (ephemeral italic, permanent, close on hover)
- Terminal wterm CSS — replace light palette with dark (bg #1e1e1e, fg #e5e5e5, prompt green #22c55e). Look at `packages/bash-poc/index.html` for the working dark palette.

### What to keep (proven, working)

- Monaco worker config (CSP proven)
- `fs-adapter.ts`, `git-command.ts`, `shell.ts` — working code
- `napkin-markdown.ts` — tokenizer
- `link-routing.ts` — routeLink, buildGitHubUrl, navigateGitHubTab
- `nav-tree.ts` — parseNavTree pure function (keep logic, replace rendering)
- `theme.ts` — lightBlue theme + CSS variable generation
- `content.ts` — trigger button, nav messages
- `background.ts` — sidePanel.open handler
- Auto-save (onDidChangeModelContent → debounced writeFile)
- Refresh-on-focus (re-read from LFS on tab switch)
- Settings overlay (move into mock-e's layout)
- Shell onCommandComplete callback (auto-refresh nav after git clone)

### Specific things to get right

1. **Nav tree must use the card system** — collapsed headers with `*` + name + agent dots + phase. Focused card with blue left border + body. Agents flattened (skip agents/ dir). `*` is the structural element, not triangles. Study mock-e's nav carefully.

2. **Agent dots** — color = role (test-arch orange, fs-eng green, test-eng gray), shape = status (filled = running, dashed+check = done, hollow = exited). Two dimensions in one element.

3. **Links always visible** — underlined and colored in the editor at all times, not just on Cmd+hover.

4. **Terminal goes dark** — when Terminal tab is active, the entire content area switches to dark. The tab bar can stay light or adapt (see how mock-e handles this).

5. **Ephemeral tabs** — single-click in nav opens file in italic ephemeral tab (reuses slot). Double-click or editing makes it permanent.

### Fixture content

Use `fixtures/.nap/` for real content when testing. The nav tree should display the space-pizza delivery pipeline structure — chapters, agents with dots, spec files.

NOTE: fixtures currently lack `nepics/` wrapping. Add `fixtures/.nap/nepics/01-v1/` and move the content there before testing. Update `fixtures/sync.sh` and `fixtures/README.md` accordingly.

### Testing

After building, all existing tests should still pass:
- `npx vitest run` (29 small tests)
- Playwright e2e tests — the UX test (`ux-e2e.spec.ts`) is the most important. It may need selector updates if DOM structure changed, but the flow should be the same.

Build, test, iterate until it matches mock-e and tests pass.

CRITICAL: when you are done, write your response to `.nap/nepics/05-extension/30-napkins/0300-design-impl/agents/001-fs-eng-design-impl/response.md`, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
