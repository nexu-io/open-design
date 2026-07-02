#!/usr/bin/env sh
# Open Design MCP installer wrapper.
#
# This file is served verbatim by the static landing page at:
#   https://open-design.ai/install.sh
#
# It intentionally delegates to the product-owned installer:
#   od mcp install <agent>
#
# Keeping the real installer in the daemon avoids duplicating the per-agent
# config planner in a hosted shell script. This wrapper exists so curl|sh no
# longer receives the landing-page HTML fallback, and so users get a clear
# error when the shell resolves /usr/bin/od or another non-Open-Design binary.

set -eu

usage() {
  cat <<'EOF'
Open Design MCP installer

Usage:
  curl -fsSL https://open-design.ai/install.sh | sh -s <agent> [options]

This is a thin hosted wrapper around:
  od mcp install <agent> [options]

Examples:
  curl -fsSL https://open-design.ai/install.sh | sh -s codex --print
  curl -fsSL https://open-design.ai/install.sh | sh -s cursor --write-config

Options are forwarded to `od mcp install`. For the complete option list:
  od mcp install --help
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

if [ "$#" -eq 0 ]; then
  printf '%s\n\n' "Open Design install.sh: missing required <agent> argument." >&2
  usage >&2
  exit 2
fi

if ! command -v od >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Open Design install.sh: `od` was not found on PATH.

Install and open the Open Design desktop app, or run the daemon from a source
checkout so the Open Design CLI is available, then re-run this command.
EOF
  exit 1
fi

od_probe="$(od mcp install --open-design-cli-probe 2>/dev/null || true)"
if [ "${od_probe}" != "open-design-cli:mcp-install:v1" ]; then
  od_path="$(command -v od || true)"
  cat >&2 <<EOF
Open Design install.sh: '${od_path}' does not look like the Open Design CLI.

On Linux and WSL2, /usr/bin/od is usually the coreutils octal-dump command and
can shadow Open Design's CLI. Put the Open Design CLI earlier on PATH, then
re-run this command.
EOF
  exit 1
fi

exec od mcp install "$@"
