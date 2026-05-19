# fixtures

Test fixture repos for the Chrome extension. Two repos + one PR, synced to GitHub.

## Structure

```
fixtures/
  main/       → github.com/diunko/nap-test-main (main branch)
  main-pr/    → github.com/diunko/nap-test-main (feature/delivery-v2 branch + PR)
  .nap/       → github.com/diunko/nap-test-nap
```

**main/** is the code repo at main branch. The extension links to it via GitHub URLs.

**main-pr/** contains only the files that differ from main/. The sync script creates a branch `feature/delivery-v2` with these changes and opens a PR. This tests diff-aware link routing — links to changed files navigate to the PR diff view, links to unchanged files navigate to blob view.

**.nap/** is the guide repo. The extension clones this into IDB. Content lives under `nepics/01-v1/`.

## Syncing to GitHub

```bash
./fixtures/sync.sh
```

The script:
1. Hard-resets `main` branch of nap-test-main to `fixtures/main/`
2. Creates/updates `feature/delivery-v2` branch from `fixtures/main-pr/`
3. Creates the PR if it doesn't exist (requires `gh` CLI with auth)
4. Hard-resets nap-test-nap to `fixtures/.nap/`

Destructive — any content on GitHub not in fixtures/ is lost.

## Fixture content

**main repo (space-pizza):**
- `modules/delivery/order-router.ts` — routes orders to warp gates
- `modules/delivery/dispatch.ts` — alignment window checks
- `modules/queue/warp-queue.ts` — per-gate order queues
- `modules/validation/crust-validator.ts` — rejects bad crusts
- `modules/tracking/delivery-tracker.ts` — tracks orders through warp

**PR branch changes (delivery-v2):**
- `modules/delivery/order-router.ts` — adds express priority gates (dedicated lanes for express/warp-rush)
- `modules/queue/warp-queue.ts` — adds capacity warning threshold (80% alert)
- Other files unchanged — tests blob URL fallback for context links

**nap repo:**
- `nepics/01-v1/30-napkins/0100-delivery-pipeline/mini-book/` — 5-chapter guide
- Mini-book links to order-router.ts (changed in PR) AND crust-validator.ts (not changed)
- 3 agents, architect with scratch, 2 napkins with status labels

## Testing link routing

The mini-book chapter 01 links to:
- `order-router.ts:54` — this line IS in the PR diff → should navigate to `pull/{n}/files#diff-{hash}R54`
- `crust-validator.ts:40` — this file is NOT in the PR → should navigate to `blob/{branch}/...#L40`
