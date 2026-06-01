#!/usr/bin/env bash
# Find low-effort doc improvements in nexu-io/open-design.
# Usage: discover-doc-gaps.sh <workdir>
# Stdout: NDJSON rows. Three classes:
#   {"kind":"todo","file":"docs/foo.md","line":42,"text":"TODO: explain the daemon"}
#   {"kind":"typo","file":"README.md","line":17,"word":"recieve","suggested":"receive"}
#   {"kind":"deadlink","file":"docs/bar.md","line":3,"url":"https://example.com/x","status":"404"}
#
# Dead-link checks are best-effort: timeout 8s, only reports 4xx/5xx/timeout, not network errors.

set -uo pipefail
source "$(dirname "$0")/config.sh"

WORKDIR="${1:?workdir required}"
[[ -d "$WORKDIR/.git" ]] || od::die "not a git workdir: $WORKDIR"

cd "$WORKDIR"
od::require jq

# Use ripgrep when present for speed; fall back to grep -rE.
if command -v rg >/dev/null 2>&1; then
  GREP() { rg --no-heading --line-number --color never "$@"; }
else
  GREP() {
    # Translate a couple of rg flags we use to grep-equivalents.
    local args=()
    while (($#)); do
      case "$1" in
        --no-heading|--color) shift ;;
        --color=never) shift ;;
        --line-number) args+=("-n"); shift ;;
        *) args+=("$1"); shift ;;
      esac
    done
    grep -rE "${args[@]}"
  }
fi

# 1) TODOs / FIXMEs in docs.
emit_todo() {
  while IFS=: read -r file line rest; do
    [[ -z "$file" ]] && continue
    jq -nc --arg file "$file" --argjson line "$line" --arg text "$rest" \
      '{kind:"todo", file:$file, line:$line, text:($text|sub("^[[:space:]]+";""))}'
  done
}

GREP --no-heading --line-number --color never -e 'TODO|FIXME|XXX' \
  -g '*.md' docs/ README*.md QUICKSTART*.md CONTRIBUTING*.md 2>/dev/null \
  | emit_todo || true

# Fallback path for environments where rg --glob isn't available — grep equivalent.
if ! command -v rg >/dev/null 2>&1; then
  grep -rEn -- 'TODO|FIXME|XXX' docs README*.md QUICKSTART*.md CONTRIBUTING*.md 2>/dev/null \
    | emit_todo || true
fi

# 2) Common typos. Whole-word match, case-sensitive (avoid false positives in code/links).
TYPOS=(
  "teh|the"
  "recieve|receive"
  "seperate|separate"
  "occured|occurred"
  "succesful|successful"
  "untill|until"
  "wich|which"
  "thier|their"
  "alot|a lot"
  "definately|definitely"
  "neccessary|necessary"
  "enviroment|environment"
  "transparant|transparent"
  "appearence|appearance"
)

for entry in "${TYPOS[@]}"; do
  bad="${entry%%|*}"
  good="${entry##*|}"
  while IFS=: read -r file line _rest; do
    [[ -z "$file" ]] && continue
    # Skip code blocks (rough heuristic: skip if line is inside ```).
    jq -nc --arg file "$file" --argjson line "$line" --arg word "$bad" --arg good "$good" \
      '{kind:"typo", file:$file, line:$line, word:$word, suggested:$good}'
  done < <(GREP --no-heading --line-number --color never -e "\\b${bad}\\b" -g '*.md' . 2>/dev/null \
           || grep -rEn "\\b${bad}\\b" --include='*.md' . 2>/dev/null \
           || true)
done

# 3) External link health (best-effort, capped).
# Cap to 50 links per run so we don't hammer arbitrary hosts.
MAX_LINKS=50
SEEN=0
extract_links() {
  GREP --no-heading --line-number --color never -e '\]\(https?://[^) ]+\)' -g '*.md' . 2>/dev/null \
    || grep -rEn '\]\(https?://[^) ]+\)' --include='*.md' . 2>/dev/null
}

while IFS= read -r row; do
  [[ "$SEEN" -ge "$MAX_LINKS" ]] && break
  file="${row%%:*}"
  rest="${row#*:}"
  line="${rest%%:*}"
  text="${rest#*:}"
  # Extract first http(s) URL on the line.
  url="$(printf '%s' "$text" | grep -oE 'https?://[^) ]+' | head -1)"
  [[ -z "$url" ]] && continue
  SEEN=$((SEEN+1))
  # HEAD with 8s timeout, follow redirects, take final status.
  status="$(curl -sS -o /dev/null -m 8 -L -w '%{http_code}' --head "$url" 2>/dev/null || echo "000")"
  case "$status" in
    2*|3*) ;;  # OK
    000) ;;    # network/timeout — skip rather than spam false positives
    *)
      jq -nc --arg file "$file" --argjson line "$line" --arg url "$url" --arg status "$status" \
        '{kind:"deadlink", file:$file, line:$line, url:$url, status:$status}'
      ;;
  esac
done < <(extract_links | head -n "$MAX_LINKS")
