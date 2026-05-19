# workflow wiring — spec

## Read before building

All ext-react docs are required reading:
- `.nap/nepics/05-extension/10-docs/ext-react/01-architecture.md`
- `.nap/nepics/05-extension/10-docs/ext-react/02-data-flow.md`
- `.nap/nepics/05-extension/10-docs/ext-react/03-session-and-state.md`
- `.nap/nepics/05-extension/10-docs/ext-react/04-testing.md`

Plus the workflow design:
- `.nap/nepics/05-extension/20-architects/001-architect/scratch/v0-take2/workflow/02-workflow.nap.md`

## URL hash format

```
#nap-repo={provider}/{owner}/{repo}&nap-branch={branch}&napkin={nepic}/{napkin}
```

- `nap-repo`: required. `github/org/repo` or `gitlab/org/repo`
- `nap-branch`: optional, defaults to `main`
- `napkin`: optional. `{nepic-slug}/{napkin-slug}` — e.g. `01-v1/0100-delivery-pipeline`

The hash survives GitHub SPA navigation (verified in spike-panel).

## State-key derivation

```
state-key = `${main-owner}/${main-repo}/${pr-num}/${nap-provider}/${nap-owner}/${nap-repo}/${nap-branch}`
```

- `main-owner`, `main-repo`, `pr-num`: from the GitHub page URL
- If no PR: `pr-num = 0`
- This key maps 1:1 to a session (own LFS, own store, own model)

## Clone URL construction

- `github/org/repo` → `https://github.com/org/repo`
- `gitlab/org/repo` → `https://gitlab.com/org/repo`
- No CORS proxy needed (extension host_permissions)

## Content script changes

Current content.ts: trigger button + nav messages + data-nap-loaded marker.

Add:
- On page load: parse `window.location.hash`
- Extract nap-repo, nap-branch, napkin
- Extract main-owner, main-repo from `window.location.pathname` (`/{owner}/{repo}/...`)
- Extract PR number from pathname (`/pull/{n}`) or 0 if not a PR page
- Derive state-key
- Send `chrome.runtime.sendMessage({ type: 'nap-config', key: stateKey, config: { cloneUrl, napBranch, napkinFocus, mainOwner, mainRepo, mainBranch } })`
- Listen for hash changes (GitHub SPA) — re-parse and re-send if hash changes

## Programmatic clone

The terminal is a BashShell instance. To clone programmatically:
- `shell.exec(`git clone ${cloneUrl}`)` — but BashShell.exec() is for non-interactive execution
- OR: simulate typing in the terminal: write `git clone ${url}\r` to the shell's input handler
- The second approach shows the clone happening in the terminal (user can see progress)
- After clone: onCommandComplete fires → model scans → nav populates

## Fetch latest

- `git fetch origin` + `git checkout origin/{branch}` (hard reset to remote HEAD)
- git-command.ts needs `fetch` and `checkout` subcommands (not currently implemented)
- isomorphic-git has `git.fetch()` and `git.checkout()` — wire them the same way as clone

## PR diff-aware link routing

The link router must distinguish between files in the PR diff and files not in it.

### Fetching diff ranges

On panel open for a PR page (prNum > 0):
1. Check store: if `prDiffRanges` is not null → use cached, skip fetch
2. If null: `GET /repos/{owner}/{repo}/pulls/{n}/files` with PAT if available
3. Parse each file's `patch` field: extract hunk ranges from `@@ -N,N +N,N @@`
4. Build map: `Record<filepath, Array<{start, end}>>` where start/end are new-side line numbers
5. Add ±3 to each range for GitHub's context window
6. Store in `prDiffRanges`, Zustand persists to IDB

On [fetch latest]: re-fetch, update map, persist.

### Diff URL construction

```typescript
async function buildDiffAnchor(filePath: string, line: number): Promise<string> {
  const encoded = new TextEncoder().encode(filePath);
  const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
  const hex = [...new Uint8Array(hashBuf)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `#diff-${hex}R${line}`;
}
```

### Link routing decision

```
if (not a PR page):
  → blob URL: /blob/{branch}/{path}#L{line}

if (file in prDiffRanges AND line within any hunk range):
  → diff URL: /pull/{n}/files#diff-{sha256(path)}R{line}

if (file in prDiffRanges but line outside all hunks):
  → blob URL: /blob/{pr-branch}/{path}#L{line}

if (file NOT in prDiffRanges):
  → blob URL: /blob/{pr-branch}/{path}#L{line}
```

### Hunk range parsing

Port `parseGitDiff` from `packages/v3/src/main/git-diff-parser.ts` (49 lines). Adapt to parse the `patch` field format (no `---`/`+++` headers, starts directly with `@@`).

### Persistence

`prDiffRanges` is included in Zustand `partialize` — persisted to IDB per session key.
  // what a funny name, why partialize? idk, maybe diff ranges? 
First visit: fetch + persist. Return visit: hydrate from IDB, instant. Fetch latest: re-fetch + update.

## Fixture PR

Create a PR in `diunko/nap-test-main`:
* // shoulod we have also a script like sync
  * // or should we extend the sync
  * // so that the PR is seeded from local data easily
- Branch: `feature/delivery-v2` off main
- Modify `modules/delivery/order-router.ts` — add express priority handling (~10 lines around line 54)
- Modify `modules/queue/warp-queue.ts` — add capacity warning (~5 lines)
- Leave `modules/validation/crust-validator.ts` unchanged
- Keep PR open permanently
- The mini-book links to all three files:
  - `order-router.ts:54` → should navigate to diff view (file changed, line in hunk)
  - `crust-validator.ts:40` → should navigate to blob view (file not changed)

## What "done" looks like

- Navigate to `github.com/diunko/nap-test-main/pull/1#nap-repo=github/diunko/nap-test-nap&napkin=01-v1/0100-delivery-pipeline`
- Open side panel
- Extension auto-clones nap-test-nap (loading state in nav during clone)
- Nav populates with 0100-delivery-pipeline focused
- file:line links just work (mainRepoConfig auto-set from URL)
- Cmd+click `order-router.ts:54` → lands in PR Files Changed, line 54 highlighted in diff
- Cmd+click `crust-validator.ts:40` → lands in blob view (file not in PR)
- No manual settings step
- Close panel, reopen → state restored from IDB (including diff ranges), links work instantly
- Click [fetch latest] → repo updates, diff ranges re-fetched
