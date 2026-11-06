#!/usr/bin/env bash
# Shared config for the od-contribute skill.
# TARGET_REPO is hard-locked to nexu-io/open-design — this skill is OD-specific.
#
# Override via env vars before invoking a script:
#   TARGET_FORK   "<owner>/<name>"  push branches here. Defaults to $GH_USER/open-design at runtime.
#   OD_BASE_BRANCH                   default: main
#   OD_WORK_ROOT                     default: $HOME/od-contrib-work
#   OD_DISCORD_INVITE                default: https://discord.gg/qhbcCH8Am4

set -euo pipefail

readonly OD_TARGET_REPO="nexu-io/open-design"
TARGET_REPO="$OD_TARGET_REPO"

: "${TARGET_FORK:=}"
: "${OD_BASE_BRANCH:=main}"
: "${OD_WORK_ROOT:="$HOME/od-contrib-work"}"
: "${OD_DISCORD_INVITE:=https://discord.gg/qhbcCH8Am4}"

# Sandboxed-agent fallback for gh auth.
# Codex.app, Cursor, and other macOS App Sandbox runtimes can't reach the
# system keychain where `gh auth login` stores the token by default. If
# GH_TOKEN isn't already set in the env, look for a token file shipped
# alongside the skill. The skill never *creates* this file automatically —
# it must be written by either:
#   - a one-time `gh auth token > <skill>/.gh-token` from a non-sandboxed shell, or
#   - the OAuth Device Flow bootstrap (TODO: implement for non-coder users).
_OD_SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -z "${GH_TOKEN:-}" && -f "$_OD_SKILL_DIR/.gh-token" ]]; then
  GH_TOKEN="$(tr -d '[:space:]' < "$_OD_SKILL_DIR/.gh-token")"
  export GH_TOKEN
fi
unset _OD_SKILL_DIR

export TARGET_REPO TARGET_FORK OD_BASE_BRANCH OD_WORK_ROOT OD_DISCORD_INVITE

od::log()  { printf '[od-contrib] %s\n' "$*" >&2; }
od::warn() { printf '[od-contrib][warn] %s\n' "$*" >&2; }
od::err()  { printf '[od-contrib][error] %s\n' "$*" >&2; }
od::die()  { od::err "$*"; exit 1; }

od::require() {
  command -v "$1" >/dev/null 2>&1 || od::die "missing dependency: $1"
}

od::slugify() {
  local s="${1:-}"
  s="$(printf '%s' "$s" | tr '[:upper:]' '[:lower:]')"
  s="$(printf '%s' "$s" | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
  printf '%s' "${s:0:48}"
}

od::workdir_for() {
  # $1 = a slug for this contribution session (e.g. "skill-foo-2026-05-28")
  printf '%s/%s\n' "$OD_WORK_ROOT" "$1"
}

# Refuse to operate outside $OD_WORK_ROOT (defense against runaway scripts).
od::assert_in_workroot() {
  local path="$1"
  case "$path" in
    "$OD_WORK_ROOT"/*) return 0 ;;
    *) od::die "refusing to operate on path outside OD_WORK_ROOT: $path" ;;
  esac
}
