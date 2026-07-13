#!/usr/bin/env bash
set -euo pipefail

for name in RELEASE_VERSION RUNNER_TEMP TOOLS_PACK_NAMESPACE; do
  if [ -z "${!name:-}" ]; then
    echo "$name is required" >&2
    exit 1
  fi
done

asset_suffix="${LINUX_ASSET_SUFFIX:-}"
release_dir="$RUNNER_TEMP/release-assets"
mkdir -p "$release_dir"

source_appimage="$RUNNER_TEMP/tools-pack/out/linux/namespaces/$TOOLS_PACK_NAMESPACE/builder/Open Design-$TOOLS_PACK_NAMESPACE.AppImage"
if [ ! -f "$source_appimage" ]; then
  echo "expected AppImage not found at $source_appimage" >&2
  exit 1
fi

versioned_appimage="open-design-${RELEASE_VERSION}${asset_suffix}-linux-x64.AppImage"
checksum_file="$versioned_appimage.sha256"

cp "$source_appimage" "$release_dir/$versioned_appimage"
(
  cd "$release_dir"
  sha256sum "$versioned_appimage" > "$checksum_file"
)
