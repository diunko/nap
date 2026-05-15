# architect onboarding — what to read before starting

* org docs (how the team works)
  * `.nap/00-org/10-promise.nap.md` — why NAP exists
  * `.nap/00-org/20-workflow.nap.md` — pipeline, agent communication, nap3 commands
  * `.nap/00-org/30-structure.nap.md` — directory layout, marker files, numbering
  * `.nap/00-org/40-roles/architect.md` — your role
  * `.nap/00-org/50-internals.md` — how the Electron app works under the hood

* the mega napkin (your seed)
  * `.nap/nepics/04-books/20-architects/001-architect/scratch/extension/00-mega-napkin.nap.md`
  * has v0/v1 scope, design threads with //DU: and //A: comments
  * read every thread — the decisions are in the nesting

* what the extension builds on (04-books nepic)
  * the extension reuses patterns from the nap.app books feature
  * read these to understand what already exists:
    * napkin-markdown tokenizer: `packages/v3/src/renderer/napkin-markdown.ts`
    * markdown-it renderer + role comments: `packages/v3/src/renderer/markdown-renderer.ts`
    * rendered mode (Cmd+J toggle): `packages/v3/src/renderer/ContentPane.tsx`
    * link routing: `packages/v3/src/renderer/routing-rules.ts`
    * themes: `packages/v3/src/renderer/themes.ts`
  * you're copying these patterns (not importing), adapted for Chrome extension context

* chrome extension specifics to research
  * `chrome.sidePanel` API — the delivery mechanism
  * `chrome.identity` — OAuth for GitHub API (v1)
  * `chrome.tabs` — controlling the main browser tab (link navigation)
  * `chrome.commands` — keyboard shortcuts (Cmd+J, test hooks)
  * `chrome.storage.local` — localStorage alternative for extensions (v1)
  * Monaco in extensions — worker setup differs from Electron (no node, web workers only)

* the monorepo
  * `packages/v2/` — legacy, ignore
  * `packages/v3/` — the Electron app (reference, don't modify)
  * `packages/extension/` — your workspace (create this)

* testing approach (from the napkin)
  * small tests: vitest, pure functions (rendering, link parsing, URL construction)
  * medium tests: Playwright + Chrome with extension loaded
  * test fixtures: real toy GitHub repo with pre-created PRs
    * agent sets up via `gh` CLI
    * deterministic but realistic

* key design decisions already made
  * side panel (right side, Chrome constraint)
  * Monaco from v0 (not rendered-only) — same napkin-markdown tokenizer
  * Cmd+J toggles rendered/edit (same as nap.app)
  * v0: edits in memory only, gone on reload
  * v1: localStorage drafts + GitHub API commit
  * copy shared code, don't import from v3
  * file structure is your call — the mega napkin doesn't prescribe it
