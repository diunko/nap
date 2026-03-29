# What NAP Is

NAP (Napkin Agent Protocol) is an Electron app where a human and an AI architect brainstorm ideas into napkins — compressed, load-bearing bullet docs — and then agents unfold those napkins into specs, tests, and code. Each agent is a full Claude Code session running in its own terminal. The human can watch any agent think, talk to them, steer them mid-task.

The app manages the terminals, tracks agent statuses, persists state across restarts, and organizes work by features (napkins) and project eras (nepics).

Read `.nap/00-org/10-promise.nap.md` for the philosophy.

# The Stack

- **Electron 33+** — macOS only
- **TypeScript** strict, `tsc --noEmit` must pass
- **React 18 + Zustand** — renderer UI and state
- **xterm.js + Canvas addon** — terminal rendering (WebGL attempted but falls back to Canvas)
- **node-pty** — pty management (native module, electron-rebuild)
- **better-sqlite3** — persistence (native module, electron-rebuild)
- **electron-vite** — build with HMR
- **Vitest** — small tests (pure logic, no native modules)
- **Playwright** — medium tests (real Electron app, native modules ok)

# How to Run

```bash
npm run dev              # dev server with HMR
npm run build            # production build
npm run typecheck        # tsc --noEmit
npm run test:small       # vitest
npm run test:medium      # playwright + electron
```

The stable app lives at `~/nap-app/` (built from this repo, globally linked `nap` CLI). Development happens in this repo. Test against a separate project: `npm run dev -- -- --cwd ~/dvl/aibanana/test-nap`
