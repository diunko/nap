# What Was Built

## The POC (nepic 01)

The v1 POC proved the concept: Electron app managing AI agent terminals. 10 features, 110+ tests, bootstrapped itself (used NAP to build NAP).

Core: xterm.js terminals with DOM reparenting for instant switching, unix socket server with ndjson protocol, CLI with 10 commands (start, ps, poke, nap, done, kill, close, log, peek, open), per-project socket at `.nap/sock`.

Read: `.nap/nepics/01-poc/10-docs/inputs.nap.md` for the original seed.

## nepic 02: nepic-spaces (what Nova built)

Nova (the previous architect) led a massive effort to evolve the POC into a structured project management tool. Here's what was implemented:

### What works (tested, code exists)

**SQLite persistence** (0200)
- better-sqlite3 replaces in-memory session store
- CC session UUIDs pre-assigned via `--session-id` flag
- Sessions, napkins, nepics, ui_state tables

**Status API** (0300)
- `nap status <napkin> <status>` CLI command
- Single function: SQLite update + board symlink move
- IPC notification to renderer

**Three-column layout** (0400)
- Gutter (nepic switcher) + NapkinBrowser (sidebar) + Terminal
- Napkin cards with collapsed/focused/extended states
- Cmd+K filter, Cmd+B toggle middle column

**Filesystem service** (0500)
- fs.watch on `30-napkins/` (recursive)
- Reads artifacts, agent dirs, .nap.md bullets
- Pushes updates to renderer via IPC

**Live wiring** (0600)
- Real data in sidebar (replacing mock data)
- Kanban overlay (Cmd+`)
- Breadcrumb navigation in terminal header

**Clean quit** (0700)
- Saves UI state to SQLite on quit
- Restores on launch

**Architect resume** (0800)
- Auto-resume architect via `claude --resume <uuid>`
- Orphaned agent states

**Reconciliation** (0900)
- Filesystem walk vs SQLite on launch
- Match/new/orphan handling

**Nepic creation** (1000)
- (+) button scaffolds dirs, inserts SQLite, boots architect

**Nepic switching** (1100)
- Gutter click swaps context

**Napkin store redesign** (1200)
- Full filesystem snapshots with absPath
- No extension allowlist — shows all files

**nap init** (1300)
- CLI command bootstraps `.nap/` from templates
- Creates nap.db, first nepic, architect session

**Architect launch** (1400)
- `nap open --architect --name Nova .`
- (+) uses template prompts

**Session resume fix** (1500)
- appIsClosing flag prevents status clobbering on quit
- Everything resumable except explicitly exited agents

**Agent lifecycle redesign** (1600)
- Three tiers: bare terminal, claude session, napkin agent
- `nap start claude "prompt"` auto-detects and injects --verbose --session-id
- Home directory model, --dir, --role, --napkin flags
- Auto-resume ALL claude sessions on launch
- nap ps tree output

**Poke fix**
- Three-step delivery: text → Escape → CR (works with Claude Code's raw mode)

### What's broken (code exists but doesn't work end-to-end)

The individual pieces were built and tested in isolation, but **the user journeys don't work**:

- `nap init` → `nap open .` → architect doesn't have claude, just bash
- (+) creates architect with weak prompt, not template quality
- Switching nepics doesn't filter agents by nepic
- Agent dots don't appear under the right napkin card
- Kanban overlay doesn't always render
- Extended view styling lost the napkin feel
- Many SQLite records become orphaned/stale

The PM wrote user stories (`.nap/nepics/02-nepic-spaces/20-architects/001-architect/stories/01-core-stories.nap.md`) and Nova reviewed them with `//A:` comments flagging issues. The stories are good but need tightening — they mix app behavior with claude behavior.

### Test suite

- 140 small tests (vitest)
- 232 medium tests (playwright)
- All green as of last commit
- But tests verify components, not user journeys

### Key design docs

- **System design**: `.nap/nepics/02-nepic-spaces/20-architects/001-architect/scratch/63-agent-lifecycle.nap.md`
- **Roadmap**: `.nap/nepics/02-nepic-spaces/20-architects/001-architect/scratch/64-agent-lifecycle-roadmap.nap.md`
- **Persistence model**: `.nap/nepics/02-nepic-spaces/20-architects/001-architect/scratch/41-persistence-model.nap.md`
- **Mega napkin**: `.nap/nepics/02-nepic-spaces/10-docs/01-inputs.nap.md`
- **Design sprint screenshots**: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/`
- **Designer journeys**: `.nap/nepics/02-nepic-spaces/20-architects/001-architect/stories/00-journeys.nap.md`
- **PM stories with architect review**: `.nap/nepics/02-nepic-spaces/20-architects/001-architect/stories/01-core-stories.nap.md`
