# Data flow — push, same direction as the app

## The pipeline

```
filesystem change          git command completes
       |                          |
adapter emitter            onCommandComplete
{ type: 'write', path }   → findNepicRoot → refreshNav
       |                          |
       +----------+---------------+
                  |
           debounce 200ms
                  |
        model re-reads from LFS
                  |
           store update
                  |
         React re-renders
```

Components never pull. They subscribe to the store. The model pushes data from the filesystem into the store. One direction.

## Who owns what

| Layer | Owns | Talks to |
|---|---|---|
| adapter (fs-adapter.ts) | LightningFS wrapper, change event emitter | model (via onChange) |
| model (model.ts) | debounce, echo suppression, nepic root scan, nav parsing | store (via getState/setState) |
| store (store.ts) | UI state: tabs, activeFilePath, navSections, focusedCardSlug | React (via Zustand subscriptions) |
| components | rendering, user input | store (via actions) |

## File load sequence

```
user clicks file in sidebar
  → [sidebar] fileClick filename
  → store.openDoc(path)
      → upsertTab (create or reuse ephemeral)
      → set activeFilePath, activeSurface='editor'
  → ContentPane useEffect([activeFilePath]) fires
      → adapter.readFile(path)
      → monaco.editor.createModel(content, 'napkin-markdown')
      → editor.setModel(model)
      → requestAnimationFrame(() => editor.layout())
      → refreshRoleDecorations()
```

## Terminal write → editor update

```
user types: echo "text" >> /path/to/file
  → shell executes via adapter.appendFile
  → adapter emits { type: 'write', path }
  → model receives event
  → debounce 200ms
  → if path === activeFilePath: reloadActiveFile
      → dispatch 'nap-external-change' custom event
      → ContentPane handles: readFile → model.setValue (preserve cursor)
  → if path !== activeFilePath: refreshNav
```

## Editor write → filesystem

```
user types in Monaco
  → onDidChangeModelContent fires
  → pinActiveEphemeral (tab: italic → normal)
  → auto-save timer starts (1s debounce)
  → timer fires: suppressEcho(true) → adapter.writeFile → suppressEcho(false)
  → adapter emits write event
  → model sees echo flag → SUPPRESSED (no re-read, no cursor jump)
```

## Echo suppression

Without it: editor saves → adapter emits → model re-reads → setValue → cursor jumps to top.

With it: editor sets `suppressEcho(true)` before writing, clears it 500ms after. Model checks the flag and skips the re-read for own writes.

## Auto-save flush on file switch

If the user switches files before the 1s auto-save debounce fires, the edit would be lost. The useEffect cleanup flushes the pending save immediately:

```
activeFilePath changes (user clicked another file)
  → cleanup runs for the OLD file
  → if saveTimer pending: clear timer, write immediately
  → new effect runs for the NEW file
```

## Model init on panel load

```
createModel({ adapter, store })
  → subscribe to adapter change events
model.init()
  → mkdir /home, /home/user (LFS starts empty)
  → scanExistingRepos()
      → findNepicRoot scans /home/user/*
      → if found: refreshNav (IDB has repo from previous session)
      → if not: no-op (fresh panel, user will clone)
```
