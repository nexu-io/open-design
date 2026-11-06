#!/usr/bin/env bash
# Upload a new anonymized recording to Cloudflare R2 and update the
# local manifest. Local-maintainer flow — no GitHub Action involved,
# nothing about the recording ever lands in git.
#
#   bash mocks/scripts/upload-recording.sh <recording.jsonl>
#
# Prereqs
# -------
# - `wrangler login` once (OAuth, no token to manage). The logged-in
#   account must have access to the powerformer R2 namespace where the
#   `open-design-mocks` bucket lives.
# - That's it. Bucket is public-read, manifest is in repo; consumers
#   pull via `fetch-recordings.sh`.
#
# What it does
# ------------
#   1. Validate the .jsonl (first line = meta event, UUID filename)
#   2. Compute sha256, parse meta, build manifest entry
#   3. `wrangler r2 object put` the recording → recordings/v1/<id>.jsonl
#   4. Update mocks/manifest.json with the new entry (rebuilt histograms)
#   5. `wrangler r2 object put` the manifest too → recordings/v1/manifest.json
#   6. Tell you to commit + push the manifest change
#
# The .jsonl is never copied into the repo. Only mocks/manifest.json
# (≈200B added per entry) gets git-tracked.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
MOCKS_DIR="$(cd "$HERE/.." && pwd -P)"
MANIFEST="$MOCKS_DIR/manifest.json"
LIB="$HERE/lib/manifest-utils.mjs"
BUCKET='open-design-mocks'
KEY_PREFIX='recordings/v1/'
# powerformer hosts the bucket; pin so wrangler doesn't ask which
# account in non-interactive mode when the OAuth login spans several.
export CLOUDFLARE_ACCOUNT_ID='64ad4569ffd912432d6b86d5656484c4'

if [ $# -lt 1 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
  sed -n '2,28p' "$0" | sed 's/^# \?//'
  exit 0
fi

INPUT="$1"
if [ ! -f "$INPUT" ]; then echo "✗ no such file: $INPUT" >&2; exit 1; fi

INPUT_ABS="$(cd "$(dirname "$INPUT")" && pwd -P)/$(basename "$INPUT")"
TRACE_ID="$(basename "$INPUT" .jsonl)"

if ! printf '%s' "$TRACE_ID" | grep -qE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then
  echo "✗ trace id '$TRACE_ID' is not a UUID. Rename the file." >&2
  exit 1
fi

if ! command -v wrangler >/dev/null 2>&1; then
  echo "✗ wrangler not installed. \`npm i -g wrangler\` (or pnpm/yarn) and \`wrangler login\` first." >&2
  exit 1
fi

# Step 1+2: validate + build entry preview via shared lib (Node — same code
# the consumers use, so no shape drift)
ENTRY_JSON=$(node --input-type=module -e "
import { inspectRecording } from '$LIB';
process.stdout.write(JSON.stringify(inspectRecording('$INPUT_ABS'), null, 2));
" 2>&1) || {
  echo "✗ validation failed:" >&2
  echo "$ENTRY_JSON" | sed 's/^/  /' >&2
  exit 1
}

echo "manifest entry to add:"
echo "$ENTRY_JSON" | sed 's/^/  /'
echo

# Step 3: upload the recording itself
echo "→ uploading recording to R2…"
wrangler r2 object put "${BUCKET}/${KEY_PREFIX}${TRACE_ID}.jsonl" \
  --file "$INPUT_ABS" --remote >/dev/null
echo "  ✓ $TRACE_ID.jsonl"

# Step 4: update local manifest.json
echo "→ updating local mocks/manifest.json…"
node --input-type=module -e "
import { inspectRecording, upsertEntry, readManifest, writeManifest } from '$LIB';
const m = readManifest('$MANIFEST');
upsertEntry(m, inspectRecording('$INPUT_ABS'));
writeManifest('$MANIFEST', m);
console.log('  ✓ now ' + m.total + ' entries (' + (m.total_bytes/1024).toFixed(0) + ' KB total)');
"

# Step 5: upload the updated manifest to R2 so consumers see the new entry
# without waiting for the next git push.
echo "→ uploading manifest to R2…"
wrangler r2 object put "${BUCKET}/${KEY_PREFIX}manifest.json" \
  --file "$MANIFEST" --remote >/dev/null
echo "  ✓ manifest.json"

echo
echo "✅ done. Next:"
echo "  git add mocks/manifest.json"
echo "  git commit -m 'mocks: add recording $TRACE_ID'"
echo "  git push"
