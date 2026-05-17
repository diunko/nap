# extension v0+v1 — side panel reader with persistence

* v0: the reader

  * side panel setup
    * manifest.json with sidePanel permission
    * background.ts: register side panel, detect github.com/*/pull/* pages
    * side-panel.html: Monaco + rendered view container
    * content.ts: extract repo/PR info from URL, find mini-book reference
    * // we'll have more funcionality; e.g. see fs thing
      * // can we create more scalable file structure? this feels very adhoc

  * loading mini-books
    * convention: folder of numbered .md files in the PR branch
      * e.g. `.nap/books/01-copy-pipeline.md`, `02-id-universe.md`, ...
      * sorted by filename prefix (01, 02, 03)
      * // okay, let's do this first:
        * // it should take a napkin directory and show file tree there
        * // just like nap does in extended mode
        * // file tree goes to panel on right
        * // and then on left goes the book/or markdown
          * // the inspo screenshot is in extennsion/scheenshots/00.png
    * discovery: scan folder via GitHub API (GET /repos/:owner/:repo/contents/:path?ref=branch)
    * content: fetch each file raw (GET /repos/:owner/:repo/contents/:path, Accept: raw)
    * chapter list shown at top of panel (collapsible TOC from filenames or H1 headers)
      * // tech POC: can we fetch napkin folder content from github?
      * // should we be storing that in IDB or smth to not hit api each time it's reloaded?
        * // what would be approaches to do that?
          * // it feels that "fs in idb" should have simplest mental model
          * // can monaco work with that?

  * Monaco editor
    * napkin-markdown tokenizer (copy from v3, not import)
    * same editor config: word wrap, no minimap, no line numbers, dark theme
      * // theme should be light
    * editable — reviewer can add // comments inline
    * shift-enter continuation (same as nap.app)
      * // did you see my comments in 00-du-thoughts? 
        * // near beginning i describe tweaks in prefix behavior that i need
        * // should be both in nap and ext
          * // can start with either

  * Cmd+J rendered/edit toggle
    * rendered: markdown-it + role comment plugin (copy from v3)
      * // don't bother about rendered; that's proven
      * // focus on inline-markdown capabilities
      * // rendered can come following at very small price
    * Cmd+click in rendered → edit at source line
    * same data-source-line mapping

  * link routing
    * file:line links in the book → navigate main browser tab
      * construct GitHub PR file URL: `/pull/N/files` + scroll to file + line
      * approach: content script finds the file element in GitHub DOM, scrolls into view
    * .md links → load another chapter in the panel
    * https:// → open in new tab
    * .ts/.tsx links → open GitHub blob URL
      * single-click: reuse last code tab (chrome.tabs.update)
      * double-click: new tab (chrome.tabs.create)
    * // caveat: highlighting doesn't work well in monaco now
      * // well, it just doesn't work
      * // can we have links highlighted?
        * // and yeah, having to hold cmd is fine for editable mode

  * theme
    * detect GitHub's current theme (light/dark) from DOM or prefers-color-scheme
    * match Monaco + panel chrome to it

  * edits are ephemeral — gone on panel reload

* v1: persistence + commit

  * localStorage model
    * key: `nap-ext:${owner}/${repo}#${prNumber}:${filePath}`
    * value: full markdown content (modified version)
    * save on every edit (debounced 1s, same as nap.app auto-save)
    * on panel open: check localStorage first, fall back to GitHub API
    * "discard drafts" button → clear localStorage for this PR, reload from API

  * commit flow
    * "commit" button in panel header
    * collects all modified files for this PR (scan localStorage keys)
    * GitHub API: create tree → create commit → update ref
      * single commit with all changed files (not one commit per file)
    * commit message: "review comments by [username]" or user-editable
    * after commit: clear localStorage for committed files
    * error handling: if branch moved since load, show conflict warning

  * auth
    * API token stored in chrome.storage.sync (syncs across devices)
    * settings page: paste GitHub PAT, test connection
    * token used for: reading private repos (v0 works without token for public) + committing (v1)

  * visual indicators
    * modified files in TOC get a dot (unsaved draft exists)
    * "X files with drafts" badge on commit button

* testing
  * small (vitest): markdown rendering, link URL construction, localStorage key generation
  * medium (Playwright + Chrome + extension):
    * real toy GitHub repo with pre-created PRs + mini-books
    * keyboard shortcut to open side panel (chrome.commands)
    * assert: chapter loads, links navigate, edit persists in localStorage, commit creates PR commit
