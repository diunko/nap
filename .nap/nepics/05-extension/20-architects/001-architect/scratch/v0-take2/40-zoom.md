# Controlling Zoom and Font Size in a Chrome Extension Side Panel

## TL;DR
- **There is no `chrome.sidePanel` zoom API, and `chrome.tabs.setZoom` cannot target a side panel because the side panel is not a tab — it is a window-attached WebContents.** Chrome also does not route the Ctrl/Cmd +/− keyboard shortcut to the side panel WebContents (tracked as Chromium issue 375982190). The only reliable, production-grade solution is to implement your own zoom/font-size control in the side panel's HTML/CSS and persist it via `chrome.storage`.
- **Build the panel with `rem`-based units off a single `html { font-size: … }` value, then expose a slider/keyboard shortcut in your UI that rewrites that root font-size.** This gives true text scaling and reflow. If you also need images/icons to scale, layer in `zoom` (now a standardized CSS property in Chrome 128+) or `transform: scale()` on a wrapper. Avoid `transform: scale()` on `<body>` for the whole panel — it leaves layout boxes at original size and creates overflow/scrollbar bugs in narrow panels.
- **Stage your work**: ship rem-based scaling first (smallest change, best a11y, satisfies WCAG 1.4.4); add a Chrome `commands` keyboard shortcut (`Ctrl+Shift+=` / `Ctrl+Shift+-`) that the side panel listens for itself; finally, watch Chromium issues 375982190 and 40730614 in case Chrome eventually delivers native zoom routing or a sidePanel zoom option.

## Key Findings

**1. The `chrome.sidePanel` API has no zoom option.** The full surface is `setOptions`, `getOptions`, `setPanelBehavior`, `getPanelBehavior`, `open`, `close`, `getPanelLayout`, plus `onOpened`/`onClosed`. `PanelOptions` accepts only `tabId`, `path`, and `enabled`. There is no `zoomFactor`, `fontSize`, or comparable property.

**2. `chrome.tabs.setZoom` cannot zoom the side panel itself.** A Chrome team member, Patrick Kettner, has explicitly told developers in the chromium-extensions Google Group that *"the sidepanel is attached to a window, not a tab. So it isn't really attached to a given tab."* As a result, when you call `chrome.tabs.getCurrent()` from inside `sidepanel.html`, the call returns `undefined` — the same behavior documented for popups and background pages on developer.chrome.com: *"Gets the tab that this script call is being made from… May be undefined if called from a non-tab context (for example, a background page or popup view)."* This is tracked at Chromium issue 40730614 ("chrome.tabs.getCurrent fails when initiated from inside a side panel"). `chrome.tabs.setZoom(tabId, zoomFactor)` therefore has no tabId you can point at the panel. You *can* call `chrome.tabs.setZoom` from inside the side panel to zoom the main page (it defaults to the active tab of the current window), but that is not what you want here.

**3. Chrome's built-in Ctrl/Cmd +/− zoom is not delivered to the side panel WebContents.** This is an open Chromium bug: **issue 375982190 — "Side panel does not receive zoom events"** (filed publicly on issues.chromium.org). The user's observation that the keyboard shortcut only zooms the main page is correct and is a known, tracked gap, not a configuration problem.

**4. The `chrome://settings/appearance` controls *do* affect the side panel.** Chrome's own Appearance settings expose **Font size** (Very Small → Very Large) and **Page zoom** (25%–500%). These propagate to every extension page Chrome renders, including side panels and popups, because side panels honor the user's default font size and the browser's per-origin zoom map. At least one popular side-panel extension actively instructs users to use this path; the "Tab Manager in Side Panel" Chrome Web Store listing tells users: *"You can go to chrome://settings/appearance and adjust side panel's some appearance, such as left or right postion, font size and page zoom."* This is the only built-in, official mechanism today.

**5. The CSS `zoom` property is now standardized in Chrome.** Chrome 128 (released August 20, 2024) shipped a standards-aligned `zoom` implementation: *"The implementation of the previously non-standard CSS zoom property has been updated to align with the new standard. This changes various JavaScript APIs to align with the specification, changes zoom to apply to iframe content documents, and changes it to apply to all inherited length properties where previously it only changed the inherited font-size."* The CSS Working Group draft has it under `css-viewport`; per MDN's Firefox 126 release notes (released May 14, 2024), *"The zoom property is now supported. It can be used to increase or decrease the size of an element and its contents (Firefox bug 390936),"* so `zoom` is now Baseline-newly-available. For an extension that targets a Chromium browser only (which is the case for side panels — they don't exist in Firefox MV3), `zoom` is a safe, well-defined choice and avoids the overflow problems of `transform: scale()`.

**6. `transform: scale()` is poorly suited to scaling an entire side panel.** Unlike `zoom`, `transform: scale()` does not change the layout box. A commenter on Sara Cope's CSS-Tricks `zoom` almanac entry summarizes the difference cleanly: *"'zoom' is a factor that applies to font sizes, image sizes, and the content in general, whilst preserving the actual width of the content, and letting text wrap and drop down… 'transform' applies an arbitrary affine transform to the element exclusively for when rendering it; thus the parent element sees it as the same size."* In a narrow (320 px default) side panel, scaling `<body>` with `transform: scale(1.25)` leaves a 320 px-wide box visually 400 px wide that overflows the panel and produces broken scrollbars.

**7. `document.body.style.zoom = "150%"` works in extension contexts but is fragile.** It's the simplest one-liner and has been documented to work since the Chrome 42 era. It is now backed by a real CSS standard. The known weaknesses — interactions with `position: fixed` elements, mis-measured `getBoundingClientRect`, and broken behavior under nested zoom — were partially addressed by the Chrome 128 standardization, but the historical complaint from extension developers in the chromium-extensions group, *"`document.body.style.zoom='150%'` works poorly with Facebook, Gmail and Google Reader, enough for me to abandon this approach,"* remains a caution: zoom can fight CSS authored against pixel-perfect layouts. For a side panel you control end-to-end, it is acceptable; for content rendered inside an `<iframe>` to a third-party site, it is unreliable.

**8. The accessibility-correct primitive is `rem`-based sizing keyed to `html { font-size: … }`.** WCAG 1.4.4 ("Resize text") requires content to be resizable up to 200% without loss of function. If every length in the panel — fonts, padding, gaps, icon `width`/`height` — is in `rem`, then rewriting the root font size proportionally scales the entire UI while still allowing flexbox/grid to reflow. This is the architecture used by sites like the BBC; Håvard Brynjulfsen, in *"Use REM for everything, not only font size"* (havardbrynjulfsen.design, Aug 12, 2024), summarizes: *"Changing the browser's font size makes the whole BBC website bigger. That's because font sizes, paddings, margins and grid layouts are based on REM."*

## Details

### What works, what doesn't, and what to ship

**Approaches that DO work for a Chrome extension side panel:**

| Approach | Where it lives | Pros | Cons |
|---|---|---|---|
| `html { font-size: var(--ui-scale) }` with all CSS in `rem` | Your sidepanel.html/CSS | Cleanest, accessible (WCAG 1.4.4), reflows correctly, no Chrome version dependency | Requires the whole CSS to use `rem` |
| `document.documentElement.style.zoom = factor` | Your sidepanel.js | One-line, scales everything including images/icons | Non-standard pre-Chrome 128; can disturb fixed-position layouts |
| `transform: scale(factor)` on a wrapper `<div>` with explicit width/height compensation | Your sidepanel.html | Fastest paint (GPU), animatable | Layout box unchanged → overflow inside narrow panel; you must size the wrapper manually |
| Telling users to change `chrome://settings/appearance` → Font size or Page zoom | User OS | No code; uses Chrome's built-in mechanism | Affects every site in Chrome, not just your panel |

**Approaches that do NOT work:**

- `chrome.tabs.setZoom(panelTabId, factor)` — side panel is not a tab; there is no panel tabId.
- `chrome.sidePanel.setOptions({ zoom: … })` — no such property exists.
- Relying on the user's `Cmd +`/`Cmd −` — Chrome routes that to the main page, not the side panel WebContents (Chromium issue 375982190).
- Sending a synthetic `Ctrl++` `KeyboardEvent` from JS — Chrome has long refused to let extensions synthesize the browser-level zoom shortcut (this was confirmed in the original 2012 chromium-extensions thread on the topic and has not changed).

### Recommended implementation (concrete)

**Step 1 — Author the panel CSS in `rem`s off a CSS custom property:**

```css
:root { --ui-scale: 1; }
html { font-size: calc(16px * var(--ui-scale)); }
button { font-size: 0.875rem; padding: 0.5rem 0.75rem; }
.icon { width: 1.25rem; height: 1.25rem; }
.toolbar { gap: 0.5rem; }
```

Now changing `--ui-scale` rescales fonts, padding, gaps, icon dimensions, and any media-query-independent length without breaking flexbox or grid reflow.

**Step 2 — Persist the user's preference with `chrome.storage.sync`:**

```js
const KEY = 'sidePanelUiScale';
async function loadScale() {
  const { [KEY]: scale = 1 } = await chrome.storage.sync.get(KEY);
  document.documentElement.style.setProperty('--ui-scale', String(scale));
}
async function setScale(scale) {
  scale = Math.max(0.75, Math.min(2.0, scale));
  document.documentElement.style.setProperty('--ui-scale', String(scale));
  await chrome.storage.sync.set({ [KEY]: scale });
}
loadScale();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[KEY]) loadScale();
});
```

The `chrome.storage.onChanged` listener ensures all open instances of the side panel (one per window) stay in sync.

**Step 3 — Wire the keyboard shortcut yourself.** Because Chrome won't deliver Ctrl/Cmd +/− to the panel, listen for it in the panel:

```js
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.key === '=' || e.key === '+') { setScale(currentScale() + 0.1); e.preventDefault(); }
  else if (e.key === '-') { setScale(currentScale() - 0.1); e.preventDefault(); }
  else if (e.key === '0') { setScale(1); e.preventDefault(); }
});
```

The listener only fires when the side panel actually has focus. To give the user a way to focus the panel, declare a `commands` entry in `manifest.json` that opens or focuses the panel, since Chrome 116+ supports `chrome.sidePanel.open()` from user-gesture commands.

**Step 4 — Add a visible slider/preset control in the panel's settings.** Don't rely on the hidden keyboard shortcut alone; expose 75%/100%/125%/150%/175%/200% buttons and/or a slider, both for discoverability and for users on devices without convenient keyboards.

**Step 5 (optional fallback) — Whole-panel `zoom` for non-rem CSS.** If you have legacy CSS authored in `px` you cannot refactor, you can add:

```js
document.body.style.zoom = String(scale);
```

This is now backed by a standardized CSS property as of Chrome 128 and is reliable inside an extension page you control. Apply it instead of `--ui-scale`, not on top of it.

### What about popups and options pages?

The same techniques apply identically to `chrome.action` popups and `options_page` HTML — those are also extension pages whose internal zoom Chrome will not adjust via Cmd+/Cmd−. (Cmd+/Cmd− *does* work on a full-tab `options_ui` page opened in `open_in_tab: true` mode, because that page lives in a real tab.) For consistency, share the same `--ui-scale` CSS variable and the same `chrome.storage.sync` key across your popup, options page, and side panel so a user who scales one surface scales them all.

### Chrome's own bug-tracker status

Two open Chromium issues directly bear on this:

- **Issue 375982190 — "Side panel does not receive zoom events"** — confirms the keyboard zoom shortcut does not propagate into the side panel WebContents.
- **Issue 40730614 — "chrome.tabs.getCurrent fails when initiated from inside a side panel"** — confirms the panel has no tab identity. Until this is fixed, even `chrome.tabs.setZoom(undefined, factor)` from inside the panel will operate on the active main-window tab, not on the panel.

The Chrome extensions team has publicly acknowledged that side-panel UX (sizing, focus, and by extension zoom routing) is governed by a shared Chrome component used by multiple Chrome teams, not just the extensions team. Oliver Dunk wrote in the chromium-extensions group: *"This is a more complex request because all side panel extensions as well as the built-in side panels share the same component."* This is the architectural reason a zoom API has not appeared and likely will not appear soon.

## Recommendations

**Do now (this week):**
1. Refactor your side panel CSS to use `rem` everywhere — font sizes, padding, margin, gap, fixed widths, icon dimensions. Set `html { font-size: calc(16px * var(--ui-scale)) }`.
2. Add a settings panel inside your side panel with a labeled slider (75%–200%, default 100%) bound to `--ui-scale` and persisted to `chrome.storage.sync`.
3. Listen for `Ctrl/Cmd + +/-/0` in the side panel itself and call `setScale()`; call `e.preventDefault()` so Chrome doesn't also zoom the main page when the panel has focus.
4. Document for users: "Use the in-panel scale control, or change Chrome's built-in Font size at chrome://settings/appearance for system-wide effect."

**Do soon (next release):**
5. Share the same `--ui-scale` variable and storage key across the popup, options page, and any future side panel iframes.
6. Add a separate `--content-scale` if you embed user-generated content (e.g., a chat transcript) and want users to scale just the content area without scaling toolbar chrome.

**Do later (and triggers to revisit):**
7. Watch Chromium issues 375982190 and 40730614. If 375982190 ships fixed (zoom events delivered to side panels), you can simplify your keyboard handler. If a future `chrome.sidePanel` release adds a `zoomFactor` to `PanelOptions`, migrate to it for cross-window consistency.
8. If you ever ship a Firefox port: Firefox 126 (released May 14, 2024) added standardized CSS `zoom` support, so the same `--ui-scale` strategy works without changes; Firefox has its own `browser.sidebarAction` (not `chrome.sidePanel`), so the chrome-API code paths will diverge anyway.

**Benchmarks that would change these recommendations:**
- If Chromium ships native zoom routing to side panels (issue 375982190 closed as Fixed) → drop the manual keyboard handler.
- If the Chrome team adds a `zoomFactor` property to `PanelOptions` → adopt it as the single source of truth; you keep `rem`-based CSS but stop persisting in your own storage.
- If usage telemetry shows >5% of your users have changed Chrome's global font size at `chrome://settings/appearance`, prioritize honoring that as your default `--ui-scale` baseline rather than hardcoding 16px.

## Caveats

- **`chrome.sidePanel.getPanelLayout`** was added more recently to the API surface and is sometimes mentioned in Chrome release notes; it returns layout (width/height/side) information but **does not** include a zoom factor and cannot be used to set one.
- **`chrome.sidePanel.close()` does not exist** in older Chrome versions; in stable channels prior to Chrome 145 the canonical close was `window.close()` inside the panel, per the open spec issue (w3c/webextensions #521). This is unrelated to zoom but is a recurring source of confusion.
- **The CSS `zoom` property's behavior changed in Chrome 128.** If your extension supports older Chrome versions (Manifest V3 minimum is Chrome 88), the same code may produce slightly different `getBoundingClientRect()` values pre/post Chrome 128. For DOM math in a side panel, prefer the `rem` approach over `zoom`.
- **Issues 375982190 and 40730614 require Google sign-in to view comments.** The titles and existence of the bugs are visible publicly via search; the exact status (Open/Assigned/Fixed/WontFix) and any Chrome-team commitments inside those threads could not be verified for this report and may have changed.
- **`chrome.storage.sync` has a 100 KB total / 8 KB per-item quota.** A single number for `sidePanelUiScale` is trivially within budget, but if you bundle other large preferences, watch for QUOTA_BYTES errors.
- **Firefox's `browser.sidebarAction`** is not the same API as Chrome's `chrome.sidePanel` and exposes different options; this report focuses on Chromium (Chrome, Edge, Brave, Opera, Arc). Helium and some other Chromium forks have *separate* extension activation bugs (e.g., side-panel extensions not activating on click) unrelated to zoom.
- **Hardcoded narrow panel minimum.** Chrome enforces a 320 px default minimum width for the side panel, which Chrome staff have said is shared with other side-panel surfaces; if your zoom UI assumes a wider panel it may overflow at 100% scale, let alone 200%. Test your scale slider down to 320 px panel width.