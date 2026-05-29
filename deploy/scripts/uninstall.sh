#!/usr/bin/env bash
# Open Design — Uninstaller
# Stops and removes the Docker Compose deployment
#
# Usage: ./uninstall.sh [--keep-data] [--non-interactive]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${DEPLOY_DIR}/.env"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.yml"
OVERRIDE_FILE="${DEPLOY_DIR}/docker-compose.override.yml"

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

prompt_text() {
  _prompt="$1" _default="$2"
  printf "%s [%s]: " "$_prompt" "$_default" >&2
  read -r _val
  PROMPT_RESULT="${_val:-$_default}"
}

prompt_confirm() {
  _question="$1" _default="$2"
  if [ "$NON_INTERACTIVE" = "1" ]; then
    return 0
  fi
  _yn_default="y"
  if [ "$_default" = "0" ]; then _yn_default="n"; fi
  printf "%s [%s]: " "$_question" "$_yn_default" >&2
  read -r _yn
  case "$_yn" in
    [Yy]*) return 0 ;;
    [Nn]*) return 1 ;;
    *) [ "$_default" = "1" ] && return 0; return 1 ;;
  esac
}

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

RUNTIME="${COMPOSE_CMD%% *}"

NON_INTERACTIVE=0
KEEP_DATA=0

for arg in "$@"; do
  case "$arg" in
    --non-interactive) NON_INTERACTIVE=1 ;;
    --keep-data)       KEEP_DATA=1 ;;
    --help|-h)
      echo "Usage: uninstall.sh [options]"
      echo "  --keep-data         Preserve the open_design_data volume"
      echo "  --non-interactive   Skip confirmation prompts"
      exit 0
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
printf "\n"
printf "${BOLD}  ┌──────────────────────────────────────┐${RESET}\n"
printf "${BOLD}  │${RESET}                                      ${BOLD}│${RESET}\n"
printf "${BOLD}  │${RESET}   ${CYAN}◈${RESET}  ${BOLD}Open Design${RESET}                     ${BOLD}│${RESET}\n"
printf "${BOLD}  │${RESET}      ${DIM}Uninstaller${RESET}                     ${BOLD}│${RESET}\n"
printf "${BOLD}  │${RESET}                                      ${BOLD}│${RESET}\n"
printf "${BOLD}  └──────────────────────────────────────┘${RESET}\n"
printf "\n"

# ---------------------------------------------------------------------------
# Find data volume (Compose prepends project name)
# ---------------------------------------------------------------------------
CONTAINER_NAME="${COMPOSE_CONTAINER_NAME:-open-design}"
VOLUME_BASE="${COMPOSE_VOLUME_NAME:-open_design_data}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-open-design}"

DATA_VOLUME=""
for _vol in "${PROJECT_NAME}_${VOLUME_BASE}" "${VOLUME_BASE}"; do
  if $RUNTIME volume inspect "$_vol" >/dev/null 2>&1; then
    DATA_VOLUME="$_vol"
    break
  fi
done

# ---------------------------------------------------------------------------
# Backup user data
# ---------------------------------------------------------------------------
BACKUP_DIR=""

_do_backup() {
  _dest="$1"
  mkdir -p "$_dest"

  step "Backing up user data to ${_dest}..."

  # Try container cp first (works if container exists, running or stopped)
  if $RUNTIME inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    $RUNTIME cp "$CONTAINER_NAME":/app/.od/. "$_dest/" 2>/dev/null
  fi

  # If container cp didn't work or container doesn't exist, use temp container
  if [ ! -f "${_dest}/app.sqlite" ] && [ -n "$DATA_VOLUME" ]; then
    _image="$($RUNTIME images -q | head -1)"
    if [ -n "$_image" ]; then
      $RUNTIME run --rm \
        -v "${DATA_VOLUME}:/source:ro" \
        -v "${_dest}:/backup" \
        --user root \
        "$_image" \
        sh -c "cp -r /source/. /backup/" 2>/dev/null || true
    fi
  fi

  if [ -f "${_dest}/app.sqlite" ] || [ -d "${_dest}/projects" ]; then
    ok "Backup saved to ${_dest}"
    ok "Contents: app database, projects, artifacts, media config"
  else
    warn "No user data found to back up."
    rm -rf "$_dest"
    BACKUP_DIR=""
  fi
}

if [ "$KEEP_DATA" = "0" ] && [ -n "$DATA_VOLUME" ]; then
  if [ "$NON_INTERACTIVE" = "0" ]; then
    _default_backup="${HOME}/open-design-backup-$(date +%Y%m%d%H%M%S)"
    prompt_text "Backup destination" "$_default_backup"
    BACKUP_DIR="$PROMPT_RESULT"
    _do_backup "$BACKUP_DIR"
  else
    BACKUP_DIR="${HOME}/open-design-backup-$(date +%Y%m%d%H%M%S)"
    _do_backup "$BACKUP_DIR"
  fi
fi

# ---------------------------------------------------------------------------
# Confirm destructive action
# ---------------------------------------------------------------------------
if [ "$NON_INTERACTIVE" = "0" ]; then
  printf "\n"
  warn "Everything will now be removed: containers, data volume, and config."
  printf "  Continue? [y/N]: "
  read -r _confirm
  case "$_confirm" in
    [Yy]*) ;;
    *) step "Cancelled."; exit 0 ;;
  esac
fi

# ---------------------------------------------------------------------------
# Stop and remove containers
# ---------------------------------------------------------------------------
if $COMPOSE_CMD "${COMPOSE_FILES[@]}" ps -q 2>/dev/null | grep -q .; then
  step "Stopping containers..."
  $COMPOSE_CMD "${COMPOSE_FILES[@]}" down
  ok "Containers stopped."
else
  # Try removing stopped container directly
  if $RUNTIME inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    step "Removing stopped container..."
    $RUNTIME rm -f "$CONTAINER_NAME" 2>/dev/null || true
  else
    step "No containers found."
  fi
fi

# Remove data volume (unless --keep-data)
if [ "$KEEP_DATA" = "0" ] && [ -n "$DATA_VOLUME" ]; then
  step "Removing data volume ${DATA_VOLUME}..."
  $RUNTIME volume rm "$DATA_VOLUME" >/dev/null 2>&1 || true
fi

# Remove systemd unit (Linux)
SYSTEMD_UNIT="${HOME}/.config/systemd/user/open-design.service"
if [ -f "$SYSTEMD_UNIT" ]; then
  step "Removing systemd unit..."
  systemctl --user disable --now open-design 2>/dev/null || true
  rm -f "$SYSTEMD_UNIT"
  systemctl --user daemon-reload
  ok "systemd unit removed."
fi

# Remove .env
if [ -f "$ENV_FILE" ]; then
  step "Removing ${ENV_FILE}..."
  rm -f "$ENV_FILE"
fi

printf "\n"
printf "${BOLD}${GREEN}  ── Uninstall Complete ────────────────────────────${RESET}\n"
printf "\n"
if [ "$KEEP_DATA" = "1" ]; then
  info "Data volume was preserved."
  step "Remove it manually: $RUNTIME volume rm $DATA_VOLUME"
elif [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
  info "Your data was backed up to: ${BACKUP_DIR}"
  step "To restore, copy contents into a new deployment's data volume."
fi
printf "\n"
