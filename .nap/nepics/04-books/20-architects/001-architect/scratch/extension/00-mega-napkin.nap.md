# chrome extension — side panel mini-book reader for GitHub PRs

* what it is
  * Chrome side panel that shows a mini-book alongside a GitHub PR
  * author writes a guide (markdown with file:line links to PR code)
  * reviewer opens the PR, opens the side panel, reads the guide
  * click a link in the guide → main tab scrolls to that file/line in the PR diff

* why
  * PRs are hard to review without context
  * a mini-book walks the reviewer through the change — what to read first, why each file matters, where the tricky parts are
  * the guide lives with the code (committed to repo), not in a separate tool

* architecture
  * Chrome extension with side panel API (`chrome.sidePanel`)
    * right side of browser (Chrome constraint, not configurable)
    * stays open as you navigate PR tabs (Files, Conversation, Commits)
  * content script detects PR pages, finds the mini-book
  * side panel renders markdown with napkin-markdown styling
  * links route to GitHub's file viewer

* where the mini-book lives
  * convention: committed to the repo, referenced from PR description
  * possible locations:
    * `.nap/books/<pr-topic>.md` in the PR branch
    * any .md file linked in the PR description
    * could also work with gist URLs
    * //DU: TBD
  * the extension reads the file via GitHub API (raw content endpoint)
    * //hmm, given it's markdown that's fine
    * //what about images? can we include them?
    * //A: yes — two ways:
      * relative paths in markdown (`![](./diagram.png)`) → resolve to raw.githubusercontent.com URL
      * absolute URLs → work as-is
      * the extension rewrites relative image `src` at render time
        * `src="./img.png"` → `src="https://raw.githubusercontent.com/org/repo/branch/path/img.png"`

* rendering
  * markdown-it (same as nap.app rendered mode)
  * role comment plugin (//A:, //DU:, //FS: colored blocks)
  * dark theme matching GitHub's dark mode (or adapt to GitHub's current theme)
  * tables, headers, code blocks — standard markdown-it output

* link routing
  * `file.ts:42` or `[text](path/to/file.ts#L42)` → navigate main tab
    * //DU: right! brilliant! ext can interpret links as it wishes
    * //A: exactly — we own the click handler, rewrite links however we want
  * GitHub PR file URLs: `github.com/org/repo/pull/N/files#diff-<sha256>L42`
    * sha256 of the file path gives the anchor hash
    * or: simpler — find the file element in the DOM by data attributes
    * //yep, need to iterate on how relate it to github diff ui etc
      * // basic usage: just read code, no diffs
      * // leverage github symbol navigation
      * //A: v0: just scroll to the file in Files Changed tab
        * GitHub's own symbol nav takes over from there
  * `.md` links → load in side panel (navigate between guide chapters)
    * // .ts -> open in regular tabs
      * // can we mimic vscode "virtual" tab?
      * // sticking behaviour would be dbl-click on link on start i guess? 
      * // or maybe lick on some decoration next to the link (in the book)
      * //A: `.ts` links → open as GitHub blob URL in a new browser tab
        * single-click = reuse last opened code tab (ephemeral, like our right pane)
        * double-click = open in a new tab (pinned)
        * `chrome.tabs.update` for reuse, `chrome.tabs.create` for new
  * `https://` → open in new tab

* //DU: some other ideas/questions
  * what about multiple tabs? can i open another link in a new tab?
    * kinda simulate vscode behavior but with chrome tabs
    * //A: covered above — single-click reuses tab, double-click opens new
  * would be cool to have nav pane; probably rightmost
    * would list all files of the minibook
    * //A: table of contents in the side panel
      * top of panel: collapsible chapter list (from .md filenames or H1 headers)
      * click → loads that chapter in the panel
      * small, fits naturally at the top

* repo layout
  * `packages/extension/` in the monorepo
  * shared code with v3 where possible (markdown-it renderer, role comment plugin)
    * // maybe not share it, just copy
      * // a doesnt' break b
      * // if there's need, copy
      * //A: agreed — copy, don't share. the rendering code is ~200 lines, stable, not worth a shared package
  * `manifest.json`, `background.ts`, `content.ts`, `side-panel.html`, `side-panel.ts`
    * // pls don't prescribe what files
      * // we'll have a whole architect who'll figure that out
      * //A: right — removed. architect decides structure.

* testing
  * small tests (vitest): markdown rendering, link parsing, GitHub URL construction
  * medium tests (Playwright + Chrome with extension loaded):
    * launch Chrome with `--load-extension=packages/extension/dist`
    * fixture HTML page mocking GitHub PR layout (no live GitHub, deterministic)
      * // it's ok to have a toy repo (real), with pre-created prs there and so on
      * // agent can use gh api to set up things there
        * // just public repo
      * //A: nice — real toy repo, pre-created PRs with known mini-books
        * deterministic but realistic
        * agent sets up fixtures via `gh` CLI during test scaffold
    * extension registers a keyboard shortcut (`commands` API) → Playwright sends it → side panel opens
    * assert content renders, link clicks navigate main tab

* v0 — Monaco reader + editable (no persistence)
  * side panel loads mini-book from GitHub API
  * Monaco editor with napkin-markdown tokenizer (same as nap.app)
    * // role colors, shift-enter, the whole thing
  * Cmd+J toggles between rendered (markdown-it HTML) and edit (Monaco) mode
  * editable — reviewer can add // comments inline
    * edits live in memory only, gone on panel reload
  * link routing to PR files
  * no auth needed for public repos (token for private)

* v1 — persistence + commit
  * drafts → localStorage keyed by PR URL (survives browser restart)
  * "commit" button → GitHub API pushes updated file as one clean commit to PR branch
  * auth: `chrome.identity` OAuth flow or PAT in extension settings
  * conflict handling: if file changed since load, re-fetch + re-apply edits (or show diff)

* not in scope
  * agent interaction
  * real-time updates (static content, reload to refresh)
  * left-side placement (Chrome API doesn't support it)
