# 05-extension — architect onboarding

* what this is
  * Chrome extension with a side panel for reading and commenting on mini-books
  * mini-books are deep technical guides written alongside PRs
    * walk a reviewer through the change: what to read first, why each file matters, tricky parts
    * markdown files with file:line links into the codebase
    * threaded // comments for human↔human and human↔AI discussion
  * the extension shows the mini-book next to GitHub's PR view

* why mini-books exist
  * PRs are hard to review without context
  * a 20-page chapter explaining the copy pipeline beats 50 inline PR comments
  * the guide lives with the code (committed to repo), evolves with the discussion
  * read `.nap/nepics/04-books/20-architects/001-architect/scratch/book-napkin-iter/` — that's where the concept evolved
  * read `.nap/nepics/04-books/20-architects/001-architect/scratch/10-mega-napkin.nap.md` — the mega napkin for the books feature in nap.app

* the example mini-book (removed from repo, see it in git)
  * `git show c2790ba~1:.nap/nepics/04-books/20-architects/001-architect/scratch/book-napkin-iter/example-minibook/01-copy-pipeline.md`
  * 5 chapters (01-copy-pipeline, 01a-copy-triggers, 02-id-universe, 03-whats-lost, 04-apps-risks)
  * each ~20KB, deeply technical, full of `[file.ts:51](path/to/file.ts#L51)` links
  * _research/ subfolder with materials gathered before writing
  * THIS is what the extension displays in the side panel

* the POC (proven, working)
  * `packages/bash-poc/` — browser terminal with bash + git over IDB
  * four libraries wired together:
    * wterm (DOM terminal renderer)
    * just-bash (bash in JS)
    * lightning-fs (IDB filesystem)
    * isomorphic-git (git in JS)
  * 16 Playwright tests, all green
  * read the POC code — it's the foundation for the extension's terminal surface
  * read the researcher's findings: `.nap/nepics/04-books/30-napkins/0500-bash-poc/agents/001-researcher/response.md`
  * read the builder's report: `.nap/nepics/04-books/30-napkins/0500-bash-poc/agents/002-fs-eng-bash-poc/response.md`

* the refined v0 scope
  * `.nap/nepics/04-books/20-architects/001-architect/scratch/extension/33-v0.nap.md`
  * three surfaces in the side panel: terminal, editor, file tree
  * terminal = POC (wterm + just-bash + lightning-fs + isomorphic-git)
  * editor = Monaco with napkin-markdown tokenizer (copy from v3)
  * file tree = reads from same IDB filesystem
  * shared LightningFS instance — terminal and editor see the same files
  * git flow via terminal: clone, edit in editor, commit + push from terminal

* the full roadmap
  * `.nap/nepics/04-books/20-architects/001-architect/scratch/extension/22-ext-scope.nap.md`
  * v0: side panel reader + ephemeral editing + terminal
  * v1: persistence (IDB is already persistence via git) + commit/push
  * v2: workflowy mode (zoom, breadcrumbs, tags)
  * v3: rich editing (anchors, cross-linking, diff layers)
  * v4: collaboration (cursors, presentation, versioning)
  * focus on v0 for now. v1+ will be planned after v0 ships.

* design threads to read (all decisions are in the nesting)
  * `.nap/nepics/04-books/20-architects/001-architect/scratch/extension/00-mega-napkin.nap.md` — original design with //DU: and //A: threads
  * `.nap/nepics/04-books/20-architects/001-architect/scratch/extension/10-du-thoughts.nap.md` — workflowy ideas, token sizing, decorations, cursors, diff layers
  * `.nap/nepics/04-books/20-architects/001-architect/scratch/extension/30-v0v1-napkin.nap.md` — v0+v1 with DU feedback
  * `.nap/nepics/04-books/20-architects/001-architect/scratch/extension/31-v0.nap.md` — v0 focused
  * `.nap/nepics/04-books/20-architects/001-architect/scratch/extension/32-v0.nap.md` — v0 with isomorphic-git

* what nap.app built (patterns to copy, not import)
  * napkin-markdown tokenizer: `packages/v3/src/renderer/napkin-markdown.ts`
  * markdown-it renderer + role comments: `packages/v3/src/renderer/markdown-renderer.ts`
  * link routing: `packages/v3/src/renderer/routing-rules.ts`
  * themes: `packages/v3/src/renderer/themes.ts`
  * shift-enter continuation: in `napkin-markdown.ts`
  * these are reference — copy and adapt for Chrome extension context

* org docs (how the team works)
  * `.nap/00-org/10-promise.nap.md` — why NAP exists
  * `.nap/00-org/20-workflow.nap.md` — pipeline, agent communication, nap3 commands
  * `.nap/00-org/30-structure.nap.md` — directory layout, marker files
  * `.nap/00-org/40-roles/architect.md` — your role
  * `.nap/00-org/50-internals.md` — how nap.app works (the Electron app)

* key decisions already made
  * Chrome side panel (right side, Chrome API constraint)
  * wterm + just-bash + lightning-fs + isomorphic-git (POC proven)
  * Monaco with napkin-markdown tokenizer (copy from v3)
  * terminal IS the git UI — no commit button, you `git push` from bash
  * one LightningFS instance shared between all surfaces
  * CORS proxy for git clone (public `cors.isomorphic-git.org` for now)
  * PAT for auth (chrome.storage.sync), not OAuth
  * copy shared code from v3, don't import
  * Playwright + Chrome with `--load-extension` for testing
  * `packages/extension/` is your workspace in the monorepo
