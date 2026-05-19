# current extension architecture — what exists

* components
  * background.ts — service worker, registers side panel, handles open_side_panel message
  * content.ts — injected on github.com, trigger button for opening panel, navigation messages, data-nap-loaded marker
  * side-panel.ts (873 lines) — EVERYTHING ELSE
  * side-panel.html — layout + CSS
  * popup.html + popup.ts — settings (orphaned — unreachable since openPanelOnActionClick)

* side-panel.ts is a god file
  * creates LightningFS, fs-adapter, shell, git-command, wterm, Monaco editor
  * manages tab state (ad-hoc: currentFilePath, autoSaveTimer, ephemeral tracking)
  * renders nav tree (delegates to nav-renderer.ts but orchestrates refresh)
  * handles link clicks (delegates to content-link-provider.ts)
  * handles settings overlay (inline DOM manipulation)
  * handles zoom (inline keyboard listener)
  * handles resize (inline mouse events)
  * handles tab switching (inline DOM visibility toggling)
  * handles auto-save (inline debounce)
  * handles refresh-on-focus (inline tab switch check)
  * handles role decorations (inline deltaDecorations)
  * all via window.__ test hooks sprinkled throughout
  * NO model, NO store, NO state management — just event handlers mutating DOM

* data flow (current)

```
  github.com tab              side panel
       |                         |
  content.ts               side-panel.ts
  (trigger btn,            (everything)
   nav messages)                 |
       |                    +----+----+----+----+
       v                    |    |    |    |    |
  chrome.tabs.update   Monaco  wterm  nav  tabs  settings
  (link nav)             |      |     |    |     |
                         |      |     |    |   chrome.storage
                         v      v     v    |
                     LightningFS (IDB)     |
                         ^                 |
                         |                 v
                    isomorphic-git    DOM manipulation
                    (via git-command)  (ad-hoc state)
```

* the problem
  * no model — state is scattered across global variables
    * currentFilePath, autoSaveTimer, mainRepoConfig, focusedCardSlug
    * tab state in tab-manager.ts (a class with its own internal arrays)
    * nav state in nav-renderer.ts (a class with its own focusedCardSlug)
    * editor state in Monaco (model.getValue(), cursor, scroll)
  * no single source of truth — each component owns its own slice
  * state synchronization is ad-hoc: tab-manager doesn't know about nav-renderer's focus
  * testing requires window.__ hooks because there's no state to assert against
  * every new feature adds more ad-hoc wiring to side-panel.ts

* what works despite the architecture
  * LightningFS sharing (one instance, three consumers) — correct and proven
  * git-command.ts, fs-adapter.ts, shell.ts — clean, standalone, tested
  * nav-tree.ts (parser) — pure function, tested
  * link-routing.ts, content-link-provider.ts — pure functions, tested
  * role-palette.ts, dot-style.ts, theme.ts — pure functions, tested
  * napkin-markdown.ts — pure, tested
  * the I/O and logic layers are fine. the wiring layer is the problem.
