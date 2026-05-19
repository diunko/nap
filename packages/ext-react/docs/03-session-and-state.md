# Session and state isolation

## The problem

The extension side panel persists across Chrome tabs. Navigate from PR 42 to PR 87 — same panel, same state, same filesystem. Without isolation, your PR 42 tabs, editor content, and cloned repo bleed into PR 87.

## The solution: one key, one session

```
createSession('pr-42')
  → LightningFS('nap-fs-pr-42')           separate IDB database
  → createNapStore('pr-42', idbStorage)    separate persist key in IDB
  → createModel({ adapter, store })        wired to this session's store
```

Switch the key → completely independent filesystem + UI state. Two Chrome windows with different keys = two independent sessions sharing nothing.

## How it flows

```
getStateKey()              returns 'default' (URL hash parsing later)
       |
createSession(key)         ties everything to one key
       |
  ├── LightningFS           nap-fs-${key}
  ├── LightningFsAdapter    wraps LFS, emits change events
  ├── createNapStore         Zustand + persist middleware → IDB nap-ui-${key}
  └── createModel            subscribes to adapter, dispatches to store
       |
SessionContext.Provider     provides session to all components
       |
Panel key={session.key}    remounts on session change (clean lifecycle)
```

## IndexedDB layout

```
nap-state (IDB database)
  └── kv (object store)
        ├── nap-ui-default     → { tabs, activeFilePath, focusedCardSlug, ... }
        ├── nap-ui-pr-42       → { ... }
        └── nap-ui-pr-87       → { ... }

nap-fs-default             → LightningFS IDB database (filesystem)
nap-fs-default_lock        → LightningFS mutex

nap-fs-pr-42               → separate filesystem
nap-fs-pr-42_lock
```

## Zustand persist middleware

The store factory wraps Zustand with the `persist` middleware:

```typescript
createNapStore(key, storage)
  → persist(storeActions, {
      name: `nap-ui-${key}`,
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({ tabs, activeFilePath, activeSurface, ... })
    })
```

`partialize` controls what's saved — only UI state, not derived data like `navSections` (rebuilt from filesystem scan on load).

## Session switch

From the console:
```javascript
__switchSession__('pr-42')
```

From content script:
```javascript
chrome.runtime.sendMessage({ type: 'session-key-changed', key: 'pr-42' })
```

What happens: old model destroyed → new session created → SessionContext updates → `key={session.key}` on Panel forces full React remount → all components fresh → Zustand hydrates from IDB → model.init() scans for repos.

## Why key={session.key} on Panel

Monaco event handlers are set up once in `useEffect([], [])`. They close over the session's store, adapter, and model. Without the `key` prop, a session switch would leave stale closures pointing at the old session.

With `key={session.key}`, React treats the Panel as a new component instance on session change. Old Panel unmounts (Monaco disposed, terminal disposed, effects cleaned up). New Panel mounts with fresh closures. No stale references possible.

## Wipe script

Paste in the side panel's DevTools console:

```javascript
const dbs = await indexedDB.databases();
const napDbs = dbs.filter(d => d.name?.startsWith('nap-'));
console.log('databases:', napDbs.map(d => d.name));
for (const db of napDbs) indexedDB.deleteDatabase(db.name);

// Also wipe the state store
indexedDB.deleteDatabase('nap-state');
console.log('wiped — close and reopen the panel');
```
