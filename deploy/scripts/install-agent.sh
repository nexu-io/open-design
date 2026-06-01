#!/bin/sh
# Open Design — per-agent MCP installer (POSIX sh; safe under `curl ... | sh -s <agent>`)
#
# One command, handed to a coding agent, that ends with Open Design wired into
# that agent over MCP. Two paths, chosen automatically:
#
#   Path 1 — Open Design is already installed locally.
#     We locate a runnable `od` (PATH, packaged app, or a previous source
#     build) and forward to `od mcp install <agent>`.
#
#   Path 2 — Open Design is NOT installed.
#     We deploy it from source: clone the repo, `pnpm install` (compiles
#     better-sqlite3), build the daemon, link `od` onto PATH, start the
#     daemon in the background, then forward to `od mcp install <agent>`.
#
# Either way the agent ends up talking to Open Design's stdio MCP server, so
# it can pull projects/files and create artifacts without exporting a zip
# each iteration. The real per-agent logic lives in `od mcp install`
# (TypeScript); this script only bootstraps a runnable `od`.
#
# Usage:
#   curl -fsSL https://open-design.ai/install.sh | sh -s <agent>
#   ./install-agent.sh <agent> [--uninstall] [--print] [--json] [--daemon-url URL]
#
# Environment overrides (Path 2):
#   OD_HOME        Checkout + runtime dir   (default: $HOME/.open-design)
#   OD_REPO        Git clone source         (default: nexu-io/open-design)
#   OD_REF         Git branch/tag to clone  (default: repo's default branch)
#   OD_BIN_DIR     Where `od` is linked     (default: $HOME/.local/bin)
#   OD_DAEMON_URL  Daemon base URL          (default: http://127.0.0.1:7456)
#
# Agents: claude codex cursor copilot openclaw antigravity gemini pi vibe
#         hermes cline kimi trae opencode
set -eu

AGENTS="claude codex cursor copilot openclaw antigravity gemini pi vibe hermes cline kimi trae opencode"

OD_HOME="${OD_HOME:-$HOME/.open-design}"
OD_REPO="${OD_REPO:-https://github.com/nexu-io/open-design.git}"
OD_REF="${OD_REF:-}"
OD_BIN_DIR="${OD_BIN_DIR:-$HOME/.local/bin}"
DAEMON_URL="${OD_DAEMON_URL:-http://127.0.0.1:7456}"
HEALTH_TIMEOUT=60

# ---- formatting ------------------------------------------------------------
if [ -t 1 ]; then
  BOLD=$(printf '\033[1m'); RED=$(printf '\033[31m'); GREEN=$(printf '\033[32m')
  YELLOW=$(printf '\033[33m'); RESET=$(printf '\033[0m')
else
  BOLD=''; RED=''; GREEN=''; YELLOW=''; RESET=''
fi
err()  { printf '%s✗%s %s\n' "$RED" "$RESET" "$1" >&2; }
ok()   { printf '%s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
note() { printf '%s›%s %s\n' "$YELLOW" "$RESET" "$1" >&2; }

usage() {
  cat >&2 <<EOF
${BOLD}Open Design — install MCP into a coding agent${RESET}

Usage: install-agent.sh <agent> [options]

Agents:
  $AGENTS

Options:
  --uninstall, --remove   Remove the Open Design MCP server instead.
  --print, --dry-run      Show what would change; write nothing.
  --json                  Machine-readable result.
  --daemon-url <url>      Daemon URL used to resolve the launch command.

If Open Design is not installed locally, it is deployed from source first
(clone + pnpm install + build). Requires git, Node.js >= 24, and pnpm
(enable via \`corepack enable\`).
EOF
}

is_agent() {
  for a in $AGENTS; do [ "$1" = "$a" ] && return 0; done
  return 1
}

need_cmd() { command -v "$1" >/dev/null 2>&1; }

# ---- parse the leading agent slug ------------------------------------------
if [ $# -eq 0 ]; then usage; exit 2; fi
case "$1" in
  -h|--help) usage; exit 0 ;;
esac
AGENT="$1"; shift
if ! is_agent "$AGENT"; then
  err "unknown agent: $AGENT"
  note "expected one of: $AGENTS"
  exit 2
fi

# ---- locate a runnable Open Design `od` ------------------------------------
# CAUTION: `od` is also the standard Unix octal-dump utility (/usr/bin/od),
# so `command -v od` alone is not enough — we must confirm the binary is
# Open Design's CLI before forwarding to it. The probe runs the agent
# installer's own --help and checks for the Open Design banner; the
# octal-dump `od` errors out / prints unrelated text and is rejected.
is_open_design_od() {
  "$1" mcp install --help 2>/dev/null | grep -q 'Open Design' 2>/dev/null
}

locate_od() {
  # `od` on PATH first, then known install locations.
  _candidates=$(command -v od 2>/dev/null || true)
  _candidates="$_candidates
$OD_BIN_DIR/od
$HOME/.local/bin/od
/usr/local/bin/od
/opt/open-design/bin/od
/Applications/Open Design.app/Contents/Resources/bin/od
/Applications/Open Design Preview.app/Contents/Resources/bin/od"

  OD_BIN=""
  _oldifs=$IFS
  IFS='
'
  for cand in $_candidates; do
    [ -n "$cand" ] || continue
    { command -v "$cand" >/dev/null 2>&1 || [ -x "$cand" ]; } || continue
    if is_open_design_od "$cand"; then OD_BIN="$cand"; break; fi
  done
  IFS=$_oldifs
  [ -n "$OD_BIN" ]
}

# ---- Path 2: deploy Open Design from source --------------------------------
check_node() {
  need_cmd node || return 1
  _major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  [ "$_major" -ge 24 ]
}

deploy_from_source() {
  note "Open Design not found locally — deploying from source."

  if ! need_cmd git; then
    err "git is required to deploy Open Design."
    note "Install git, then re-run."
    exit 1
  fi
  if ! check_node; then
    err "Node.js >= 24 is required (found: $(node --version 2>/dev/null || echo 'none'))."
    note "Install from https://nodejs.org (or via nvm/winget/brew), then re-run."
    exit 1
  fi
  if ! need_cmd pnpm && need_cmd corepack; then
    corepack enable >/dev/null 2>&1 || true
  fi
  if ! need_cmd pnpm; then
    err "pnpm is required."
    note "Enable it with: corepack enable   (or: npm install -g pnpm)"
    exit 1
  fi

  if [ -d "$OD_HOME/.git" ]; then
    ok "Updating existing checkout at $OD_HOME"
    git -C "$OD_HOME" pull --ff-only || note "git pull failed; using existing checkout"
  elif [ -n "$OD_REF" ]; then
    ok "Cloning $OD_REPO ($OD_REF)"
    git clone --depth 1 --branch "$OD_REF" "$OD_REPO" "$OD_HOME"
  else
    ok "Cloning $OD_REPO"
    git clone --depth 1 "$OD_REPO" "$OD_HOME"
  fi

  (
    cd "$OD_HOME"
    ok "Installing dependencies (compiles better-sqlite3; ~2 min)…"
    pnpm install
    ok "Building the daemon…"
    pnpm --filter @open-design/daemon build
  )

  mkdir -p "$OD_BIN_DIR"
  ln -sf "$OD_HOME/apps/daemon/bin/od.mjs" "$OD_BIN_DIR/od"
  OD_BIN="$OD_BIN_DIR/od"
  ok "Linked od -> $OD_BIN"

  case ":$PATH:" in
    *":$OD_BIN_DIR:"*) ;;
    *) note "Add to your shell profile: export PATH=\"$OD_BIN_DIR:\$PATH\"" ;;
  esac
}

# ---- ensure a daemon is reachable (Path 2) ---------------------------------
daemon_healthy() {
  if need_cmd curl; then
    [ "$(curl -s -o /dev/null -w '%{http_code}' "$DAEMON_URL/api/health" 2>/dev/null || echo 000)" = "200" ]
  elif need_cmd wget; then
    wget -q -O /dev/null "$DAEMON_URL/api/health" 2>/dev/null
  else
    return 1
  fi
}

ensure_daemon() {
  if daemon_healthy; then
    ok "Daemon already running at $DAEMON_URL"
    return 0
  fi
  note "Starting the Open Design daemon in the background…"
  mkdir -p "$OD_HOME"
  nohup "$OD_BIN" --no-open >"$OD_HOME/daemon.log" 2>&1 &
  _elapsed=0
  while [ "$_elapsed" -lt "$HEALTH_TIMEOUT" ]; do
    if daemon_healthy; then
      ok "Daemon healthy at $DAEMON_URL"
      return 0
    fi
    sleep 2
    _elapsed=$((_elapsed + 2))
  done
  err "Daemon did not become healthy within ${HEALTH_TIMEOUT}s."
  note "Check the log: $OD_HOME/daemon.log"
  exit 1
}

# ---- choose a path ---------------------------------------------------------
if ! locate_od; then
  deploy_from_source
  ensure_daemon
fi

# ---- forward to the real engine --------------------------------------------
# `od mcp install` resolves the exact launch command from the running daemon
# (GET /api/mcp/install-info) and performs the per-agent registration.
exec "$OD_BIN" mcp install "$AGENT" "$@"
