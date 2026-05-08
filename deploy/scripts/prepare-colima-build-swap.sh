#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-ensure}"
SWAP_SIZE="${COLIMA_BUILD_SWAP_SIZE:-4G}"
SWAP_FILE="${COLIMA_BUILD_SWAPFILE:-/swapfile-colima-build}"
LEGACY_SWAP_FILE="/swapfile-open-design-build"
MEMORY_THRESHOLD_KIB="${COLIMA_BUILD_SWAP_MEMORY_THRESHOLD_KIB:-4194304}"

log() {
  printf '[prepare-colima-build-swap] %s\n' "$*" >&2
}

die() {
  printf '[prepare-colima-build-swap] ERROR: %s\n' "$*" >&2
  exit 1
}

host_os() {
  uname -s
}

host_arch() {
  uname -m
}

require_apple_silicon_macos() {
  [[ "$(host_os)" == "Darwin" && "$(host_arch)" == "arm64" ]] || die "prepare-colima-build-swap requires Apple Silicon macOS"
}

resolve_colima_bin() {
  if [[ -n "${COLIMA_BIN:-}" ]]; then
    printf '%s' "$COLIMA_BIN"
    return 0
  fi

  if [[ "$(host_arch)" == "arm64" && -x /opt/homebrew/bin/colima ]]; then
    printf '%s' /opt/homebrew/bin/colima
    return 0
  fi

  command -v colima 2>/dev/null || true
}

usage() {
  cat <<'EOF'
Usage:
  prepare-colima-build-swap.sh [ensure|status|cleanup]

Commands:
  ensure   Create and enable a Colima VM swap file if memory is low. Default.
  status   Print Colima VM memory/swap status.
  cleanup  Disable and remove the swap file created by this script.

Environment:
  COLIMA_BUILD_SWAP_SIZE=4G
  COLIMA_BUILD_SWAPFILE=/swapfile-colima-build
  COLIMA_BUILD_SWAP_MEMORY_THRESHOLD_KIB=4194304
  COLIMA_BIN=/opt/homebrew/bin/colima

Run this before manual multi-arch Docker publishing on Apple Silicon Colima:
  prepare-colima-build-swap.sh
  <your docker buildx / image publish command>
  prepare-colima-build-swap.sh cleanup
EOF
}

require_colima() {
  local colima_bin="$1"
  [[ -n "$colima_bin" ]] || die "colima not found; install Colima or set COLIMA_BIN"
  "$colima_bin" status >/dev/null || die "Colima is not running"
}

vm_status() {
  local colima_bin="$1"
  "$colima_bin" ssh -- sh -lc '
    set -e
    awk "/^MemTotal:|^SwapTotal:/ { print }" /proc/meminfo
    swapon --show || true
  '
}

ensure_swap() {
  local colima_bin="$1"
  local memory_total_kib
  local swap_total_kib

  memory_total_kib="$("$colima_bin" ssh -- awk '/^MemTotal:/ { print $2; exit }' /proc/meminfo)"
  swap_total_kib="$("$colima_bin" ssh -- awk '/^SwapTotal:/ { print $2; exit }' /proc/meminfo)"

  [[ "$memory_total_kib" =~ ^[0-9]+$ ]] || die "failed to read Colima MemTotal"
  [[ "$swap_total_kib" =~ ^[0-9]+$ ]] || die "failed to read Colima SwapTotal"

  if (( 10#$swap_total_kib > 0 )); then
    log "Colima already has swap (${swap_total_kib}KiB); no changes made"
    vm_status "$colima_bin"
    return 0
  fi

  if (( 10#$memory_total_kib >= 10#$MEMORY_THRESHOLD_KIB )); then
    log "Colima memory is ${memory_total_kib}KiB, at or above threshold ${MEMORY_THRESHOLD_KIB}KiB; no swap needed"
    vm_status "$colima_bin"
    return 0
  fi

  log "enabling $SWAP_SIZE swap at $SWAP_FILE for low-memory Colima (${memory_total_kib}KiB RAM)"
  "$colima_bin" ssh -- sh -lc "
    set -e
    swapfile='$SWAP_FILE'
    if ! swapon --show=NAME --noheadings | grep -qx \"\$swapfile\"; then
      if [ ! -f \"\$swapfile\" ]; then
        sudo fallocate -l '$SWAP_SIZE' \"\$swapfile\" 2>/dev/null || sudo dd if=/dev/zero of=\"\$swapfile\" bs=1M count=4096 status=progress
        sudo chmod 600 \"\$swapfile\"
        sudo mkswap \"\$swapfile\" >/dev/null
      fi
      sudo swapon \"\$swapfile\"
    fi
  "
  vm_status "$colima_bin"
}

cleanup_swap() {
  local colima_bin="$1"

  log "removing swap file $SWAP_FILE from Colima if present"
  "$colima_bin" ssh -- sh -lc "
    set -e
    for swapfile in '$SWAP_FILE' '$LEGACY_SWAP_FILE'; do
      if swapon --show=NAME --noheadings | grep -qx \"\$swapfile\"; then
        sudo swapoff \"\$swapfile\"
      fi
      sudo rm -f \"\$swapfile\"
    done
  "
  vm_status "$colima_bin"
}

case "$ACTION" in
  -h|--help|help)
    usage
    exit 0
    ;;
  ensure|status|cleanup)
    ;;
  *)
    usage >&2
    die "unknown command: $ACTION"
    ;;
esac

require_apple_silicon_macos
COLIMA_BIN_RESOLVED="$(resolve_colima_bin)"
require_colima "$COLIMA_BIN_RESOLVED"

case "$ACTION" in
  ensure)
    ensure_swap "$COLIMA_BIN_RESOLVED"
    ;;
  status)
    vm_status "$COLIMA_BIN_RESOLVED"
    ;;
  cleanup)
    cleanup_swap "$COLIMA_BIN_RESOLVED"
    ;;
esac
