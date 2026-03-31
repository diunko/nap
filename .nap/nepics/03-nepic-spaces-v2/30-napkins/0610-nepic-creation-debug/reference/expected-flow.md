## Expected nepic creation flow — step by step

### From the gutter (+) button:
1. User clicks (+) in the gutter
2. Inline input appears — user types nepic name
3. CLI: `nap3 create nepic <slug> --name <display-name>` (via socket)
4. Socket handler → model.createNepic():
   - Scaffolds dirs: `nepics/<slug>/10-docs/`, `20-architects/001-architect/`, `30-napkins/`
   - Creates architect stub: `.agent.nap.json` with UUID, started: false
   - Copies architect prompt.md from template
   - Persists activeNepicId to ui-state.json
5. Model switches to new nepic (model.switchNepic):
   - Stops watcher for old nepic
   - Loads new nepic dir
   - Starts watcher for new nepic
6. Bridge pushes snapshot → renderer updates:
   - Gutter shows new nepic icon (active)
   - Sidebar shows empty nepic (just architect, no napkins yet)
   - If architect should auto-start (case C: not started): spawn pty
7. Architect terminal appears, reads prompt.md, ready to talk

### From CLI:
1. `nap3 create nepic my-nepic --name "My Nepic"`
2. Same flow from step 4 above

### What should be visible after creation:
- Gutter: new icon with white active bar, old nepic(s) still visible
- Sidebar: architect card (only), no napkins yet
- Terminal: architect booting up (if auto-started)
- Kanban (Cmd+`): empty — no napkins in any column

### Source code paths:
- Gutter (+) handler: `packages/v3/src/renderer/Gutter.tsx`
- Socket handler: `packages/v3/src/main/socket-handler.ts` (create-nepic)
- Model: `packages/v3/src/main/model.ts` (createNepic, switchNepic)
- Coordinators: `packages/v3/src/main/coordinators.ts` (startAgents — case C)
- Preload: `packages/v3/src/main/preload.ts` (nepic:create, nepic:switch IPC)
- Store: `packages/v3/src/renderer/store.ts` (switchNepic, nepics)
