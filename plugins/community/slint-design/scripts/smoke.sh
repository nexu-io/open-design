#!/usr/bin/env bash
# Smoke: slint-viewer --check on plugin examples and templates.
# Primary acceptance runtime for the skill is OpenCode under OpenDesign;
# this script only validates .slint compile diagnostics.
# Optional: when viewer supports --size (1.18+), also write temp multi-size
# screenshots (best-effort; never fails the smoke on 1.17).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VIEWER="${SLINT_VIEWER:-slint-viewer}"

if [[ "$VIEWER" == /* ]]; then
  if [[ ! -x "$VIEWER" ]]; then
    echo "error: SLINT_VIEWER not executable: $VIEWER" >&2
    exit 127
  fi
elif ! command -v "$VIEWER" >/dev/null 2>&1; then
  echo "error: slint-viewer not found on PATH (set SLINT_VIEWER=...)" >&2
  exit 127
fi

echo "==> $($VIEWER --version 2>/dev/null || echo unknown)"

files=(
  "$ROOT/examples/hello-window.slint"
  "$ROOT/templates/desktop-window/ui.slint"
  "$ROOT/templates/settings-form/ui.slint"
)

failed=0
for f in "${files[@]}"; do
  echo "==> --check $f"
  if ! "$VIEWER" --check "$f"; then
    echo "FAIL: $f" >&2
    failed=1
  else
    echo "OK: $f"
  fi
done

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi

# Best-effort multi-size screenshots when --size exists (1.18+).
# Do not fail smoke on 1.17 or screenshot errors.
EXAMPLE="$ROOT/examples/hello-window.slint"
if "$VIEWER" --help 2>&1 | grep -q -- '--size'; then
  tmp_root="${TMPDIR:-/tmp}"
  tmp_root="${tmp_root%/}"
  tmpdir="$(mktemp -d "${tmp_root}/slint-design-smoke.XXXXXX")"
  # shellcheck disable=SC2064
  trap 'rm -rf "$tmpdir"' EXIT
  echo "==> --size supported; writing temp screenshots under $tmpdir"
  for size in 1280x800 390x844; do
    out="$tmpdir/hello-window-${size}.png"
    if "$VIEWER" --screenshot "$out" --size "$size" "$EXAMPLE"; then
      echo "OK: screenshot $size -> $out"
    else
      echo "WARN: screenshot $size failed (ignored)" >&2
    fi
  done
else
  echo "==> --size not available (viewer < 1.18); skipping multi-size screenshots"
fi

echo "All smoke checks passed."
