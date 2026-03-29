## 0100 — model layer + hypothesis validation: spec

This spec gives you direction and constraints. It is NOT a complete implementation guide. Before writing any code, do your own thorough research of the existing v2 codebase — understand how main.ts manages state today, how the renderer store works, how IPC flows between processes.

### The hypothesis

The core bet of nepic 03: a model layer with injectable sources lets us test full user journeys in vitest (milliseconds, no Electron) while keeping the real app working through a typed bridge.

If this works, every subsequent napkin builds on a testable foundation. If it doesn't, we pivot.

### Model (packages/v3/src/main/model.ts)

The model owns the app's business state. It replaces what v2 splits across SQLite + session-store + reconcile + ad-hoc IPC.

**Interface shape:**

```ts
interface NapModel {
  // Load state from persistent layer (marker files on disk)
  loadFromFilesystem(nepicDir: string): void

  // Accessors
  getNapkins(): NapkinState[]
  getArchitects(): AgentState[]

  // Change notification
  onChange(listener: () => void): () => void  // returns unsubscribe
}
```

The filesystem access must be injectable — the model takes a `FileSystem` interface (or similar), not `import * as fs from 'fs'` directly. This is what makes vitest testing possible.

**State types** (in src/shared/bridge-types.ts so both sides share them):

```ts
interface NapkinState {
  slug: string
  status: 'backlog' | 'todo' | 'doing' | 'review' | 'done'
  agents: AgentState[]
}

interface AgentState {
  name: string
  role: string
  ccSessionUuid?: string
  exited?: boolean
  createdAt: number
}
```

### Marker files

The model reads these from disk. Format:

**`.napkin.nap.json`** in napkin dir (e.g. `30-napkins/0100-explore/.napkin.nap.json`):
```json
{ "status": "doing" }
```

**`.agent.nap.json`** in agent dir (e.g. `30-napkins/0100-explore/agents/001-test-arch/.agent.nap.json`):
```json
{
  "cc_session_uuid": "abc-123",
  "role": "test-arch",
  "name": "001-test-arch",
  "created_at": 1711700000000
}
```

The directory structure encodes identity — the marker file adds metadata. If no marker file exists, the directory still represents a napkin/agent (with defaults).

### Bridge (packages/v3/src/main/bridge.ts)

Main → renderer: push full state snapshot on every model change.

```ts
interface AppSnapshot {
  napkins: NapkinState[]
  architects: AgentState[]
  activeNepicId: string
}
```

Renderer → main: send intents (user actions).

```ts
type AppIntent =
  | { type: 'setActiveTerminal'; id: string }
```

In Electron: `webContents.send('app:state', snapshot)` / `ipcRenderer.on('app:state', ...)`.

In tests: two EventEmitters wired together. No Electron process needed.

### Renderer sidebar (packages/v3/src/renderer/)

Minimal — just enough to prove the data path:
- Zustand store that receives snapshots from the bridge
- List of napkin cards: slug, agent dots (colored by role/status), phase label
- Architect card(s) pinned at top
- No focused/extended views, no file trees, no click handlers beyond setActive
- Visually: monospace font, dark background, `*` bullet prefix — same language as v2

### Filesystem abstraction

The model must not call `fs.readdirSync` etc directly. Instead, accept an interface:

```ts
interface FileSystemReader {
  readdir(dir: string): string[]
  readJSON(filePath: string): unknown | null  // returns null if file doesn't exist
  isDirectory(filePath: string): boolean
}
```

Production: wraps real `fs`. Tests: in-memory implementation backed by a plain object.

This is the key enabler — without it, model tests need real disk I/O.

### What to copy from v2

- Study `src/main/main.ts` lines 857-952 (startup: reconcile, resume logic) — this is the flow the model replaces
- Study `src/main/napkin-watcher.ts` — how v2 reads napkin directories
- Study `src/renderer/store.ts` — the zustand shape and how NapkinBrowser derives data
- Study `src/renderer/components/NapkinBrowser.tsx` lines 52-122 — deriveArchitects and deriveNapkinCards functions
- Don't copy the implementation — understand the patterns and build fresh

### What the fs-eng delivers (beyond the app code)

The fs-eng builds the test infrastructure as part of their deliverable:
- `MemoryFileSystem` — in-memory implementation of `FileSystemReader` backed by a plain object (e.g. `{ "30-napkins/0100/.napkin.nap.json": { status: "doing" } }`)
- `FakeBridge` — two EventEmitters wired together, same interface as the real IPC bridge but in-process
- Fixture helpers — functions to build common test scenarios (e.g. "project with 3 napkins, 2 with agents")
- 3-4 smoke tests proving: model loads correctly, bridge delivers snapshot, renderer receives state

These are architecture — they enable the TE to write the comprehensive test suite without building plumbing.

### What NOT to do

- Don't wire real ptys — the model should have a placeholder for where pty spawning will go, but no actual node-pty usage
- Don't write marker files — 0100 is read-only. Writing is 0200.
- Don't build the full NapkinBrowser — collapsed cards only
- Don't add SQLite — the model reads marker files directly
- Don't add socket server — CLI integration is 0300
