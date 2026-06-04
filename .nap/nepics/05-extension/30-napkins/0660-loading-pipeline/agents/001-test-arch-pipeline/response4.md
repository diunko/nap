# Test architect response — fixes-03

## What I produced

`fixes-03/fixes-03.test.md` — 15 test cases. Two bugs, one recovery path.

## The diagnosis

The two bugs are coupled. The recovery path for "private GitLab, no token" is:

```
clone fails → "auth failed" shown → inline token form → enter token → retry → done
```

Bug 1 breaks step 1: error classified as "network failed" → no inline form appears.
Bug 2 breaks the workaround: even if user knows they need a token, no settings gear during loading.

Both must be fixed for recovery to work. FX3-P10 is the acceptance test: GitLab 401 → BOTH inline form AND settings gear work.

## Architecture

**Bug 1 — error classification (6 tests):**

- FX3-S01: run `fx-error-capture.test.ts` FIRST. Read real error shape from GitLab.
- FX3-S02: write vitest mock matching the OBSERVED shape (not guessed). Assert 'authentication failed'.
- FX3-S03: regression — existing GitHub 401 still works.
- FX3-S04: isomorphic-git HttpError variants (`data.statusCode`, etc.).
- FX3-S05: verify LoadingGate dispatches to inline form (depends on error string match).
- FX3-P01: Playwright end-to-end — GitLab 401 → inline form → real token → clone succeeds.

**Bug 2 — settings during loading (6 tests):**

- FX3-S10: gear visible during pipeline running.
- FX3-S11: gear visible when pipeline errored.
- FX3-S12: overlay opens, tokens saveable to chrome.storage.sync (no session needed).
- FX3-S13: opening settings doesn't interrupt pipeline.
- FX3-S14: enter token via settings → retry clone → succeeds.
- FX3-S15: loading-gate settings uses same component/testids as Panel settings.

**Combined acceptance:**

- FX3-P10: full recovery — both inline form AND settings gear paths work.

## The critical mandate

FX3-S02 (the classification regression test) MUST be written AFTER running FX3-S01 and reading its output. The mock error in the test must match the real error shape — not guessed, copied. This is the principle from the napkin: "observe before classifying."

## Root cause of bug 1

`pipeline-steps.ts:218` checks `e.statusCode === 401 || e.data?.statusCode === 401`. If isomorphic-git's GitLab error stores status code elsewhere (different field name, deeper nesting, or on the prototype chain instead of own properties), the check fails → falls through to `"can't reach {hostname}"`. The error capture test will reveal the actual location.

## Root cause of bug 2

`index.tsx:739-741` renders `<LoadingGate>` alone during pipeline execution. `SettingsOverlay` is inside `<Panel>`, which mounts only after `pipelineDone`. Fix: add settings access to the loading gate screen (settings gear icon in LoadingGate itself, or a mini header in App's loading branch).
