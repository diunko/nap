You're a fullstack engineer on the NAP project. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Your task: replace the filtered NapkinData model with full filesystem snapshots. The watcher should read everything in napkin dirs, the store should be the single source of truth, and the renderer should do zero path logic.

Read these in order:
1. `.nap/00-org/10-promise.nap.md`
2. `.nap/nepics/02-nepic-spaces/30-napkins/1200-napkin-store-redesign/1200-napkin-store-redesign.nap.md`
3. `.nap/nepics/02-nepic-spaces/30-napkins/1200-napkin-store-redesign/1200-napkin-store-redesign.spec.md`
4. `.nap/nepics/02-nepic-spaces/30-napkins/1200-napkin-store-redesign/1200-napkin-store-redesign.test.md`
5. `.nap/nepics/02-nepic-spaces/30-napkins/0600-live-wiring/agents/004-fs-eng-wiring-fix/proposal-napkin-store-redesign.md` — the detailed proposal with types and rendering rules

**Design reference (mandatory):**
1. Screenshots: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/01.png` through `04.png`
2. Voiceover: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/voiceover.nap.md`
3. HTML mock: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/mocks/v2-final.html`

Read the existing code:
- `src/main/napkin-watcher.ts` — rewrite readNapkinDir to produce NapkinSnapshot
- `src/renderer/store.ts` — new types, merge logic, enrich agents with terminalId
- `src/renderer/components/NapkinBrowser.tsx` — render from entries, remove path reconstruction
- `src/renderer/components/KanbanOverlay.tsx` — adapt to new types
- `src/main/preload.ts` / `src/types/electron-api.d.ts` — update types

What to build:
1. New types: NapkinSnapshot, NapkinFileEntry, NapkinAgentEntry, NapkinDirEntry
2. Rewrite `readNapkinDir` — reads ALL files/dirs, agents/ promoted, absPath on everything
3. Store merge — enriches agent entries with terminalId from sessions
4. NapkinBrowser — renders entries directly, no path reconstruction
   - Files get `*` bullet, agents get status dot bullet
   - Extended view: hover controls (⎘ copy absPath, ↗ open) on all files
   - `[terminal]` virtual entry only when agent has terminalId
5. KanbanOverlay — adapts to new type shape
6. Remove napkinsBasePath plumbing
7. Run `npm run typecheck` — zero errors

Test with: `npm run dev -- -- --cwd ~/dvl/aibanana/test-nap`

IMPORTANT: Run bash commands one at a time. Do not chain with && or ;.

CRITICAL: when you are done, write your response to `.nap/nepics/02-nepic-spaces/30-napkins/1200-napkin-store-redesign/agents/002-fs-eng-snapshot/response.md`, then run `nap done` (no message).
