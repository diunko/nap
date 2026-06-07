# Changelog

## 0.1.1

**Fixed:**
- GitLab authentication errors now correctly show "authentication failed" instead of "network failed" — token input form appears as expected
- Settings gear accessible during loading — enter tokens without waiting for pipeline to finish

## 0.1.0

- **Loading pipeline** — transparent step-by-step progress replaces the old "cloning..." screen. See which step is active, what failed, and why.
- **Inline token form** — when clone fails with 401, enter your PAT right on the failed step. Save & retry in one click.
- **Global tokens** — enter your GitHub/GitLab PAT once, works across all PRs. No re-entering on PR switch.
- **Reset session** — wipe local data and re-clone fresh from settings. Tokens preserved.
- **Retry** — every error has a retry button. Fix the issue, click retry, pipeline continues from where it stopped.
- **Debug mode** — enable in settings to show Playground tab for pipeline testing.
