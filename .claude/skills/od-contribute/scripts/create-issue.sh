#!/usr/bin/env bash
# Create a bug-report issue on nexu-io/open-design from a rendered body file.
# Usage:
#   create-issue.sh --title "<issue title>" --body-file <rendered .md>
#                   [--allow-duplicates] [--dedupe-keywords "<kw>"]
#
# Dedupe gate (now actually a gate, not a print):
#   - If --dedupe-keywords is supplied, the script runs `gh search issues`
#     FIRST and writes the matches to stderr.
#   - If any matches are found AND --allow-duplicates was NOT passed, the
#     script EXITS NON-ZERO with a clear hint and refuses to call
#     `gh issue create`. This lets the agent (per SKILL.md Step 3d.4) show
#     the matches to the user and only re-invoke with --allow-duplicates
#     after the user explicitly chose "open a new issue anyway".
#   - If `gh search` ITSELF fails (network, rate limit, jq parse error),
#     the script also exits non-zero. Failing closed is the right default
#     for a bug-dedupe gate — we'd rather block creation than open
#     potentially redundant issues silently.
#
# Caller contract (matches SKILL.md):
#   1. Run with --dedupe-keywords on first attempt; show output to user.
#   2. If exit is non-zero with REASON=duplicates_found, ask the user.
#   3. If user picks "open anyway", re-run WITHOUT --dedupe-keywords (or
#      WITH --allow-duplicates). The script then creates the issue.
#
# Emits the issue URL on its own line (stdout) on success.

set -euo pipefail
source "$(dirname "$0")/config.sh"

TITLE=""
BODY_FILE=""
DEDUPE_KEYWORDS=""
ALLOW_DUPES=0

while (($#)); do
  case "$1" in
    --title)            TITLE="$2"; shift 2 ;;
    --body-file)        BODY_FILE="$2"; shift 2 ;;
    --dedupe-keywords)  DEDUPE_KEYWORDS="$2"; shift 2 ;;
    --allow-duplicates) ALLOW_DUPES=1; shift ;;
    *) od::die "unknown flag: $1" ;;
  esac
done

[[ -n "$TITLE"     ]] || od::die "--title required"
[[ -f "$BODY_FILE" ]] || od::die "--body-file does not exist: $BODY_FILE"

od::require gh
od::require jq

if [[ -n "$DEDUPE_KEYWORDS" && "$ALLOW_DUPES" -eq 0 ]]; then
  od::log "checking for duplicates: $DEDUPE_KEYWORDS"

  # Run gh search and jq as separate steps so a failure in either is loud
  # rather than swallowed by `|| true`. The previous implementation chained
  # them with `|| true`, which let a network or jq error mask "no duplicates"
  # vs "search broken" — both produced empty output and the script then
  # created the issue regardless.
  if ! SEARCH_JSON="$(gh search issues "$DEDUPE_KEYWORDS" \
        --repo "$TARGET_REPO" \
        --state open \
        --limit 5 \
        --json number,title,url 2>&1)"; then
    od::err "gh search failed: $SEARCH_JSON"
    printf 'REASON=search_failed\n' >&2
    exit 2
  fi

  MATCH_COUNT="$(printf '%s' "$SEARCH_JSON" | jq -r 'length' 2>/dev/null || echo 'parse-error')"
  if [[ "$MATCH_COUNT" == "parse-error" ]]; then
    od::err "could not parse gh search output as JSON"
    printf 'REASON=parse_failed\n' >&2
    exit 2
  fi

  if (( MATCH_COUNT > 0 )); then
    printf '%s' "$SEARCH_JSON" \
      | jq -r '.[] | "  #\(.number)  \(.title)\n           \(.url)"' >&2
    od::err "${MATCH_COUNT} potentially duplicate open issue(s) found."
    od::err "Refusing to create a new issue. Show these to the user and ask:"
    od::err "  (a) comment on an existing one — open the URL above"
    od::err "  (b) open a new issue anyway — re-run with --allow-duplicates"
    od::err "  (c) cancel — do nothing"
    printf 'REASON=duplicates_found\n' >&2
    printf 'MATCH_COUNT=%s\n' "$MATCH_COUNT" >&2
    exit 3
  fi

  od::log "no duplicates found — proceeding with create"
fi

URL="$(gh issue create \
  --repo "$TARGET_REPO" \
  --title "$TITLE" \
  --body-file "$BODY_FILE" \
  --label bug)" || od::die "gh issue create failed"

printf '\n'
printf '%s\n' "$URL"
