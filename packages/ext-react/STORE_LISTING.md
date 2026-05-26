# Chrome Web Store Listing

## Title

NAP — .nap repo reader

## Summary

Read .nap mini-book guides in a side panel alongside GitHub PRs.

## Description

NAP opens a side panel next to GitHub pull requests so reviewers can read structured guides — mini-book chapters, napkin specs, agent logs — written in .nap repos.

**What it does:**

- Clones a .nap repo into your browser (IndexedDB) when you open a PR with a review link
- Displays a nav tree of napkins, agents, and chapters
- Opens documents in a Monaco editor with syntax highlighting
- Cmd+click file references to jump to the exact line in the GitHub diff or blob view
- Cmd+click .md links to navigate between chapters
- Built-in terminal for git operations (commit review comments, fetch latest)
- Persists state between visits — tabs, scroll position, cloned repos

**Who it's for:**

Developers using the .nap workflow for code review. The PR author shares a review link (a normal GitHub URL with a `#nap-repo=...` fragment), and reviewers open the side panel to read the guide alongside the code.

**How to use:**

1. Open a GitHub PR that has a `#nap-repo=...` review link
2. Click the NAP icon in the toolbar to open the side panel
3. The .nap repo clones automatically — browse chapters in the nav tree
4. For private repos, add your GitHub or GitLab PAT in Settings (gear icon)

## Category

Developer Tools

## Language

English

## Privacy

**What data is accessed:**

- Reads the current GitHub tab URL to detect review links
- Clones .nap repos into IndexedDB (local browser storage)
- Reads GitHub/GitLab PATs you optionally provide (stored in chrome.storage.sync)

**What data leaves the browser:**

- GitHub API requests to fetch PR diff ranges (uses your GitHub PAT if provided)
- Git clone/fetch requests to the .nap repo host (GitHub or GitLab)

**What data is NOT collected:**

- No analytics, tracking, or telemetry
- No data is sent to any third-party service
- No browsing history is recorded
- Tokens are stored locally in chrome.storage.sync and never transmitted except to their respective API hosts

**Privacy policy:** https://diunko.github.io/nap-privacy/

**Host permissions justification:**

- `https://github.com/*` — reads PR URLs, fetches PR diffs via GitHub API, clones .nap repos
- GitLab hosts — requested at runtime via optional permissions when the user configures a GitLab hostname
