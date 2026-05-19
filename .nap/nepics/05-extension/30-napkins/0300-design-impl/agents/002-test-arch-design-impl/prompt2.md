## Round 2: test plan for visual fixes

We have 5 remaining visual fixes for the extension. For each one, decide: is it worth an automated test, and if so, what kind (small vitest or medium Playwright)?

Read the app's source to understand how these work in the desktop app — the extension should port the same patterns.

### The 5 fixes

**1. Role prefix decorations**
- App code: `packages/v3/src/renderer/ContentPane.tsx` lines 277-305 (`refreshRoleDecorations`)
- App code: `packages/v3/src/renderer/role-palette.ts` (`roleDecoClass`, `generatePaletteCss`)
- What it does: scans Monaco content for `//(\w+):` patterns, applies `inlineClassName` decoration from match position to end of line. Each prefix (DU, A, TA, TE) gets its own CSS color class.
- Currently broken in extension: all `//` comments are green (tokenizer only, no decorations)

**2. Nav tree subdirectories**
- The parser (`packages/extension/src/nav-tree.ts`, `parseNapkins` function) only handles flat files + `agents/`. Any other subdirectory (mini-book/, scratch/) is silently dropped.
- Fix is ~10 lines: loop over non-agents directories and include them.
- The existing `parseNavTree` vitest tests don't include a subdirectory case.

**3. Monaco config**
- App code: `packages/v3/src/renderer/ContentPane.tsx` line 186-205 (editor creation config)
- Key settings: `tabSize: 2`, `glyphMargin: true`, `lineDecorationsWidth: 8`, `padding: { top: 12, bottom: 12 }`, `fontSize: 13`
- Extension currently has: `tabSize: 4` (Monaco default), `fontSize: 14`

**4. Zoom**
- Ctrl+Shift+/- keyboard handler (NOT Cmd+/- which Chrome intercepts)
- CSS `document.documentElement.style.zoom = scale`
- Persist to chrome.storage.sync, restore on load

**5. Link provider upgrade**
- App code: `packages/v3/src/renderer/content-link-provider.ts` — three regex types with priority: markdown links > bare URLs > bare file paths
- App code: `resolveLink` uses `nap-link://` custom protocol to encode route result, decoded on click
- Extension has a simplified provider that misses bare file paths and doesn't prioritize correctly

### What I want from you

For each fix, answer:
- **Testable?** yes/no
- **Test type?** small (vitest, pure logic) or medium (Playwright, needs real Monaco/browser)
- **What the test verifies** — concrete assertion
- **Skip?** If testing this would be brittle or low-value, say so and why

Write your analysis to `0300-design-impl.test-2.md` in the napkin directory. Do NOT overwrite `0300-design-impl.test.md` — that's the round 1 migration plan and we need it.

Write response2.md in your agent directory, then `nap3 done`.
