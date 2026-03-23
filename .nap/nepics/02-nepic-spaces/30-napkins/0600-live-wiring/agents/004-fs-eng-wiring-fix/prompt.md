You're a fullstack engineer on the NAP project. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Your task: fix the live wiring between backend and frontend. The napkin browser is empty — the UI doesn't show napkins from the filesystem.

## The bug

The backend works: reconciliation populates SQLite, napkin watcher scans `30-napkins/`, the data is there. But the sidebar shows nothing — NapkinBrowser renders an empty list.

The wiring code exists (built in 0600-live-wiring). IPC listeners are in `index.tsx`. Store has `setNapkinData`. But something in the startup chain is broken:

```
app launches → napkin watcher scans → IPC napkin:update fires → store populates → NapkinBrowser renders
```

The tests passed because they injected data directly into the store, bypassing the real startup flow. So the bug is likely in the real IPC delivery path.

## What to investigate

1. Does `startNapkinWatcher` actually get called on startup? With the right nepic dir?
2. Does it send `napkin:update` IPC to the renderer window?
3. Does the renderer's `onNapkinUpdate` listener fire?
4. Does `setNapkinData` actually update the store?
5. Does NapkinBrowser read from `store.napkins`?
6. Is there a timing issue — watcher sends data before renderer mounts the listener?

## How to test

Use the test project at `~/dvl/aibanana/test-nap/` which has realistic `.nap/` structure with two nepics and 13 napkins.

Run the app in dev mode pointed at it:
```bash
npm run dev -- -- --cwd ~/dvl/aibanana/test-nap
```

Add `console.log` statements at each step of the chain to trace where data stops flowing. Check Electron dev tools console (Cmd+Option+I in the app).

## Read

- `src/main/main.ts` — where watcher starts, where reconciliation runs
- `src/main/napkin-watcher.ts` — the filesystem service
- `src/main/preload.ts` — IPC bridges
- `src/renderer/index.tsx` — IPC listeners
- `src/renderer/store.ts` — setNapkinData, napkins state
- `src/renderer/components/NapkinBrowser.tsx` — what reads the data
- `.nap/nepics/02-nepic-spaces/30-napkins/0600-live-wiring/agents/002-fs-eng-wiring/response.md` — what was originally built
- `.nap/nepics/02-nepic-spaces/30-napkins/0600-live-wiring/agents/003-test-eng-wiring/response.md` — test results

Also read the kanban overlay:
- `src/renderer/components/KanbanOverlay.tsx` — should show napkins when Cmd+` is pressed

Fix the issue. Make sure napkins appear in the sidebar and kanban when the app opens. Run `npm run typecheck` when done.

IMPORTANT: Run bash commands one at a time. Do not chain with && or ;.

CRITICAL: when you are done, write your response to `.nap/nepics/02-nepic-spaces/30-napkins/0600-live-wiring/agents/004-fs-eng-wiring-fix/response.md`, then run `nap done` (no message).
