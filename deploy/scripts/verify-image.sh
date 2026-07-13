#!/usr/bin/env bash
set -euo pipefail

IMAGE_REF="${1:-}"
ARCHIVE_CONTAINER_ID=""
CONTAINER_ID=""

cleanup() {
  if [[ -n "$ARCHIVE_CONTAINER_ID" ]]; then
    docker rm -f "$ARCHIVE_CONTAINER_ID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$CONTAINER_ID" ]]; then
    docker rm -f "$CONTAINER_ID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ -z "$IMAGE_REF" ]]; then
  echo "usage: $0 <image-ref>" >&2
  exit 64
fi

ARCHIVE_CONTAINER_ID="$(docker create "$IMAGE_REF")"
archive_listing="$(docker export "$ARCHIVE_CONTAINER_ID" | tar -tf -)"
docker rm "$ARCHIVE_CONTAINER_ID" >/dev/null
ARCHIVE_CONTAINER_ID=""

for required_path in \
  "app/apps/daemon/dist/cli.js" \
  "app/apps/web/out/index.html" \
  "app/apps/daemon/node_modules/express" \
  "app/apps/daemon/node_modules/better-sqlite3" \
  "app/skills" \
  "app/design-systems" \
  "app/assets/frames"
do
  if ! grep -Eq "^${required_path}(/|$)" <<<"$archive_listing"; then
    echo "missing expected runtime path: $required_path" >&2
    exit 1
  fi
done

for forbidden_path in \
  "app/apps/web/src" \
  "app/docs" \
  "app/story" \
  "app/apps/daemon/node_modules/typescript" \
  "app/apps/daemon/node_modules/vite" \
  "app/apps/daemon/node_modules/@types" \
  "app/apps/daemon/node_modules/.pnpm/@types\\+" \
  "app/apps/daemon/node_modules/.pnpm/better-sqlite3@.*/node_modules/better-sqlite3/deps" \
  "app/apps/daemon/node_modules/.pnpm/better-sqlite3@.*/node_modules/better-sqlite3/src" \
  "app/apps/daemon/node_modules/.cache"
do
  if grep -Eq "^${forbidden_path}(/|$)" <<<"$archive_listing"; then
    echo "unexpected build-only content found in runtime image: $forbidden_path" >&2
    exit 1
  fi
done

runtime_tools="$(docker run --rm --entrypoint sh "$IMAGE_REF" -lc 'for tool in python3 g++ make pnpm; do if command -v "$tool" >/dev/null 2>&1; then echo "$tool"; fi; done')"
if [[ -n "$runtime_tools" ]]; then
  echo "unexpected build tools found in runtime image:" >&2
  echo "$runtime_tools" >&2
  exit 1
fi

node_major="$(docker run --rm --entrypoint node "$IMAGE_REF" -p 'process.versions.node.split(`.`)[0]')"
if [[ "$node_major" != "24" ]]; then
  echo "unexpected runtime node major: $node_major" >&2
  exit 1
fi

CONTAINER_ID="$(docker run -d -p 127.0.0.1::7456 "$IMAGE_REF")"
runtime_port="$(docker port "$CONTAINER_ID" 7456/tcp | awk -F: '{print $2}')"
health_code=""

for _ in $(seq 1 20); do
  health_code="$(curl -o /dev/null -s -w '%{http_code}' "http://127.0.0.1:${runtime_port}/api/health" || true)"
  if [[ "$health_code" == "200" ]]; then
    break
  fi
  sleep 1
done

if [[ "$health_code" != "200" ]]; then
  echo "unexpected health status: $health_code" >&2
  docker logs "$CONTAINER_ID" >&2 || true
  exit 1
fi

rss_bytes="$(docker stats --no-stream --format '{{.MemUsage}}' "$CONTAINER_ID" | awk '{print $1}')"
echo "open-design runtime image verified: $IMAGE_REF"
echo "container memory sample: ${rss_bytes}"
