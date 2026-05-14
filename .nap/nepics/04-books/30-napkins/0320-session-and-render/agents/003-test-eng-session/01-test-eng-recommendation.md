**Ghost watcher (SP-06):**

The real problem isn't the tmpdir path — I tried `realpathSync` and it still failed. The real problem is that `watchGhost` is fire-and-forget:

```
renderer: ipcRenderer.send('file:watch-ghost', path)   // fire and forget
main:     ipcMain.on('file:watch-ghost', () => {
            ghostWatcher.watch(path)                     // async, not awaited
          })
```

Nobody knows when the subscription is ready. In prod this is the same race — if a file appears within milliseconds of the ghost tab opening, it's missed.

**Fix:** Make it awaitable.
- `ipcMain.on` → `ipcMain.handle` (returns promise)
- `ipcRenderer.send` → `ipcRenderer.invoke` (awaitable)
- `ghostWatcher.watch()` is already async — await it in the handler
- In ContentPane, `await window.electronAPI.watchGhost(path)` before moving on

Then the test just awaits the watcher setup, writes the file, and the event fires deterministically. Tmpdir, real dir, doesn't matter — the subscription is confirmed ready before the file appears.

**Scroll sync (SS-03, SS-04):**

The zustand subscribe idea is brittle — you're right. It depends on zustand's internal dispatch order.

The real problem is architectural: the rendered div's visibility and the scroll sync that reads it are driven by the same state change. They race.

**Fix:** Don't use `display: none`. Use stacked layers with `visibility: hidden`:

```jsx
<div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
  <div ref={containerRef} style={{
    position: 'absolute', inset: 0,
    zIndex: leftPaneRenderMode === 'edit' ? 1 : 0,
    visibility: leftPaneRenderMode === 'edit' ? 'visible' : 'hidden',
  }} />
  <div ref={renderedRef} style={{
    position: 'absolute', inset: 0, overflow: 'auto',
    zIndex: leftPaneRenderMode === 'rendered' ? 1 : 0,
    visibility: leftPaneRenderMode === 'rendered' ? 'visible' : 'hidden',
  }} />
</div>
```

Both divs are always mounted AND fully laid out (same dimensions, same scroll state). The active one is on top via z-index. The hidden one retains `scrollTop`, `offsetTop`, everything — because `visibility: hidden` + `position: absolute` preserves layout. It's how every tab panel works.

No timing dependency. No cache. No subscribe hack. The scroll sync effect runs whenever it wants — the div it reads is always in a valid layout state.

**Summary:**

| Issue | Root cause | Fix |
|---|---|---|
| Ghost watcher test | fire-and-forget IPC, no subscription readiness signal | `ipcMain.handle` + `ipcRenderer.invoke` + await |
| Scroll sync | `display: none` destroys layout state before effect reads it | stacked absolute layers with `visibility: hidden` |

Both are architecture changes, not patches. Both make the features testable by removing races rather than working around them.
