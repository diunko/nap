#!/bin/bash
# Sync .nap fixture content to GitLab repo.
# Usage: ./fixtures/sync-gitlab.sh
#
# Requires GITLAB_API_TOKEN in .env at repo root.
# Target: gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

# Read token from .env
if [ -f "$REPO_ROOT/.env" ]; then
  GITLAB_API_TOKEN=$(grep -E '^GITLAB_API_TOKEN=' "$REPO_ROOT/.env" | cut -d'=' -f2-)
fi

if [ -z "${GITLAB_API_TOKEN:-}" ]; then
  echo "error: GITLAB_API_TOKEN not found in .env"
  exit 1
fi

GITLAB_REMOTE="https://oauth2:${GITLAB_API_TOKEN}@gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap.git"

echo "=== syncing fixtures/.nap → gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap ==="
cd "$TMPDIR"
git clone --depth 1 "$GITLAB_REMOTE" nap-test-nap
cd nap-test-nap
git rm -rf . > /dev/null 2>&1 || true
cp -r "$SCRIPT_DIR/.nap/"* .
git add -A
if git diff --cached --quiet; then
  echo "  no changes"
else
  git commit -m "sync fixtures"
  git push --force origin main
  echo "  pushed"
fi

echo "=== done ==="
