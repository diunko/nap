# Structure

## Directory layout

```
.nap/
  sock                              ← runtime socket (per-project)
  00-org/                           ← how we work (shared across nepics)
    10-promise.nap.md
    20-workflow.nap.md
    30-structure.nap.md              ← this file
    40-roles/
      architect.md
      test-architect.md
      fullstack-eng.md
      test-eng.md

  nepics/
    01-poc/                         ← v1 reference (read-only)
    02-nepic-spaces/                ← current work
      10-docs/
        01-inputs.nap.md            ← mega napkin (authoritative)
        02-milestones.nap.md        ← sequencing + learning questions
      15-feedback/
        issues.md                   ← bugs noticed during use
        wishlist.md                 ← ideas with energy
      20-architects/
        001-architect/
          prompt.md
          onboarding/
          scratch/
      30-napkins/                   ← canonical napkin dirs, never move
        0100-feature/
          0100-feature.nap.md
          0100-feature.spec.md
          0100-feature.journeys.md
          0100-feature.test.md
          agents/
            001-test-arch-feature/
              prompt.md
              response.md
            002-fs-eng-feature/
              prompt.md
              response.md
            003-test-eng-feature/
              prompt.md
              response.md
      40-board/                     ← symlinked status dirs
        10-draft/
        20-backlog/
        30-todo/
        40-doing/
          0100-feature → ../../30-napkins/0100-feature
        50-review/
        60-done/
```

## Key principles

- **Napkins never move.** `30-napkins/0100-feature/` is the canonical path. All references point there.
- **Status lives in symlinks.** `40-board/` dirs contain symlinks back to `30-napkins/`. Moving a symlink = status change.
- **Filesystem is the source of truth for content.** Human edits napkins, specs, prompts in their editor.
- **When SQLite lands**, it becomes source of truth for status. Symlinks stay as editor lenses.

## Nepic structure

Each nepic is one milestone/era of the project:
- `10-docs/` — mega napkin, milestones, handoffs
- `15-feedback/` — bugs and wishlist (living docs, anyone can append)
- `20-architects/` — `001-architect/`, `002-architect/`, etc.
- `30-napkins/` — canonical napkin dirs
- `40-board/` — symlinked status dirs

## Feature numbering

4 digits, spaced by 100:

```
0100, 0200, 0300, ...
```

Room for 99 insertions between each (0101-0199).

## Agent numbering

3 digits within a feature directory:

```
001-role-subject
```

Role and subject in the name:
- `001-test-arch-sqlite` — test architect for SQLite
- `002-fs-eng-sqlite` — fullstack engineer for SQLite
- `003-test-eng-sqlite` — test engineer for SQLite

## File extensions

| File | Purpose |
|---|---|
| `.nap.md` | Napkin — compressed idea anchors |
| `.spec.md` | Min spec — why, what, constraints the implementer can't derive |
| `.stories.md` | User stories — what the human does + which components interact |
| `.test.md` | Test architecture — strategic test cases |
