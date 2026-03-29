# Structure

## Directory layout

```
.nap/
  nap.db                            ← SQLite database (runtime state)
  sock                              ← runtime socket
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
    01-v1/                          ← first nepic
      10-docs/
      15-feedback/
        issues.md
        wishlist.md
      20-architects/
        001-architect/
          prompt.md
      30-napkins/                   ← canonical napkin dirs, never move
        0100-feature/
          0100-feature.nap.md
          0100-feature.spec.md
          0100-feature.test.md
          agents/
            001-test-arch-feature/
              prompt.md
              response.md
      40-board/                     ← symlinked status dirs
        20-backlog/
        30-todo/
        40-doing/
          0100-feature → ../../30-napkins/0100-feature
        50-review/
        60-done/
```

## Key principles

- **Napkins never move.** `30-napkins/0100-feature/` is the canonical path.
- **Status lives in symlinks.** `40-board/` dirs contain symlinks back to `30-napkins/`.
- **Filesystem is source of truth for content.** Human edits in their editor.
- **SQLite is source of truth for status.** Symlinks are editor lenses.

## Feature numbering

4 digits, spaced by 100: `0100, 0200, 0300, ...`

Room for 99 insertions between each.

## Agent numbering

3 digits within a feature: `001-role-subject`

Role and subject in the name:
- `001-test-arch-sqlite` — test architect for SQLite
- `002-fs-eng-sqlite` — fullstack engineer for SQLite

## File extensions

| File | Purpose |
|---|---|
| `.nap.md` | Napkin — compressed idea anchors |
| `.spec.md` | Min spec — why, what, constraints |
| `.journeys.md` | Developer/user journeys |
| `.test.md` | Test architecture — strategic test cases |
