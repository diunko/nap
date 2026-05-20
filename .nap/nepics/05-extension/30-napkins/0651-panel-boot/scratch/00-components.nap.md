# 0651 — minimal components

## build (4 components, one deletion)

```
tab-url-reader          5 lines     chrome.tabs.query on mount
boot-gate              ~40 lines    loading → session | "no nap link" | "open on github"
content-script-trim    -80 lines    delete hash parsing, config msg, SPA observer
refresh-pr-button      ~20 lines    re-read URL, invalidate + re-fetch diff ranges
```

net ~-15 lines. simplification, not a feature.

```
idle-pane               ~10 lines   repo/branch status, calm bg, terminal hidden until clicked
```

## cut

* **connect-modal** — replace with "ask the author for a review link"
  * primary flow is shared link WITH hash. additive later if needed.
* **handshake + inject** — fallback to `chrome.tabs.update` if content script missing
  * only developers hit this. reviewers install once.

## stories covered

* B1 shared link, B2 return visit, B4 two windows — core, free
* B3 extension reload — boot works. link clicks: `chrome.tabs.update` fallback
* B5 no-hash page — message, not modal
* B6 non-github — message
* B7 refresh PR, B10 routing after refresh — refresh-pr-button
* B8 fetch latest — exists
* ~~B9 manual connect~~ — cut
