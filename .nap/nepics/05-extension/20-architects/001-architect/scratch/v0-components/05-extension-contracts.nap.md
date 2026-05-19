# extension-specific contracts

Interfaces that exist in the extension but not in the app. The app's internal interfaces (store ↔ components) are defined by the app code itself — port those. These are the new seams.

## 1. side panel ↔ content script

* two directions:
  * panel → content script: navigate the GitHub tab
  * content script → panel: open panel, pass URL hash data

* panel → content script
  * `chrome.tabs.sendMessage(tabId, { type: 'navigate', url: string })`
  * content script receives, calls `window.location.href = url`
  * alternative (simpler, proven): `chrome.tabs.update(tabId, { url })`
    * doesn't need content script at all for navigation
    * content script still needed for: trigger button, reading URL hash

* content script → panel
  * on github.com page load: content script reads `window.location.hash`
  * parses: `#nap-repo={provider}/{owner}/{repo}&nap-branch={branch}&napkin={nepic}/{napkin}`
  * stores in `chrome.storage.session` (per-tab, ephemeral)
  * side panel reads on open: `chrome.storage.session.get('napConfig')`
  * or: content script sends `chrome.runtime.sendMessage({ type: 'nap-config', ... })`
    * background.ts forwards to side panel

* trigger button
  * content script injects invisible button on github.com
  * Playwright clicks it → sends `chrome.runtime.sendMessage({ type: 'open_side_panel' })`
  * background.ts calls `chrome.sidePanel.open({ tabId })`
  * in prod: user clicks extension icon (openPanelOnActionClick)
  * trigger button is for testing only

## 2. store ↔ LightningFS (replaces electronAPI)

* the app's store doesn't touch the filesystem — it calls electronAPI, main process does I/O
* the extension's store calls LightningFS directly (no process boundary)
* but the pattern should be the same: store calls an interface, implementation does I/O

* interface: ExtensionFS
  ```
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  readdir(path: string): Promise<string[]>
  stat(path: string): Promise<{ isDirectory: boolean; isFile: boolean }>
  exists(path: string): Promise<boolean>
  ```
  * implemented by LightningFS adapter (already exists as fs-adapter.ts)
  * components never touch `lfs.promises` directly — go through this interface
  * makes testing possible: mock ExtensionFS for vitest, real LFS for Playwright

* the key difference from the app
  * app: main process PUSHES snapshots to renderer (model.onChange → IPC)
  * extension: renderer PULLS data from LFS (no push, no watcher)
  * trigger points: after git commands (onCommandComplete), after auto-save, on panel open
  * at each trigger: read LFS → parse → update store → React re-renders

## 3. store ↔ chrome.storage (persistence)

* what gets persisted (survives panel close/reopen):
  * mainRepoConfig: { owner, repo, branch }
  * PAT (github token)
  * zoom level
  * state-key → LFS store name mapping
  * per-state-key: last focused card, last open file, tab list

* when to persist:
  * on settings change → immediate write
  * on state change (tab open/close, card focus) → debounced write (500ms, same as app)
  * on panel close → flush (beforeunload)

* when to restore:
  * on panel open → read chrome.storage.sync → hydrate store
  * if state-key exists → restore tabs, focused card, active file
  * if not → fresh state, empty nav, show terminal

* interface:
  ```
  persist(key: string, state: PersistedState): Promise<void>
  restore(key: string): Promise<PersistedState | null>
  ```

## 4. adapter filesystem events (replaces fs.watch)

* the app watches the filesystem: fs.watch → model reload → snapshot → renderer
* the extension controls all writes — emit events at write time instead of watching

* event emitter on LightningFsAdapter:
  ```
  on('change', (event: { type: 'write' | 'mkdir' | 'rm', path: string }) => void)
  ```
  * writeFile → emit { type: 'write', path }
  * mkdir → emit { type: 'mkdir', path }
  * rm → emit { type: 'rm', path }
  * appendFile → emit { type: 'write', path }

* git commands write directly to raw LFS (not through adapter)
  * handled separately: onCommandComplete after git clone/pull/checkout → emit 'repo-changed'
  * store subscribes: on 'repo-changed' → refreshNav (re-parse entire tree from LFS)

* who subscribes:
  * store.refreshNav() on repo-changed
  * store can optionally re-read open file on write event (if path matches activeFilePath)
  * nav tree doesn't need per-file updates — bulk refresh after git commands is enough for v0

## 5. Monaco ↔ store

* app: ContentPane.tsx manages Monaco lifecycle as a React component
  * useEffect for editor creation, file loading, auto-save, external changes
  * store provides: activeFilePath, leftTabs, leftPaneRenderMode
  * component reads from store, writes to store (openDoc, pinActiveEphemeral)

* extension: same pattern
  * ContentPane.tsx creates Monaco editor in a ref
  * when activeFilePath changes (store subscription) → read file from LFS → set model
  * on content change → debounced writeFile to LFS → pinActiveEphemeral
  * role decorations refreshed on content change (same as app)
  * link provider registered once, click handler calls store actions

* cursor/scroll preservation
  * app: store.saveTabScroll(pane, tabId, scrollPos, cursorPos)
  * extension: same — save before switching, restore after switching
  * stored in Tab object, survives tab switching

## 6. wterm ↔ store

* app: Terminal.tsx reparents xterm, TerminalPane.tsx manages tab bar
* extension: simpler — one terminal, always present, no reparenting

* terminal is a surface, not a tab
  * store has: activeSurface: 'editor' | 'terminal'
  * switching surface: toggle visibility of editor container and terminal container
  * terminal container holds the wterm instance (created once, never destroyed)
  * no tab bar for terminal — it's one of two surfaces

* shell callbacks → store
  * onCommandComplete: if git command → store.refreshNav()
  * this is the existing pattern — just wired to store instead of ad-hoc

## 7. background.ts ↔ side panel

* background.ts is a service worker — separate JS context from side panel
* communication via chrome.runtime messaging

* background → panel:
  * currently: nothing (panel opens independently)
  * future (v1): pass URL hash config from content script through background to panel

* panel → background:
  * currently: nothing direct
  * the open_side_panel message goes content script → background → chrome.sidePanel.open

* for v0: background.ts is minimal — just the sidePanel registration + open handler
