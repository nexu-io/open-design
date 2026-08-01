#!/usr/bin/env bash
# Fetch the recording corpus referenced by mocks/manifest.json from
# Cloudflare R2 into mocks/recordings/. Skips files already on disk
# whose sha256 matches the manifest. Verifies every download.
#
# Usage:
#   bash mocks/scripts/fetch-recordings.sh                  # fetch all
#   bash mocks/scripts/fetch-recordings.sh --agent claude   # fetch claude only
#   bash mocks/scripts/fetch-recordings.sh --outcome failed # fetch failed only
#   bash mocks/scripts/fetch-recordings.sh --skill agent-browser
#   bash mocks/scripts/fetch-recordings.sh --concurrency 16
#   bash mocks/scripts/fetch-recordings.sh --force          # re-download all
#   bash mocks/scripts/fetch-recordings.sh --cache-dir <p>  # override cache location
#
# Default cache: mocks/recordings/. Override with OD_MOCKS_CACHE_DIR env
# or --cache-dir flag — useful for sharing across multiple OD checkouts.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
MOCKS_DIR="$(cd "$HERE/.." && pwd -P)"
MANIFEST="$MOCKS_DIR/manifest.json"

FILTER_AGENT=""
FILTER_OUTCOME=""
FILTER_SKILL=""
CONCURRENCY=8
FORCE=0
CACHE_DIR="${OD_MOCKS_CACHE_DIR:-$MOCKS_DIR/recordings}"
CURL_CONNECT_TIMEOUT="${OD_MOCKS_CURL_CONNECT_TIMEOUT:-10}"
CURL_MAX_TIME="${OD_MOCKS_CURL_MAX_TIME:-120}"
CURL_RETRY_MAX_TIME="${OD_MOCKS_CURL_RETRY_MAX_TIME:-180}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent)        FILTER_AGENT="$2";   shift 2 ;;
    --outcome)      FILTER_OUTCOME="$2"; shift 2 ;;
    --skill)        FILTER_SKILL="$2";   shift 2 ;;
    --concurrency)  CONCURRENCY="$2";    shift 2 ;;
    --cache-dir)    CACHE_DIR="$2";      shift 2 ;;
    --force)        FORCE=1;             shift   ;;
    -h|--help)
      sed -n '2,17p' "$0" | sed 's/^# //; s/^#//'; exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

if [ ! -f "$MANIFEST" ]; then
  echo "✗ manifest not found at $MANIFEST" >&2
  exit 1
fi

mkdir -p "$CACHE_DIR"

# A worker normally removes its own temporary file on exit. Files older than
# the bounded transfer window can only be leftovers from a killed invocation;
# remove those before starting new workers without racing a live download.
find "$CACHE_DIR" -maxdepth 1 -type f -name '.*.jsonl.tmp.*' -mmin +60 -exec rm -f -- {} + 2>/dev/null || true

# Use node to walk the manifest — sturdier than shell JSON parsing.
PUBLIC_URL=$(node -e '
const m = JSON.parse(require("fs").readFileSync(process.argv[1],"utf-8"));
process.stdout.write(m.storage.public_url_base + "/" + m.storage.object_prefix);
' "$MANIFEST")

# Select entries matching filters, write one TSV row per entry:
# <trace_id>\t<sha256>\t<bytes>
ENTRIES_TSV=$(node -e '
const m = JSON.parse(require("fs").readFileSync(process.argv[1],"utf-8"));
const fa = process.argv[2], fo = process.argv[3], fs = process.argv[4];
for (const e of m.entries) {
  if (fa && e.agent !== fa) continue;
  if (fo && e.outcome !== fo) continue;
  if (fs && !(e.skills || []).includes(fs)) continue;
  process.stdout.write(`${e.trace_id}\t${e.sha256}\t${e.bytes}\n`);
}
' "$MANIFEST" "$FILTER_AGENT" "$FILTER_OUTCOME" "$FILTER_SKILL")

# Empty-string check has to come BEFORE any line-counting — `printf '%s\n' ""`
# emits a single empty line, which `grep -c ""` / `wc -l` would count as 1
# and let a typo'd `--agent xyz` quietly succeed with zero downloads.
if [ -z "$ENTRIES_TSV" ]; then
  echo "no entries matched filter" >&2
  exit 0
fi
TOTAL=$(printf '%s\n' "$ENTRIES_TSV" | wc -l | tr -d ' ')

echo "Fetching up to $TOTAL recordings → $CACHE_DIR"
echo "  manifest:    $MANIFEST"
echo "  R2 prefix:   $PUBLIC_URL"
[ -n "$FILTER_AGENT" ]   && echo "  filter:      agent=$FILTER_AGENT"
[ -n "$FILTER_OUTCOME" ] && echo "  filter:      outcome=$FILTER_OUTCOME"
[ -n "$FILTER_SKILL" ]   && echo "  filter:      skill=$FILTER_SKILL"
[ "$FORCE" -eq 1 ]       && echo "  --force: re-downloading all matched"
echo

# Function called by xargs — must be exported. Writes one of:
#   ✓ <id>   (newly fetched)
#   • <id>   (skipped — sha256 already matches)
#   ✗ <id>   (failed — sha256 mismatch or download error)
fetch_one() {
  local id="$1" sha="$2" bytes="$3"
  local dest="$CACHE_DIR/$id.jsonl"
  local tmp=""
  trap 'if [ -n "${tmp:-}" ]; then rm -f -- "$tmp"; fi' HUP INT TERM
  if [ "$FORCE" -ne 1 ] && [ -f "$dest" ]; then
    local existing
    local existing_bytes
    existing=$(shasum -a 256 "$dest" 2>/dev/null | awk '{print $1}')
    existing_bytes=$(wc -c < "$dest" | tr -d '[:space:]')
    if [ "$existing" = "$sha" ] && [ "$existing_bytes" = "$bytes" ]; then
      echo "• $id"
      return 0
    fi
  fi
  local url="${PUBLIC_URL}${id}.jsonl"
  tmp=$(mktemp "$CACHE_DIR/.$id.jsonl.tmp.XXXXXX") || {
    echo "✗ $id (could not create same-directory temporary file)"
    return 1
  }
  if ! curl --fail --show-error --silent --location \
      --connect-timeout "$CURL_CONNECT_TIMEOUT" \
      --max-time "$CURL_MAX_TIME" \
      --retry 3 --retry-delay 1 --retry-max-time "$CURL_RETRY_MAX_TIME" \
      --output "$tmp" "$url"; then
    echo "✗ $id (download failed)"
    rm -f -- "$tmp"
    tmp=""
    return 1
  fi
  local got_bytes
  got_bytes=$(wc -c < "$tmp" | tr -d '[:space:]')
  if [ "$got_bytes" != "$bytes" ]; then
    echo "✗ $id (byte count mismatch: got $got_bytes expected $bytes)"
    rm -f -- "$tmp"
    tmp=""
    return 1
  fi
  local got
  got=$(shasum -a 256 "$tmp" | awk '{print $1}')
  if [ "$got" != "$sha" ]; then
    echo "✗ $id (sha256 mismatch: got $got expected $sha)"
    rm -f -- "$tmp"
    tmp=""
    return 1
  fi
  mv -f -- "$tmp" "$dest"
  tmp=""
  echo "✓ $id"
}

export PUBLIC_URL CACHE_DIR FORCE CURL_CONNECT_TIMEOUT CURL_MAX_TIME CURL_RETRY_MAX_TIME
export -f fetch_one

PROGRESS_LOG=$(mktemp "${TMPDIR:-/tmp}/od-mocks-fetch-progress.XXXXXX")
set +e
printf '%s\n' "$ENTRIES_TSV" \
  | xargs -P "$CONCURRENCY" -L 1 bash -c 'fetch_one "$1" "$2" "$3"' _ \
  > "$PROGRESS_LOG" 2>&1
fetch_status=$?
set -e

new=$(grep -c "^✓"  "$PROGRESS_LOG" || true)
skip=$(grep -c "^•" "$PROGRESS_LOG" || true)
fail=$(grep -c "^✗" "$PROGRESS_LOG" || true)

echo "  ✓ fetched: $new"
echo "  • cached:  $skip"
if [ "$fail" -gt 0 ] || [ "$fetch_status" -ne 0 ]; then
  echo "  ✗ failed:  $fail"
  echo
  grep "^✗" "$PROGRESS_LOG" | head -5
  echo "  …(full log $PROGRESS_LOG)"
  exit 1
fi
rm -f -- "$PROGRESS_LOG"

# Symlink (or copy) into mocks/recordings/ when cache lives elsewhere so
# the mock-agent recording-picker keeps working without env overrides.
if [ "$CACHE_DIR" != "$MOCKS_DIR/recordings" ]; then
  mkdir -p "$MOCKS_DIR/recordings"
  for f in "$CACHE_DIR"/*.jsonl; do
    [ -e "$f" ] || continue
    bn=$(basename "$f")
    if [ ! -e "$MOCKS_DIR/recordings/$bn" ]; then
      ln -sf "$f" "$MOCKS_DIR/recordings/$bn"
    fi
  done
  # Also link the manifest so picker/index-aware tooling sees it.
  ln -sf "$MANIFEST" "$MOCKS_DIR/recordings/index.json" 2>/dev/null || true
fi

echo
echo "✅ ready: $MOCKS_DIR/recordings/"
