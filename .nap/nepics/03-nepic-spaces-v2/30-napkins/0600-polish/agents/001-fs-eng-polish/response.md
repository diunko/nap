## Done — three fixes shipped

### 1. Debug panel defaults to collapsed
- `store.ts`: `debugPanelCollapsed` initial value → `true`
- Persisted state still restores if user previously opened it (loadPersistedUiState kicks in after mount)
- No flicker on launch

### 2. Kanban: three columns, not five
- `KanbanOverlay.tsx`: COLUMNS array now maps display columns to internal statuses
  - backlog = backlog + todo
  - doing = doing + review
  - done = done
- Internal model statuses untouched
- `kanban.spec.ts` medium tests updated (T-0500-12, T-0500-70) to assert 3 columns with correct merged counts

### 3. Medium tests: headless by default
- `main.ts`: `show: false` on BrowserWindow + `ready-to-show` handler (copies v2 pattern)
- Default: headless in test mode. `HEADED=1` env var shows windows for debugging.
- Added `test:medium:headed` script to both `packages/v3/package.json` and root `package.json`

### Test results
- 134 small tests pass
- 29 medium tests pass (headless)
- `tsc --noEmit` clean
