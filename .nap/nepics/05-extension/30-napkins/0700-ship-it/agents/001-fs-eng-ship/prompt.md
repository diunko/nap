Read your role: `.nap/00-org/40-roles/fullstack-eng.md` — it tells you to read org docs. Do that first.

## The feature

- `.nap/nepics/05-extension/30-napkins/0700-ship-it/0700-ship-it.nap.md`

## Read the code

- `packages/ext-react/manifest.json` — current manifest
- `packages/ext-react/vite.config.ts` — build config
- `packages/ext-react/package.json` — dependencies, scripts
- `packages/ext-react/src/index.tsx` — window.__ globals to strip
- `packages/ext-react/side-panel.html` — entry point

Also read `docs/extension.md` — the existing docs describe what the extension does.

## Your task

Prepare the extension for Chrome Web Store submission. Work through these:

### 1. Manifest polish
- Set version: "0.1.0"
- Set name: "NAP — .nap repo reader"  
- Write a concise description (under 132 chars)
- Add icons entries (16, 48, 128) pointing to `icons/icon-{size}.png`
- Create placeholder SVG icons (simple "n" letter in a rounded square, brand color #2563eb) and export as PNG at all three sizes. Put in `packages/ext-react/icons/`
- Audit permissions — remove anything unnecessary

### 2. Production build
- Add `npm run build:prod` script (or confirm existing `build` is production-ready)
- Ensure `window.__napStore__`, `window.__monaco__`, `window.__wipeCurrentSession__` are stripped in production (use `import.meta.env.PROD` check or `if (process.env.NODE_ENV !== 'production')`)
- Verify no .env tokens leak into the bundle (grep the dist/ output)
- Add `npm run package` script: `npm run build && cd dist && zip -r ../nap-extension.zip .`

### 3. Store listing draft
- Write `packages/ext-react/STORE_LISTING.md` with:
  - Title
  - Summary (one sentence)
  - Description (a few paragraphs — what it does, who it's for, how to use)
  - Category: Developer Tools
  - Privacy: what data is accessed, what leaves the browser

### 4. Debug mode for production
- Playground tab: already gated by debug flag — verify it's hidden when `debugMode` is false
- Console APIs: wrap in `import.meta.env.DEV` check
- Ensure debug mode toggle still works in production (settings checkbox)

### 5. Verify
- `npm run build` succeeds
- `npm run package` produces nap-extension.zip
- Load the zip's contents as unpacked extension — everything works
- Grep dist/ for any leaked tokens or test-only code
- `tsc --noEmit` clean

Write response.md, then `nap3 done`.

CRITICAL: when you are done, write your response to `.nap/nepics/05-extension/30-napkins/0700-ship-it/agents/001-fs-eng-ship/response.md`, then run `nap3 done` in your terminal (no message argument — just `nap3 done`). The architect is blocked waiting — without this, the pipeline stalls.
