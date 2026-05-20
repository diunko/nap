# panel boot — config-gated, tab-URL-driven

* the problem with 0650's boot
  * content script parses hash → sends config → panel receives → session starts
  * content script injection is unreliable
    * extension reload doesn't re-inject into open tabs
    * user must reload the GitHub page — invisible requirement
    * SPA navigation detection (MutationObserver) is fragile
  * panel starts blind — black terminal, empty sidebar, no explanation
  * timing dance: who fires first? content script or panel mount?
    * three call sites for checkAutoClone, config request/response fallback
    * complexity exists to solve a problem that shouldn't exist

* the insight
  * panel has `chrome.tabs.query({ active: true })` — gives tab URL directly
  * no content script needed for config
  * no timing dance — panel reads URL, has config, creates session
  * one-shot read on mount — no listeners, no polling

* panel boot sequence
  * mount → `chrome.tabs.query` → read `tab.url` → `parseNapHash`
  * hash present?
    * yes → derive state key, create session, init terminal, auto-clone
    * no → show connect modal (manual repo/branch/PR entry)
  * not github.com?
    * show "open on a GitHub page" message
  * nothing initializes until config exists
    * no session, no terminal, no model, no blank black screen

* session = panel instance
  * one tab = one panel = one session
  * user opens PR link A → tab A + panel A
  * user opens PR link B → tab B + panel B
  * browser IS the session manager — no switching logic needed
  * panel is faithful to the moment it opened
    * tab navigation doesn't disturb the review session
    * explicit intent: new window for new PR

* content script shrinks to:
  * `navigate` message handler (`window.location.href = url`)
  * trigger button (Playwright)
  * ~20 lines, down from ~100
  * no hash parsing, no config messaging, no SPA observer

* two refresh actions (header bar)
  * **fetch latest** — .nap repo side
    * git fetch + checkout in the cloned .nap repo
    * "author pushed updates to the guide"
  * **refresh PR** — code repo side
    * re-read tab URL via `chrome.tabs.query`
    * re-parse hash, update mainRepoConfig, re-fetch diff ranges
    * "PR got new code commits" or "I changed the URL hash"
    * no session switch, no remount — just refreshes code-repo context

* connect modal (no hash / manual entry)
  * when: panel opens on a page with no nap hash
  * fields: nap repo URL, branch (default main), napkin path (optional)
  * also: main repo owner/name (auto-filled from tab URL if on github.com)
  * PR number (auto-filled from tab URL if on /pull/N)
  * submit → creates session, same flow as hash-derived config

* what changes from 0650
  * `index.tsx` App — reads tab URL on mount, gates session creation
  * `content.ts` — delete hash parsing, config messaging, SPA observer
  * `model.ts` — delete applyConfig timing dance (config known before model)
    * checkAutoClone simplifies: config always present when model created
  * new: gate component — loading → session | modal | "open on github" message
  * new: refresh-PR button wiring in header bar

* what stays the same
  * session.ts, store.ts, model.ts core (data pipeline, nav, echo suppression)
  * link-routing.ts, pr-diff.ts (diff-aware routing)
  * all Playwright test infrastructure (fixtures, helpers)
  * content script navigate handler
