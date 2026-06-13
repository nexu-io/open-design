#!/usr/bin/env bash
# Open Design — Updater
# Pulls the latest image and restarts the service
#
# Usage: ./update.sh [--image <ref>] [--non-interactive]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.yml"
OVERRIDE_FILE="${DEPLOY_DIR}/docker-compose.override.yml"
HEALTH_TIMEOUT=60

COMPOSE_FILES=(-f "$COMPOSE_FILE")
if [ -f "$OVERRIDE_FILE" ]; then
  COMPOSE_FILES+=(-f "$OVERRIDE_FILE")
fi

# ---------------------------------------------------------------------------
# Colors & formatting
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
# Detect container runtime
# ---------------------------------------------------------------------------
COMPOSE_CMD=""
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
  COMPOSE_CMD="podman compose"
elif command -v podman >/dev/null 2>&1 && command -v podman-compose >/dev/null 2>&1; then
  COMPOSE_CMD="podman-compose"
elif command -v docker >/dev/null 2>&1 && command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  error "No container runtime found. Install Docker or Podman."
  exit 1
fi

OPT_IMAGE=""
NON_INTERACTIVE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --image) shift; OPT_IMAGE="$1" ;;
    --image=*) OPT_IMAGE="${1#--image=}" ;;
    --non-interactive) NON_INTERACTIVE=1 ;;
    --help|-h)
      echo "Usage: update.sh [options]"
      echo "  --image <ref>       Pull a specific image instead of latest"
      echo "  --non-interactive   Skip confirmation prompts"
      exit 0
      ;;
  esac
  shift
done

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
printf "\n"
printf "${BOLD}  ┌──────────────────────────────────────┐${RESET}\n"
printf "${BOLD}  │${RESET}                                      ${BOLD}│${RESET}\n"
printf "${BOLD}  │${RESET}   ${CYAN}◈${RESET}  ${BOLD}Open Design${RESET}                     ${BOLD}│${RESET}\n"
printf "${BOLD}  │${RESET}      ${DIM}Updater${RESET}                         ${BOLD}│${RESET}\n"
printf "${BOLD}  │${RESET}                                      ${BOLD}│${RESET}\n"
printf "${BOLD}  └──────────────────────────────────────┘${RESET}\n"
printf "\n"

# Read current port from .env if it exists
PORT=7456
ENV_FILE="${DEPLOY_DIR}/.env"
if [ -f "$ENV_FILE" ]; then
  _port="$(grep '^OPEN_DESIGN_PORT=' "$ENV_FILE" | cut -d= -f2)"
  if [ -n "$_port" ]; then PORT="$_port"; fi
fi

# Override image if specified
if [ -n "$OPT_IMAGE" ]; then
  export OPEN_DESIGN_IMAGE="$OPT_IMAGE"
fi

# Pull latest image
step "Pulling latest image..."
$COMPOSE_CMD "${COMPOSE_FILES[@]}" pull

# Restart with new image
step "Restarting service..."
$COMPOSE_CMD "${COMPOSE_FILES[@]}" up -d --no-build

# Health check
step "Waiting for health check (up to ${HEALTH_TIMEOUT}s)..."
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"
HEALTH_OK=0
ELAPSED=0

while [ "$ELAPSED" -lt "$HEALTH_TIMEOUT" ]; do
  if command -v curl >/dev/null 2>&1; then
    HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null || echo '000')"
  elif command -v wget >/dev/null 2>&1; then
    HTTP_CODE="$(wget -q -O /dev/null --server-response "$HEALTH_URL" 2>&1 | grep 'HTTP/' | tail -1 | awk '{print $2}')"
  else
    HTTP_CODE="000"
  fi

  if [ "$HTTP_CODE" = "200" ]; then
    HEALTH_OK=1
    break
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

if [ "$HEALTH_OK" = "1" ]; then
  ok "Update complete. Daemon is healthy."
else
  warn "Health check did not pass."
  step "Check logs: ${COMPOSE_CMD} \"${COMPOSE_FILES[@]}\" logs"
fi

# Clean up dangling images
step "Cleaning up old images..."
# shellcheck disable=SC2086
${COMPOSE_CMD%% *}$ image prune -f >/dev/null 2>&1 || true

printf "\n"
printf "${BOLD}${GREEN}  ── Update Complete ───────────────────────────────${RESET}\n"
printf "\n"
printf "  URL:          http://127.0.0.1:%s\n" "$PORT"
printf "\n"
