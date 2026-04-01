# Response — napkin content rendering

## What was built

Replaced flat `napkinBullets: string[]` with raw `napkinContent: string` across the bridge, model, and renderer.

### Changes

- **bridge-types.ts**: `NapkinState.napkinBullets: string[]` → `NapkinState.napkinContent: string`
- **model.ts**: Removed `parseBullets()`. Model now stores raw `.nap.md` text as `napkinContent`.
- **KanbanOverlay.tsx**: New `parseContentLines()` + `NapkinContentLines` component:
  - Parses indentation levels (2 spaces = 1 level)
  - Level 0-1: styled lines (level 1 indented + dimmer)
  - Level 2+: rendered as `...` ellipsis
  - Capped at 8 lines, truncated with `...` at bottom
  - Handles bullets (`*`) and plain indented content
- **kanban.test.ts**: Updated T-0500-03 to verify raw `napkinContent` string. Added content parsing tests (flat, nested, non-bullet, blank lines, empty).

### Decisions

- 2 spaces per indent level (matches .nap.md convention)
- `parseContentLines` exported for testability
- Level 2+ collapses to `...` rather than being hidden — preserves the hint that deeper content exists

### Test results

- 139/139 small tests pass
- 29/29 medium tests pass
- Zero type errors (`tsc --noEmit`)
