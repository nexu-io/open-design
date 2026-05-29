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
  if [ "$FORCE" -ne 1 ] && [ -f "$dest" ]; then
    local existing
    existing=$(shasum -a 256 "$dest" 2>/dev/null | awk '{print $1}')
    if [ "$existing" = "$sha" ]; then
      echo "• $id"
      return 0
    fi
  fi
  local url="${PUBLIC_URL}${id}.jsonl"
  if ! curl -sf -o "$dest.tmp" "$url"; then
    echo "✗ $id (download failed)"
    rm -f "$dest.tmp"
    return 1
  fi
  local got
  got=$(shasum -a 256 "$dest.tmp" | awk '{print $1}')
  if [ "$got" != "$sha" ]; then
    echo "✗ $id (sha256 mismatch: got $got expected $sha)"
    rm -f "$dest.tmp"
    return 1
  fi
  mv "$dest.tmp" "$dest"
  echo "✓ $id"
}

export PUBLIC_URL CACHE_DIR FORCE
export -f fetch_one

printf '%s\n' "$ENTRIES_TSV" \
  | xargs -P "$CONCURRENCY" -L 1 bash -c 'fetch_one "$1" "$2" "$3"' _ \
  > /tmp/od-mocks-fetch-progress.txt 2>&1

new=$(grep -c "^✓"  /tmp/od-mocks-fetch-progress.txt || true)
skip=$(grep -c "^•" /tmp/od-mocks-fetch-progress.txt || true)
fail=$(grep -c "^✗" /tmp/od-mocks-fetch-progress.txt || true)

echo "  ✓ fetched: $new"
echo "  • cached:  $skip"
if [ "$fail" -gt 0 ]; then
  echo "  ✗ failed:  $fail"
  echo
  grep "^✗" /tmp/od-mocks-fetch-progress.txt | head -5
  echo "  …(full log /tmp/od-mocks-fetch-progress.txt)"
  exit 1
fi

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
