# Lessons from nepic 02

## What worked

**The napkin → spec → test arch → fs-eng → test-eng pipeline.** Every feature went through this. Test architects found real design issues. Test engineers found real bugs (pty shutdown race, ABI conflicts, startup timing). The pipeline produces quality.

**Design sprint first.** The UX designer produced amazing work — screenshots, voiceover, interactive HTML mocks. Every subsequent implementation referenced these. The designer even spawned their own sub-agent to build mocks. The design is the north star.

**One mega napkin as source of truth.** Having `01-inputs.nap.md` as the authoritative system description meant every agent could understand the whole. It was iterated 4 times (50→51→52→final).

**Pre-assigning CC session UUIDs.** Research agent discovered `claude --session-id <uuid>` — lets NAP control session identity. Game changer for resume.

**Poke fix.** Research agent traced the bug through xterm.js, node-pty, and Ink source code. Found the three-step delivery pattern. Deep research pays off.

## What didn't work

**Testing components, not journeys.** 232 tests pass but the app doesn't work end-to-end. Each napkin was tested in isolation — the wiring between them was never verified as a complete flow.

**Too many napkins, too fast.** 16 napkins implemented sequentially, each adding complexity. By napkin 12, the accumulated technical debt made each subsequent napkin harder. The last few (1400-1600) spent significant time fixing things earlier napkins broke.

**The architect doesn't write code — but should trace flows.** Nova correctly delegated all implementation to agents. But nobody traced the actual user journeys through the code. The PM wrote stories, Nova reviewed them, but nobody walked through: "when the user clicks (+), which function fires, what SQL runs, what IPC sends, does the renderer actually render it?"

**Agents forget `nap done`.** Constant problem. Even with CRITICAL in the prompt, agents would finish work and sit at the prompt without signaling. We added it to role docs, to workflow docs, made it the last line of every prompt — still happens.

**Native module ABI conflicts.** better-sqlite3 compiled for Electron breaks vitest (system Node). Solution: native module tests must be Playwright (medium), never vitest (small). Rule codified in test-architect role doc.

**SQLite records become stale.** Sessions from previous runs, double invocations, and errors leave orphaned rows. The reconciliation (0900) handles filesystem vs SQLite, but session cleanup is incomplete.

## Key architectural decisions

- **SQLite is annotation layer** — filesystem defines what exists, SQLite annotates with metadata. Reconciliation on launch.
- **Three tiers** — bare terminal (no resume), claude session (resumable), napkin agent (resumable + napkin containment).
- **appIsClosing flag** — prevents quit from marking sessions as exited. Makes close/open invisible.
- **Every agent has a home dir** — the sidebar card is a window into that dir.
- **`nap start claude "prompt"`** — NAP detects `claude` as first arg, auto-injects --verbose --session-id.

## What the human cares about

- **It should just work.** Close the app, open it, everything is there. No orphaned states, no missing agents, no broken flows.
- **The sidebar IS a napkin.** Asterisk bullets, nesting, labels not sentences. The tool speaks its own language.
- **Agents are first-class citizens.** Full Claude Code sessions, visible, interactive. Never internal subagents.
- **Keep bash commands simple.** One command per line, no && chaining. The human auto-approves simple commands but denies compound ones.
- **No Co-Authored-By in commits.** Concise one-line commit messages.
- **Use `nap` CLI, not node/npx wrappers.** The stable CLI is globally linked.
