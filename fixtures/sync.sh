#!/bin/bash
# Sync fixtures to GitHub repos. Hard-resets both repos to match local content.
# Also creates/updates a fixture PR in nap-test-main.
# Usage: ./fixtures/sync.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

echo "=== syncing fixtures/main → diunko/nap-test-main ==="
cd "$TMPDIR"
git clone git@github.com:diunko/nap-test-main.git
cd nap-test-main
# Reset main branch to fixture content
git rm -rf . > /dev/null 2>&1 || true
cp -r "$SCRIPT_DIR/main/"* .
git add -A
if git diff --cached --quiet; then
  echo "  main: no changes"
else
  git commit -m "sync fixtures"
  git push --force origin main
  echo "  main: pushed"
fi

# Create/update PR branch with modified files
echo "=== syncing fixtures/main-pr → feature/delivery-v2 branch ==="
git checkout -B feature/delivery-v2 main
cp -r "$SCRIPT_DIR/main-pr/"* .
git add -A
if git diff --cached --quiet; then
  echo "  PR branch: no changes from main"
else
  git commit -m "delivery v2: express priority routing + capacity warnings"
  git push --force origin feature/delivery-v2
  echo "  PR branch: pushed"
  # Create PR if it doesn't exist
  if gh pr view feature/delivery-v2 --repo diunko/nap-test-main > /dev/null 2>&1; then
    echo "  PR: already exists"
  else
    gh pr create \
      --repo diunko/nap-test-main \
      --base main \
      --head feature/delivery-v2 \
      --title "Delivery v2: express priority routing + capacity warnings" \
      --body "Adds dedicated express gates for priority orders and capacity warning thresholds.

This is a test fixture PR for the nap Chrome extension." \
      || echo "  PR: create failed (may need gh auth)"
    echo "  PR: created"
  fi
fi

echo "=== syncing fixtures/.nap → diunko/nap-test-nap ==="
cd "$TMPDIR"
git clone --depth 1 git@github.com:diunko/nap-test-nap.git
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
