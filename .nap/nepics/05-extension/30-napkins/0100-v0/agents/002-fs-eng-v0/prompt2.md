## Update: port spike-panel fixture into packages/extension

Read the spike results: `.nap/nepics/05-extension/30-napkins/0100-v0/agents/004-fs-eng-spikes/response.md`

The spike package at `packages/spike-panel/` proved that Playwright can open and interact with a REAL Chrome side panel alongside a real github.com tab. All three spikes pass.

### What you need to port into packages/extension/

1. **`PW_CHROMIUM_ATTACH_TO_OTHER=1`** — add to `e2e/tests/fixtures.ts` before creating context

2. **Trigger button in content.ts** — add a near-invisible button to github.com that sends `chrome.runtime.sendMessage({ type: 'open_side_panel' })` when clicked. See `packages/spike-panel/src/content.ts` for the pattern.

3. **`open_side_panel` handler in background.ts** — listen for the message and call `chrome.sidePanel.open({ tabId: sender.tab.id })`. See `packages/spike-panel/src/background.ts`.

4. **`openSidePanel()` helper in fixtures.ts** — navigates to github.com, waits for content script, clicks trigger button, catches the new page event. See `packages/spike-panel/e2e/tests/fixtures.ts`.

5. **Delete old `side-panel.spec.ts`** — the two-tab hack is superseded. Replace with real-panel tests.

6. **Rewrite `happy-path-debug.spec.ts`** — use the real panel fixture instead of `page.goto(chrome-extension://...)`. Tests should open github.com first, then open the real side panel.

7. **Create fixture repos** — two public GitHub repos:
   - `nap-test-main` — code repo with files at known paths (e.g. `modules/server/copy_document.ts` with marker comment at line 51)
   - `nap-test-nap` — .nap repo with `20-architects/`, `30-napkins/`, chapters with file:line links pointing at nap-test-main
   - Use `gh repo create` to create them, push known content

### What to verify after porting

Run the existing 8 happy-path tests with the new fixture pattern. They should all still pass — the only change is HOW the panel opens, not WHAT it contains.

Then add the lifecycle tests from `0110-v0.tests.md`:
- L1: clone .nap repo, read chapter, click file:line link → main tab navigates to nap-test-main
- L2: edit, commit, verify from terminal
- L3: navigate between chapters (.md links) and code (file:line links)
- L6: close panel, reopen, IDB persists

Write your response to `response2.md` in your agent directory, then run `nap3 done`.
