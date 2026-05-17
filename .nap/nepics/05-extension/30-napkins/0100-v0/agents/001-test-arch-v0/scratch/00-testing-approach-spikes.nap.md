# testing approach — spikes to kill the ifs

Every "if" in the lifecycle tests traces back to one of four unknowns.
Four spikes, each under 2 hours, each produces a yes/no + the fallback if no.

* spike 1: playwright + chrome extension + side panel
  * the question: can playwright load our extension and interact with the side panel page?
  * the smallest thing that answers it:
    * bare manifest v3 extension — background.ts registers side panel, side-panel.html has one `<div id="hello">it works</div>`
    * playwright test: launch chrome with `--load-extension=dist/`, navigate to `chrome-extension://{id}/side-panel.html`, assert `#hello` visible
    * then: click browser action → side panel opens → assert same div
  * what we learn:
    * does `chrome-extension://{id}/side-panel.html` work as a direct URL? (probably yes)
    * can we get the extension ID programmatically from playwright? (need to read chrome://extensions or derive from path)
    * does the page have full DOM access or is it sandboxed differently?
  * if yes → all medium tests use this approach, side panel tested as a page
  * if no → we test side-panel.html as a standalone page served by vite dev server (lose extension APIs, mock chrome.*)
  * time: 1 hour
  * produces: `packages/extension/e2e/spike-01-extension-load.spec.ts` — keep or delete, either way the question is dead

* spike 2: playwright + content script on github.com
  * the question: can playwright navigate to real github.com with our extension loaded and verify the content script runs?
  * the smallest thing:
    * content script that adds `data-nap-loaded="true"` to `<body>` on github.com
    * manifest: `"content_scripts": [{ "matches": ["https://github.com/*"], "js": ["content.js"] }]`
    * playwright test: launch with extension, `page.goto('https://github.com')`, assert `body[data-nap-loaded]`
    * then: side panel sends `chrome.runtime.sendMessage({ type: 'navigate', url: '...' })` → content script calls `window.location.href = url` → assert `page.url()` changed
  * what we learn:
    * does the content script actually inject on github.com in playwright's chrome?
    * can side panel → content script messaging work? (runtime.sendMessage vs tabs.sendMessage)
    * does github.com CSP block our content script?
  * if yes → L1, L3, L4 are fully automatable against real github.com
  * if no → content script logic tested in isolation (small test: message in → action out), github.com integration is manual
  * risk: github.com rate-limits or captchas headless chrome
    * mitigation: use a specific public repo URL, not the homepage
    * fallback: mock page that mimics github.com URL structure
  * time: 1.5 hours
  * produces: `packages/extension/e2e/spike-02-content-script.spec.ts`
  * depends on: spike 1 (need to know extension loading works first)

* spike 3: monaco boots in extension CSP
  * the question: does monaco load workers and initialize in a chrome extension side panel?
  * the smallest thing:
    * side-panel.html with monaco-editor bundled
    * manifest CSP: `"content_security_policy": { "extension_pages": "script-src 'self'; worker-src 'self' blob:;" }`
    * side-panel.ts: create editor, set value to "# hello", check `.monaco-editor` appears
    * console error collector: any message with "CSP" or "worker" → test fails
  * two variants to try:
    * A: blob: in worker-src (the easy path)
    * B: bundled editor.worker.js + `MonacoEnvironment.getWorkerUrl` (the fallback)
    * try A first. if it fails, try B. document which one worked.
  * what we learn:
    * which CSP configuration actually works (A or B or neither)
    * does monaco degrade gracefully without workers? (syntax highlighting still works, just no intellisense — might be fine for napkin-markdown)
    * any other extension-specific monaco gotchas (e.g., does `document.domain` matter?)
  * if yes (A or B) → T1.1 answered, proceed with that config
  * if neither → monaco can't run in extension. fallback: textarea with manual syntax highlighting (catastrophic pivot, unlikely)
  * time: 1.5 hours (most time is bundler config, not code)
  * produces: `packages/extension/e2e/spike-03-monaco-csp.spec.ts` + the working manifest CSP config
  * THIS IS THE GATE — do this spike first, before anything else

* spike 4: side panel lifecycle on tab navigation
  * the question: does chrome destroy/recreate the side panel DOM when the user navigates the main tab?
  * the smallest thing:
    * side-panel.html with a counter: `let n = 0; setInterval(() => { n++; document.getElementById('count').textContent = n; }, 1000)`
    * manual test (not playwright): open side panel, wait for counter to reach 10, navigate main tab to different github page, check if counter reset to 0 or kept counting
    * also: write to IDB on panel load, read on next load — does it see previous data?
  * what we learn:
    * panel DOM survives? → in-memory state (monaco models, terminal history) persists
    * panel DOM destroyed but IDB persists? → need to rebuild from IDB on each panel show (heavier, but workable)
    * panel DOM destroyed AND IDB cleared? → catastrophic, unlikely
  * why manual not playwright: the real behavior depends on the side panel frame, which we lose in chrome-extension:// URL testing. this is the one question that MUST be tested manually.
  * time: 30 minutes
  * produces: written observation in spike notes (not a test file — this is a fact-finding mission)

* spike order
  * spike 3 first (monaco CSP) — if this fails, everything changes
  * spike 1 second (playwright + extension load) — if this fails, all medium tests need replanning  
  * spike 2 third (content script on github.com) — depends on spike 1
  * spike 4 any time (manual, 30 min, no dependencies)
  * total: ~5 hours across all four
  * after spikes: every "if" in 0110-v0.tests.md is resolved, test plan is concrete

* what the spikes DON'T answer (and don't need to)
  * main-repo config mechanism — design decision, not technical unknown. pick "manual param", build it, done.
  * nav tree refresh trigger — design decision. pick "re-read on tab switch", build it, done.
  * double-click tab behavior — try it in spike 2. if monaco exposes it, keep it. if not, cut from v0.
  * fixture repo content — TE creates these, no spike needed, just a task

* fixture repos (not a spike — just a task for TE)
  * `nap-test-main`: 3 files with marker comments at known lines
  * `nap-test-nap`: .nap/ structure with chapters containing links to nap-test-main
  * public, deterministic, never change without updating tests
  * TE creates before spike 2 (content script needs a real github URL to navigate to)
