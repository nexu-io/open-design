#!/usr/bin/env bash
# Commit, push, and open a PR against nexu-io/open-design.
# Usage: create-pr.sh --workdir <dir> --type <skill|design-system|i18n|docs> \
#                     --title "<pr title>" --body-file <rendered PR body .md>
#
# Reads:
#   <workdir>/.od-contrib/contributor.txt   (display name; optional)
#   <workdir>/.od-contrib/pitch.txt         (one-line pitch; optional)
# Emits PR URL on its own line at the end (stdout).

set -euo pipefail
source "$(dirname "$0")/config.sh"

WORKDIR=""
TYPE=""
TITLE=""
BODY_FILE=""
DRAFT=""

while (($#)); do
  case "$1" in
    --workdir)   WORKDIR="$2"; shift 2 ;;
    --type)      TYPE="$2"; shift 2 ;;
    --title)     TITLE="$2"; shift 2 ;;
    --body-file) BODY_FILE="$2"; shift 2 ;;
    --draft)     DRAFT="--draft"; shift ;;
    *) od::die "unknown flag: $1" ;;
  esac
done

[[ -n "$WORKDIR"   ]] || od::die "--workdir required"
[[ -n "$TYPE"      ]] || od::die "--type required (skill|design-system|i18n|docs)"
[[ -n "$TITLE"     ]] || od::die "--title required"
[[ -f "$BODY_FILE" ]] || od::die "--body-file does not exist: $BODY_FILE"
[[ -d "$WORKDIR/.git" ]] || od::die "not a git workdir: $WORKDIR"

od::require gh
od::require git

cd "$WORKDIR"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

case "$BRANCH" in
  main|master|develop) od::die "refusing to push base branch '$BRANCH'" ;;
esac

# 1) Stage + commit if there are changes. Use a non-jargon commit message.
#
# Use `git status --porcelain` rather than `git diff --quiet` because the latter
# ignores untracked files. The most common contribution shape — a brand-new
# Skill folder, translation file, or doc — is 100% untracked at this point;
# any predicate that misses untracked paths would silently push an empty PR.
#
# Belt-and-suspenders against the skill's internal scratch dir leaking into
# the user's contribution PR: setup-workspace.sh adds `.od-contrib/` to
# .git/info/exclude, but in case this script is invoked against a workdir
# set up differently, also pass `:!.od-contrib` as a pathspec exclude so
# nothing under .od-contrib/ gets staged here.
SCRATCH_EXCLUDE=':!:.od-contrib'
if [[ -n "$(git status --porcelain -- . "$SCRATCH_EXCLUDE")" ]]; then
  git add -A -- . "$SCRATCH_EXCLUDE"
  # If even after `git add` the index is clean (e.g., changes were only in
  # ignored paths or symlink mode bits), skip the commit instead of erroring.
  if git diff --cached --quiet; then
    od::log "no real changes after staging — skipping commit"
  else
    git commit -m "$TITLE"
    od::log "created commit"
  fi
else
  od::log "nothing new to commit (assuming work was already committed)"
fi

# 2) Decide push remote. Prefer fork.
PUSH_REMOTE="origin"
if [[ -n "${TARGET_FORK}" ]] && git remote | grep -q '^fork$'; then
  PUSH_REMOTE="fork"
else
  od::warn "no fork configured (TARGET_FORK empty) — pushing to upstream ${TARGET_REPO}. 3s to abort..."
  sleep 3 || true
fi

od::log "pushing to ${PUSH_REMOTE}/${BRANCH}"
git push -u "$PUSH_REMOTE" "$BRANCH"

# 3) Pick label set per contribution type. (OD's labels: documentation, i18n, blog, enhancement, ...)
LABELS=()
case "$TYPE" in
  skill)         LABELS+=("good first issue" "enhancement") ;;
  design-system) LABELS+=("good first issue" "enhancement") ;;
  i18n)          LABELS+=("i18n" "documentation") ;;
  docs)          LABELS+=("documentation") ;;
esac

LABEL_FLAGS=()
for L in "${LABELS[@]}"; do
  LABEL_FLAGS+=(--label "$L")
done

# 4) Open the PR. `gh pr create` automatically picks `head` from the pushed branch.
HEAD_REF="$BRANCH"
if [[ "$PUSH_REMOTE" == "fork" && -n "$TARGET_FORK" ]]; then
  HEAD_REF="${TARGET_FORK%%/*}:${BRANCH}"
fi

PR_URL="$(gh pr create \
  --repo "$TARGET_REPO" \
  --base "$OD_BASE_BRANCH" \
  --head "$HEAD_REF" \
  --title "$TITLE" \
  --body-file "$BODY_FILE" \
  ${DRAFT} \
  "${LABEL_FLAGS[@]}")" || od::die "gh pr create failed"

printf '\n'
printf '%s\n' "$PR_URL"
