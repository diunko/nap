# fs-eng response — 0650-workflow-wiring

## Architecture: model orchestrates, React renders

The core design decision: ALL workflow orchestration lives in `model.ts`. React components are a thin rendering shell with trivial callbacks. No useEffects coordinate state. No refs leak between components. No timing hacks.

### The auto-clone pattern

`checkAutoClone()` has five guards: `initComplete`, `shellExec`, `config`, `!cloneTriggered`, `!nepicRoot`. It's called from three places:
- `registerShell()` — shell just became available
- `init()` — filesystem bootstrapped + scan complete
- `applyConfig()` — config arrived from content script

Whichever fires last completes the preconditions and triggers the clone. A `cloneTriggered` boolean prevents double-fire. Deterministic, no coordination needed.

### What Panel looks like now

```tsx
function Panel() {
  const { store, lfs, adapter, model } = React.useContext(SessionContext)!;
  const activeSurface = useNapStore((s) => s.activeSurface);
  const sidebarVisible = useNapStore((s) => s.sidebarVisible);

  useEffect(() => {
    model.init();
    return () => { model.registerShell(null); model.destroy(); };
  }, [model]);

  useEffect(() => { /* keyboard shortcuts only */ }, []);

  return (
    <div>
      <HeaderBar onFetchLatest={() => model.fetchLatest()} />
      <TerminalPane
        onCommandComplete={(cmd) => model.onCommandComplete(cmd)}
        onShellReady={(exec) => model.registerShell(exec)}
      />
      ...
    </div>
  );
}
```

Two effects: init/destroy + keyboard shortcuts. Three trivial callbacks. That's it.

## What I built

### Phase 1: URL hash parsing (pure functions)

**`src/url-config.ts`** — `parseNapHash`, `parsePageUrl`, `deriveStateKey`, `buildCloneUrl`, `buildNapConfig`

**`src/content.ts`** — parses hash on page load, sends `nap-config` message, responds to `get-nap-config` requests, watches hashchange + SPA navigation via MutationObserver

### Phase 2: Model orchestration

**`src/model.ts`** gained:
- `applyConfig(config)` — sets mainRepoConfig + prNum on store, defers napkin focus if nav empty
- `registerShell(exec)` — stores shell executor, checks auto-clone
- `fetchLatest()` — `git fetch origin && git checkout origin/{branch}` via shell
- `checkAutoClone()` — five guards, three call sites, one boolean
- `checkDiffRanges()` — fetches GitHub API when prNum > 0 + no cache, uses Zustand 5 `onFinishHydration` to avoid redundant fetch on return visit
- Enhanced `onCommandComplete()` — post-clone: sets `cloningStatus='done'`, expands napkin card. Post-fetch: invalidates + re-fetches diff ranges
- Enhanced `init()` — sets `initComplete` flag, calls `checkAutoClone()`
- Enhanced `destroy()` — sets `destroyed` flag, clears state

### Phase 3: Diff-aware link routing

**`src/pr-diff.ts`** — `parseHunkRanges` (±3 context), `lineInRanges`, `buildDiffAnchor` (SHA256), `fetchPrDiffRanges`

**`src/link-routing.ts`** — `routingDecision(file, line, diffCtx)` returns 'diff'|'blob', `resolveDiffUrl` for async SHA256 anchor

### Phase 4: Simplification

**`src/store.ts`** — removed `pendingClone`, `setPendingClone`, `clearPendingClone` (model tracks this internally)

**`src/index.tsx`** — App: single `handleConfig` function for both live messages and mount-time request. Panel: stripped to two effects + three callbacks

**`src/git-command.ts`** — added `fetch` and `checkout` subcommands

## Decisions

1. **`initComplete` guard.** Shell can register before `init()` creates `/home/user`. Without this guard, clone fires into a filesystem that doesn't have the home dir yet. Found this in Playwright — the model creates dirs then scans, so init must complete before clone can fire.

2. **Zustand 5 `onFinishHydration`.** On return visit, persist middleware restores `prDiffRanges` from IDB. Without waiting for hydration, `checkDiffRanges` sees null and re-fetches unnecessarily. The Zustand 5 API gives us a clean hook.

3. **No compound `cd && git clone`.** The shell starts in `/home/user`. The command `git clone url` is sufficient. Compound commands (`cd X && git Y`) cause `onCommandComplete` to receive the full string, which breaks `trimmed.startsWith('git clone')` detection.

4. **`destroyed` flag everywhere.** Model's async callbacks (findNepicRoot, fetchPrDiffRanges) can complete after destroy. The flag prevents stale writes.

## Test results

| Layer | Tests | Status |
|-------|-------|--------|
| Vitest (97 tests) | url-config, pr-diff, workflow-wiring, store, session, model, adapter | all pass |
| TypeScript | `tsc --noEmit` | zero errors |
| Build | `vite build` | clean |
| Playwright WW-P01 | hash → session switch + mainRepoConfig | **PASS** |
| Playwright WW-P02 | auto-clone + nav + napkin focus (gate test) | **PASS** |
| Playwright WW-P03 | link routing blob fallback | **PASS** |
| Playwright DS-P2-01 | panel renders (regression) | **PASS** |
| Playwright DS-P2-02 | store actions (regression) | **PASS** |
| Playwright DS-P3-01 | clone → nav (regression) | **PASS** |

## Files changed

| File | Change |
|------|--------|
| `src/model.ts` | Orchestration hub: registerShell, applyConfig, fetchLatest, checkAutoClone, checkDiffRanges |
| `src/url-config.ts` | NEW: pure URL parsing functions |
| `src/pr-diff.ts` | NEW: PR diff range parsing + GitHub API |
| `src/content.ts` | Hash parsing, config messaging, SPA detection |
| `src/store.ts` | Added prNum/prDiffRanges/cloningStatus; removed pendingClone |
| `src/link-routing.ts` | Diff-aware routing: routingDecision + resolveDiffUrl |
| `src/ContentPane.tsx` | getDiffCtx, async diff URL resolution |
| `src/index.tsx` | Simplified App (model.applyConfig) + stripped Panel |
| `src/Sidebar.tsx` | Clone loading state |
| `src/TerminalPane.tsx` | onShellReady callback |
| `src/git-command.ts` | fetch + checkout subcommands |
| `src/chrome.d.ts` | Extended Chrome API types |
| `src/__tests__/url-config.test.ts` | NEW: WW-S01..S03 |
| `src/__tests__/workflow-wiring.test.ts` | NEW: WW-M01..M04 (model-level) |
| `src/__tests__/pr-diff.test.ts` | NEW: WW-S04..S07 |

## What to review

1. **Diff URL async resolution.** `routeLink` is sync (Monaco mousedown), SHA256 is async. The `__DIFF_URL__` placeholder pattern works but is unusual. Consider pre-computing anchors when diff ranges are fetched.

2. **PAT storage.** Settings overlay accepts PAT but doesn't persist it. Needs `chrome.storage.local` wiring and passing to git commands + API fetches.

3. **Fixture PR.** The diff-aware routing (diff vs blob URL) needs the fixture PR to exist on GitHub. Run `fixtures/sync.sh` to create it, then WW-P05/P06 can test the full diff path.
