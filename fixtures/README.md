# fixtures

Test fixture repos for the Chrome extension. Two repos, synced to GitHub.

## Structure

```
fixtures/
  main/     → github.com/diunko/nap-test-main  (the "code repo")
  .nap/     → github.com/diunko/nap-test-nap   (the ".nap repo")
    nepics/
      01-v1/
        10-docs/
        15-feedback/
        20-architects/
        30-napkins/
```

**main/** is a fictional codebase (space-pizza delivery API). The extension never clones this — it only links to it via GitHub blob URLs.

**.nap/** is the guide repo with mini-books, napkins, agents. The extension clones this into IDB via the terminal. Content lives under `nepics/01-v1/` matching the production directory layout.

## Syncing to GitHub

Edit content here (source of truth), then push to the GitHub repos:

```bash
./fixtures/sync.sh
```

The script hard-resets both GitHub repos to match the fixture content. Destructive — any content on GitHub that's not in fixtures/ is lost.

## Fixture content

**main repo (space-pizza):**
- `modules/delivery/order-router.ts` — routes orders to warp gates
- `modules/delivery/dispatch.ts` — alignment window checks
- `modules/queue/warp-queue.ts` — per-gate order queues
- `modules/validation/crust-validator.ts` — rejects bad crusts
- `modules/tracking/delivery-tracker.ts` — tracks orders through warp

**nap repo:**
- `nepics/01-v1/30-napkins/0100-delivery-pipeline/mini-book/` — 5-chapter guide to the delivery pipeline
- 3 agents (test-arch, fs-eng, test-eng) with prompts and responses
- `nepics/01-v1/20-architects/001-architect/` with scratch notes
- `nepics/01-v1/30-napkins/0200-crust-validation/` — backlog napkin

The mini-book chapters have `[file.ts:line](/path#Lline)` links pointing at the main repo. These links resolve to `github.com/diunko/nap-test-main/blob/main/...` in the extension.
