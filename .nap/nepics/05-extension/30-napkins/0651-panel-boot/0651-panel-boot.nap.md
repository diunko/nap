# panel boot — config-gated, tab-URL-driven

* the problem with 0650's boot
  * content script parses hash → sends config → panel receives
  * content script injection unreliable (ext reload, SPA nav, timing)
  * panel starts blind — black terminal, empty sidebar, no explanation

* the fix
  * `chrome.tabs.query` on mount → parse hash → config known before anything starts
  * no content script dependency for config. one-shot read, no listeners.

* boot sequence
  * mount → read tab URL → parseNapHash
    * hash found → create session → init → auto-clone or IDB resume
    * github.com, no hash → "ask author for a review link"
    * not github.com → "open on a GitHub page"
  * nothing initializes until config exists (no session, no terminal, no model)

* session = panel instance
  * one tab = one panel = one session
  * new PR = new window. browser IS the session manager.
  * panel faithful to the moment it opened — tab nav doesn't disturb it

* content script shrinks to ~20 lines
  * `navigate` handler (link clicks → `window.location.href`)
  * trigger button (Playwright)
  * hash parsing, config messaging, SPA observer — all deleted

* two refresh actions
  * **fetch latest** — .nap repo: git fetch + checkout
  * **refresh PR** — code repo: re-read tab URL, re-fetch diff ranges

* idle pane
  * no file open → repo/branch status, calm bg
  * terminal hidden until user clicks Terminal tab
