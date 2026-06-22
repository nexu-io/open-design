#!/usr/bin/env bash
# html-ppt :: render.sh — managed Chromium screenshot(s)
#
# Usage:
#   render.sh <html-file>                     # one PNG, slide 1
#   render.sh <html-file> <N>                 # N PNGs, slides 1..N, via #/k
#   render.sh <html-file> all                 # autodetect .slide count
#   render.sh <html-file> <N> <out-dir>       # custom output dir
#
# Uses Playwright's managed Chromium. Do not fall back to the user's installed
# Google Chrome on macOS; Crashpad/profile permissions can abort it inside the
# Open Design desktop sandbox.

set -euo pipefail

PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.60.0}"

FILE="${1:-}"
if [[ -z "$FILE" ]]; then
  echo "usage: render.sh <html> [N|all] [out-dir]" >&2
  exit 1
fi
if [[ ! -f "$FILE" ]]; then
  echo "error: $FILE not found" >&2
  exit 1
fi

COUNT="${2:-1}"
OUT="${3:-}"

ABS="$(cd "$(dirname "$FILE")" && pwd)/$(basename "$FILE")"
STEM="$(basename "${FILE%.*}")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT_DIR="$(dirname "$ABS")"

find_upward_playwright() {
  local start dir
  for start in "$@"; do
    [[ -n "$start" ]] || continue
    dir="$(cd "$start" 2>/dev/null && pwd)" || continue
    while [[ "$dir" != "/" ]]; do
      if [[ -x "$dir/node_modules/.bin/playwright" ]]; then
        printf '%s\n' "$dir/node_modules/.bin/playwright"
        return 0
      fi
      dir="$(dirname "$dir")"
    done
  done
  return 1
}

run_playwright() {
  if [[ -n "${PLAYWRIGHT_CLI:-}" ]]; then
    "$PLAYWRIGHT_CLI" "$@"
    return $?
  fi

  local local_playwright
  if local_playwright="$(find_upward_playwright "$SCRIPT_DIR" "$INPUT_DIR")"; then
    "$local_playwright" "$@"
    return $?
  fi

  npx --yes "playwright@${PLAYWRIGHT_VERSION}" "$@"
}

ensure_managed_chromium() {
  if ! run_playwright install chromium; then
    echo "error: failed to install Playwright managed Chromium; cannot render PNG export" >&2
    exit 1
  fi
}

if [[ "$COUNT" == "all" ]]; then
  COUNT="$(grep -c 'class="slide"' "$FILE" || true)"
  [[ -z "$COUNT" || "$COUNT" -lt 1 ]] && COUNT=1
fi

if [[ -z "$OUT" ]]; then
  if [[ "$COUNT" -gt 1 ]]; then
    OUT="$(dirname "$FILE")/${STEM}-png"
    mkdir -p "$OUT"
  fi
fi

ensure_managed_chromium

render_one() {
  local url="$1" target="$2"
  if ! run_playwright screenshot \
    --browser chromium \
    --viewport-size=1920,1080 \
    --wait-for-timeout=4000 \
    "$url" \
    "$target"; then
    echo "error: managed Chromium screenshot failed; not retrying and not falling back to system Google Chrome" >&2
    exit 1
  fi
  echo "  ✔ $target"
}

if [[ "$COUNT" == "1" ]]; then
  OUT_FILE="${OUT:-$(dirname "$FILE")/${STEM}.png}"
  render_one "file://$ABS" "$OUT_FILE"
else
  for i in $(seq 1 "$COUNT"); do
    render_one "file://$ABS#/$i" "$OUT/${STEM}_$(printf '%02d' "$i").png"
  done
fi

echo "done: rendered $COUNT slide(s) from $FILE"
