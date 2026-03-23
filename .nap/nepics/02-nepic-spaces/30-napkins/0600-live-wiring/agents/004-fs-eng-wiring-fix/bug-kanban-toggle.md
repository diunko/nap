## Bug: Kanban board doesn't appear on Ctrl+`

Pressing Ctrl+` (or Cmd+`) doesn't show the kanban overlay.

### What exists

- `main.ts:255` — menu item with `accelerator: 'CmdOrCtrl+\``
- `main.ts:258` — sends `kanban:toggle` IPC
- `preload.ts:47` — bridges `kanban:toggle` to renderer
- `index.tsx:149` — listener calls `store.toggleKanban()`
- `KanbanOverlay.tsx` — the overlay component

### Unknown

- Does the menu accelerator actually fire? (Cmd+` conflicts with macOS system shortcut for window switching)
- Does `kanbanVisible` toggle in the store?
- Is `KanbanOverlay` actually rendered conditionally in index.tsx or wherever the layout lives?
- Does the overlay render but with no data (empty columns)?

### To investigate

1. Check if KanbanOverlay is mounted in the component tree at all
2. Check if `kanbanVisible` state toggles (add console.log or check via dev tools)
3. If the accelerator doesn't fire due to macOS conflict, consider adding a keyboard listener in the renderer as fallback
4. Test with the test project at `~/dvl/aibanana/test-nap/`
5. Run dev mode: `npm run dev -- -- --cwd ~/dvl/aibanana/test-nap`

### Reference

- Screenshot of kanban working: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/04.png`
- Voiceover explaining kanban: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/voiceover.nap.md` (section "04 — kanban quake console")
- HTML reference implementation: `.nap/nepics/02-nepic-spaces/30-napkins/0100-design-sprint/mocks/v2-final.html` (toggle kanban with Cmd+` in browser)
- KanbanOverlay component: `src/renderer/components/KanbanOverlay.tsx`
