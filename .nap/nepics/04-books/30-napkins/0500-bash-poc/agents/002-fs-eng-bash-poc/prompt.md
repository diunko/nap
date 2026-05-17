You're the fullstack engineer for 0500-bash-poc. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

## Context

We're building a Chrome extension (side panel) for reviewing PRs with mini-books. The extension needs a terminal with bash + git running fully in the browser. Files live in IndexedDB. This POC proves the terminal layer works.

Read the researcher's findings — this is your primary reference:
`.nap/nepics/04-books/30-napkins/0500-bash-poc/agents/001-researcher/response.md`

It covers all four libraries (just-bash, wterm, lightning-fs, isomorphic-git), their APIs, integration shape, and the exact implementation proposal with file structure.

Also read:
- `.nap/nepics/04-books/30-napkins/0500-bash-poc/0500-bash-poc.nap.md` — the napkin
- `.nap/nepics/04-books/30-napkins/0500-bash-poc/0500-bash-poc.spec.md` — the spec
- `.nap/nepics/04-books/30-napkins/0500-bash-poc/0500-bash-poc.stories.md` — the four stories (definition of done)

## What to build

Follow the implementation proposal from the researcher's findings (section 8). Location: `packages/bash-poc/`.

### Setup
- TypeScript project with vite
- Add `packages/bash-poc` to root `package.json` workspaces
- `tsconfig.json`, proper types
- `npm run dev` serves the POC page

### Files to create (from researcher's proposal)
1. `src/fs-adapter.ts` — LightningFS → IFileSystem adapter (~150-200 lines)
2. `src/git-command.ts` — `defineCommand("git")` wrapping isomorphic-git (clone, log, status, add, commit)
3. `src/shell.ts` — copy BashShell from `@wterm/just-bash` (~324 lines), add `fs` passthrough + `customCommands` support
4. `src/main.ts` — entry: mount wterm, init lightning-fs, wire everything together
5. `index.html` — page that loads the terminal

### Key decisions (from research)
- Don't use `@wterm/just-bash` as a dep — copy BashShell into `shell.ts` and patch it to accept `fs`
- Use `cors.isomorphic-git.org` as CORS proxy for git clone
- Single LightningFS instance shared between bash (via adapter) and git commands (direct)
- `git` registered as a custom command via `defineCommand`

### The four stories must work
Open `http://localhost:5173` in Chrome and type:

1. `git clone https://github.com/<small-public-repo>` → clone completes
2. `ls` → repo dir appears. `cd <repo>`, `cat README.md` → content prints
3. `echo "hello" >> README.md`, `git status` → shows modified
4. `git add .`, `git commit -m "test"`, `git log --oneline` → new commit shows

### Playwright tests
Create `e2e/playwright.config.ts` and `e2e/tests/terminal.spec.ts` with tests for all four stories. Follow the patterns from the researcher's findings (section 4).

The vite dev server serves the POC page. Playwright opens it, types commands, asserts output.

### Run before you're done
- `tsc --noEmit` in `packages/bash-poc/` — zero errors
- `npm run dev` — page loads, terminal appears
- Run through the four stories manually
- `npx playwright test` — all four story tests pass

CRITICAL: when you are done, write your response to .nap/nepics/04-books/30-napkins/0500-bash-poc/agents/002-fs-eng-bash-poc/response.md, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
