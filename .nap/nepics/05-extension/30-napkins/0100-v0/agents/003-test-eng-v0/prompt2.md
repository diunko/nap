## Update: real side panel testing now possible

Read the spike results: `.nap/nepics/05-extension/30-napkins/0100-v0/agents/004-fs-eng-spikes/response.md`

We proved that Playwright CAN open a real Chrome side panel and interact with it alongside a github.com tab. The fs-eng (002) is porting this into packages/extension/ now.

### What's changed since your first run

- `PW_CHROMIUM_ATTACH_TO_OTHER=1` env var lets Playwright see side panels
- Content script injects on real github.com (no CSP blocks)
- Side panel → content script messaging works
- Trigger button pattern opens the real panel (not the two-tab hack)

### What you should do after fs-eng finishes

Wait for the fs-eng (002) to finish porting the fixture and writing lifecycle tests. Then:

1. Run ALL tests — small (vitest) + medium (Playwright with new fixture)
2. Report: which pass, which fail, exact errors
3. The lifecycle tests (L1-L6 from `0110-v0.tests.md`) are the critical ones — they test the real user journey
4. Compare results against `0100-v0.test.md` (seam tests) and `0110-v0.tests.md` (lifecycle tests) — what's covered now?
5. Fix obvious test bugs if you find them

### Coverage target

The human wants 95% happy path coverage via automated Playwright. That means L1 (clone → read → click through to code), L2 (edit → commit), L3 (navigate between chapters) should all pass green.

Write your response to `response2.md` in your agent directory, then run `nap3 done`.
