# How to create review links

Share a review link so your teammate can open the .nap guide alongside the PR.

## The format

```
https://github.com/{owner}/{repo}/pull/{n}#nap-repo={provider}/{nap-owner}/{nap-repo}&nap-branch={branch}&napkin={nepic}/{napkin}
```

The link is a normal GitHub PR URL with a `#` fragment appended. GitHub ignores the fragment. The extension reads it.

## Parameters

| Parameter | Required | Example | Description |
|---|---|---|---|
| `nap-repo` | yes | `github/acme/project-nap` | Provider + owner + repo of the .nap repository |
| `nap-branch` | no | `main` | Branch to clone/checkout. Defaults to `main` |
| `napkin` | no | `01-v1/0100-delivery-pipeline` | Nepic + napkin to focus on. Format: `{nepic-slug}/{napkin-slug}` |

## Providers

| Provider | Clone URL | Host permissions |
|---|---|---|
| `github` | `https://github.com/{owner}/{repo}` | included by default |
| `gitlab` | `https://gitlab.com/{owner}/{repo}` | included by default |

Self-hosted GitLab (`gitlab.mycompany.com`) requires adding the host to `manifest.json` host_permissions.

## Examples

### GitHub .nap repo, specific napkin

```
https://github.com/acme/project/pull/42#nap-repo=github/acme/project-nap&napkin=01-v1/0100-delivery-pipeline
```

Reviewer opens the PR, clicks [n], panel auto-clones `github.com/acme/project-nap`, focuses on the delivery pipeline napkin. File:line links in the mini-book navigate to `github.com/acme/project` (the PR's code repo).

### GitLab .nap repo

```
https://github.com/acme/project/pull/42#nap-repo=gitlab/acme/project-nap&napkin=01-v1/0100-delivery-pipeline
```

Same flow — the extension clones from GitLab instead of GitHub. The main code repo is still on GitHub (that's where the PR lives).

### Specific branch

```
https://github.com/acme/project/pull/42#nap-repo=github/acme/project-nap&nap-branch=review/sprint-3&napkin=01-v1/0100-delivery-pipeline
```

Clones the `review/sprint-3` branch of the .nap repo. Useful when different branches have different guide content.

### No napkin focus (browse everything)

```
https://github.com/acme/project/pull/42#nap-repo=github/acme/project-nap
```

Panel opens in show-all mode — all napkins and architects visible. Reviewer browses freely.

### Non-PR page (just a branch)

```
https://github.com/acme/project/blob/main/#nap-repo=github/acme/project-nap&napkin=01-v1/0100-delivery-pipeline
```

Works on any GitHub page, not just PRs. File:line links resolve to blob view instead of PR diff view.

## What happens when the reviewer clicks

1. GitHub page loads normally (the `#` fragment is invisible to GitHub)
2. Reviewer clicks the extension icon → side panel opens
3. Extension reads the URL fragment → derives session key → creates isolated session
4. If first visit: auto-clones the .nap repo into IndexedDB
5. If return visit: restores from IndexedDB (instant, no network)
6. Nav tree populates, napkin focuses (if specified)
7. File:line links in the mini-book navigate the GitHub tab to the right file + line

## How to generate

For now: construct the URL manually. Append `#nap-repo=...` to the PR URL.

Future: `nap3 share-link` will generate the URL from the current project context.
