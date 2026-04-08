## 0655 — guardian always visible across nepics: spec

This spec gives you direction and constraints. Before writing any code, read `packages/v3/src/main/model.ts` — specifically `loadFromFilesystem` where architects are loaded from `20-architects/`.

### The change

In `loadFromFilesystem`, after loading architects from the active nepic dir:

1. Check if any loaded architect has `role === 'guardian'`
2. If not, find the first nepic in `nepicList`
3. If first nepic differs from active nepic, read its `20-architects/` for a guardian
4. If found, append to the `architects` array

This is ~10 lines in one function. Everything downstream (findAgentByRole, startAgents, sidebar rendering, poke routing) works automatically because it all reads from the `architects` array.

### Edge cases

- Active nepic IS the first nepic → guardian already loaded, skip
- First nepic has no guardian → no-op
- Guardian exists in both first and active nepic → use active nepic's (don't duplicate)
- nepicList is empty → skip (shouldn't happen, but guard)

### What NOT to do

- Don't move the guardian's physical location
- Don't create a project-level agent concept
- Don't change setup/init behavior
- Don't break existing tests
