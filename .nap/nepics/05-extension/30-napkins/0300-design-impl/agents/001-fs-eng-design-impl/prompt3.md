## Round 3: visual fixes + deep research

### Step 1: Read the app source deeply first

Before touching any code, read these files in the v3 app. Understand how each feature works there — the extension should port the same patterns. Spend time on this. Don't skim.

- `packages/v3/src/renderer/ContentPane.tsx` — especially:
  - Lines 277-305: `refreshRoleDecorations()` — how role prefix colors work (deltaDecorations with inlineClassName)
  - Lines 180-205: Monaco editor creation config (tabSize, glyphMargin, padding, etc.)
  - Lines 330-394: link click handling via `onMouseDown` (three regex types, column range matching)
  - Lines 222-242: auto-save with pinActiveEphemeral and suppressExternal
- `packages/v3/src/renderer/content-link-provider.ts` — full file: `detectLinks` with three regex types, priority via `seen` set, `resolveLink` using `nap-link://` protocol, `handleLinkClick` decoder
- `packages/v3/src/renderer/role-palette.ts` — full file: `hashPrefix`, `roleDecoClass`, `roleColor`, `generatePaletteCss`
- `packages/v3/src/renderer/Sidebar.tsx` — especially:
  - Lines 177-239: `EntryTree` — recursive rendering with `maxDepth`, sort order (main file first, then files, then dirs)
  - Lines 80-173: `FileRow` — `*` bullet at 10px wide, centered, file name styling (isMain → bold, .md → link color)
- `packages/v3/src/renderer/store.ts` — especially:
  - Lines 104-144: `upsertTab` and `removeTab` helpers
  - Lines 351-357: `saveTabScroll` — cursor/scroll position per tab

### Step 2: Fix these 5 things

**1. Role prefix decorations**
- Port `role-palette.ts` from v3 into the extension (or adapt the existing `dot-style.ts` to include the decoration classes)
- In `side-panel.ts`, add a `refreshRoleDecorations()` that runs on every `onDidChangeModelContent` — near-copy of ContentPane.tsx:277-305
- Inject the palette CSS via `generatePaletteCss(false)` (light theme) into a `<style>` element at startup
- Result: `//DU:` lines are green, `//A:` lines are blue, `//TA:` lines are orange — not all green

**2. Nav tree subdirectories**
- In `nav-tree.ts`, `parseNapkins`: after the files loop and agents check, add a loop for non-agents directories. Use the existing `parseFileDir` to recurse.
- Result: `mini-book/` and `scratch/` appear in the nav tree when a card is focused

**3. Monaco config**
- In `side-panel.ts`, editor creation: set `tabSize: 2`, `fontSize: 13`, `glyphMargin: true`, `lineDecorationsWidth: 8`, `padding: { top: 12, bottom: 12 }`
- Match the app's ContentPane.tsx line 186-205

**4. Zoom**
- Add keyboard listener for Ctrl+Shift+= (zoom in), Ctrl+Shift+- (zoom out), Ctrl+Shift+0 (reset)
- NOT Cmd+/- (Chrome intercepts those)
- Apply `document.documentElement.style.zoom = String(scale)`
- Persist scale to chrome.storage.sync, restore on load
- ~15 lines

**5. Link provider upgrade**
- Port `detectLinks` from `content-link-provider.ts` — three regex types with priority (markdown > URL > bare file path), `seen` set for overlap prevention
- Port the `resolveLink` approach: encode route result as `nap-link://` protocol URL, decode on click via `handleLinkClick`
- OR: keep the current `onMouseDown` approach but add bare file path detection (the app uses both — link provider for hover underlines + onMouseDown for click handling)

### Step 3: Write tests per the TA's plan

Read the TA's test plan: `.nap/nepics/05-extension/30-napkins/0300-design-impl/0300-design-impl.test-2.md`

Add 3 vitest suites:
1. **role-palette tests** — `roleDecoClass`, `hashPrefix`, `roleColor`, `generatePaletteCss` (see TA's concrete assertions)
2. **nav-tree subdirectory case** — add one test to existing `nav-tree.test.ts` with `mini-book/` directory
3. **detectLinks tests** — priority, overlap, bare paths, false positives (see TA's concrete assertions)

### Step 4: Run everything

- `npx vitest run` — all small tests including the 3 new ones
- `npx playwright test` — all existing e2e (should still pass, these changes don't break selectors)
- `npm run build` — verify it builds

Write response3.md, then `nap3 done`.
