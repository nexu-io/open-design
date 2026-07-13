#!/usr/bin/env bash
# Validate a user-supplied DESIGN.md (Open Design "design system" submission).
# Usage: validate-design-system.sh <DESIGN.md path> [--reference <existing-DESIGN.md>]
#
# Strategy: instead of hardcoding a schema, we read 1-3 existing DESIGN.md files
# from the OD repo at runtime to learn which top-level sections are conventional,
# then check the new file has at least those sections (case-insensitive H1/H2 match).
#
# Heuristic-only: warns rather than fails on missing optional sections; only fails
# when the file is empty, unparseable, or has zero structural overlap with samples.

set -uo pipefail
source "$(dirname "$0")/config.sh"

NEW_FILE="${1:?DESIGN.md path required}"
shift || true

REFERENCE_FILES=()
while (($#)); do
  case "$1" in
    --reference) REFERENCE_FILES+=("$2"); shift 2 ;;
    *) od::die "unknown flag: $1" ;;
  esac
done

[[ -f "$NEW_FILE" ]] || od::die "not a file: $NEW_FILE"
[[ -s "$NEW_FILE" ]] || od::die "file is empty: $NEW_FILE"

extract_headings() {
  # Pull H1/H2 lines, lowercase, trim, dedupe.
  awk '/^#{1,2}[[:space:]]+/ { sub(/^#{1,2}[[:space:]]+/, ""); print tolower($0) }' "$1" \
    | sed -E 's/[[:space:]]+$//' | sort -u
}

new_headings="$(extract_headings "$NEW_FILE")"
[[ -n "$new_headings" ]] || { printf 'FAIL  no H1/H2 headings found in %s — is this really a design system doc?\n' "$NEW_FILE"; printf 'RESULT=fail\n'; exit 1; }

# If references were supplied, build the union of their headings as the "expected" set.
EXPECTED=""
for ref in "${REFERENCE_FILES[@]}"; do
  [[ -f "$ref" ]] || continue
  EXPECTED+=$'\n'"$(extract_headings "$ref")"
done
EXPECTED="$(printf '%s' "$EXPECTED" | grep -v '^$' | sort -u || true)"

PASS=0
WARN=0
FAIL=0

if [[ -z "$EXPECTED" ]]; then
  printf 'WARN  no reference DESIGN.md provided — running structure-only checks\n'
  WARN=$((WARN+1))
else
  # Count overlap. >= 30% structural overlap = looks like a design system.
  overlap=0
  total=0
  while IFS= read -r h; do
    [[ -z "$h" ]] && continue
    total=$((total+1))
    if printf '%s\n' "$new_headings" | grep -Fxq "$h"; then
      overlap=$((overlap+1))
    fi
  done <<< "$EXPECTED"

  if [[ "$total" -eq 0 ]]; then
    printf 'WARN  references parsed but had no headings\n'; WARN=$((WARN+1))
  else
    pct=$(( overlap * 100 / total ))
    if [[ "$pct" -ge 30 ]]; then
      printf 'PASS  structural overlap with reference DESIGN.md files: %d%% (%d/%d)\n' "$pct" "$overlap" "$total"
      PASS=$((PASS+1))
    else
      printf 'FAIL  structural overlap with reference DESIGN.md files only %d%% (%d/%d) — likely missing required sections\n' "$pct" "$overlap" "$total"
      FAIL=$((FAIL+1))
    fi
  fi
fi

# Always-on lightweight checks:
if grep -qE '^(#)[[:space:]]+' "$NEW_FILE"; then
  printf 'PASS  has at least one H1 heading\n'; PASS=$((PASS+1))
else
  printf 'WARN  no H1 heading found — convention is one H1 with the brand/system name\n'; WARN=$((WARN+1))
fi

# No relative path escape (../).
if grep -nE '\(\.\./' "$NEW_FILE" >/dev/null; then
  printf 'WARN  contains ../ relative paths — make sure they resolve once placed at design-systems/<brand>/DESIGN.md\n'; WARN=$((WARN+1))
fi

if [[ "$FAIL" -eq 0 ]]; then
  printf 'RESULT=pass (passes=%d warns=%d)\n' "$PASS" "$WARN"
  exit 0
else
  printf 'RESULT=fail (passes=%d warns=%d fails=%d)\n' "$PASS" "$WARN" "$FAIL"
  exit 1
fi
