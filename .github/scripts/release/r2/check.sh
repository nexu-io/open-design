#!/usr/bin/env bash
set -euo pipefail

for name in AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY CLOUDFLARE_R2_RELEASES_BUCKET CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN CLOUDFLARE_R2_RELEASES_URL RELEASE_CHANNEL R2_ACCESS_PROBE_NAME; do
  if [ -z "${!name:-}" ]; then
    echo "$name is required" >&2
    exit 1
  fi
done

probe_file="$RUNNER_TEMP/r2-release-access.txt"
probe_key="$RELEASE_CHANNEL/.ci-access-check/$R2_ACCESS_PROBE_NAME.txt"
printf 'run=%s\nsha=%s\nchannel=%s\n' "$GITHUB_RUN_ID" "$GITHUB_SHA" "$RELEASE_CHANNEL" > "$probe_file"
aws --endpoint-url "${CLOUDFLARE_R2_RELEASES_URL%/}" s3api put-object \
  --bucket "$CLOUDFLARE_R2_RELEASES_BUCKET" \
  --key "$probe_key" \
  --body "$probe_file" \
  --content-type "text/plain; charset=utf-8" \
  --cache-control "no-store" \
  --no-cli-pager >/dev/null
