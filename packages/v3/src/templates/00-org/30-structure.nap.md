# Structure

## Directory layout

```
.nap/
  sock                              ← runtime socket (gitignored)
  ui-state.json                     ← active nepic, terminal (gitignored)
  00-org/                           ← how we work (shared across nepics)
    10-promise.nap.md
    20-workflow.nap.md
    30-structure.nap.md              ← this file
    40-roles/
      architect.md
      guardian.md
      test-architect.md
      fullstack-eng.md
      test-eng.md

  nepics/
    01-v1/
      10-docs/
        01-inputs.nap.md            ← mega napkin (seed)
      15-feedback/
        issues.md
        wishlist.md
      20-architects/
        001-architect/
          .agent.nap.json           ← marker file (identity + state)
          prompt.md
        002-guardian/
          .agent.nap.json
          prompt.md
      30-napkins/
        0100-feature/
          .napkin.nap.json          ← marker file (status)
          0100-feature.nap.md
          0100-feature.spec.md
          0100-feature.stories.md
          0100-feature.test.md
          agents/
            001-test-arch-feature/
              .agent.nap.json
              prompt.md
              response.md
            002-fs-eng-feature/
              .agent.nap.json
              prompt.md
              response.md
```

## Marker files

**`.agent.nap.json`** — agent identity and state:
```json
{ "cc_session_uuid": "...", "role": "fs-eng", "name": "002-fs-eng-feature", "created_at": 1711700000000, "started": false, "exited": false }
```

**`.napkin.nap.json`** — napkin status:
```json
{ "status": "doing" }
```

## Key principles

- **Marker files are source of truth** for identity and status. No database.
- **Filesystem defines what exists.** If the directory is there, the napkin/agent exists. Markers annotate it with metadata.
- **Napkins never move.** `30-napkins/0100-feature/` is the canonical path.
- Status changes via `nap3 set-status 0100-feature doing`.

## Numbering

- **Napkins:** 4 digits, spaced by 100 — `0100, 0200, 0300, ...` Room for 99 insertions.
- **Agents:** 3 digits, role + subject — `001-test-arch-sqlite`, `002-fs-eng-sqlite`

## File extensions

| File | Purpose |
|---|---|
| `.nap.md` | Napkin — compressed idea anchors |
| `.spec.md` | Min spec — why, what, constraints the implementer can't derive |
| `.stories.md` | User journeys — concrete scenarios that define "working" |
| `.test.md` | Test architecture — strategic test cases |
