# 0500 — spec

## Context

We're building a Chrome extension that puts a side panel next to GitHub PRs for reading and commenting on mini-books (napkin-format markdown). The side panel needs: Monaco editor (napkin-markdown), a file tree, and a terminal with bash + git. Files live in IDB via lightning-fs. Git operations happen client-side via isomorphic-git. This POC proves the terminal layer is viable.

## What

Research four libraries (wterm, just-bash, lightning-fs, isomorphic-git) and build a working POC that wires them together. TypeScript, proper project setup, code that carries forward to the extension.

## Phase 1: Research

Clone the source repos into `_vendor/` (add `_vendor/` to `.gitignore`):

```bash
git clone https://github.com/vercel-labs/just-bash _vendor/just-bash
git clone https://github.com/vercel-labs/wterm _vendor/wterm
```

Study the source code. Understand:

1. **just-bash filesystem interface** — does it define its own fs abstraction? Can you swap in lightning-fs? Or does it use Node's `fs` module?
2. **just-bash command registration** — how do you add a custom `git` command? Plugin API, or fork?
3. **just-bash browser support** — which built-ins actually work in browser? What breaks?
4. **wterm API** — how do you mount it? Input/output flow? ANSI escape code support? Does it work in a narrow fixed-height div (~400px wide)?
5. **lightning-fs + isomorphic-git** — confirm API pairing works in browser context.
6. **CORS** — isomorphic-git needs CORS proxy for GitHub HTTPS from browser. What are the options? `cors.isomorphic-git.org` (public), GitHub API as transport, or own proxy?
7. **Maintenance status** — last commits, npm downloads, open issues for just-bash and wterm. Are these maintained or abandoned experiments?
8. **Bundle sizes** — all four combined, is it acceptable for a Chrome extension?

Write findings to `response.md` before building. If any library is a dead end, say so and suggest alternatives.

## Phase 2: Build

Location: `packages/bash-poc/`

Setup:
- TypeScript project with vite as bundler.
- `tsconfig.json`, proper types for all four libraries.
- `npm run dev` serves the POC page with HMR.
- Add `packages/bash-poc` to the root `package.json` workspaces.

Wire:
- Mount wterm in a full-page div.
- Wire wterm input → just-bash → wterm output.
- just-bash filesystem backed by lightning-fs (IDB).
- Register `git` command that delegates to isomorphic-git:
  - `git clone <url>` → `git.clone({ fs, http, dir, url })`
  - `git log [--oneline] [-n N]` → `git.log({ fs, dir })` → format and print
  - `git status` → `git.statusMatrix({ fs, dir })` → format and print
  - `git add .` → `git.add({ fs, dir, filepath: '.' })`
  - `git commit -m "msg"` → `git.commit({ fs, dir, message, author })`

Test by opening in Chrome:
```
git clone https://github.com/<small-public-repo>
ls
cd <repo-name>
cat README.md
git log --oneline
git status
```

## What to report

In `response.md`:
- Research findings for each library (API, viability, surprises).
- CORS situation and recommended approach.
- Maintenance status assessment.
- Bundle size breakdown.
- Which commands work, which don't, and why.
- Performance notes (clone time, terminal responsiveness).
- Overall verdict: is this stack viable for the Chrome extension side panel?
- If not viable, what alternatives and why.
