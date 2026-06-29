#!/usr/bin/env bash
# Open Design — One-Click Installer
# Docker Compose wrapper for Linux and macOS
#
# Usage:
#   Clone this repo, then run:
#   ./install.sh [--non-interactive] [--port 7456] [--image <ref>] [--skip-docker-install] [--no-systemd]
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DEFAULT_PORT=7456
DEFAULT_IMAGE="ghcr.io/nexu-io/od:latest"
DEFAULT_MEM_LIMIT="384m"
HEALTH_TIMEOUT=60

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.yml"
OVERRIDE_FILE="${DEPLOY_DIR}/docker-compose.override.yml"

# Build the -f argument list: always include the base file,
# and add the override if it exists (used by tests for isolation).
COMPOSE_FILES=(-f "$COMPOSE_FILE")
if [ -f "$OVERRIDE_FILE" ]; then
  COMPOSE_FILES+=(-f "$OVERRIDE_FILE")
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "WARN: docker-compose.yml not found at ${COMPOSE_FILE}" >&2
  echo "       Clone the repository and run this script from deploy/scripts/." >&2
  exit 1
fi

ENV_FILE="${DEPLOY_DIR}/.env"

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
# Argument parsing
# ---------------------------------------------------------------------------
NON_INTERACTIVE=0
OPT_PORT=""
OPT_IMAGE=""
OPT_SKIP_DOCKER=0
OPT_NO_SYSTEMD=0

while [ $# -gt 0 ]; do
  case "$1" in
    --non-interactive) NON_INTERACTIVE=1 ;;
    --port) shift; OPT_PORT="$1" ;;
    --port=*) OPT_PORT="${1#--port=}" ;;
    --image) shift; OPT_IMAGE="$1" ;;
    --image=*) OPT_IMAGE="${1#--image=}" ;;
    --skip-docker-install) OPT_SKIP_DOCKER=1 ;;
    --no-systemd) OPT_NO_SYSTEMD=1 ;;
    --help|-h)
      echo "Usage: install.sh [options]"
      echo ""
      echo "Options:"
      echo "  --non-interactive       Use defaults for all prompts"
      echo "  --port <n>              Host port (default: ${DEFAULT_PORT})"
      echo "  --image <ref>           Docker image reference"
      echo "  --skip-docker-install   Do not attempt to install Docker"
      echo "  --no-systemd            Skip systemd unit creation"
      echo "  --help                  Show this help"
      exit 0
      ;;
    *)
      warn "Unknown argument: $1 (ignored)"
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
printf "${BOLD}  │${RESET}      ${DIM}One-Click Installer${RESET}             ${BOLD}│${RESET}\n"
printf "${BOLD}  │${RESET}                                      ${BOLD}│${RESET}\n"
printf "${BOLD}  └──────────────────────────────────────┘${RESET}\n"
printf "\n"

# ---------------------------------------------------------------------------
# 1. OS detection
# ---------------------------------------------------------------------------
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)
    if [ -f /etc/os-release ]; then
      # shellcheck disable=SC1091
      . /etc/os-release
      DISTRO="$ID"
      DISTRO_VERSION="$VERSION_ID"
    else
      DISTRO="unknown"
      DISTRO_VERSION=""
    fi
    step "OS: Linux ${DISTRO} ${DISTRO_VERSION} (${ARCH})"
    ;;
  Darwin)
    step "OS: macOS $(sw_vers -productVersion) (${ARCH})"
    DISTRO="macos"
    ;;
  *)
    error "Unsupported OS: ${OS}. This script supports Linux and macOS."
    exit 1
    ;;
esac

# ---------------------------------------------------------------------------
# 2. Container runtime detection (Docker or Podman)
# ---------------------------------------------------------------------------
CONTAINER_CMD=""
CONTAINER_RUNTIME=""

detect_container_runtime() {
  if command -v docker >/dev/null 2>&1; then
    CONTAINER_CMD="docker"
    CONTAINER_RUNTIME="docker"
    return 0
  fi
  if command -v podman >/dev/null 2>&1; then
    CONTAINER_CMD="podman"
    CONTAINER_RUNTIME="podman"
    return 0
  fi
  return 1
}

detect_compose() {
  if $CONTAINER_CMD compose version >/dev/null 2>&1; then
    COMPOSE_CMD="${CONTAINER_CMD} compose"
    return 0
  fi
  if [ "$CONTAINER_RUNTIME" = "podman" ] && command -v podman-compose >/dev/null 2>&1; then
    COMPOSE_CMD="podman-compose"
    return 0
  fi
  if [ "$CONTAINER_RUNTIME" = "docker" ] && command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
    return 0
  fi
  return 1
}

check_runtime_running() {
  $CONTAINER_CMD info >/dev/null 2>&1
}

if ! detect_container_runtime; then
  if [ "$OPT_SKIP_DOCKER" = "1" ]; then
    error "No container runtime found (Docker or Podman) and --skip-docker-install was set."
    exit 1
  fi

  warn "No container runtime found (Docker or Podman)."

  case "$DISTRO" in
    ubuntu|debian)
      install_cmd="sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin"
      step "Install Docker with: ${install_cmd}"
      step "Or Podman: sudo apt-get install -y podman podman-compose"
      ;;
    fedora)
      install_cmd="sudo dnf install -y docker docker-compose-plugin"
      step "Install Docker with: ${install_cmd}"
      step "Or Podman: sudo dnf install -y podman podman-compose"
      ;;
    centos|rhel|rocky|alma)
      install_cmd="sudo yum install -y docker docker-compose-plugin"
      step "Install Docker with: ${install_cmd}"
      step "Or Podman: sudo yum install -y podman podman-compose"
      ;;
    macos)
      install_cmd="brew install --cask docker"
      step "Install Docker with: ${install_cmd}"
      step "Or Podman: brew install podman && podman machine init && podman machine start"
      ;;
    *)
      error "Cannot auto-detect install method for: ${DISTRO}"
      step "Install Docker: https://docs.docker.com/get-docker/"
      step "Or Podman: https://podman.io/getting-started/installation"
      exit 1
      ;;
  esac

  if [ "$NON_INTERACTIVE" = "0" ]; then
    if prompt_confirm "Install Docker now?" 0; then
      step "Running: ${install_cmd}"
      eval "$install_cmd"
      if ! detect_container_runtime; then
        error "Installation did not succeed. Install manually and re-run."
        exit 1
      fi
    else
      error "A container runtime is required. Install Docker or Podman and re-run."
      exit 1
    fi
  else
    error "A container runtime is required in non-interactive mode. Install Docker or Podman first."
    exit 1
  fi
fi

if ! detect_compose; then
  error "Container Compose is not available."
  if [ "$CONTAINER_RUNTIME" = "podman" ]; then
    case "$OS" in
      Darwin) step "Install with: brew install podman-compose" ;;
      *)      step "Install with: sudo apt-get install podman-compose (or equivalent for your distro)" ;;
    esac
  else
    step "Install the compose plugin: https://docs.docker.com/compose/install/"
  fi
  exit 1
fi

if ! check_runtime_running; then
  warn "${CONTAINER_RUNTIME} is not running."
  case "$DISTRO" in
    ubuntu|debian|fedora|centos|rhel|rocky|alma)
      if [ "$CONTAINER_RUNTIME" = "podman" ]; then
        step "Start with: podman machine init && podman machine start"
      else
        step "Start with: sudo systemctl start docker"
      fi
      ;;
    macos)
      if [ "$CONTAINER_RUNTIME" = "podman" ]; then
        step "Start with: podman machine start"
      else
        step "Open Docker Desktop from your Applications folder."
      fi
      ;;
  esac
  if [ "$NON_INTERACTIVE" = "0" ]; then
    if prompt_confirm "Retry after starting ${CONTAINER_RUNTIME}?" 1; then
      if ! check_runtime_running; then
        error "${CONTAINER_RUNTIME} is still not running. Start it and re-run."
        exit 1
      fi
    else
      exit 1
    fi
  else
    exit 1
  fi
fi

RUNTIME_VERSION="$(${CONTAINER_CMD} --version 2>/dev/null || echo 'unknown')"
COMPOSE_VERSION="$(${COMPOSE_CMD} version 2>/dev/null || echo 'unknown')"
step "Runtime: ${CONTAINER_RUNTIME} ${RUNTIME_VERSION}"
step "Compose: ${COMPOSE_VERSION}"

# ---------------------------------------------------------------------------
# 2b. Check if Open Design is already running
# ---------------------------------------------------------------------------
if $CONTAINER_CMD ps --filter "name=open-design" --format '{{.Names}}' 2>/dev/null | grep -q 'open-design'; then
  STATUS="$($CONTAINER_CMD inspect --format '{{.State.Status}}' open-design 2>/dev/null || echo 'unknown')"
  IMAGE="$($CONTAINER_CMD inspect --format '{{.Config.Image}}' open-design 2>/dev/null || echo 'unknown')"
  PORTS="$($CONTAINER_CMD port open-design 2>/dev/null || echo 'unknown')"

  error "Open Design is already running."
  printf "\n"
  printf "  Container:  open-design\n"
  printf "  Status:     %s\n" "$STATUS"
  printf "  Image:      %s\n" "$IMAGE"
  printf "  Ports:      %s\n" "$PORTS"
  printf "\n"
  step "To update:  ${SCRIPT_DIR}/update.sh"
  step "To remove:  ${SCRIPT_DIR}/uninstall.sh"
  printf "\n"
  exit 1
fi

# ---------------------------------------------------------------------------
# 3. Port conflict detection
# ---------------------------------------------------------------------------
PORT="${OPT_PORT:-$DEFAULT_PORT}"

check_port_in_use() {
  if command -v ss >/dev/null 2>&1; then
    ss -tlnp 2>/dev/null | grep -q ":${1} " && return 0
  elif command -v lsof >/dev/null 2>&1; then
    lsof -i :"$1" 2>/dev/null | grep -q LISTEN && return 0
  fi
  return 1
}

if check_port_in_use "$PORT"; then
  warn "Port ${PORT} is already in use."
  if [ "$NON_INTERACTIVE" = "0" ]; then
    _suggest=$((PORT + 1))
    prompt_text "Enter a different port" "$_suggest"
    PORT="$PROMPT_RESULT"
    if check_port_in_use "$PORT"; then
      error "Port ${PORT} is also in use. Please pick a free port."
      exit 1
    fi
  else
    error "Port ${PORT} is occupied. Use --port to specify a different one."
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# 4. Interactive prompts
# ---------------------------------------------------------------------------
IMAGE="${OPT_IMAGE:-$DEFAULT_IMAGE}"
ALLOWED_ORIGINS=""
MEM_LIMIT="$DEFAULT_MEM_LIMIT"

if [ "$NON_INTERACTIVE" = "0" ]; then
  printf "\n"
  prompt_text "Docker image" "$DEFAULT_IMAGE"
  IMAGE="$PROMPT_RESULT"

  prompt_text "Port" "$PORT"
  PORT="$PROMPT_RESULT"

  prompt_text "Allowed origins (CORS, comma-separated, or empty)" ""
  ALLOWED_ORIGINS="$PROMPT_RESULT"

  prompt_text "Memory limit" "$DEFAULT_MEM_LIMIT"
  MEM_LIMIT="$PROMPT_RESULT"

  if check_port_in_use "$PORT"; then
    error "Port ${PORT} is already in use. Aborting."
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# 5. Generate .env
# ---------------------------------------------------------------------------
if [ -f "$ENV_FILE" ]; then
  BACKUP="${ENV_FILE}.$(date +%Y%m%d%H%M%S).bak"
  step "Existing .env found. Backing up to ${BACKUP}"
  cp "$ENV_FILE" "$BACKUP"
fi

GENERATED_TOKEN=$(openssl rand -hex 32 2>/dev/null || od -vAn -N32 -tx1 /dev/urandom | tr -d ' \n' 2>/dev/null)

cat > "$ENV_FILE" << ENVFILE
# Generated by install.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
OPEN_DESIGN_IMAGE=${IMAGE}
OPEN_DESIGN_PORT=${PORT}
OPEN_DESIGN_ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
OPEN_DESIGN_MEM_LIMIT=${MEM_LIMIT}
NODE_OPTIONS=--max-old-space-size=192
OD_API_TOKEN=${GENERATED_TOKEN}
ENVFILE

ok "Written ${ENV_FILE}"

# ---------------------------------------------------------------------------
# 6. Pull and start
# ---------------------------------------------------------------------------
step "Pulling image: ${IMAGE}"
$COMPOSE_CMD "${COMPOSE_FILES[@]}" pull

step "Starting Open Design..."
$COMPOSE_CMD "${COMPOSE_FILES[@]}" up -d --no-build

# ---------------------------------------------------------------------------
# 7. Health check
# ---------------------------------------------------------------------------
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
  ok "Daemon is healthy (${HTTP_CODE} OK)"
else
  warn "Health check did not pass within ${HEALTH_TIMEOUT}s."
  step "Check status: ${COMPOSE_CMD} \"${COMPOSE_FILES[@]}\" logs"
fi

# ---------------------------------------------------------------------------
# 8. systemd unit (Linux only)
# ---------------------------------------------------------------------------
if [ "$OS" = "Linux" ] && [ "$OPT_NO_SYSTEMD" = "0" ]; then
  if command -v systemctl >/dev/null 2>&1; then
    SYSTEMD_DIR="${HOME}/.config/systemd/user"
    SYSTEMD_UNIT="${SYSTEMD_DIR}/open-design.service"

    mkdir -p "$SYSTEMD_DIR"

    CONTAINER_BIN="$(command -v "$CONTAINER_CMD")"

    {
      echo "[Unit]"
      echo "Description=Open Design daemon (${CONTAINER_RUNTIME} Compose)"
      if [ "$CONTAINER_RUNTIME" = "docker" ]; then
        echo "After=${CONTAINER_RUNTIME}.service"
        echo "Requires=${CONTAINER_RUNTIME}.service"
      fi
      echo ""
      echo "[Service]"
      echo "Type=oneshot"
      echo "RemainAfterExit=yes"
      echo "WorkingDirectory=${DEPLOY_DIR}"
      if [ -f "$OVERRIDE_FILE" ]; then
        echo "ExecStart=${CONTAINER_BIN} compose -f ${COMPOSE_FILE} -f ${OVERRIDE_FILE} up -d --no-build"
        echo "ExecStop=${CONTAINER_BIN} compose -f ${COMPOSE_FILE} -f ${OVERRIDE_FILE} down"
      else
        echo "ExecStart=${CONTAINER_BIN} compose -f ${COMPOSE_FILE} up -d --no-build"
        echo "ExecStop=${CONTAINER_BIN} compose -f ${COMPOSE_FILE} down"
      fi
      echo "TimeoutStartSec=120"
      echo ""
      echo "[Install]"
      echo "WantedBy=default.target"
    } > "$SYSTEMD_UNIT"

    systemctl --user daemon-reload
    systemctl --user enable open-design 2>/dev/null || true
    ok "systemd unit installed: open-design.service"
    step "Manage with: systemctl --user start|stop|status open-design"
  else
    warn "systemd not found. Skipping service installation."
  fi
fi

# ---------------------------------------------------------------------------
# 9. Summary
# ---------------------------------------------------------------------------
printf "\n"
printf "${BOLD}${GREEN}  ── Installation Complete ──────────────────────────${RESET}\n"
printf "\n"
printf "  URL:          http://127.0.0.1:%s\n" "$PORT"
printf "  Image:        %s\n" "$IMAGE"
printf "  Data volume:  open_design_data\n"
printf "  Config:       %s\n" "$ENV_FILE"
if [ "$OS" = "Linux" ] && [ -f "${HOME}/.config/systemd/user/open-design.service" ]; then
  printf "  Service:      systemd (open-design.service)\n"
fi
printf "\n"
printf "  Next steps:\n"
printf "    Update:    %s/update.sh\n" "$SCRIPT_DIR"
printf "    Uninstall: %s/uninstall.sh\n" "$SCRIPT_DIR"
printf "    Logs:      %s logs -f\n" "$COMPOSE_CMD"
printf "\n"
printf "  Open http://127.0.0.1:%s in your browser\n\n" "$PORT"
