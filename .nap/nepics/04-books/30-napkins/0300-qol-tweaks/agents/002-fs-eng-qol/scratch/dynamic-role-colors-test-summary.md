# Dynamic role comment colors — test-eng summary

Replaces the hardcoded 5-prefix role comment system (//A:, //DU:, //FS:, //TA:, //TE:) with a hybrid approach: 4 known prefixes keep their fixed colors, everything else (//DU:, //E:, //PM:, //QA:, any new prefix) hashes to a 20-hue palette.

## Architecture

Two layers:
- **Known prefixes** (A, FS, TA, TE) → fixed hex colors, same as before. Defined in `KNOWN` map in `role-palette.ts`.
- **Everything else** → djb2 hash mod 20 → evenly-spaced hue. Lightness adjusts for dark/light themes.

DU is intentionally NOT in the known map — the user's own prefix uses the palette like any new prefix.

## What changed

### New file: `src/renderer/role-palette.ts`
- `KNOWN` — map of 4 prefixes (A, FS, TA, TE) with dark/light hex colors.
- `hashPrefix(prefix: string): number` — djb2 hash → palette index (0–19).
- `roleColor(prefix, isDark)` — known prefix → fixed hex; others → HSL from palette.
- `roleCssClass(prefix)` — known → `role-known-XX`; others → `role-N`.
- `roleDecoClass(prefix)` — same split for edit-mode decoration classes (`role-deco-known-XX` or `role-deco-N`).
- `generatePaletteCss(isDark)` — emits all CSS rules: 20 palette hues + 4 known-prefix overrides, for both rendered mode (`.nap-rendered .role-*`) and edit mode (`.role-deco-*`).

### themes.ts
- Removed `roleColors` field from `ThemeDef`.
- Added `isDark: boolean` field to `ThemeDef`.
- `applyTheme()` injects/updates `<style id="nap-role-palette">` with output of `generatePaletteCss(theme.isDark)`. Regenerated on every theme switch.
- Token rules: single `comment.role` rule with neutral base color (overridden by decorations). Replaces the 5 individual `comment.architect`, `comment.user`, etc. rules.
- No more `--nap-role-*` CSS variables.

### napkin-markdown.ts
- Removed 5 individual role-prefixed comment rules (`//A:`, `//DU:`, etc.).
- Single generic rule: `/\/\/\w+:.*$/` → token `comment.role`.
- Monarch tokenizer stays simple — just captures the pattern. Color comes from decorations.

### ContentPane.tsx (edit mode)
- `refreshRoleDecorations()` — scans all lines for `//\w+:` patterns, applies `deltaDecorations` with `inlineClassName` from `roleDecoClass(prefix)`.
- Called on: model content change, file open, external file change.
- Decoration CSS classes (`role-deco-known-A`, `role-deco-0`, etc.) are defined in the palette stylesheet injected by `applyTheme()` — automatically update on theme switch.

### markdown-renderer.ts (rendered mode)
- `ROLE_PREFIXES` map removed. Text renderer and post-processor now detect any `//\w+:` pattern.
- Uses `roleCssClass(prefix)` to assign either `role-known-XX` or `role-N` class.
- CSS rules for these classes come from the palette stylesheet.

### ContentPane.tsx CSS injection
- Removed 5 hardcoded `.role-architect`, `.role-user`, etc. rules.
- Kept `.nap-rendered .role-comment` base styles (padding, border-radius, background).
- Actual colors come from the palette stylesheet.

### dot-style.ts / Sidebar.tsx — unchanged
- Agent dots in the sidebar still use their own `ROLE_COLORS` map (architect=blue, fs-eng=green, etc.). These are structural roles with fixed meaning — not affected by this change.

## The palette system

**Known prefixes:** A → #3b82f6/#2563eb (blue), FS → #22c55e/#16a34a (green), TA → #f59e0b/#d97706 (orange), TE → #6b7280 (gray). These never change.

**Hash:** djb2 mod 20. Deterministic — same prefix always gets same index.

**Hues:** 20 evenly spaced: `index * 18` degrees (0, 18, 36, ..., 342).

**Lightness:**
- Dark themes: `hsl(H, 55%, 65%)`
- Light themes: `hsl(H, 55%, 40%)`

**Class naming:**
- Known: `role-known-A`, `role-deco-known-A`
- Palette: `role-3`, `role-deco-3`

## Test considerations

### What to test

**T-ROLE-01: hashPrefix is deterministic**
- `hashPrefix('A')` returns same value on repeated calls.
- Different prefixes return different indices (spot check — 'DU', 'E', 'PM' should differ; collisions are allowed but unlikely for short strings).
- Size: small.

**T-ROLE-02: Known prefixes return fixed colors**
- `roleColor('A', true)` returns `'#3b82f6'` (exact hex, not HSL).
- `roleColor('A', false)` returns `'#2563eb'`.
- Same for FS, TA, TE.
- Size: small.

**T-ROLE-03: Unknown prefixes return HSL from palette**
- `roleColor('E', true)` returns a string matching `hsl(...)` pattern.
- `roleColor('DU', true)` also returns HSL (DU is not in KNOWN).
- Size: small.

**T-ROLE-04: Dark vs light adjusts lightness for palette prefixes**
- `roleColor('E', true)` and `roleColor('E', false)` have same hue, different lightness.
- Size: small.

**T-ROLE-05: All 20 palette slots produce distinct hues**
- `roleColorByIndex(i, true)` for i=0..19 — extract hue values, verify all unique.
- Size: small.

**T-ROLE-06: roleCssClass splits known vs palette**
- `roleCssClass('A')` returns `'role-known-A'`.
- `roleCssClass('E')` returns `'role-N'` where N = `hashPrefix('E')`.
- `roleCssClass('DU')` returns `'role-N'` (DU is NOT known).
- Size: small.

**T-ROLE-07: roleDecoClass mirrors roleCssClass**
- `roleDecoClass('A')` returns `'role-deco-known-A'`.
- `roleDecoClass('E')` returns `'role-deco-N'`.
- Size: small.

**T-ROLE-08: generatePaletteCss produces rules for both palette and known**
- Call `generatePaletteCss(true)`. Verify output contains `.role-deco-known-A` with `#3b82f6`.
- Verify output contains `.role-deco-0` through `.role-deco-19` with `hsl(...)` values.
- Size: small.

**T-ROLE-09: Rendered mode — known prefix gets known class**
- `renderMarkdown('* //A: thought')` → output contains `class="role-comment role-known-A"`.
- Size: small.

**T-ROLE-10: Rendered mode — unknown prefix gets palette class**
- `renderMarkdown('* //E: expert thought')` → output contains `class="role-comment role-N"` where N = `hashPrefix('E')`.
- Size: small.

**T-ROLE-11: Edit mode — decorations applied with correct class**
- Medium test. Open a file containing `//A: text` and `//E: text`.
- Verify decoration for //A: has `inlineClassName` containing `role-deco-known-A`.
- Verify decoration for //E: has `inlineClassName` containing `role-deco-N`.
- Size: medium.

**T-ROLE-12: Theme switch updates palette colors but known colors stay pinned**
- Render with dark, capture //A: color and //E: color.
- Switch to light, re-render.
- //A: color should change (dark=#3b82f6, light=#2563eb).
- //E: color should change (different lightness, same hue).
- Size: small for rendered mode.

### What NOT to test
- Visual aesthetics of palette colors.
- Hash collision avoidance (20 buckets — collisions are acceptable).
- Monaco decoration rendering internals.

### Files to create/update
- `tests/role-palette.test.ts` — T-ROLE-01 through T-ROLE-08 (new file, small).
- `tests/rendered-mode.test.ts` — T-ROLE-09, T-ROLE-10, T-ROLE-12.
- `tests/role-decorations.spec.ts` — T-ROLE-11 (medium, Playwright).
