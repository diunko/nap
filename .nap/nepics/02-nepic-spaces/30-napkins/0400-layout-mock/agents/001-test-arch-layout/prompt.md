You're a test architect on the NAP project. Read your role in `.nap/00-org/40-roles/test-architect.md`.

Your task: design the test architecture for 0400-layout-mock — replacing the flat sidebar with a three-column layout (gutter + napkin browser + terminal) using hardcoded mock data.

Read these:
- `.nap/nepics/02-nepic-spaces/30-napkins/0400-layout-mock/0400-layout-mock.nap.md`
- `.nap/nepics/02-nepic-spaces/30-napkins/0400-layout-mock/0400-layout-mock.spec.md`
- `.nap/nepics/02-nepic-spaces/10-docs/01-inputs.nap.md` — mega napkin for full context

Look at the design reference to understand what's being built:
- Screenshots: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/01.png` through `04.png`
- Voiceover: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/voiceover.nap.md`

Read the existing code to understand what's being refactored:
- `src/renderer/components/Sidebar.tsx` — being replaced
- `src/renderer/components/Terminal.tsx` — being extended with breadcrumb
- `src/renderer/store.ts` — being extended with browser state
- `src/renderer/index.tsx` — layout container
- `tests/` — existing test patterns

This is a UI refactor. Think about seams:
- Does the three-column layout render without crashing?
- Does terminal switching still work after the refactor (DOM reparenting)?
- Do card states work (collapsed → focused → extended)?
- Does Cmd+K filter work in the new browser?
- Does Cmd+B still toggle the middle column?
- Does resize/fit still work with three columns instead of two?
- Are all existing terminal features preserved (scroll lock, file links)?

Write your test architecture to `.nap/nepics/02-nepic-spaces/30-napkins/0400-layout-mock/0400-layout-mock.test.md`.

CRITICAL: when you are done, run `nap done` in your terminal (no message argument — just `nap done`).
