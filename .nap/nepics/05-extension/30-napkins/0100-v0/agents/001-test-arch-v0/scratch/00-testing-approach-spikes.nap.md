# testing approach — spikes to kill the ifs

every "if" in lifecycle tests traces to four unknowns.
four spikes, each under 2h, each produces yes/no + fallback.

* spike 1: playwright + extension + side panel
  * question: can playwright load extension, interact with side panel page?
  * smallest thing that answers it:
    * bare manifest v3 — background.ts registers side panel, side-panel.html has `<div id="hello">`
    * playwright: launch chrome `--load-extension=dist/`, goto `chrome-extension://{id}/side-panel.html`, assert `#hello`
    * then: click browser action → side panel opens → assert same div
  * what we learn:
    * `chrome-extension://{id}/side-panel.html` works as direct URL?
    * extension ID retrievable from playwright? (read chrome://extensions or derive from path)
    * full DOM access or sandboxed differently?
  * yes → all medium tests use this, side panel tested as page
  * no → side-panel.html served by vite dev server (lose extension APIs, mock chrome.*)
  * time: 1h
  * produces: `packages/extension/e2e/spike-01-extension-load.spec.ts` — keep or delete, question is dead

* spike 2: playwright + content script on github.com
  * question: can playwright verify content script runs on real github.com?
  * smallest thing:
    * content script adds `data-nap-loaded="true"` to `<body>`
    * manifest: `"content_scripts": [{ "matches": ["https://github.com/*"], "js": ["content.js"] }]`
    * playwright: launch with extension → `page.goto('https://github.com')` → assert `body[data-nap-loaded]`
    * then: side panel sends `chrome.runtime.sendMessage({ type: 'navigate', url })` → content script navigates → assert `page.url()` changed
  * what we learn:
    * content script injects on github.com in playwright's chrome?
    * side panel → content script messaging works? (runtime.sendMessage vs tabs.sendMessage)
    * github.com CSP blocks our content script?
  * yes → L1, L3, L4 fully automatable against real github.com
  * no → content script logic tested in isolation (small: message in → action out), github.com integration manual
  * risk: github.com rate-limits or captchas headless chrome
    * mitigation: specific public repo URL, not homepage
    * fallback: mock page mimicking github.com URL structure
  * time: 1.5h
  * produces: `packages/extension/e2e/spike-02-content-script.spec.ts`
  * depends on spike 1

* spike 3: monaco boots in extension CSP — THE GATE
  * question: does monaco load workers and initialize in extension side panel?
  * smallest thing:
    * side-panel.html with monaco-editor bundled
    * manifest CSP: `"content_security_policy": { "extension_pages": "script-src 'self'; worker-src 'self' blob:;" }`
    * side-panel.ts: create editor, set value `"# hello"`, assert `.monaco-editor` visible
    * console error collector: any "CSP" or "worker" message → fail
  * two variants:
    * A: `blob:` in worker-src (easy path)
    * B: bundled editor.worker.js + `MonacoEnvironment.getWorkerUrl` (fallback)
    * try A first → if fails, try B → document which worked
  * what we learn:
    * which CSP config works (A or B or neither)
    * monaco degrades gracefully without workers? (syntax highlighting works, no intellisense — might be fine for napkin-markdown)
    * other extension-specific gotchas? (`document.domain`?)
  * A or B works → T1.1 answered, proceed with that config
  * neither → monaco can't run in extension → textarea + manual highlighting (catastrophic pivot, unlikely)
  * time: 1.5h (most time: bundler config, not code)
  * produces: `packages/extension/e2e/spike-03-monaco-csp.spec.ts` + working manifest CSP config
  * do this first — if it fails, everything changes

* spike 4: side panel lifecycle on tab navigation
  * question: does chrome destroy/recreate side panel DOM on main tab navigation?
  * smallest thing:
    * side-panel.html with counter: `setInterval(() => n++, 1000)` → display in DOM
    * manual test: open panel, counter reaches 10, navigate main tab, check counter reset or kept counting
    * also: write to IDB on load, read on next load — sees previous data?
  * three outcomes:
    * DOM survives → in-memory state persists (monaco models, terminal history)
    * DOM destroyed, IDB persists → rebuild from IDB on each show (heavier, workable)
    * DOM destroyed, IDB cleared → catastrophic, unlikely
  * why manual: real behavior depends on side panel frame, lost in chrome-extension:// URL testing
    * this is the one question that MUST be tested manually
  * time: 30min
  * produces: written observation in spike notes (fact-finding, not test file)

* spike order
  * spike 3 first (monaco CSP) — fails? everything changes
  * spike 1 second (playwright + extension) — fails? all medium tests need replanning
  * spike 2 third (content script) — depends on spike 1
  * spike 4 any time (manual, 30min, no dependencies)
  * total: ~5h across all four
  * after: every "if" in 0110-v0.tests.md resolved, test plan concrete

* things spikes DON'T answer (and don't need to)
  * main-repo config — design decision, not technical unknown. pick manual param, done.
  * nav tree refresh trigger — design decision. pick re-read on tab switch, done.
  * double-click tab behavior — try in spike 2. monaco exposes it? keep. doesn't? cut from v0.
  * fixture repo content — TE task, no spike needed

* fixture repos (TE task, not a spike)
  * `nap-test-main`: 3 files with marker comments at known lines
  * `nap-test-nap`: .nap/ structure with chapters linking to nap-test-main
  * public, deterministic, never change without updating tests
  * TE creates before spike 2 (content script needs real github URL)
