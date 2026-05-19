# test architect response — round 2 (visual fixes)

## what I produced

`0300-design-impl.test-2.md` — test plan for the 5 visual fixes.

## the verdict

3 of the 5 fixes deserve automated tests. All 3 are small vitest tests — no new Playwright tests.

| Fix | Test? | Why |
|---|---|---|
| Role prefix decorations | **yes** — vitest for role-palette.ts | Pure mapping logic: prefix → class, prefix → color, hash determinism. The decoration application is a Monaco API call — skip testing that. |
| Nav tree subdirectories | **yes** — one new case in nav-tree.test.ts | Catches the exact bug. Add mini-book/ to the mock FS, assert it appears in the parsed tree. |
| Monaco config | **skip** | Static values. Code review is the test. |
| Zoom | **skip** | ~15 lines, trivial math. Real risk is Chrome key interception, which only manual testing catches. |
| Link provider upgrade | **yes** — vitest for detectLinks | Highest value in this round. Priority/overlap resolution between markdown links, bare URLs, and bare file paths is where bugs hide. |

## key design decisions

- **No new Playwright tests.** Every testable piece is pure logic — no DOM, no browser needed. Playwright tests are expensive to write and maintain; the round 1 plan already handles all the e2e migration.
- **Port role-palette.ts as-is** from the app. It's pure (no Monaco import). The vitest tests verify the mapping, the visual result is a manual check.
- **Port detectLinks as-is** from content-link-provider.ts. The app already solved the priority/overlap problem with its `seen` set approach. The vitest catches regressions in the regex and priority logic.
