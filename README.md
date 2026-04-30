# NAP — Napkin Agent Protocol

Scratch a napkin with AI in 15 minutes. Spawn agents. Take a nap. Wake up to a working system.

## Quick start

```bash
# Install
git clone <repo> && cd nap
npm install
npm run build:v3
npm run build:cli -w packages/v3
npm link -w packages/v3

# Create a project
mkdir ~/my-project && cd ~/my-project
nap3 init --template raft-viz --guardian   # or: --template random, --list-templates
nap3 open                        # launches the app

# Or with hot-reload for development
nap3 dev
```

## What it does

NAP is an Electron app where you and an AI architect brainstorm ideas into napkins — compressed bullet docs — then agents unfold those napkins into specs, tests, and code. Each agent is a full Claude Code session running in its own terminal. You can watch any agent think, talk to them, steer them mid-task.

## CLI

```
nap3 init [--template <name>] [--guardian]   Create a new project
nap3 open                                     Launch the app (walks up to find .nap/)
nap3 dev                                      Launch with hot-reload for development
nap3 setup --guardian|--skills|--import       Add capabilities to existing project

nap3 create napkin <slug>                     Create a napkin
nap3 create agent <name> --napkin <slug>      Create an agent
nap3 create nepic <slug> --name <name>        Create a new version/era
nap3 start <name> [prompt]                    Start a pre-created agent
nap3 ps                                       List all agents (tree view)
nap3 set-status <slug> <phase>                Set napkin phase
nap3 status [--napkin|--agent|--nepic]        Inspect any entity
nap3 done                                     Mark current session as done
nap3 nap <name>                               Wait for agent to complete
nap3 poke <name> <message>                    Send input to agent terminal
nap3 key <name> <key>                         Send raw keypress (enter, esc, ctrl-c, ...)
nap3 peek <name>                              Focus agent terminal in UI
nap3 log <name>                               Dump terminal scrollback
nap3 stop <name>                              Stop an agent
nap3 permission-response --agent <id> --decision allow|deny
nap3 doctor                                     Diagnose project health (spawns Claude)
```

## Project structure

```
.nap/
  00-org/                     Workflow, roles, structure
  nepics/
    01-v1/                    First version
      10-docs/                Mega napkin, milestones
      20-architects/          Architect + guardian agents
      30-napkins/             Feature napkins with agents
  ui-state.json               Persisted UI state
```

## Key concepts

- **Napkin**: a compressed bullet doc. One feature, load-bearing bullets.
- **Nepic**: a version/era. Each nepic has its own architect, napkins, agents.
- **Agent**: a full Claude Code session. Has a marker file (`.agent.nap.json`), a home dir, and a terminal.
- **Guardian**: an optional agent that auto-approves safe commands via CC hooks.
- **Marker files**: `.agent.nap.json` and `.napkin.nap.json` — the persistent state. No database.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| Cmd+B | Toggle sidebar |
| Cmd+K | Filter napkins |
| Cmd+E | Toggle focused/extended view |
| Cmd+D | Toggle debug panel |
| Cmd+` | Toggle kanban overlay |

## Templates

```bash
nap3 init --list-templates     # See available templates
nap3 init --template raft-viz  # Raft consensus visualizer
nap3 init --template random    # Surprise me
```

## Doctor

```bash
nap3 doctor                        # Diagnose project setup and health
```

Spawns Claude in your terminal with full knowledge of NAP conventions. It walks your `.nap/` directory, checks marker files, validates role docs and agent prompts, and reports what's wrong. Works without the app running — no socket needed.

## Development

```bash
npm run dev:v3                  # Dev server with HMR
npm run test:v3:small           # Vitest (fast, no Electron)
npm run test:v3:medium          # Playwright (real Electron)
npm run typecheck:v3            # TypeScript check
npm run build:v3                # Production build
```

## Monorepo

- `packages/v2/` — legacy version (reference)
- `packages/v3/` — current version
- `nap3` CLI globally linked from v3
- `nap2` CLI globally linked from v2
