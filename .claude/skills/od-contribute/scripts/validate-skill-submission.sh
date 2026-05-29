#!/usr/bin/env bash
# Validate a user-supplied OD skill folder before staging it for PR.
# Usage: validate-skill-submission.sh <skill-folder>
# Checks (each prints PASS/FAIL line on stdout):
#   - SKILL.md exists
#   - SKILL.md has frontmatter with `name` and `description`
#   - `name` matches folder name (warn-only, since OD may rename on merge)
#   - all relative paths in SKILL.md resolve to files inside the folder
#   - no path escapes the skill folder (../ in references)
# Exit 0 = all PASS or only warnings. Exit 1 = at least one FAIL.

set -uo pipefail
source "$(dirname "$0")/config.sh"

SKILL_DIR="${1:?skill folder path required}"
[[ -d "$SKILL_DIR" ]] || od::die "not a directory: $SKILL_DIR"

ABS_SKILL_DIR="$(cd "$SKILL_DIR" && pwd -P)"
FAIL=0

pass() { printf 'PASS  %s\n' "$1"; }
warn() { printf 'WARN  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAIL=1; }

SKILL_MD="$ABS_SKILL_DIR/SKILL.md"
if [[ ! -f "$SKILL_MD" ]]; then
  fail "SKILL.md missing — every OD skill folder must contain SKILL.md at its root"
  printf 'RESULT=%s\n' "fail"
  exit 1
fi
pass "SKILL.md exists"

# Frontmatter parse: extract YAML between the first two '---' lines.
#
# The opening fence MUST be on line 1 — both Claude Code's loader and Codex
# CLI's loader (codex-rs/core-skills) parse the top of the file, so a SKILL.md
# that starts with prose, a BOM, or whitespace and only contains a `---` block
# later will load as having no frontmatter, even if this validator picks it up.
# Reject leading content explicitly so the validator can't pass a file the
# real loaders will reject.
FIRST_LINE="$(head -n 1 "$SKILL_MD")"
if [[ ! "$FIRST_LINE" =~ ^---[[:space:]]*$ ]]; then
  fail "SKILL.md must start with a YAML frontmatter fence ('---') on line 1 — found: $(printf '%q' "$FIRST_LINE" | head -c 80)"
  printf 'RESULT=%s\n' "fail"
  exit 1
fi

FRONT=$(awk '
  BEGIN { in_fm=0; fence=0 }
  /^---[[:space:]]*$/ {
    fence++
    if (fence==1) { in_fm=1; next }
    if (fence==2) { exit }
  }
  in_fm { print }
' "$SKILL_MD")

if [[ -z "$FRONT" ]]; then
  fail "SKILL.md has a leading '---' but no closing fence or empty frontmatter"
else
  pass "SKILL.md frontmatter present"

  name_line="$(printf '%s' "$FRONT" | grep -E '^name:' | head -1 || true)"
  desc_line="$(printf '%s' "$FRONT" | grep -E '^description:' | head -1 || true)"
  [[ -n "$name_line" ]] && pass "frontmatter has 'name'" || fail "frontmatter missing 'name:'"
  [[ -n "$desc_line" ]] && pass "frontmatter has 'description'" || fail "frontmatter missing 'description:'"

  # Sanity: name should look like a slug.
  fm_name="$(printf '%s' "$name_line" | sed -E 's/^name:[[:space:]]*//; s/^["'\''"]//; s/["'\''"]$//')"
  folder_name="$(basename "$ABS_SKILL_DIR")"
  if [[ -n "$fm_name" && "$fm_name" != "$folder_name" ]]; then
    warn "frontmatter name '$fm_name' differs from folder name '$folder_name' (maintainer may rename — OK)"
  fi
fi

# Relative path scan: every non-URL, non-anchor markdown link target must
# resolve inside the skill folder.
#
# We extract ALL markdown links (`[label](target)`) and filter out URLs and
# anchors here, rather than only matching dot-prefixed paths in the regex.
# Plain intra-skill references like `[ref](references/foo.md)` or
# `[script](scripts/run.sh)` are common and must be validated too — the
# contract for SKILL.md says every relative path resolves on disk, regardless
# of whether the author wrote `./references/foo.md` or `references/foo.md`.
# A narrower `\(\.{1,2}/...\)` pattern would silently let bare paths through.
BAD_REFS=0
ESCAPE=0
# Lexical escape check: count path segments and ensure no prefix walks above
# the skill root. We do this on the literal target rather than from `cd … &&
# pwd -P` so that a missing intermediate directory (which is itself a fail
# we want to report) doesn't masquerade as an escape.
escapes_root() {
  local p="$1" depth=0 seg
  # Strip a leading "./" if present.
  p="${p#./}"
  IFS='/' read -r -a _segs <<< "$p"
  for seg in "${_segs[@]}"; do
    case "$seg" in
      ''|.) ;;
      ..)   depth=$((depth-1)); (( depth < 0 )) && return 0 ;;
      *)    depth=$((depth+1)) ;;
    esac
  done
  return 1
}
while IFS= read -r ref; do
  # Skip protocol URLs, mailto, anchors-only, and absolute paths.
  case "$ref" in
    http*|https*|mailto:*|tel:*|\#*|/*) continue ;;
  esac
  # Strip query and fragment components before resolving.
  target="${ref%%#*}"
  target="${target%%\?*}"
  [[ -z "$target" ]] && continue
  if escapes_root "$target"; then
    ESCAPE=1
    fail "path escapes skill folder: $ref"
    continue
  fi
  if [[ ! -e "$ABS_SKILL_DIR/$target" ]]; then
    BAD_REFS=$((BAD_REFS+1))
    fail "referenced file does not exist: $ref"
  fi
done < <(grep -oE '\!?\[[^]]*\]\([^)]+\)' "$SKILL_MD" 2>/dev/null \
         | sed -E 's/.*\(([^)]+)\).*/\1/' \
         | sort -u)

if [[ "$BAD_REFS" -eq 0 && "$ESCAPE" -eq 0 ]]; then
  pass "all relative references resolve inside the skill folder"
fi

if [[ "$FAIL" -eq 0 ]]; then
  printf 'RESULT=%s\n' "pass"
  exit 0
else
  printf 'RESULT=%s\n' "fail"
  exit 1
fi
