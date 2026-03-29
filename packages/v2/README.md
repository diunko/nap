# NAP — Napkin Agent Protocol

*Scratch a napkin with AI in 15 minutes. Spawn agents. Take a nap. Wake up to a working system.*

A terminal manager for AI agents. Electron app with a sidebar of agent cards, each running in its own pty. Agents communicate via `poke`, wait on each other via `nap`, and signal completion via `done`.

## Setup

```bash
# Clone and build
git clone <repo> ~/nap-app
cd ~/nap-app
npm install
npm run build && npm run build:cli
npm link   # puts `nap` in your PATH
```

## Usage

```bash
# Open nap in a project directory
nap open .
nap open . --name architect

# Spawn agents
nap start "claude --verbose '...'" --name fs-eng
nap start "npm test" --name test-runner

# Monitor
nap ps                        # list all sessions with colored status dots
nap log <name>                # dump terminal scrollback to stdout
nap peek <name>               # switch sidebar to that agent

# Agent communication
nap poke <name> "message"     # send message to agent's stdin
nap nap <name> --timeout 300  # block until agent is done
nap done "result"             # signal completion (from inside an agent)

# Cleanup
nap kill <name>               # kill process, card stays (gray dot)
nap close <name>              # kill + remove card
# Cmd+W                       # dismiss terminated cards from sidebar
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Cmd+B | Toggle sidebar |
| Cmd+T | New terminal |
| Cmd+W | Close terminated session |
| Cmd+K | Filter sidebar cards |
| Cmd+Click | Open file path under cursor |

## Development

```bash
npm run dev              # electron-vite dev server with HMR
npm run test:small       # vitest unit tests
npm run test:medium      # playwright + electron integration tests
npm test                 # both
npm run typecheck        # tsc --noEmit
```

## Architecture

```
src/
  main/          Electron main process — pty management, socket server, IPC
  renderer/      React + zustand — terminal display, sidebar, store
  cli/           Standalone `nap` CLI — talks to app over unix socket
  shared/        Protocol types, ndjson parser, constants
```

Per-project socket at `.nap/sock`. Each project gets its own Nap instance.
