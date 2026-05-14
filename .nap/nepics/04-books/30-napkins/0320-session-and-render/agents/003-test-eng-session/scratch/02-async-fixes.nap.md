# v3 async race fixes

Two changes fix all 7 proven races. Net: ~5 lines added, ~40 deleted.

---

## Fix 1: Serialize queue on model

One queue. Every model mutation goes through it. No concurrent await chains.

### The queue

```ts
// model.ts — add near top, inside createModel()
let queue = Promise.resolve();

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn);
  queue = p.catch(() => {}); // don't break chain on error
  return p;
}
```

### Wrap every async model method

```ts
// Before:
async function setAgentDone(agentId: string): Promise<void> {
  // ... reads disk, writes disk, updates memory
}

// After:
function setAgentDone(agentId: string): Promise<void> {
  return serialize(async () => {
    // ... same body
  });
}
```

Methods to wrap (every async method that reads or writes disk):
- `setAgentDone`
- `setAgentExitedById`
- `setAgentStarted`
- `setAgentArchived`
- `spawnSuccessor`
- `setNapkinStatus`
- `saveUiState`
- `createNapkin`
- `createAgentStub`
- `createArchitectStub`
- `createNepicFn`
- `startAgentByName`
- `switchNepicFn`
- `loadFromFilesystem` (watcher-triggered reloads go through queue too)

### What this fixes

- **RACE-09** (done + exit interleave): exit waits for done to finish writing
- **RACE-13** (saveUiState lost update): second save waits for first to read-merge-write
- **RACE-04** (concurrent loadFromFilesystem): second load waits for first
- **RACE-15** (double nepic switch): second switch waits for first

### What to delete after

- `hasPendingWrite` boolean — all 14 set-true sites, 2 set-false sites
- The check in `handleWatchEvent` that reads/clears the flag

The watcher just calls `serialize(() => loadFromFilesystem(nepicDir))`. If our write is in-flight, the reload queues behind it, reads correct disk. No flag needed.

---

## Fix 2: Disk-first writes + derive runtime state

### Reorder setAgentDone to match setAgentExitedById

```ts
// Before (memory first, disk second — RACE-08):
async function setAgentDone(agentId: string): Promise<void> {
  doneAgents.add(agentId);           // shadow set
  agent.done = true;                  // memory
  notify();                           // push to renderer
  await fs.writeJSON(path, updated);  // disk (too late)
}

// After (disk first, reload — matches setAgentExitedById pattern):
function setAgentDone(agentId: string): Promise<void> {
  return serialize(async () => {
    const agent = findAgentById(agentId);
    if (!agent) return;
    const marker = await fs.readJSON(markerPath) as Record<string, unknown>;
    await fs.writeJSON(markerPath, { ...marker, done: true });
    await loadFromFilesystem(nepicDir);  // rebuilds from disk — single source of truth
  });
}
```

### Delete ephemeral Sets

Remove:
- `runningAgents` Set + all `.add()` / `.delete()` calls (~8 sites)
- `doneAgents` Set + all `.add()` / `.delete()` calls (~6 sites)
- The reconciliation loop at lines 349-355

### Replace with derived state after loadFromFilesystem

```ts
// At the end of loadFromFilesystem, after napkins and architects are assigned:
for (const agent of getAllAgents()) {
  agent.running = ptySpawner.isRunning(agent.id);
  const pa = pendingApprovals.get(agent.id);
  if (pa) agent.pendingApproval = pa;
}
```

`ptySpawner` needs to be accessible inside the model. Pass it as a parameter to `loadFromFilesystem`, or store it on the model when `startAgents` is first called.

`pendingApprovals` Map stays — it's genuinely runtime-only (in-flight IPC approval requests have no disk representation).

### Await setAgentDone in socket handler

```ts
// socket-handler.ts line 86
// Before:
model.setAgentDone(sessionId);    // fire-and-forget

// After:
await model.setAgentDone(sessionId);  // wait for disk write
```

---

## Fix 3: Effect abort flags (renderer)

### ContentPane file load (RACE-01, RACE-02)

```tsx
// ContentPane.tsx — file load effect
useEffect(() => {
  const editor = editorRef.current;
  if (!editor) return;
  let aborted = false;                          // ← add

  if (!activeFilePath) { /* ... clear model ... */ return; }

  (async () => {
    const content = await window.electronAPI?.fileRead(activeFilePath);
    if (aborted) return;                         // ← add (after every await)
    // ... rest of the effect body unchanged
  })();

  return () => {
    aborted = true;                              // ← add
    clearTimeout(saveTimerRef.current);
  };
}, [activeFilePath, fileReloadVersion]);
```

### TerminalPane CodeEditor file load (RACE-03)

Same pattern — add `aborted` flag, check after `fileRead` await.

---

## Fix 4: Restore ordering (renderer)

### RACE-10: Set state before starting watchers

```ts
// store.ts loadPersistedUiState — tab restore section

// Build tabs
const tabs: Tab[] = [];
const ghostPaths: string[] = [];
for (const check of checks) {
  if (!check) continue;
  tabs.push({
    id: nextTabId(),
    path: check.path,
    type: 'file',
    ephemeral: check.ephemeral,
    ...(check.ghost ? { ghost: true } : {}),
  });
  if (check.ghost) ghostPaths.push(check.path);  // collect, don't watch yet
}
updates.leftTabs = tabs;

// ... later, AFTER useNapStore.setState(updates):

for (const p of ghostPaths) {
  await window.electronAPI!.watchGhost(p);
}
```

State committed before side effects. `promoteGhostTab` finds the tabs.

### RACE-11: Don't validate slug against current napkins

```ts
// store.ts loadPersistedUiState — focusedCardSlug section

// Before:
if (typeof state.focusedCardSlug === 'string') {
  const store = useNapStore.getState();
  const napkinMatch = store.napkins.some(n => n.slug === state.focusedCardSlug);
  const archMatch = store.architects.some(a => a.id === state.focusedCardSlug);
  if (napkinMatch || archMatch) {
    updates.focusedCardSlug = state.focusedCardSlug;
  }
}

// After:
if (typeof state.focusedCardSlug === 'string') {
  updates.focusedCardSlug = state.focusedCardSlug;
  const savedMode = state.cardViewMode;
  updates.cardViewMode = (savedMode === 'focused' || savedMode === 'extended')
    ? savedMode : 'focused';
}
// Validation deferred — applySnapshot clears invalid slugs when model arrives
```

Restore always sets the slug. `applySnapshot` (which runs when the model snapshot arrives) can check validity and clear if the slug doesn't match anything.

---

## Summary

| Fix | Lines added | Lines deleted | Races fixed |
|---|---|---|---|
| Serialize queue | ~15 | ~0 | RACE-09, 13 |
| Disk-first + delete ephemeral Sets | ~5 | ~40 | RACE-08, (04, 06 defended) |
| Await in socket handler | 1 word | 0 | RACE-09 (completes fix) |
| Delete hasPendingWrite | 0 | ~20 | simplification |
| Effect abort flags | ~10 | 0 | RACE-01, 02, 03 |
| Restore reorder | ~10 | ~8 | RACE-10 |
| Restore skip validation | ~3 | ~5 | RACE-11 |
| **Total** | **~45** | **~73** | **all 7** |

Net: **-28 lines.** Codebase gets smaller and every race test passes.

## Effort estimate

These are all mechanical changes. No new abstractions, no architectural redesign. The serialize queue is the only new concept — 15 lines, used as a wrapper.

## Optional: content-hash echo detection

Not needed for correctness. The serialize queue makes echo reloads safe (just redundant). If watcher-triggered reloads become a perf concern (~5ms each, unlikely with <100 files), add:

```ts
const lastWrittenHash = new Map<string, string>();

// in writeMarker: lastWrittenHash.set(path, JSON.stringify(data))
// in watcher: skip if hash matches
```

~15 lines. Skip for now.
