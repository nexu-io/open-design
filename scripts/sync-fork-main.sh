#!/usr/bin/env bash
# Sync local main and fork/main from upstream (origin) without modifying other branches.
#
# Remotes (this repo's convention):
#   origin = nexu-io/open-design (read-only upstream)
#   fork   = your GitHub fork (read/write)
#
# Usage:
#   ./scripts/sync-fork-main.sh                 # update main only, return to previous branch
#   ./scripts/sync-fork-main.sh --stash         # stash tracked+untracked changes first
#   ./scripts/sync-fork-main.sh --merge-here  # sync main, then merge main into current branch
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STASH=false
MERGE_HERE=false
for arg in "$@"; do
  case "$arg" in
    --stash) STASH=true ;;
    --merge-here) MERGE_HERE=true ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Missing remote 'origin' (expected nexu-io/open-design)." >&2
  exit 1
fi
if ! git remote get-url fork >/dev/null 2>&1; then
  echo "Missing remote 'fork' (expected your-github-user/open-design)." >&2
  echo "Add with: git remote add fork git@github.com:<you>/open-design.git" >&2
  exit 1
fi

PREV_BRANCH="$(git branch --show-current)"
DIRTY=false
if ! git diff --quiet || ! git diff --cached --quiet; then
  DIRTY=true
fi
UNTRACKED=false
if [ -n "$(git ls-files --others --exclude-standard)" ]; then
  UNTRACKED=true
fi

if { [ "$DIRTY" = true ] || [ "$UNTRACKED" = true ]; } && [ "$STASH" = false ]; then
  echo "Working tree is not clean (committed or untracked changes)." >&2
  echo "Commit your work, switch to a feature branch, or re-run with --stash." >&2
  exit 1
fi

if [ "$STASH" = true ]; then
  git stash push -u -m "sync-fork-main $(date -u +%Y-%m-%dT%H%M%SZ)"
  echo "Stashed local changes. Restore later with: git stash pop"
fi

echo "Fetching upstream (origin)..."
git fetch origin

echo "Updating local main from origin/main..."
git checkout main
git merge origin/main --no-edit

echo "Pushing fork/main..."
git push fork main

if [ "$MERGE_HERE" = true ]; then
  if [ -z "$PREV_BRANCH" ] || [ "$PREV_BRANCH" = "main" ]; then
    echo "On main; skipping --merge-here (nothing to merge into)." >&2
  else
    echo "Merging main into $PREV_BRANCH..."
    git checkout "$PREV_BRANCH"
    git merge main --no-edit
    echo "Updated $PREV_BRANCH with latest main. Push with: git push fork $PREV_BRANCH"
  fi
elif [ -n "$PREV_BRANCH" ] && [ "$PREV_BRANCH" != "main" ]; then
  git checkout "$PREV_BRANCH"
  echo "Back on $PREV_BRANCH (unchanged except if you used --merge-here)."
fi

echo "Done. main matches origin/main; fork/main updated."
