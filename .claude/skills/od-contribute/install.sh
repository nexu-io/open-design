#!/usr/bin/env bash
# OD Contribute installer — self-bootstrapping.
# Fetches the latest od-contribute skill from nexu-io/open-design and installs
# it into every supported AI agent's home directory.
#
# Two ways to run this:
#
# 1) Tell your AI agent (Claude Code / Codex / Cursor / etc.) in the chat:
#
#      curl -sSL https://raw.githubusercontent.com/nexu-io/open-design/main/.claude/skills/od-contribute/install.sh | bash
#
#    The agent's Bash tool runs this. You never open a terminal yourself.
#
# 2) Or paste that same one-liner into a terminal directly, if you prefer.
#
# Targets installed:
#   ~/.claude/skills/od-contribute/        Claude Code (native skill format)
#   ~/.claude/commands/od-contribute.md    Claude Code slash command
#   ~/.agents/skills/od-contribute/        Codex CLI (canonical path)
#   ~/.codex/skills/od-contribute/         Codex CLI (legacy, only if ~/.codex exists)
#
# Override the source branch with OD_CONTRIBUTE_BRANCH=feat/foo (default: main).

set -euo pipefail

REPO="nexu-io/open-design"
BRANCH="${OD_CONTRIBUTE_BRANCH:-main}"

cyan()  { printf '\033[36m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
gray()  { printf '\033[90m%s\033[0m\n' "$*"; }
die()   { printf '\033[31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

cyan "Installing OD Contribute skill from ${REPO}@${BRANCH}..."

command -v curl >/dev/null 2>&1 || die "curl is required."
command -v tar  >/dev/null 2>&1 || die "tar is required."

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

# Tarball download — no `git clone` needed (works in env without git).
TARBALL="$TMPDIR/repo.tar.gz"
curl -fsSL "https://github.com/${REPO}/archive/refs/heads/${BRANCH}.tar.gz" -o "$TARBALL" \
  || die "failed to fetch ${REPO}@${BRANCH} (branch may not exist)"

# Extract just the two paths we need. GitHub tarballs name the root dir
# <repo>-<branch>/, with slashes in branch names converted to dashes.
TARBALL_ROOT="open-design-${BRANCH//\//-}"
tar -xzf "$TARBALL" -C "$TMPDIR" \
  "${TARBALL_ROOT}/.claude/skills/od-contribute" \
  "${TARBALL_ROOT}/.claude/commands/od-contribute.md" \
  2>/dev/null || die "skill files not found in tarball — branch may have different layout"

SKILL_SRC="$TMPDIR/${TARBALL_ROOT}/.claude/skills/od-contribute"
CMD_SRC="$TMPDIR/${TARBALL_ROOT}/.claude/commands/od-contribute.md"

[[ -f "$SKILL_SRC/SKILL.md" ]] || die "SKILL.md missing at expected path"
[[ -f "$CMD_SRC"             ]] || die "slash command missing at expected path"

install_skill_to() {
  local dest="$1" label="$2"

  # Preserve user-local state across reinstall/upgrade. Re-running this script
  # is the documented upgrade path ("re-run to pull the latest skill from
  # main"), so anything the user wrote here that ISN'T part of the skill
  # itself must survive `rm -rf`. Today that's just `.gh-token` (sandboxed
  # agents like Codex.app / Cursor write a GitHub token here when they can't
  # reach the macOS keychain — see check-prereqs.sh's hint and config.sh's
  # fallback). Add new state filenames to PRESERVE if we ever introduce more.
  local PRESERVE=(.gh-token)
  local stash=""
  local f
  for f in "${PRESERVE[@]}"; do
    if [[ -f "$dest/$f" ]]; then
      [[ -z "$stash" ]] && stash="$(mktemp -d)"
      cp -p "$dest/$f" "$stash/$f"
    fi
  done

  rm -rf "$dest"
  mkdir -p "$dest"
  cp -R "$SKILL_SRC/." "$dest/"

  # Restore preserved state. The mode preservation (`cp -p` above + this
  # explicit chmod) keeps tokens at 600.
  if [[ -n "$stash" ]]; then
    for f in "${PRESERVE[@]}"; do
      if [[ -f "$stash/$f" ]]; then
        cp -p "$stash/$f" "$dest/$f"
        chmod 600 "$dest/$f" 2>/dev/null || true
      fi
    done
    rm -rf "$stash"
  fi

  # Ensure scripts retain executable bit (tar usually preserves; defense in depth).
  find "$dest" -name '*.sh' -exec chmod +x {} + 2>/dev/null || true
  green "  ✓ $label"
  gray  "      $dest"
}

# --- Claude Code (native, always install) -----------------------------------
install_skill_to "$HOME/.claude/skills/od-contribute" "Claude Code skill"
mkdir -p "$HOME/.claude/commands"
cp "$CMD_SRC" "$HOME/.claude/commands/od-contribute.md"
green "  ✓ Claude Code slash command (/od-contribute)"
gray  "      $HOME/.claude/commands/od-contribute.md"

# --- Codex CLI (canonical) --------------------------------------------------
install_skill_to "$HOME/.agents/skills/od-contribute" "Codex CLI skill (~/.agents/skills/)"

# --- Codex CLI (legacy) — only if user already has Codex --------------------
if [[ -d "$HOME/.codex" ]]; then
  install_skill_to "$HOME/.codex/skills/od-contribute" "Codex CLI skill (legacy ~/.codex/skills/)"
fi

echo
green "Done."
echo
cyan "How to use it:"
cat <<'EOF'

  In Claude Code:  type  /od-contribute  in any chat.
  In Codex CLI:    type  @od-contribute  or pick "Open Design — Contribute" from /skills.
  In other agents: ask the agent to follow ~/.claude/skills/od-contribute/SKILL.md

The skill walks you through one of:

  * shipping a Skill or Design System you made with Open Design
  * translating a doc to a new language
  * fixing a typo or writing a use-case blog
  * reporting a clean bug

Need help? Open Design Discord:  https://discord.gg/qhbcCH8Am4
EOF
