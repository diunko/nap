You're a test architect on the NAP project. Read your role in `.nap/00-org/40-roles/test-architect.md`.

Your task: design the test architecture for 1200-napkin-store-redesign — replacing the filtered NapkinData model with full filesystem snapshots.

Read these:
- `.nap/nepics/02-nepic-spaces/30-napkins/1200-napkin-store-redesign/1200-napkin-store-redesign.nap.md`
- `.nap/nepics/02-nepic-spaces/30-napkins/1200-napkin-store-redesign/1200-napkin-store-redesign.spec.md`
- `.nap/nepics/02-nepic-spaces/30-napkins/0600-live-wiring/agents/004-fs-eng-wiring-fix/proposal-napkin-store-redesign.md` — the detailed proposal
- `.nap/nepics/02-nepic-spaces/10-docs/01-inputs.nap.md` — mega napkin

Read the existing code:
- `src/main/napkin-watcher.ts` — what's being rewritten
- `src/renderer/store.ts` — types and merge logic changing
- `src/renderer/components/NapkinBrowser.tsx` — renders from store
- `src/renderer/components/KanbanOverlay.tsx` — uses napkin data
- `tests/` — existing patterns

Seams:
- Does readNapkinDir produce correct NapkinSnapshot with all files, not just known extensions?
- Are agent dirs promoted correctly (type='agent' with nested files)?
- Are non-agent subdirs captured as type='dir'?
- Does every entry have correct absPath?
- Does store merge enrich agents with terminalId from sessions?
- Does NapkinBrowser render arbitrary files, not just known ones?
- Does extended view show agent files with hover controls?
- Does [terminal] virtual entry appear only for agents with live sessions?
- Does kanban still work with new type shape?
- Are existing napkin watcher tests updated or replaced?

IMPORTANT: Run bash commands one at a time. Do not chain with && or ;.

Write your test architecture to `.nap/nepics/02-nepic-spaces/30-napkins/1200-napkin-store-redesign/1200-napkin-store-redesign.test.md`.

CRITICAL: when you are done, run `nap done` in your terminal (no message argument — just `nap done`).
