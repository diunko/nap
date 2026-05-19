Read your role: `.nap/00-org/40-roles/test-eng.md` — it tells you to read org docs. Do that first.

## Project context

- `.nap/nepics/05-extension/10-docs/02-app-ux.nap.md` — how nap works
- `.nap/nepics/05-extension/10-docs/context/design-spec.nap.md` — the approved design
- `.nap/nepics/05-extension/10-docs/context/mock-e-screenshot.png` — what it should look like

## The feature

- `.nap/nepics/05-extension/30-napkins/0300-design-impl/0300-design-impl.nap.md`
- `.nap/nepics/05-extension/30-napkins/0300-design-impl/0300-design-impl.spec.md`
- `.nap/nepics/05-extension/30-napkins/0300-design-impl/0300-design-impl.stories.md`

## What the TA produced

- `.nap/nepics/05-extension/30-napkins/0300-design-impl/0300-design-impl.test.md` — migration plan
- `.nap/nepics/05-extension/30-napkins/0300-design-impl/agents/002-test-arch-design-impl/response.md`

## What the fs-eng built

- `.nap/nepics/05-extension/30-napkins/0300-design-impl/agents/001-fs-eng-design-impl/response2.md`

The fs-eng reports 29/29 vitest + 21/21 Playwright all green. They updated selectors per the migration table and fixed two pre-existing test bugs.

## Your task

1. **Run everything yourself.** Build the extension, run vitest, run Playwright. Confirm the fs-eng's results independently.

2. **Two gaps from the TA's plan.** The TA recommended two new tests that the fs-eng didn't add:

   - **Terminal dark theme assertion**: verify the terminal surface has dark background (#1e1e1e), not the old light theme. Add to an existing test or as a new assertion.
   
   - **Ephemeral/permanent tab behavior**: click file in nav → tab shows italic (ephemeral) → click another file → same slot reused → edit → tab becomes non-italic (permanent) → click third file → new ephemeral tab appears, permanent stays. New medium test.

3. **Check the UX e2e journey** — does it still do what a real user does? No window.__ hooks except where physically impossible. If anything feels like it's testing internals instead of user actions, flag it.

4. **Report**: total pass/fail, any regressions, gap coverage.

Write response.md, then `nap3 done`.
