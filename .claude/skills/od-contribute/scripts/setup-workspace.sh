#!/usr/bin/env bash
# Clone (or reuse) nexu-io/open-design in an isolated workdir + create a feature branch.
# Usage: setup-workspace.sh <type> <slug>
#   <type>  one of: skill | design-system | i18n | docs
#   <slug>  short kebab-case identifier (e.g. "translate-readme-es", "fix-typo-quickstart")
#
# Env: TARGET_FORK optional (else pushes go to upstream — create-pr.sh warns first).
#
# Stdout (machine-readable):
#   WORKDIR=<abs path>
#   BRANCH=<branch name>

set -euo pipefail
source "$(dirname "$0")/config.sh"

TYPE="${1:?type required (skill|design-system|i18n|docs)}"
SLUG="${2:?slug required}"

case "$TYPE" in
  skill|design-system|i18n|docs) ;;
  *) od::die "unknown type: $TYPE (expected skill|design-system|i18n|docs)" ;;
esac

od::require gh
od::require git

# Use second-precision timestamp so two contribution sessions on the same day
# (or the SKILL.md i18n flow that calls setup-workspace.sh with a placeholder
# slug like "translate" before the user has picked a language) don't collide
# into the same workdir. Reusing a workdir would leak untracked / half-edited
# files from an earlier abandoned session into a later contribution.
SESSION_TAG="$(date +%Y%m%d-%H%M%S)"
SESSION_DIR="${TYPE}-${SLUG}-${SESSION_TAG}"
WORKDIR="$(od::workdir_for "$SESSION_DIR")"
BRANCH="od-contrib/${TYPE}/${SLUG}-${SESSION_TAG}"

mkdir -p "$OD_WORK_ROOT"
od::assert_in_workroot "$WORKDIR"

CLONE_URL="https://github.com/${TARGET_REPO}.git"

if [[ -d "$WORKDIR/.git" ]]; then
  # We reach here only if the user explicitly resumed by passing the same
  # SESSION_TAG, or if the wall clock somehow produced a duplicate. Clean any
  # untracked/dirty state so the run starts from a known good base instead of
  # inheriting whatever the previous occupant left behind.
  od::log "reusing existing workdir: $WORKDIR"
  git -C "$WORKDIR" fetch origin --prune
  git -C "$WORKDIR" reset --hard HEAD
  git -C "$WORKDIR" clean -fdx
else
  od::log "cloning $CLONE_URL → $WORKDIR (depth 50)"
  git clone --depth 50 "$CLONE_URL" "$WORKDIR"
fi

# Tell git to ignore our internal scratch dir so `git add -A` later (in
# create-pr.sh) doesn't accidentally stage type.txt, slug.txt, PR-BODY.md
# into the user's contribution PR. .git/info/exclude is repo-local and not
# committed, so we don't pollute the OD repo's .gitignore.
mkdir -p "$WORKDIR/.git/info"
if ! grep -qxF '.od-contrib/' "$WORKDIR/.git/info/exclude" 2>/dev/null; then
  printf '\n# od-contribute scratch dir (added by setup-workspace.sh)\n.od-contrib/\n' \
    >> "$WORKDIR/.git/info/exclude"
fi

git -C "$WORKDIR" checkout "$OD_BASE_BRANCH"
git -C "$WORKDIR" pull --ff-only origin "$OD_BASE_BRANCH"

# Configure fork remote if provided.
if [[ -n "${TARGET_FORK}" ]]; then
  if git -C "$WORKDIR" remote | grep -q '^fork$'; then
    git -C "$WORKDIR" remote set-url fork "https://github.com/${TARGET_FORK}.git"
  else
    git -C "$WORKDIR" remote add fork "https://github.com/${TARGET_FORK}.git"
  fi
fi

# Create or reset branch off latest base.
if git -C "$WORKDIR" show-ref --verify --quiet "refs/heads/$BRANCH"; then
  od::log "branch $BRANCH already exists — switching"
  git -C "$WORKDIR" checkout "$BRANCH"
else
  git -C "$WORKDIR" checkout -b "$BRANCH" "$OD_BASE_BRANCH"
fi

mkdir -p "$WORKDIR/.od-contrib"
printf '%s\n' "$TYPE" > "$WORKDIR/.od-contrib/type.txt"
printf '%s\n' "$SLUG" > "$WORKDIR/.od-contrib/slug.txt"

od::log "workspace ready"
printf 'WORKDIR=%s\n' "$WORKDIR"
printf 'BRANCH=%s\n' "$BRANCH"
