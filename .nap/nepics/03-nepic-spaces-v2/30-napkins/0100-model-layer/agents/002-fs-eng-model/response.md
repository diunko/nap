## Done

### What was built

All code in `packages/v3/`.

**Shared types** (`src/shared/bridge-types.ts`):
- `NapkinState`, `AgentState`, `NapkinStatus` — shared between main + renderer
- `AppSnapshot`, `AppIntent` — bridge protocol types

**Filesystem abstraction** (`src/main/filesystem.ts`):
- `FileSystemReader` interface — `readdir`, `readJSON`, `isDirectory`
- `NodeFileSystem` — wraps real `fs` for production
- `MemoryFileSystem` — in-memory implementation for tests. Constructor takes `Record<string, object | null>`, derives directory listings from keys.

**Model** (`src/main/model.ts`):
- `NapModel` interface — `loadFromFilesystem`, `getNapkins`, `getArchitects`, `onChange`
- `createModel(fs)` — factory taking injectable `FileSystemReader`
- Walks `30-napkins/` for napkins + `agents/` subdirs, `20-architects/` for architects
- Reads `.napkin.nap.json` and `.agent.nap.json` marker files
- Missing markers → sensible defaults (status='backlog', role='', no uuid)
- Agents sorted by `createdAt` within each napkin
- `onChange` fires on load, unsubscribe works

**Bridge** (`src/main/bridge.ts`):
- `Bridge` interface — `pushSnapshot`, `onSnapshot`, `sendIntent`, `onIntent`
- `FakeBridge` — two EventEmitters, no Electron needed
- `wireModelToBridge(model, bridge, activeNepicId)` — wires model.onChange to bridge.pushSnapshot

**Renderer** (`src/renderer/`):
- `store.ts` — zustand store with `applySnapshot` + `setActiveTerminal`
- `Sidebar.tsx` — collapsed napkin cards with slug, phase label, agent dots (colored by role). Architect cards pinned at top. Monospace font, dark background, `*` bullet prefix.
- `index.tsx` — wires `electronAPI.onSnapshot` → store. Exposes `window.__napStore__` for Playwright.
- `preload.ts` — exposes `onSnapshot` + `sendIntent` via `contextBridge`
- `main.ts` — creates model with `NodeFileSystem`, wires to IPC bridge, pushes snapshot on model change + `did-finish-load`

**Test infrastructure** (`tests/`):
- `fixtures.ts` — 6 fixture factories: minimal (F1), rich (F2), empty (F3), exited agent (F4), no architects (F5), edge case (F3+F4 combo)
- `helpers.ts` — `createTestNepicDir` writes fixtures to real disk for Playwright. `launchApp`/`cleanupApp` manage Electron lifecycle with `NAP_CWD`.
- `model.test.ts` — 8 model tests (T-0100-01 through T-0100-08)
- `bridge.test.ts` — 4 bridge tests (T-0100-10 through T-0100-13)
- `journey.test.ts` — 3 journey tests (T-0100-20 through T-0100-22)
- `model-layer.spec.ts` — 3 Playwright tests (T-0100-30 through T-0100-32)

### Verified

- `npm run typecheck:v3` — passes
- `npm run typecheck:v2` — passes
- `npm run test:v3:small` — 4 files, 16 tests pass
- `npm run test:v3:medium` — 4 tests pass (3 new + 1 pre-existing smoke)
- `npm run test:v2:small` — 19 files, 155 tests pass
- `npm run build:v3` — builds (main, preload, renderer)

### Decisions

- **Model is sync.** `loadFromFilesystem` is synchronous — `FileSystemReader` uses sync methods. Good enough for marker files (tiny JSON). Async would complicate the API for no benefit at this scale.
- **Slug = directory name.** No parsing or modification. "0100-explore" is the identity.
- **Missing marker defaults.** Napkin without `.napkin.nap.json` gets status='backlog'. Agent without `.agent.nap.json` gets name from dir, role='', no uuid.
- **Architects from 20-architects/ only.** Only dirs with `.agent.nap.json` become architect entries (unlike napkins which appear even without markers).
- **Full snapshot, not delta.** Every model change pushes complete state. Simple and correct for this scale.
- **Store exposes `__napStore__` globally** for Playwright test access — same pattern as v2's `useTerminalStore`.
- **zustand added to v3 dependencies** — was only hoisted from v2 before.

### For the TE

The test infrastructure is ready. All fixtures from the TA's `.test.md` are implemented. To write a new test:

```ts
import { createModel } from '../src/main/model';
import { createMinimalFixture, NEPIC_DIR } from './fixtures';

const fs = createMinimalFixture();
const model = createModel(fs);
model.loadFromFilesystem(NEPIC_DIR);
// assert on model.getNapkins(), model.getArchitects()
```

For bridge tests, wire with `FakeBridge` + `wireModelToBridge`. For journey tests, add an `onSnapshot` listener. For medium tests, use `createTestNepicDir` + `launchApp`.
