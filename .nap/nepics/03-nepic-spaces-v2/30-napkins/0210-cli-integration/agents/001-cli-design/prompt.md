You are a fullstack engineer. Read your role: `.nap/00-org/40-roles/fullstack-eng.md`

Think like Linus Torvalds. Be thorough, opinionated, and ruthlessly practical about CLI design.

## Your task

Design the v3 CLI for NAP. The entity management model has changed: instead of SQLite rows, we now have marker files (.agent.nap.json, .napkin.nap.json) on the filesystem. The app model owns all writes while running. The CLI talks to the app through a unix socket.

Your job is NOT to implement — it's to think through what the CLI should look like and produce a design document.

## What to read (take your time — read ALL of these thoroughly)

1. **The 0210 napkin** (current draft): `.nap/nepics/03-nepic-spaces-v2/30-napkins/0210-cli-integration/0210-cli-integration.nap.md`
2. **The v2 CLI** (what exists today): `packages/v2/src/cli/nap.ts` — study every command, every flag, how they're used
3. **The v3 CLI** (current copy): `packages/v3/src/cli/nap.ts` — same code, needs to evolve
4. **Designer's journeys** (how humans and architects actually use the tool): `.nap/nepics/02-nepic-spaces/20-architects/001-architect/stories/00-journeys.nap.md`
5. **PM stories** (concrete user stories): `.nap/nepics/02-nepic-spaces/20-architects/001-architect/stories/01-core-stories.nap.md`
6. **The workflow** (how architects launch agents): `.nap/00-org/20-workflow.nap.md`
7. **The v3 model** (what entities look like now): `packages/v3/src/shared/bridge-types.ts` and `packages/v3/src/main/model.ts`
8. **The marker file shape**: read the 0200 napkin for the full .agent.nap.json shape: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0200-survivability/0200-survivability.nap.md`
9. **Mega napkin** (the full vision): `.nap/nepics/03-nepic-spaces-v2/10-docs/01-inputs.nap.md`

## What to think about

Three users of the CLI:
- **The human** — runs `nap init`, `nap open`, occasionally `nap ps` or `nap status` to check on things
- **The architect agent** — runs `nap start` to spawn sub-agents, `nap nap` to wait, `nap status` to move napkins, creates napkins and agent dirs
- **Worker agents** (fs-eng, test-eng, etc.) — run `nap done` when finished, that's about it

Questions to answer:
- What does `nap start` look like in v3? How does it know which napkin, which nepic? Context from cwd? Explicit flags? Both?
- How does the architect create a napkin? `nap create napkin 0300-feature`? Or is it just `mkdir` + the app picks it up?
- How does the architect create an agent without starting it? (Set up dir + prompt.md first, then start)
- What about nepic context? The architect is always working within a nepic. Does every command need `--nepic` or is it derived?
- What about `nap init`? It runs without the app. What does it write?
- What about `nap open`? Any flags needed beyond `--cwd`?
- How minimal can we make this while keeping it usable from an agent's terminal?
- What flags are required vs optional? What has good defaults?
- How do IDs work in the CLI? UUIDs are ugly to type. Names can collide. What's the resolution strategy?

## What to produce

Write a CLI design document to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0210-cli-integration/agents/001-cli-design/response.md`.

It should include:
- Every command with its syntax, flags, and defaults
- Who uses each command (human, architect, worker agent)
- How nepic/napkin context is resolved (explicit vs derived)
- How agent identity works in commands (name resolution strategy)
- What `nap init` writes to disk
- Any commands you'd add or remove compared to v2
- Your reasoning for non-obvious decisions

Be opinionated. If something from v2 is wrong, say so and propose better. If a command isn't needed, kill it.

CRITICAL: when you are done, write your design to the response.md path above, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
