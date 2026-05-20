# NAP Chrome Extension

Read .nap guides alongside GitHub PRs. The extension opens a side panel with the mini-book, nav tree, and terminal — right next to the code.

## Install

The extension isn't in the Chrome Web Store yet. Install from source:

```bash
cd packages/ext-react
npm install
npm run build
```

Then in Chrome:
1. Navigate to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `packages/ext-react/dist`

The extension icon [n] appears in the toolbar.

## Usage

### 1. Get a review link

The PR author shares a link like:

```
https://github.com/org/repo/pull/42#nap-repo=github/org/project-nap&napkin=01-v1/0100-feature
```

This is a normal GitHub PR URL with a `#` fragment. GitHub ignores it. The extension reads it.

See [review-links.md](review-links.md) for the full format and examples.

### 2. Open the side panel

Click the [n] icon in Chrome's toolbar. The side panel opens alongside the GitHub page.

### 3. First time setup

If the .nap repo is private, enter your token in settings (gear icon in the header):
- **GitHub PAT** — for private GitHub .nap repos
- **GitLab PAT** — for private GitLab .nap repos (e.g. gitlab.grammarly.io)

Public repos work without a token.

### 4. Reading

The extension auto-clones the .nap repo on first visit. The nav tree shows napkins, agents, and chapters.

- Click a chapter in the nav tree → opens in the editor
- **Cmd+click** a `[file.ts:54]` link → GitHub tab navigates to that line
  - If the file is in the PR diff → lands in the Files Changed view
  - If not → lands in the blob view
- **Cmd+click** a `.md` link → loads the other chapter in the editor
- **Cmd+click** a `https://` link → opens in a new tab

### 5. Commenting

Type `//DU: your comment` on any line. Comments auto-save to the local filesystem (IndexedDB).

To push your comments:
1. Click the **Terminal** tab
2. `cd nap-test-nap && git add . && git commit -m "review comments" && git push`

### 6. Return visits

Close and reopen the panel — your state is preserved (tabs, focused napkin, scroll position). The repo persists in IndexedDB. Click **fetch latest** to pull new commits.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Cmd+click | Follow link in editor |
| Ctrl+Shift+F | Toggle focus/show-all mode in nav |
| Ctrl+Shift+= | Zoom in |
| Ctrl+Shift+- | Zoom out |
| Ctrl+Shift+0 | Reset zoom |
| Cmd+E | Toggle focused/extended card view |

## Nav modes

- **Focus mode** (default): shows only the napkin from the URL. Clean, distraction-free.
- **Show-all mode**: shows architects + all napkins. Click the focus toggle icon (or Ctrl+Shift+F) to switch.

## Supported .nap repo hosts

| Provider | Hash prefix | Hostname |
|---|---|---|
| GitHub | `github` | github.com |
| GitLab | `gitlab` | gitlab.grammarly.io |

## Developing

```bash
cd packages/ext-react
npm install
npm run dev          # vite dev (HMR, but needs manual reload in Chrome)
npm run build        # production build → dist/
npm run test:small   # vitest (fast, no browser)
npm run test:medium  # playwright (real Chrome + extension)
npm run typecheck    # tsc --noEmit
```

After changing code: `npm run build`, then click the reload button on `chrome://extensions`.
