# Fullstack engineer response 2 — monaco command

## What I built

### `monaco-command.ts` — custom shell command
- `createMonacoCommand(store, adapter)` → `defineCommand('monaco', ...)` — same pattern as `git-command.ts`.
- Path resolution uses `adapter.resolvePath(cwd, arg)` — handles relative paths, absolute paths, `..` segments.
- Existence check via `adapter.exists(resolvedPath)` — returns `{ stderr, exitCode: 1 }` if file not found.
- On success: `store.openDoc(path)` → `store.pinActiveEphemeral()` → `store.setActiveSurface('editor')`.
- `--help` and no-args both show usage text, no store calls.
- Returns `{ stdout: '', stderr: '', exitCode: 0 }` on success.

### Wiring
- `TerminalPane.tsx`: added `store` prop (optional), creates monaco command alongside git command when store is provided.
- `index.tsx`: passes `store` to `<TerminalPane>` from SessionContext.

### Tests — 8 passing (vitest)
- MC-S01: relative path resolved against cwd
- MC-S02: absolute path used as-is
- MC-S03: `..` in relative path normalized
- MC-S04: file not found → error, no tab
- MC-S05: `--help` shows usage
- MC-S06: no args → same as `--help`
- MC-S07: openDoc + pinActiveEphemeral + setActiveSurface called in order
- MC-S08: return value shape on success

### Regressions
- All 192 tests pass (14 files). Zero regressions.
- `tsc --noEmit` clean — zero type errors.

## Decisions

- **Store as prop, not context.** TerminalPane already receives adapter/lfs as props. Adding store as an optional prop keeps the component self-contained and testable without SessionContext.
- **Reused `adapter.resolvePath` for path resolution.** No custom normalization — the adapter already handles `/`, `.`, `..` correctly. One code path, one behavior.
- **`pinActiveEphemeral()` instead of explicit `pinTab(tabId)`.** `openDoc` creates an ephemeral tab and sets it active, then `pinActiveEphemeral` promotes it. Same mechanism used by nav clicks + double-click pin. No new plumbing needed.

## Files changed

- **New:** `src/monaco-command.ts`, `src/__tests__/monaco-command.test.ts`
- **Modified:** `src/TerminalPane.tsx` (store prop + monaco command registration), `src/index.tsx` (pass store to TerminalPane)
