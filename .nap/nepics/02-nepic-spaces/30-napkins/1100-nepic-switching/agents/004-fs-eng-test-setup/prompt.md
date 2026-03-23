You're a fullstack engineer on the NAP project. Read your role in `.nap/00-org/40-roles/fullstack-eng.md`.

Your task: set up a test project at `~/dvl/aibanana/test-nap/` that the v2 NAP app can open for manual testing. This project needs realistic `.nap/` structure with sample data so we can see the three-column layout, napkin browser, kanban overlay, and nepic switching in action.

Read the mega napkin for full context of what v2 looks like:
- `.nap/nepics/02-nepic-spaces/10-docs/01-inputs.nap.md`

Read the design screenshots for what the UI should show:
- `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/voiceover.nap.md`

Create this structure at `~/dvl/aibanana/test-nap/`:

1. `git init` the directory so NAP has a project root

2. `.nap/nepics/01-foundation/` — a completed nepic with:
   - `10-docs/01-inputs.nap.md` — a small mega napkin (5-6 bullet points about a fictional project)
   - `30-napkins/` with 4-5 napkins at various statuses (done, review, doing)
   - Each napkin has a `.nap.md` with 3-5 real-looking top-level bullets
   - Some napkins have `agents/` dirs with `001-test-arch/`, `002-fs-eng/` etc (empty prompt.md/response.md is fine)
   - `40-board/` with correct symlinks to `30-napkins/`

3. `.nap/nepics/02-next-phase/` — an active nepic with:
   - `10-docs/01-inputs.nap.md`
   - `30-napkins/` with 6-8 napkins (mix of backlog, todo, doing, review, done)
   - More agents, various statuses
   - `40-board/` with correct symlinks
   - `20-architects/001-architect/prompt.md` — a template prompt

4. Make the napkin content look realistic — like a food delivery app or a game backend or whatever. The content should be interesting enough that you can read the kanban and understand the project at a glance.

5. Make sure board symlinks use the correct relative paths: `../../30-napkins/NNNN-feature`

DO NOT modify anything in the nap source repo. Only create files under `~/dvl/aibanana/test-nap/`.

IMPORTANT: Run bash commands one at a time. Do not chain with && or ;.

Write response to `.nap/nepics/02-nepic-spaces/30-napkins/1100-nepic-switching/agents/004-fs-eng-test-setup/response.md`, then run `nap done` (no message).
