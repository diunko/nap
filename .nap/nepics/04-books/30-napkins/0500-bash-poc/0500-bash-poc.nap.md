# 0500 — browser bash + git POC

* the big picture
  * we're building a Chrome extension (side panel) for reviewing PRs with mini-books
  * side panel has: Monaco editor (napkin-markdown), file tree, and ideally a terminal
  * the terminal is the missing piece — need bash + git running in the browser
  * files live in IDB via lightning-fs — Monaco and terminal share the same filesystem
  * git operations happen client-side via isomorphic-git against the IDB repo
  * this POC proves the terminal layer is viable before we build the extension

* the four libraries
  * wterm (vercel-labs) — DOM-based terminal renderer
  * just-bash (vercel-labs) — bash parser + executor in JS
  * lightning-fs — IDB-backed POSIX filesystem
  * isomorphic-git — git in JS, uses lightning-fs

* goal
  * prove they work together
  * type `git clone`, `ls`, `cat`, `git log` — all in browser, all in IDB
  * proper TypeScript setup — this code becomes the seed for the extension

* research phase (before building)
  * clone sources into `_vendor/` (gitignored) to study:
    * `git clone https://github.com/vercel-labs/just-bash _vendor/just-bash`
    * `git clone https://github.com/vercel-labs/wterm _vendor/wterm`
  * understand:
    * just-bash: filesystem interface — can we plug lightning-fs?
    * just-bash: command registration — how to add `git` as a custom command?
    * just-bash: browser built-ins — which of ls/cat/cd/echo actually work?
    * wterm: mount API, input/output flow, ANSI color support
    * wterm: does it work in a constrained div (Chrome side panel is ~400px wide)?
    * lightning-fs + isomorphic-git: standard pairing, confirm API
  * also check:
    * CORS — isomorphic-git needs CORS proxy for GitHub HTTPS from browser
      * `cors.isomorphic-git.org` is public, need our own for production?
      * or can we use GitHub API directly as transport?
    * maintenance status — last commits, npm downloads, open issues
    * bundle sizes — all four combined, acceptable for extension?
  * write findings to response.md before building

* the POC
  * location: `packages/bash-poc/`
  * TypeScript + vite (already in monorepo)
  * proper tsconfig, proper types
  * this scaffold carries forward to the extension if viable
  * test sequence:
    * `git clone https://github.com/<small-public-repo>`
    * `ls`, `cd`, `cat README.md`
    * `git log --oneline`
    * `git status`

* unknowns
  * can just-bash use lightning-fs as its filesystem?
  * is just-bash maintained? (vercel-labs can be experimental/abandoned)
  * CORS for git clone from browser
  * performance of git clone into IDB
  * wterm in a narrow fixed-height div

* if it doesn't work
  * document what broke and why
  * suggest alternatives (xterm.js + custom command dispatcher, Monaco command palette, button bar)
