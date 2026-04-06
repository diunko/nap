You are a fullstack engineer. Read your role: `.nap/00-org/40-roles/fullstack-eng.md`

## Task

Upgrade xterm.js from 5.5.0 to 6.0.0 in v3. This is a major version bump — expect breaking API changes.

## Why

The terminal has a scroll bug: viewport jumps to the first line during rapid tool calls / file edits by Claude Code. Upgrading may fix this. If not, the upgrade is still valuable for staying current.

## Current versions (packages/v3)

- @xterm/xterm: 5.5.0 → 6.0.0
- @xterm/addon-canvas: 0.7.0 (check if upgrade needed for compat)
- @xterm/addon-fit: 0.10.0 → 0.11.0
- @xterm/addon-webgl: 0.18.0 → 0.19.0 (we use canvas, but it's in deps)

## How to approach

1. **Research first**: read the xterm 6.0.0 changelog and migration guide. Check npm page, GitHub releases, any breaking changes doc. Understand what changed before touching code.

2. **Read v3 terminal code**: `packages/v3/src/renderer/terminal-registry.ts`, `packages/v3/src/renderer/components/Terminal.tsx`, `packages/v3/src/renderer/index.tsx` — understand how we use xterm APIs (open, write, onData, buffer, FitAddon, CanvasAddon, loadAddon, etc.)

3. **Bump versions**: update `packages/v3/package.json`, run npm install

4. **Fix breakages**: update any API calls that changed. Common xterm 5→6 changes might include: Terminal constructor, addon loading, buffer API, CSS imports.

5. **Test**: run `npm run test:v3:small` and `npm run test:v3:medium`. Fix any failures.

6. **Verify scroll behavior**: note any changes to how the terminal handles viewport positioning — this is the bug we're trying to fix.

## Important

- Only change `packages/v3/` — don't touch v2
- We're on the `xterm-6-upgrade` branch — commit here
- If the upgrade breaks things badly and you can't fix them, document what broke and what you tried

## Process

- Keep bash commands simple — one command per line, no `&&` chaining
- Commit after each significant step

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0630-xterm-upgrade/agents/001-fs-eng-xterm/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
