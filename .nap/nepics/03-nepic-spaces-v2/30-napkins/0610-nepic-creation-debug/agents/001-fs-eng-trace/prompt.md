You are a fullstack engineer. Read your role: `.nap/00-org/40-roles/fullstack-eng.md`

## Your task

Trace the entire nepic creation flow end-to-end. Find what's broken and fix it.

## What to read

1. **Napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0610-nepic-creation-debug/0610-nepic-creation-debug.nap.md`
2. **Expected flow** (step-by-step with code paths): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0610-nepic-creation-debug/reference/expected-flow.md`
3. **Designer's J1 — clicking (+)**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0610-nepic-creation-debug/reference/j1-clicking-plus.md`
4. **Designer's J5 — clicking (+) for next version**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0610-nepic-creation-debug/reference/j5-clicking-plus.md`
5. **Full designer journeys**: `.nap/nepics/02-nepic-spaces/20-architects/001-architect/stories/00-journeys.nap.md`
6. **Designer screenshots**: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/` — screenshot 01 shows the gutter
7. **ALL v3 source code**: read every file in `packages/v3/src/` — especially the code paths listed in expected-flow.md

## How to work

1. **Read everything first** — understand the full flow before touching code
2. **Trace the flow step by step** — start from the Gutter (+) click handler, follow through IPC, socket, model, bridge, back to renderer. Log what you find at each step.
3. **Identify every bug** — disconnected IPC channels, missing handlers, wrong arguments, race conditions
4. **Fix each bug** — commit after each fix
5. **Verify the full flow works** — after fixes, the flow should be: click (+) → input name → nepic created → gutter updates → sidebar shows empty nepic with architect → architect terminal appears

## Dev setup

- The human is testing with `NAP_CWD=~/dvl/tmp/fun12 npm run dev:v3` from repo root
- Renderer changes hot-reload. Main process changes need dev server restart — tell the human.
- `nap3` CLI is globally linked.
- To rebuild CLI: `npm run build:cli -w packages/v3`

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit after each fix

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0610-nepic-creation-debug/agents/001-fs-eng-trace/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
