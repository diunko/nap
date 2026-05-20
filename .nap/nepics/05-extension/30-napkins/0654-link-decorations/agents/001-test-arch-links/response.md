# response — test-arch-links

## What I produced

`0654-link-decorations.test.md` — three Playwright tests, no small tests.

## Key decisions

**No small tests.** `refreshLinkDecorations` is a thin loop over `detectLinks` → `deltaDecorations`, same as the role pattern. No branching logic, no edge cases. The interesting failures are all in the rendering pipeline — CSS class injection, decoration ref isolation, content-change wiring. All require real Monaco.

**detectLinks is untested but not our problem.** It has zero vitest coverage. But it's proven indirectly by IM-05/IM-06 (Cmd+click depends on the same regex + column math). The decoration feature adds no new risk to detectLinks. If we want unit tests for it later, that's a separate effort.

**Three tests, not five.** LD3 (Cmd+click) is already covered by IM-05/IM-06. LD4 (editable without Cmd) is Monaco's default — no code change, no test. That leaves LD1, LD5, LD2 as LD-P01, LD-P02, LD-P03.

**LD-P03 (Cmd+hover) has a brittleness risk.** Monaco may not process synthetic mousemove events. I flagged it and recommended a model-level fallback via `__monaco__` if DOM assertions prove unreliable. The fs-eng should try the DOM approach first.

## Most likely bug

Shared decoration ref. Copying `refreshRoleDecorations` and forgetting to create a separate `linkDecorationsRef`. One call to `deltaDecorations` with the wrong ref would silently overwrite all role decorations. Called it out in the test.md and the implementation guidance.
