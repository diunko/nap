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

## What "done" looks like

- Navigate to `github.com/diunko/nap-test-main#nap-repo=github/diunko/nap-test-nap&napkin=01-v1/0100-delivery-pipeline`
- Open side panel
- Extension auto-clones nap-test-nap (loading state in nav during clone)
- Nav populates with 0100-delivery-pipeline focused
- file:line links just work (mainRepoConfig auto-set from URL)
- No manual settings step
- Close panel, reopen → state restored from IDB, nav populates from scan
- Click [fetch latest] → repo updates to remote HEAD
