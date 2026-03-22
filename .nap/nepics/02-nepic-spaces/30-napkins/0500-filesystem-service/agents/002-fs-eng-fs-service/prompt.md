You're a fullstack engineer on the NAP project. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Your task: build the filesystem service — a main process module that watches `30-napkins/` and pushes live updates to the renderer.

Read these in order:
1. `.nap/00-org/10-promise.nap.md` — what NAP is
2. `.nap/nepics/02-nepic-spaces/30-napkins/0500-filesystem-service/0500-filesystem-service.nap.md` — the napkin
3. `.nap/nepics/02-nepic-spaces/30-napkins/0500-filesystem-service/0500-filesystem-service.spec.md` — the spec
4. `.nap/nepics/02-nepic-spaces/30-napkins/0500-filesystem-service/0500-filesystem-service.test.md` — test architecture

Read the existing code:
- `src/main/main.ts` — where to init the watcher
- `src/main/preload.ts` — IPC channel registration pattern
- `src/renderer/store.ts` — where napkin data will land
- `src/renderer/mock-data.ts` — current mock data (will be replaced by real data in 0600)

What to build:
1. `src/main/napkin-watcher.ts` — the filesystem service
   - `startNapkinWatcher(nepicDir, mainWindow)` / `stopNapkinWatcher()`
   - Uses `fs.watch(path.join(nepicDir, '30-napkins'), { recursive: true })`
   - On change: debounce 200ms per napkin dir, then read and push
   - Reading per napkin dir:
     - `readdir` → artifact files (.nap.md, .spec.md, .test.md, .journeys.md)
     - `readdir agents/` → agent directory names
     - Read first N lines of .nap.md → top-level `*` bullets for kanban
   - IPC channel: `napkin:update` (main → renderer)
   - On startup: full scan, send all napkins as array
   - On fs change: send single updated napkin
2. Update `src/main/preload.ts` — add `onNapkinUpdate` bridge
3. Update `src/main/main.ts` — start watcher after database init, stop on quit
4. Data structure:
   ```typescript
   interface NapkinData {
     slug: string;
     artifacts: string[];     // file extensions: ['.nap.md', '.spec.md']
     agents: string[];        // dir names: ['001-test-arch', '002-fs-eng']
     napkinBullets: string[]; // first-level * lines from .nap.md
   }
   ```
5. Run `npm run typecheck` — zero errors

Key constraints:
- Debounce per napkin dir — batch rapid file changes
- Handle missing dirs gracefully (empty 30-napkins/, no .nap.md, no agents/)
- Don't read agent internals (prompt.md, response.md) — just dir names
- Expose test helpers via `globalThis.__napTest` for Playwright

CRITICAL: when you are done, write your response to `.nap/nepics/02-nepic-spaces/30-napkins/0500-filesystem-service/agents/002-fs-eng-fs-service/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`).
