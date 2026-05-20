# 0651 — minimal components

```
tab-url-reader          5 lines     chrome.tabs.query on mount              B1 B2
boot-gate              ~40 lines    loading → session | message             B1 B2 B3
content-script-trim    -80 lines    delete hash parsing, config, SPA obs    B1 B2 B3
refresh-pr-button      ~20 lines    re-read URL, re-fetch diff ranges       B4
idle-pane              ~10 lines    repo/branch status, terminal hidden     B6
```

net ~-15 lines. simplification, not a feature. B5 already exists.
