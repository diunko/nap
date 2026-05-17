You're a researcher for the 0500-bash-poc feature. Your job is to study four libraries, answer specific questions, and produce a findings doc + implementation proposal. **You do not write product code.** You read source, run small experiments, and report.

## Context

We're building a Chrome extension (side panel) that sits next to GitHub PRs. The side panel will have a Monaco editor for napkin-markdown, a file tree, and a terminal. The terminal needs bash + git running fully in the browser — no server, no Node.js. Files live in IndexedDB.

The four libraries under investigation:
1. **just-bash** (vercel-labs) — bash shell in JS
2. **wterm** (vercel-labs) — DOM-based terminal renderer
3. **lightning-fs** — IDB-backed POSIX filesystem
4. **isomorphic-git** — git implementation in JS

We need to know if they wire together. If they do, the extension gets a real terminal. If they don't, we need alternatives.

## What to do

### Step 1: Clone sources

```bash
git clone https://github.com/vercel-labs/just-bash _vendor/just-bash
git clone https://github.com/vercel-labs/wterm _vendor/wterm
```

`_vendor/` is already gitignored.

Also install the npm packages to study their published APIs:
```bash
mkdir -p /tmp/bash-poc-research && cd /tmp/bash-poc-research
npm init -y
npm install just-bash @anthropic-ai/sdk 2>/dev/null; npm install just-bash @nicolo-ribaudo/chokidar-2 2>/dev/null; npm install just-bash lightning-fs isomorphic-git
```

(Try installing — some of these may have peer deps or not exist on npm under these exact names. Document what you find.)

### Step 2: Answer the research questions

Read `.nap/nepics/04-books/30-napkins/0500-bash-poc/agents/001-researcher/scratch/00-research.nap.md` — it has every question you need to answer.

For each question: read the source code, read the types, check the README, look at tests/examples in the repos. Don't guess — find the answer in the code.

### Step 3: Check maintenance status

For just-bash and wterm:
- Last commit date
- Number of npm downloads (check package.json for the published name, then look at the repo activity)
- Open issues count
- Is this actively maintained or a one-off experiment?

### Step 4: Assess Playwright testability

For the four user stories in `0500-bash-poc.stories.md`:
- Can Playwright interact with wterm's DOM? (It's DOM-based, not canvas)
- How would you type a command? (`page.keyboard.type()`? Or does wterm need a specific input method?)
- How would you assert on terminal output? (Read DOM text? Wait for specific strings?)
- What's the wait strategy for async ops (git clone takes time)?

### Step 5: Write findings

Put everything in `response.md`. Structure:

1. **just-bash** — filesystem interface, command registration, browser built-ins, maintenance
2. **wterm** — mount API, I/O flow, ANSI support, narrow div, maintenance
3. **lightning-fs + isomorphic-git** — API confirmation, CORS, performance estimate
4. **Playwright testability** — how to drive each story
5. **Bundle sizes** — rough breakdown
6. **Integration shape** — how the wiring code looks (pseudocode)
7. **Verdict** — viable / not viable / viable with caveats
8. **Implementation proposal** — if viable, what the `packages/bash-poc/` project should look like (files, deps, tsconfig, vite config)

Also read the napkin and spec for full context:
- `.nap/nepics/04-books/30-napkins/0500-bash-poc/0500-bash-poc.nap.md`
- `.nap/nepics/04-books/30-napkins/0500-bash-poc/0500-bash-poc.spec.md`
- `.nap/nepics/04-books/30-napkins/0500-bash-poc/0500-bash-poc.stories.md`

CRITICAL: when you are done, write your response to .nap/nepics/04-books/30-napkins/0500-bash-poc/agents/001-researcher/response.md, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
