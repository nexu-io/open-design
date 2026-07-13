#!/usr/bin/env bash
set -euo pipefail

for name in BRANCH_NAME CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN GITHUB_OUTPUT GITHUB_REPOSITORY GITHUB_SHA RELEASE_CHANNEL RELEASE_SIGNED RELEASE_VERSION RUNNER_TEMP VERSION_TAG; do
  if [ -z "${!name:-}" ]; then
    echo "$name is required" >&2
    exit 1
  fi
done

notes_file="$RUNNER_TEMP/open-design-stable-notes.md"
public_origin="${CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN%/}"
cat > "$notes_file" <<EOF
## Summary
- channel: $RELEASE_CHANNEL
- version: $RELEASE_VERSION
- R2 metadata: $public_origin/$RELEASE_CHANNEL/latest/metadata.json
- E2E report: $public_origin/$RELEASE_CHANNEL/versions/$RELEASE_VERSION/report.zip
- mac signed/notarized: $RELEASE_SIGNED
- mac x64 signed/notarized: ${MAC_INTEL_SIGNED:-false}
- windows signed: false
- branch: $BRANCH_NAME
- commit: $GITHUB_SHA

See [CHANGELOG.md](https://github.com/${GITHUB_REPOSITORY}/blob/$VERSION_TAG/CHANGELOG.md) for the full release notes.

This stable release ships mac arm64/x64 DMG and ZIP assets, Windows x64 NSIS installer assets, checksums, updater feed files, and a zipped packaged e2e spec report. Linux AppImage packaging remains optional through the stable Linux lane.
EOF
echo "notes_file=$notes_file" >> "$GITHUB_OUTPUT"
