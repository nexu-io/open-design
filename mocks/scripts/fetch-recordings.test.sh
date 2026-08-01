#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(mktemp -d "${TMPDIR:-/tmp}/od-mocks-fetch-test.XXXXXX")"
SERVER_ROOT="$ROOT/server"
FIXTURE_ROOT="$ROOT/fixture"
CACHE_DIR="$ROOT/cache"
READY_FILE="$ROOT/ready"
COUNT_FILE="$ROOT/counts"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf -- "$ROOT"
}
trap cleanup EXIT

mkdir -p "$SERVER_ROOT" "$FIXTURE_ROOT/mocks/scripts" "$CACHE_DIR"
cp "$HERE/fetch-recordings.sh" "$FIXTURE_ROOT/mocks/scripts/fetch-recordings.sh"

printf 'same recording\n' > "$SERVER_ROOT/same.jsonl"
printf 'valid recording\n' > "$SERVER_ROOT/valid.jsonl"
printf 'stale recording\n' > "$SERVER_ROOT/stale.jsonl"
printf 'expected hash\n' > "$SERVER_ROOT/hash-expected.jsonl"
printf 'wrong hash!!!\n' > "$SERVER_ROOT/hash.jsonl"
printf 'expected size\n' > "$SERVER_ROOT/size-expected.jsonl"
printf 'short\n' > "$SERVER_ROOT/size.jsonl"
printf 'interrupted recording\n' > "$SERVER_ROOT/interrupted.jsonl"
printf 'timeout recording\n' > "$SERVER_ROOT/timeout.jsonl"

SERVER_ROOT="$SERVER_ROOT" READY_FILE="$READY_FILE" COUNT_FILE="$COUNT_FILE" node <<'NODE' &
const fs = require('node:fs');
const http = require('node:http');
const root = process.env.SERVER_ROOT;
const ready = process.env.READY_FILE;
const counts = process.env.COUNT_FILE;
const server = http.createServer((req, res) => {
  const id = decodeURIComponent(req.url.split('/').pop()).replace(/\.jsonl$/, '');
  const count = fs.existsSync(counts) ? Number(fs.readFileSync(counts, 'utf8')) || 0 : 0;
  fs.writeFileSync(counts, String(count + 1));
  if (id === 'http') { res.writeHead(503); res.end('unavailable'); return; }
  if (id === 'timeout') {
    setTimeout(() => res.end(fs.readFileSync(`${root}/timeout.jsonl`)), 5000);
    return;
  }
  const file = `${root}/${id}.jsonl`;
  if (!fs.existsSync(file)) { res.writeHead(404); res.end('missing'); return; }
  const body = fs.readFileSync(file);
  if (id === 'interrupted') {
    res.writeHead(200, { 'Content-Length': body.length + 10 });
    res.write(body.subarray(0, Math.floor(body.length / 2)));
    setTimeout(() => req.socket.destroy(), 20);
    return;
  }
  if (id === 'same') setTimeout(() => res.end(body), 150);
  else res.end(body);
});
server.listen(0, '127.0.0.1', () => fs.writeFileSync(ready, String(server.address().port)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
NODE
SERVER_PID=$!
for _ in $(seq 1 50); do
  [ -s "$READY_FILE" ] && break
  sleep 0.1
done
[ -s "$READY_FILE" ] || { echo 'server did not start' >&2; exit 1; }
PORT=$(<"$READY_FILE")

SERVER_ROOT="$SERVER_ROOT" PORT="$PORT" FIXTURE_MANIFEST="$FIXTURE_ROOT/mocks/manifest.json" node <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
const root = process.env.SERVER_ROOT;
const file = (name) => fs.readFileSync(`${root}/${name}.jsonl`);
const digest = (body) => crypto.createHash('sha256').update(body).digest('hex');
const entry = (id, expected, skill) => ({
  trace_id: id, sha256: digest(file(expected)), bytes: file(expected).length,
  agent: 'fixture', outcome: 'passed', skills: [skill],
});
const manifest = {
  storage: { public_url_base: `http://127.0.0.1:${process.env.PORT}`, object_prefix: 'recordings/' },
  entries: [
    entry('same', 'same', 'same'), entry('same', 'same', 'same'),
    entry('valid', 'valid', 'valid'), entry('stale', 'stale', 'stale'),
    entry('hash', 'hash-expected', 'hash'), entry('size', 'size-expected', 'size'),
    entry('interrupted', 'interrupted', 'interrupted'), entry('http', 'valid', 'http'),
    entry('timeout', 'timeout', 'timeout'),
  ],
};
fs.writeFileSync(process.env.FIXTURE_MANIFEST, JSON.stringify(manifest, null, 2));
NODE

run_fetch() {
  OD_MOCKS_CACHE_DIR="$CACHE_DIR" \
  OD_MOCKS_CURL_CONNECT_TIMEOUT=1 \
  OD_MOCKS_CURL_MAX_TIME=1 \
  OD_MOCKS_CURL_RETRY_MAX_TIME=2 \
    bash "$FIXTURE_ROOT/mocks/scripts/fetch-recordings.sh" "$@"
}

run_fetch --skill same --concurrency 2
[ -f "$CACHE_DIR/same.jsonl" ]
[ "$(<"$COUNT_FILE")" -eq 2 ]
run_fetch --skill valid
run_fetch --skill valid
[ "$(<"$COUNT_FILE")" -eq 3 ]

printf 'stale temp\n' > "$CACHE_DIR/.stale.jsonl.tmp.STALE"
touch -d '2 hours ago' "$CACHE_DIR/.stale.jsonl.tmp.STALE"
run_fetch --skill stale
[ ! -e "$CACHE_DIR/.stale.jsonl.tmp.STALE" ]

printf 'keep existing\n' > "$CACHE_DIR/hash.jsonl"
if run_fetch --skill hash; then
  echo 'hash mismatch unexpectedly succeeded' >&2
  exit 1
fi
[ "$(<"$CACHE_DIR/hash.jsonl")" = 'keep existing' ]

for skill in size interrupted http timeout; do
  if run_fetch --skill "$skill"; then
    echo "$skill unexpectedly succeeded" >&2
    exit 1
  fi
  [ ! -e "$CACHE_DIR/$skill.jsonl" ]
done

if find "$CACHE_DIR" -maxdepth 1 -type f -name '.*.jsonl.tmp.*' -print -quit | grep -q .; then
  echo 'orphan temporary file remains' >&2
  exit 1
fi

echo 'fetch-recordings fixtures: PASS'
