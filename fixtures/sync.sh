#!/bin/bash
# Sync fixtures to GitHub repos. Hard-resets both repos to match local content.
# Usage: ./fixtures/sync.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

echo "=== syncing fixtures/main → diunko/nap-test-main ==="
cd "$TMPDIR"
git clone --depth 1 git@github.com:diunko/nap-test-main.git
cd nap-test-main
# Remove all tracked files, replace with fixture content
git rm -rf . > /dev/null 2>&1 || true
cp -r "$SCRIPT_DIR/main/"* .
git add -A
if git diff --cached --quiet; then
  echo "  no changes"
else
  git commit -m "sync fixtures"
  git push --force origin main
  echo "  pushed"
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
