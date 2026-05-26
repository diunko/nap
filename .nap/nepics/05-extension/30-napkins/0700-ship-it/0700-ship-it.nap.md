# ship it — prepare ext-react for Chrome Web Store

* what: package the extension for Chrome Web Store submission
  * production build
  * manifest polish
  * store listing assets
  * remove dev-only features from production

* manifest.json cleanup
  * name: "NAP — .nap repo reader"
  * description: concise, under 132 chars
  * version: "0.1.0"
  * icons: 16, 48, 128px (currently missing — need actual icons)
  * permissions: audit — only what's needed, no excess
  * host_permissions: github.com + gitlab.grammarly.io
    * does Chrome Web Store flag broad host permissions?
    * may need justification for gitlab.grammarly.io
  * remove dev-only: any test hooks, console APIs
    * `window.__napStore__`, `window.__monaco__`, `window.__wipeCurrentSession__`
    * strip behind `process.env.NODE_ENV !== 'production'` or build flag

* production build
  * `npm run build` already works → dist/
  * minification: vite handles it
  * source maps: exclude from submission (keep for debugging)
  * bundle size audit: current ~5MB (Monaco). acceptable? code-split?
  * ensure no .env tokens leak into the build

* Chrome Web Store listing
  * title: "NAP — .nap repo reader"
  * summary: one sentence
  * description: what it does, who it's for
  * screenshots: side panel alongside GitHub PR (use fixture PR)
  * category: Developer Tools
  * language: English

* store assets needed
  * icon 128×128 (store listing)
  * icon 48×48 (extensions page)
  * icon 16×16 (toolbar)
  * promotional tile 440×280 (optional but helps discovery)
  * screenshots: at least 1, max 5
    * screenshot 1: side panel with mini-book chapter open, nav tree, GitHub PR visible
    * screenshot 2: loading gate steps progressing
    * screenshot 3: terminal with git commands

* privacy
  * privacy policy URL (Chrome requires one for extensions with host_permissions)
  * what data: reads GitHub/GitLab URLs, clones repos into local IndexedDB
  * what's sent where: GitHub API for PR diff ranges (with user's token). nothing else leaves the browser.
  * no analytics, no tracking, no telemetry

* debug mode in production
  * playground tab: hidden by default (debug flag off)
  * `__wipeCurrentSession__`: strip or keep behind debug flag
  * console APIs: strip or keep behind debug flag
  * decision: keep debug flag mechanism, strip the actual `window.__` globals in prod

* zip for submission
  * Chrome Web Store accepts a .zip of the dist/ folder
  * `cd packages/ext-react && npm run build && cd dist && zip -r ../nap-extension.zip .`
  * the zip is the submission artifact
