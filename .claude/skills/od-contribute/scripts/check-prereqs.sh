#!/usr/bin/env bash
# Verify required tools + gh auth before the skill starts.
# Exit 0  = ready (prints GH_USER=... and READY=1 to stdout)
# Exit 2  = missing prereq, hint printed to stderr; skill should surface it verbatim.

set -uo pipefail

# shellcheck disable=SC1091
source "$(dirname "$0")/config.sh"

# config.sh runs with `set -e` for its own callers, but this script wants the
# OPPOSITE behavior: continue checking all prereqs even when one fails so we
# can surface the full diagnostic in one shot rather than aborting at the
# first miss. Restore -uo pipefail without -e after sourcing.
set +e
set -uo pipefail

# Skill root, used in the auth-failure hint below to tell the user where to
# drop a .gh-token file if they're stuck in a sandboxed agent.
_OD_SKILL_DIR_HINT="$(cd "$(dirname "$0")/.." && pwd)"

STATUS=0
MISSING=()
HINTS=()

check_bin() {
  local bin="$1" install_hint="$2"
  if command -v "$bin" >/dev/null 2>&1; then
    printf '  ✓ %s\n' "$bin" >&2
  else
    printf '  ✗ %s (not installed)\n' "$bin" >&2
    MISSING+=("$bin")
    HINTS+=("$install_hint")
    STATUS=2
  fi
}

printf '[od-contrib] checking prerequisites...\n' >&2

OS="$(uname -s)"
case "$OS" in
  Darwin) GH_HINT="brew install gh" ;;
  Linux)  GH_HINT="see https://github.com/cli/cli#installation (e.g. 'sudo apt install gh' or 'brew install gh')" ;;
  *)      GH_HINT="see https://github.com/cli/cli#installation" ;;
esac

check_bin gh   "$GH_HINT"
check_bin git  "install git for your OS"
check_bin jq   "$( [[ $OS == Darwin ]] && echo 'brew install jq' || echo 'sudo apt install jq  (or brew install jq)' )"

if ((${#MISSING[@]} > 0)); then
  printf '\n[od-contrib][error] missing required tools: %s\n' "${MISSING[*]}" >&2
  printf '\nInstall hints:\n' >&2
  for i in "${!MISSING[@]}"; do
    printf '  - %s: %s\n' "${MISSING[$i]}" "${HINTS[$i]}" >&2
  done
  exit 2
fi

# Two acceptable auth paths:
#   1. `gh auth status` succeeds (gh has a token in keychain or hosts.yml)
#   2. GH_TOKEN env var is set (config.sh loaded it from .gh-token, or caller exported it)
# Path 2 matters for sandboxed runtimes (Codex.app, Cursor, etc.) where gh
# CAN'T reach macOS keychain due to App Sandbox restrictions.
if [[ -n "${GH_TOKEN:-}" ]]; then
  # Verify the token actually works against the API.
  if ! gh api user --jq .login >/dev/null 2>&1; then
    printf '[od-contrib][error] GH_TOKEN is set but gh api call failed (token expired?).\n' >&2
    printf '[od-contrib][error] Refresh the token: from a terminal run  gh auth refresh  or replace the .gh-token file.\n' >&2
    exit 2
  fi
elif ! gh auth status >/dev/null 2>&1; then
  cat >&2 <<EOF

[od-contrib][error] No GitHub credentials available.

Two ways to fix this:

  Option A (one-time, works for any agent):
    From a regular terminal, run:
      gh auth login
    Pick GitHub.com → HTTPS → browser login. Need 'repo' scope.

  Option B (for sandboxed agents like Codex.app / Cursor that can't reach
  the macOS keychain):
    From a regular terminal where gh IS authenticated, run:
      gh auth token > "$_OD_SKILL_DIR_HINT/.gh-token"
      chmod 600 "$_OD_SKILL_DIR_HINT/.gh-token"
    The skill will pick up the token automatically next run.
EOF
  exit 2
fi

# Resolve the authenticated login. Fail closed if this can't be done — even
# with `gh auth status` green, `gh api user` can fail when the token has
# insufficient scopes, has been revoked, or GitHub is unreachable. Returning
# a fabricated GH_USER like `?` would propagate to TARGET_FORK and cause
# downstream pushes to point at `?/open-design`, so we'd rather stop here.
GH_USER="$(gh api user --jq .login 2>/dev/null)"
if [[ -z "$GH_USER" ]]; then
  cat >&2 <<'EOF'

[od-contrib][error] gh auth check passed but `gh api user` could not resolve a login.

Common causes:
  - The token has insufficient scopes (need at least 'repo')
  - The token has been revoked or expired since the session started
  - GitHub API is unreachable

Refresh the token with the right scopes and retry:

  gh auth refresh -s repo
EOF
  exit 2
fi

printf '  ✓ gh authed as %s\n' "$GH_USER" >&2
printf '  ✓ target locked to %s\n' "$OD_TARGET_REPO" >&2

printf 'GH_USER=%s\n' "$GH_USER"
printf 'READY=1\n'
