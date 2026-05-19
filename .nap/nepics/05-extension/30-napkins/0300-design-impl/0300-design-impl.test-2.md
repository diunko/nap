# design impl — test plan for visual fixes (round 2)

## 1. Role prefix decorations

**What it is:** Scan editor content for `//(\w+):` patterns. Apply `inlineClassName` decoration from match position to end of line. Each prefix (DU, A, TA, TE) gets its own CSS color. Unknown prefixes hash to a deterministic palette slot (djb2 → 20 hues). The app does this in `ContentPane.tsx:276-305` using `roleDecoClass()` from `role-palette.ts`.

**Testable?** Yes — two levels.

**Test 1: small (vitest) — role-palette pure logic**
- Port `role-palette.ts` to the extension (it's pure, no Monaco dependency)
- Test `roleDecoClass`: known prefixes → `role-deco-known-A`, `role-deco-known-DU`, etc.
- Test `hashPrefix`: deterministic — same prefix always same index
- Test `roleColor`: known prefixes return fixed colors, unknown return HSL by hash
- Test `generatePaletteCss`: produces 20 hue rules + 5 known-prefix overrides
- **Concrete assertions:**
  - `roleDecoClass('A') === 'role-deco-known-A'`
  - `roleDecoClass('A') !== roleDecoClass('DU')`
  - `hashPrefix('FOO') === hashPrefix('FOO')` (determinism)
  - `generatePaletteCss(false)` contains `.role-deco-known-A { color: #2563eb`

**Test 2: medium (Playwright) — decorations applied in editor**
- Write content with `//DU: comment` and `//A: response` to editor
- Query `editor.getLineDecorations(lineNumber)` for the `//DU:` line
- Assert at least one decoration has `inlineClassName` containing `role-deco-known-DU`
- **Skip.** The vitest covers the mapping logic. Whether Monaco's `deltaDecorations` actually renders the CSS class is a Monaco API guarantee, not our code. Testing it in Playwright would be brittle (decoration timing, DOM class lookup) for low value. The real verification is visual — a reviewer sees green DU lines and blue A lines. If the `refreshRoleDecorations` function is a near-copy of the app's (which it should be), the risk is low.

**Recommendation: one small vitest for role-palette.ts. Skip the Playwright decoration test.**

---

## 2. Nav tree subdirectories

**What it is:** `parseNapkins` in `nav-tree.ts:184-225` handles flat files + `agents/`. Any other subdirectory (mini-book/, scratch/) is dropped. The fix adds a loop over non-agents directories, recursing into them via `parseFileDir`.

**Testable?** Yes.

**Test type: small (vitest)**

The existing `nav-tree.test.ts` has a mock filesystem and tests `parseNavTree`. Add one test case with a `mini-book/` subdirectory under a napkin.

**Concrete assertion:**
```
mockFs['/root/30-napkins/0100-feature'] = [
  { name: '.napkin.nap.json', isDirectory: false },
  { name: '0100-feature.nap.md', isDirectory: false },
  { name: 'mini-book', isDirectory: true },
  { name: 'agents', isDirectory: true },
];
mockFs['/root/30-napkins/0100-feature/mini-book'] = [
  { name: '01-chapter.md', isDirectory: false },
  { name: '02-chapter.md', isDirectory: false },
];

// After parse:
const feature = napkins.children![0];
const miniBook = feature.children?.find(c => c.name === 'mini-book');
expect(miniBook).toBeDefined();
expect(miniBook!.children).toHaveLength(2);
expect(miniBook!.children![0].name).toBe('01-chapter.md');
```

This is the seam that matters — the parser sees the subdirectory and recurses. If this test passes, the nav tree will render it (rendering is already tested separately via Playwright).

**Recommendation: add one vitest case to nav-tree.test.ts. Cheap, high value, catches the exact bug.**

---

## 3. Monaco config alignment

**What it is:** Match the app's editor config: `tabSize: 2`, `glyphMargin: true`, `lineDecorationsWidth: 8`, `padding: { top: 12, bottom: 12 }`. Extension currently has `tabSize: 4` (default), `fontSize: 14`, `glyphMargin: false`, `lineDecorationsWidth: 0`.

**Testable?** Technically yes — you could query `editor.getOption(EditorOption.tabSize)` in Playwright. But:

**Skip.** These are static config values, not logic. The "test" is reading the source code and verifying it matches the spec. If someone changes `tabSize: 2` to `tabSize: 4`, a test that asserts `tabSize === 2` catches it — but so does code review. The cost of a Playwright test (boot a real panel, query each option) is disproportionate to the risk (near-zero chance of regression — these values don't change).

**Recommendation: skip automated testing. Document the expected values in the spec. Code review catches drift.**

---

## 4. Zoom (Ctrl+Shift+/-)

**What it is:** Keyboard handler for Ctrl+Shift+= (zoom in) and Ctrl+Shift+- (zoom out). Applies CSS `zoom` on `document.documentElement`. Persists to `chrome.storage.sync`, restores on load.

**Testable?** Yes, but in two separable pieces.

**Test 1: small (vitest) — zoom scale logic**
- If the zoom logic is extracted into a pure function (e.g. `clampZoom(current, delta) → newScale` with min/max bounds), test the clamping.
- **Concrete assertions:**
  - `clampZoom(1.0, +0.1) === 1.1`
  - `clampZoom(0.5, -0.1) === 0.5` (at min, stays)
  - `clampZoom(2.0, +0.1) === 2.0` (at max, stays)
- This is only worth it if the clamping has non-trivial edge cases. If it's just `Math.min(2, Math.max(0.5, scale + delta))`, a vitest is overkill.

**Test 2: medium (Playwright) — keyboard triggers zoom**
- Dispatch `Ctrl+Shift+=` in the panel
- Read `getComputedStyle(document.documentElement).zoom`
- Assert it changed from `1` to something > `1`
- **Skip.** CSS zoom + keyboard dispatch is a known browser API. The risk is in Chrome intercepting the key combo (which you can only discover by running it manually in a real Chrome extension context, not in Playwright's headless mode where key routing may differ).

**Recommendation: skip both. Zoom is ~15 lines of straightforward code. The real test is: does the Ctrl+Shift keyboard shortcut work in a Chrome side panel without Chrome intercepting it? That's a manual test — Playwright can't faithfully reproduce Chrome's key routing for extension side panels.**

---

## 5. Link provider upgrade (bare file paths + priority)

**What it is:** The app's `content-link-provider.ts` detects three link types with priority: markdown links `[text](href)` > bare URLs `https://...` > bare file paths `src/main.ts:42`. It uses a `seen` set to prevent overlapping matches. The extension's current provider only handles markdown links and bare URLs — bare file paths are missed.

**Testable?** Yes.

**Test type: small (vitest) — detectLinks pure function**

The app's `detectLinks(lineContent, lineNumber)` is a pure function (takes a string, returns link ranges). Port it to the extension and test it directly.

**Concrete assertions:**

```
// Bare file path detected
const links1 = detectLinks('See src/main.ts:42 for details', 1);
expect(links1).toHaveLength(1);
expect(links1[0].href).toBe('src/main.ts:42');

// Markdown link takes priority over bare path inside it
const links2 = detectLinks('See [main.ts:42](/src/main.ts#L42) here', 1);
expect(links2).toHaveLength(1);
expect(links2[0].href).toBe('/src/main.ts#L42'); // markdown href, not bare path

// URL takes priority over overlapping bare path
const links3 = detectLinks('Visit https://github.com/org/repo/blob/main/src/foo.ts', 1);
expect(links3).toHaveLength(1);
expect(links3[0].href).toMatch(/^https:/);

// Multiple non-overlapping links
const links4 = detectLinks('[a.ts:1](/a.ts#L1) and b.ts:2', 1);
expect(links4).toHaveLength(2);

// No false positives on non-file tokens
const links5 = detectLinks('The value is 3.14 and name.is.dotted', 1);
expect(links5).toHaveLength(0);
```

This tests the seam: what does the link detector find, and do priorities resolve correctly? The downstream routing (what happens when you click) is already tested in `link-routing.test.ts`.

**Recommendation: add a vitest for `detectLinks`. This is the highest-value test in this round — the priority/overlap logic is the bug-prone part. The regex matching edge cases (what counts as a bare file path?) are where regressions hide.**

---

## summary

| Fix | Automated test? | Type | What it tests |
|---|---|---|---|
| 1. Role prefix decorations | **yes** | small (vitest) | `roleDecoClass`, `hashPrefix`, `roleColor`, `generatePaletteCss` |
| 2. Nav tree subdirectories | **yes** | small (vitest) | `parseNavTree` with mini-book/ subdirectory — add one case |
| 3. Monaco config | **skip** | — | Static values, code review catches drift |
| 4. Zoom | **skip** | — | Trivial code, real risk is Chrome key interception (manual only) |
| 5. Link provider upgrade | **yes** | small (vitest) | `detectLinks` priority, overlap resolution, bare path detection |

**3 new vitest suites, 0 new Playwright tests.**

The pattern: test the pure logic (palette mapping, directory parsing, link detection). Skip testing browser API interactions (CSS decorations, CSS zoom, key routing) — those are visual or platform-dependent and better caught manually.
