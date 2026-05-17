# 7 failing tests — triage

## Suite no longer hangs — cleanupApp fix works

## Failures by category

### Stale assertions (3) — tests expect old behavior, code changed

1. **M03** `content-monaco.spec.ts:146` — expects `comment.architect` token type for `//A:`. Token grammar was changed (role-palette system replaced hardcoded architect tokens).
2. **M05** `content-monaco.spec.ts:216` — same root cause, same `comment.architect` check.
3. **TH-06** `theme-css.spec.ts:115` — expects ≥5 themes, only 2 exist. Themes were trimmed.

### Flaky watcher (1) — @parcel/watcher in tmpdir

4. **SP-06** `session-persist.spec.ts:141` — ghost tab watcher. @parcel/watcher doesn't reliably fire in macOS temp dirs. Flaky, not a code bug.

### Timeout / infrastructure (2)

5. **smoke.spec** `smoke.spec.ts:6` — `firstWindow` 30s timeout. This test creates a fixture-less Electron app. Likely missing NAP_CWD or no nepic dir → app hangs at startup.
6. **T-0210-86** `cli-integration.spec.ts:183` — `nap stop` test. Agent `003-stop-target` not found. Fixture issue — agent not created before stop is called.

### Role decoration count (1)

7. **ROLE-11** `role-decorations.spec.ts:84` — expects ≥2 palette deco classes (`//E:` and `//DU:`). Gets 1. DU was moved to known prefixes, so it gets `role-known-DU` not `role-deco-N`.
