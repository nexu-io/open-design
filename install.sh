#!/usr/bin/env bash
# Open Design — Agent MCP install bootstrap.
#
# This is the shell entry point referenced by the README's one-liner:
#
#   curl -fsSL https://open-design.ai/install.sh | sh -s <agent>
#
# It is the no-Node-required, no-daemon-required first step. It prints
# (or, with --write-config, writes) the agent-specific MCP server
# registration for the Open Design stdio MCP server, so a coding agent
# can talk to the local Open Design daemon at $DAEMON_URL.
#
# The full agent-aware planner lives in the daemon at `od mcp install
# <agent>` (apps/daemon/src/mcp-agent-install.ts). That path is the
# authoritative installer: it picks the exact per-agent argv / config
# keyPath / entry shape, drives the agent's own `mcp add` subcommand
# where one exists, and deep-merges JSON configs without clobbering
# other servers. This script is a deliberate complement to it — a
# shell-only fast path for users who want a copy-pasteable snippet
# before they have `od` installed, or who want the snippet without
# touching their agent's config yet.
#
# The per-agent tables (config path, keyPath, CLI argv, manual
# snippet) intentionally mirror mcp-agent-install.ts so the two
# stay in lock-step. When a new agent lands in AGENT_SLUGS there, add
# a matching arm here.
#
# Usage:
#   install.sh <agent> [options]
#
# Agents (matches apps/daemon/src/mcp-agent-install.ts AGENT_SLUGS):
#   claude  codex  cursor  copilot  openclaw  antigravity  gemini
#   pi      vibe   hermes   cline     kimi      trae         opencode
#
# Options:
#   --daemon-url URL       Daemon URL (default: http://127.0.0.1:7456)
#   --write-config         Write the config (default: dry-run, print only)
#   --non-interactive      Don't prompt
#   --help, -h             Show this help
#
# Exit codes:
#   0   success (snippet printed or config written)
#   1   generic error
#   2   bad arguments (missing agent, unknown agent, bad flag)

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DEFAULT_DAEMON_URL="http://127.0.0.1:7456"
DAEMON_URL="$DEFAULT_DAEMON_URL"
DRY_RUN=1
NON_INTERACTIVE=0
AGENT=""

# ---------------------------------------------------------------------------
# Colors & formatting (matches deploy/scripts/install.sh)
# ---------------------------------------------------------------------------
BOLD="" DIM="" RED="" GREEN="" YELLOW="" CYAN="" RESET=""
if [ -t 1 ]; then
  BOLD="\033[1m" DIM="\033[2m" RED="\033[31m" GREEN="\033[32m"
  YELLOW="\033[33m" CYAN="\033[36m" RESET="\033[0m"
fi
step()    { printf "  ${DIM}▸${RESET} %s\n" "$1"; }
ok()      { printf "  ${GREEN}✓${RESET} %s\n" "$1"; }
warn()    { printf "  ${YELLOW}!${RESET} %s\n" "$1" >&2; }
error()   { printf "  ${RED}✗${RESET} %s\n" "$1" >&2; }
info()    { printf "  ${CYAN}›${RESET} %s\n" "$1"; }

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
usage() {
  cat <<EOF
${BOLD}Open Design — Agent MCP install bootstrap${RESET}

Wire the Open Design stdio MCP server into a coding agent so the agent
can talk to a running Open Design daemon.

${BOLD}Usage:${RESET} install.sh <agent> [options]

${BOLD}Agents:${RESET}
  claude  codex  cursor  copilot  openclaw  antigravity  gemini
  pi      vibe   hermes   cline     kimi      trae         opencode

  Per-agent strategy (mirrors apps/daemon/src/mcp-agent-install.ts):
    - cli    (claude, codex, gemini, kimi):
        prints a one-liner that drives the agent's own \`<bin> mcp add\`
        subcommand. Idempotent: re-running with the same server name
        overwrites the previous entry.
    - json   (cursor, copilot, cline, opencode, openclaw, antigravity, trae):
        prints (or, with --write-config, deep-merges) a JSON config file
        under the agent's well-known config dir. Never clobbers other
        servers.
    - manual (pi, hermes, vibe):
        schema is unverified, so the script always prints only and
        refuses to write. Paste the snippet by hand.

${BOLD}Options:${RESET}
  --daemon-url URL       Daemon URL (default: ${DEFAULT_DAEMON_URL})
  --write-config         Write the config (default: dry-run, print only)
  --non-interactive      Don't prompt
  --help, -h             Show this help

${BOLD}Examples:${RESET}
  # Dry-run: print the snippet, write nothing
  install.sh claude

  # Wire claude-code for real
  install.sh claude --write-config

  # Wire codex pointing at a non-default daemon
  install.sh codex --write-config --daemon-url http://od.lan:7456

  # pi / hermes / vibe (manual): always print-only
  install.sh pi
EOF
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --daemon-url)      shift; DAEMON_URL="$1" ;;
    --daemon-url=*)    DAEMON_URL="${1#--daemon-url=}" ;;
    --write-config)    DRY_RUN=0 ;;
    --dry-run)         DRY_RUN=1 ;;
    --non-interactive) NON_INTERACTIVE=1 ;;
    --help|-h)         usage; exit 0 ;;
    -*)                error "Unknown option: $1"; echo; usage; exit 2 ;;
    *)                 AGENT="$1" ;;
  esac
  shift
done

if [ -z "$AGENT" ]; then
  error "Missing required <agent> argument."
  echo
  usage
  exit 2
fi

# ---------------------------------------------------------------------------
# Agent whitelist — must match apps/daemon/src/mcp-agent-install.ts AGENT_SLUGS.
# ---------------------------------------------------------------------------
SUPPORTED_AGENTS="claude codex cursor copilot openclaw antigravity gemini pi vibe hermes cline kimi trae opencode"

case " $SUPPORTED_AGENTS " in
  *" $AGENT "*) ;;
  *)
    error "Unknown agent: ${AGENT}"
    step "Supported: ${SUPPORTED_AGENTS}"
    exit 2
    ;;
esac

# ---------------------------------------------------------------------------
# Platform detection (used for cline / trae config paths).
# ---------------------------------------------------------------------------
UNAME_S="$(uname -s 2>/dev/null || echo unknown)"
case "$UNAME_S" in
  Darwin) PLATFORM=darwin ;;
  Linux)  PLATFORM=linux  ;;
  *)      PLATFORM=other  ;;
esac

# ---------------------------------------------------------------------------
# Per-agent config metadata. Mirrors the canonical planner in
# apps/daemon/src/mcp-agent-install.ts. The KIND column decides which
# branch of the dispatch below runs.
# ---------------------------------------------------------------------------
#   kind=cli    → shell out to the agent's `<bin> mcp add` (printed only)
#   kind=json   → merge into a JSON file (printed or --write-config)
#   kind=manual → print a snippet, never write

agent_meta() {
  case "$1" in
    # --- CLI-driven agents ---
    claude)        echo "cli"   ;;
    codex)         echo "cli"   ;;
    gemini)        echo "cli"   ;;
    kimi)          echo "cli"   ;;

    # --- JSON config-file agents ---
    cursor)        echo "json"  ;;
    copilot)       echo "json"  ;;
    cline)         echo "json"  ;;
    opencode)      echo "json"  ;;
    openclaw)      echo "json"  ;;
    antigravity)   echo "json"  ;;
    trae)          echo "json"  ;;

    # --- Unverified: print-only ---
    pi)            echo "manual" ;;
    vibe)          echo "manual" ;;
    hermes)        echo "manual" ;;
  esac
}

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
printf "\n${BOLD}  Open Design — Agent MCP install bootstrap${RESET}\n"
step "Agent:      ${AGENT}"
step "Daemon URL: ${DAEMON_URL}"
if [ "$DRY_RUN" = "1" ]; then
  step "Mode:       dry-run (use --write-config to actually write)"
else
  step "Mode:       write"
fi
printf "\n"

# ---------------------------------------------------------------------------
# JSON merge helper (used only by --write-config for json agents).
# Avoids an external dep (jq) by delegating to a tiny Node script that
# lives next to the tests in scripts/install-sh-merge.mjs. Node is the
# same runtime the Open Design daemon already requires, so it is not
# an extra dep for users who run `od`.
# ---------------------------------------------------------------------------
SCRIPT_DIR_CD="$(cd "$(dirname "$0")" && pwd)"
MERGE_SCRIPT="${SCRIPT_DIR_CD}/scripts/install-sh-merge.mjs"

merge_json_config() {
  # merge_json_config <configPath> <dotKeyPath> <serverName> <entryJson>
  # Creates the parent dir, deep-merges `entryJson` under
  # `dotKeyPath.serverName` into the existing file (treating a missing
  # or malformed file as {}), and writes back atomically.
  local config_path="$1" dot_key_path="$2" server_name="$3" entry_json="$4"

  if ! command -v node >/dev/null 2>&1; then
    error "node is required for --write-config but was not found on PATH."
    step "Install Node 24 (https://nodejs.org) and re-run, or omit --write-config to print only."
    return 1
  fi

  if [ ! -f "$MERGE_SCRIPT" ]; then
    error "merge helper not found at $MERGE_SCRIPT"
    step "Reinstall Open Design (or pull this repo) so the helper is present."
    return 1
  fi

  node "$MERGE_SCRIPT" "$config_path" "$dot_key_path" "$server_name" "$entry_json"

  ok "Wrote ${config_path}"
}

# ---------------------------------------------------------------------------
# Per-agent dispatch
# ---------------------------------------------------------------------------
SERVER_NAME="open-design"
ENTRY_JSON="$(printf '{"command":"od","args":["mcp","--daemon-url","%s"],"env":{"OD_DAEMON_URL":"%s"}}' "$DAEMON_URL" "$DAEMON_URL")"

# print_json_plan <configPath> <dotKeyPath> <entryJson> <description>
# Renders the standard "where to put it + what to put" block used by
# every json agent. Defined here so the case statement below can call
# it directly.
print_json_plan() {
  local config_path="$1" dot_key_path="$2" entry_json="$3" description="$4"
  cat <<EOF
${BOLD}  ${description}${RESET}
  Add this entry under the dot-path \`${dot_key_path}\` in:

    ${config_path}

  The shape below mirrors what mcp-agent-install.ts generates server-side
  so the two installers stay in lock-step. With --write-config, this
  script deep-merges the entry into the existing file instead of
  clobbering the rest of the config.

    ${entry_json}
EOF
}

case "$AGENT" in
  # ============================================================
  # CLI-driven agents: print the exact argv the daemon's
  # mcp-agent-install.ts generates for its <bin> mcp add flow.
  # ============================================================
  claude)
    cat <<EOF
${BOLD}  Run this in your shell to register open-design with Claude Code:${RESET}

    claude mcp add --scope user ${SERVER_NAME} \\
      -- od mcp --daemon-url ${DAEMON_URL}

  This is idempotent: re-running with the same server name overwrites
  the previous entry. To remove later: \`claude mcp remove --scope user ${SERVER_NAME}\`.

  For the full payload (OD_DATA_DIR, sidecar env, ELECTRON_RUN_AS_NODE),
  prefer the daemon installer once it is installed:
    od mcp install claude
EOF
    ;;

  codex)
    cat <<EOF
${BOLD}  Run this in your shell to register open-design with Codex:${RESET}

    codex mcp add ${SERVER_NAME} \\
      -- od mcp --daemon-url ${DAEMON_URL}

  This is idempotent: re-running overwrites the previous entry.
  To remove later: \`codex mcp remove ${SERVER_NAME}\`.

  For the full payload: \`od mcp install codex\`
EOF
    ;;

  gemini)
    cat <<EOF
${BOLD}  Run this in your shell to register open-design with Gemini CLI:${RESET}

    gemini mcp add -s user -t stdio ${SERVER_NAME} \\
      -- od mcp --daemon-url ${DAEMON_URL}

  This is idempotent. To remove later: \`gemini mcp remove ${SERVER_NAME}\`.

  For the full payload: \`od mcp install gemini\`
EOF
    ;;

  kimi)
    cat <<EOF
${BOLD}  Run this in your shell to register open-design with Kimi:${RESET}

    kimi mcp add --transport stdio ${SERVER_NAME} \\
      -- od mcp --daemon-url ${DAEMON_URL}

  This is idempotent. To remove later: \`kimi mcp remove ${SERVER_NAME}\`.

  For the full payload: \`od mcp install kimi\`
EOF
    ;;

  # ============================================================
  # JSON config-file agents: print the JSON entry; with
  # --write-config, deep-merge into the per-agent config file.
  # ============================================================
  cursor)
    CURSOR_CFG="${HOME}/.cursor/mcp.json"
    print_json_plan "$CURSOR_CFG" "mcpServers" "$ENTRY_JSON" "Cursor (mcpServers at \$HOME/.cursor/mcp.json)"
    if [ "$DRY_RUN" = "0" ]; then
      merge_json_config "$CURSOR_CFG" "mcpServers" "$SERVER_NAME" "$ENTRY_JSON"
    fi
    ;;

  copilot)
    COPILOT_CFG="${HOME}/.copilot/mcp-config.json"
    COPILOT_ENTRY="$(printf '{"command":"od","args":["mcp","--daemon-url","%s"],"env":{"OD_DAEMON_URL":"%s"},"type":"local","tools":["*"]}' "$DAEMON_URL" "$DAEMON_URL")"
    print_json_plan "$COPILOT_CFG" "mcpServers" "$COPILOT_ENTRY" "GitHub Copilot CLI (mcpServers at \$HOME/.copilot/mcp-config.json)"
    if [ "$DRY_RUN" = "0" ]; then
      merge_json_config "$COPILOT_CFG" "mcpServers" "$SERVER_NAME" "$COPILOT_ENTRY"
    fi
    ;;

  opencode)
    OPENCODE_CFG="${HOME}/.config/opencode/opencode.json"
    # OpenCode nests under `mcp`, folds command+args into one array,
    # and uses `environment` for env vars. Mirrors mcp-agent-install.ts.
    OPENCODE_ENTRY="$(printf '{"type":"local","command":["od","mcp","--daemon-url","%s"],"enabled":true,"environment":{"OD_DAEMON_URL":"%s"}}' "$DAEMON_URL" "$DAEMON_URL")"
    print_json_plan "$OPENCODE_CFG" "mcp" "$OPENCODE_ENTRY" "OpenCode (mcp.<server> at \$HOME/.config/opencode/opencode.json)"
    if [ "$DRY_RUN" = "0" ]; then
      merge_json_config "$OPENCODE_CFG" "mcp" "$SERVER_NAME" "$OPENCODE_ENTRY"
    fi
    ;;

  openclaw)
    OPENCLAW_CFG="${HOME}/.openclaw/openclaw.json"
    # OpenClaw nests under `mcp.servers` (two levels deep). The
    # merge helper takes a dot-path so this works without changes.
    print_json_plan "$OPENCLAW_CFG" "mcp.servers" "$ENTRY_JSON" "OpenClaw (mcp.servers at \$HOME/.openclaw/openclaw.json)"
    if [ "$DRY_RUN" = "0" ]; then
      merge_json_config "$OPENCLAW_CFG" "mcp.servers" "$SERVER_NAME" "$ENTRY_JSON"
    fi
    ;;

  antigravity)
    ANTIGRAVITY_CFG="${HOME}/.gemini/antigravity/mcp_config.json"
    print_json_plan "$ANTIGRAVITY_CFG" "mcpServers" "$ENTRY_JSON" "Antigravity (mcpServers at \$HOME/.gemini/antigravity/mcp_config.json)"
    if [ "$DRY_RUN" = "0" ]; then
      merge_json_config "$ANTIGRAVITY_CFG" "mcpServers" "$SERVER_NAME" "$ENTRY_JSON"
    fi
    ;;

  cline)
    # Cline's config is platform-specific: it lives inside the VS Code
    # globalStorage dir, not under $HOME. Mirrors clineConfigPath() in
    # mcp-agent-install.ts.
    case "$PLATFORM" in
      darwin)
        CLINE_CFG="${HOME}/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json"
        ;;
      linux)
        CLINE_CFG="${HOME}/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json"
        ;;
      *)
        warn "Cline is only supported on macOS and Linux from this script."
        step "On Windows, run from a Bash shell that has \$APPDATA set, or use od mcp install cline."
        CLINE_CFG=""
        ;;
    esac
    if [ -n "$CLINE_CFG" ]; then
      CLINE_ENTRY="$(printf '{"command":"od","args":["mcp","--daemon-url","%s"],"env":{"OD_DAEMON_URL":"%s"},"disabled":false,"autoApprove":[]}' "$DAEMON_URL" "$DAEMON_URL")"
      print_json_plan "$CLINE_CFG" "mcpServers" "$CLINE_ENTRY" "Cline (mcpServers under the VS Code globalStorage dir)"
      if [ "$DRY_RUN" = "0" ]; then
        merge_json_config "$CLINE_CFG" "mcpServers" "$SERVER_NAME" "$CLINE_ENTRY"
      fi
    fi
    ;;

  trae)
    # Trae's config is platform-specific: it lives under the Trae app's
    # User dir, not under $HOME. Mirrors traeConfigPath() in
    # mcp-agent-install.ts.
    case "$PLATFORM" in
      darwin)
        TRAE_CFG="${HOME}/Library/Application Support/Trae/User/mcp.json"
        ;;
      linux)
        TRAE_CFG="${HOME}/.config/Trae/User/mcp.json"
        ;;
      *)
        warn "Trae is only supported on macOS and Linux from this script."
        step "On Windows, run from a Bash shell that has \$APPDATA set, or use od mcp install trae."
        TRAE_CFG=""
        ;;
    esac
    if [ -n "$TRAE_CFG" ]; then
      print_json_plan "$TRAE_CFG" "mcpServers" "$ENTRY_JSON" "Trae (mcpServers under the Trae app User dir)"
      if [ "$DRY_RUN" = "0" ]; then
        merge_json_config "$TRAE_CFG" "mcpServers" "$SERVER_NAME" "$ENTRY_JSON"
      fi
    fi
    ;;

  # ============================================================
  # Manual agents: print only, never write. The daemon's
  # mcp-agent-install.ts treats these the same way — schema is
  # unverified, so we refuse to guess a path and risk corrupting
  # a user-owned config.
  # ============================================================
  pi)
    PI_SNIPPET="$(cat <<JSON
{
  "mcpServers": {
    "${SERVER_NAME}": {
      "command": "od",
      "args": ["mcp", "--daemon-url", "${DAEMON_URL}"],
      "env": { "OD_DAEMON_URL": "${DAEMON_URL}" }
    }
  }
}
JSON
)"
    cat <<EOF
${BOLD}  Manual step required for the pi coding agent.${RESET}
  pi's MCP config schema is not authoritatively documented, so this
  script refuses to write a guessed path (it would risk corrupting a
  user-owned config). The daemon installer does the same:
  \`od mcp install pi\` is print-only by design.

  Likely config path: ${HOME}/.pi/agent/mcp.json
  Confirm the exact location with: \`pi --help\`

  Paste this block into pi's MCP config:

${PI_SNIPPET}
EOF
    if [ "$DRY_RUN" = "0" ]; then
      warn "--write-config is ignored for ${AGENT} (manual / unverified schema). The snippet above was printed; nothing was written."
    fi
    ;;

  hermes)
    HERMES_SNIPPET="$(cat <<YAML
mcp_servers:
  ${SERVER_NAME}:
    command: od
    args:
      - mcp
      - --daemon-url
      - "${DAEMON_URL}"
    env:
      OD_DAEMON_URL: "${DAEMON_URL}"
YAML
)"
    cat <<EOF
${BOLD}  Manual step required for Hermes.${RESET}
  Hermes config format is unverified, so this script refuses to write
  a guessed path. \`od mcp install hermes\` is print-only by design.

  Likely config path: ${HOME}/.hermes/config.yaml

  Paste this block into your Hermes MCP server configuration:

${HERMES_SNIPPET}
EOF
    if [ "$DRY_RUN" = "0" ]; then
      warn "--write-config is ignored for ${AGENT} (manual / unverified schema). The snippet above was printed; nothing was written."
    fi
    ;;

  vibe)
    VIBE_SNIPPET="$(cat <<TOML
[[mcp_servers]]
name = "${SERVER_NAME}"
command = "od"
args = ["mcp", "--daemon-url", "${DAEMON_URL}"]

[mcp_servers.env]
OD_DAEMON_URL = "${DAEMON_URL}"
TOML
)"
    cat <<EOF
${BOLD}  Manual step required for Mistral Vibe.${RESET}
  Vibe uses a TOML array-of-tables ([[mcp_servers]]); its exact schema
  is unverified, so this script refuses to write a guessed path.
  \`od mcp install vibe\` is print-only by design.

  Likely config path: ${HOME}/.vibe/config.toml

  Append this block to your Vibe config:

${VIBE_SNIPPET}
EOF
    if [ "$DRY_RUN" = "0" ]; then
      warn "--write-config is ignored for ${AGENT} (manual / unverified schema). The snippet above was printed; nothing was written."
    fi
    ;;
esac

# ---------------------------------------------------------------------------
# Daemon health check (advisory only — does not fail the install)
# ---------------------------------------------------------------------------
echo
check_daemon() {
  if ! command -v curl >/dev/null 2>&1; then
    step "curl not found; skipping daemon health check."
    return 0
  fi
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$DAEMON_URL/api/health" 2>/dev/null || true)
  code="${code:-000}"
  if [ "$code" = "200" ]; then
    ok "Daemon is healthy at $DAEMON_URL"
  else
    warn "Daemon not reachable at $DAEMON_URL (HTTP ${code})"
    step "Start it with: pnpm tools-dev run web"
    step "Or with Docker: bash deploy/scripts/install.sh"
  fi
}
check_daemon

# ---------------------------------------------------------------------------
# Next steps
# ---------------------------------------------------------------------------
echo
step "Next: open a new shell, run your agent (${AGENT}), and try:"
step "  > Use open-design to generate a landing page with the Linear design system"

