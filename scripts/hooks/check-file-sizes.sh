#!/usr/bin/env bash
# Configurable file size enforcement hook — block oversized scripts before commit
# Distributed by dev-infra (https://github.com/STEALTHTEMP1/dev-infra)
#
# Usage as pre-commit hook:
#   Add to .pre-commit-config.yaml:
#     - repo: local
#       hooks:
#         - id: check-file-sizes
#           name: Check file sizes
#           entry: scripts/hooks/check-file-sizes.sh
#           language: script
#           pass_filenames: false
#
# Configuration:
#   DEFAULT_LIMIT  — max lines for normal files (default: 500)
#   EXTENSIONS     — file extensions to check (default: "sh mjs js")
#   ALLOWLIST      — override per-file caps, format: "path:cap" per line
#
# Customize by editing the variables below or setting env vars.
set -euo pipefail

# --- Configuration (edit these for your project) ---
LIMIT="${CHECK_FILE_SIZES_LIMIT:-500}"
EXTENSIONS="${CHECK_FILE_SIZES_EXTENSIONS:-sh mjs js}"

# Per-file overrides — add entries as "relative/path:cap"
# Example: ALLOWLIST=("src/big-module.js:800" "scripts/legacy.sh:600")
ALLOWLIST=(
  # "scripts/lib/example.sh:600"
)
# --- End configuration ---

FOUND=0

# Build extension pattern for case matching
get_cap() {
  local file="$1"
  local entry
  for entry in "${ALLOWLIST[@]}"; do
    if [ "${entry%%:*}" = "$file" ]; then
      echo "${entry##*:}"
      return
    fi
  done
  echo ""
}

matches_extension() {
  local file="$1"
  local ext
  for ext in $EXTENSIONS; do
    case "$file" in
      *."$ext") return 0 ;;
    esac
  done
  return 1
}

staged_files=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)

if [ -z "$staged_files" ]; then
  exit 0
fi

while IFS= read -r file; do
  matches_extension "$file" || continue

  # Skip vendored / minified files
  case "$file" in
    node_modules/* | vendor/* | *.min.*) continue ;;
  esac

  [ -f "$file" ] || continue

  lines=$(wc -l <"$file" | tr -d ' ')
  cap=$(get_cap "$file")

  if [ -n "$cap" ]; then
    if [ "$lines" -gt "$cap" ]; then
      echo "ERROR: $file is $lines lines (cap: $cap)" >&2
      FOUND=1
    fi
  else
    if [ "$lines" -gt "$LIMIT" ]; then
      echo "ERROR: $file is $lines lines (limit: $LIMIT)" >&2
      FOUND=1
    fi
  fi
done <<<"$staged_files"

exit "$FOUND"
