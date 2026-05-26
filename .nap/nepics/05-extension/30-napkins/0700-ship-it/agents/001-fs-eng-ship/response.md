# Response — 0700-ship-it: Chrome Web Store prep

## What was done

### 1. Manifest polish
- `manifest.json`: name → "NAP — .nap repo reader", version → "0.1.0"
- Description: "Read .nap mini-book guides in a side panel alongside GitHub PRs — nav tree, editor, terminal, all in-browser" (110 chars)
- Added `icons` entries for 16, 48, 128px
- Permissions audited — all four are needed:
  - `sidePanel` — core feature
  - `storage` — chrome.storage.sync for tokens + debug mode
  - `activeTab` — read current tab URL
  - `tabs` — chrome.tabs.query for tab URL on mount

### 2. Icons
- Created `packages/ext-react/icons/icon.svg` — white "n" in a #2563eb rounded square
- Generated PNG at 16, 48, 128px using sharp-cli
- Build script copies `icons/` into `dist/icons/`

### 3. Production build
- `npm run build` copies manifest.json + icons/ into dist/
- `npm run package` = build + zip dist/ → `nap-extension.zip` (1.6 MB)
- `npm run dev` now uses `--mode development` to preserve console.logs during dev

### 4. Window globals stripped in production
All five `window.__` globals guarded behind `import.meta.env.DEV`:
- `__napStore__` (session.ts)
- `__monaco__` (ContentPane.tsx)
- `__napPipeline__` (index.tsx)
- `__wipeCurrentSession__` (index.tsx)
- `__napPipelineRawError__` (pipeline-steps.ts)

Verified: none appear in `dist/side-panel.js` — esbuild tree-shakes the dead branches.

### 5. Console.log stripping
- Configured `esbuild.pure: ['console.log', 'console.debug']` in vite.config.ts for production mode
- `console.warn` and `console.error` preserved for real issues
- Source maps excluded from production build (`sourcemap: false` when mode=production)

### 6. Debug mode in production
- Playground tab: already gated by `debugMode` prop in SurfaceTabBar (line 202) — hidden when false
- Debug toggle: still works in production via settings checkbox
- No changes needed here — existing gating was correct

### 7. Store listing
- `packages/ext-react/STORE_LISTING.md` with title, summary, description, category, privacy section
- Privacy: reads GitHub URLs, clones into IndexedDB, GitHub API for PR diffs. No analytics, no telemetry.

### 8. Verification
- `npm run build` — succeeds
- `npm run package` — produces `nap-extension.zip` (1.6 MB)
- `tsc --noEmit` — clean, zero type errors
- `grep dist/` for `__napStore__`, `__monaco__`, `__wipeCurrentSession__`, `__napPipeline__`, `__napPipelineRawError__` — zero matches
- `grep dist/` for `ghp_`, `glpat-`, `sk-` — only placeholder text in input fields, not actual tokens

## Files changed
- `packages/ext-react/manifest.json` — version, name, description, icons
- `packages/ext-react/package.json` — version, build script (copy icons), package script, dev mode flag
- `packages/ext-react/vite.config.ts` — esbuild.pure for console stripping, sourcemap off in prod
- `packages/ext-react/src/index.tsx` — guard `__napPipeline__` + `__wipeCurrentSession__`
- `packages/ext-react/src/session.ts` — guard `__napStore__`
- `packages/ext-react/src/ContentPane.tsx` — guard `__monaco__`
- `packages/ext-react/src/pipeline-steps.ts` — guard `__napPipelineRawError__`

## Files created
- `packages/ext-react/icons/icon.svg` — source SVG
- `packages/ext-react/icons/icon-16.png`
- `packages/ext-react/icons/icon-48.png`
- `packages/ext-react/icons/icon-128.png`
- `packages/ext-react/STORE_LISTING.md`

## Decisions
- **Kept all four permissions** — each is actively used
- **esbuild.pure over manual wrapping** for console.log — cleaner than wrapping 50+ call sites
- **Source maps off in production** — no debug symbols in the submission zip
- **`dev` script gets `--mode development`** — so Vite's `import.meta.env.DEV` is true and console.logs + window globals are preserved during local development

## To review
- Host permissions: `gitlab.grammarly.io` may need justification in Chrome Web Store review
- Bundle size: 5.1 MB main chunk (Monaco). Works but Chrome Web Store might flag it. Code-splitting Monaco is a future option.
- Screenshots: not included — need manual captures of the extension in action
- Privacy policy URL: Chrome requires one for extensions with host_permissions — needs to be created and hosted
