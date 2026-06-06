#!/usr/bin/env bash
set -euo pipefail

required() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "$name is required" >&2
    exit 1
  fi
}

sha256_file() {
  local path="$1"
  local name
  name="$(basename "$path")"
  (
    cd "$(dirname "$path")"
    shasum -a 256 "$name" > "$name.sha256"
  )
}

required RELEASE_ASSETS_DIR
required RELEASE_ASSET_SUFFIX
required RELEASE_CHANNEL
required RELEASE_NAMESPACE
required RELEASE_PUBLIC_ORIGIN
required RELEASE_TARGET
required RELEASE_VERSION
required TOOLS_PACK_DIR

mkdir -p "$RELEASE_ASSETS_DIR"

case "$RELEASE_TARGET" in
  mac_arm64 | mac_x64)
    artifact_mode="${RELEASE_ARTIFACT_MODE:-dmg-and-zip}"
    case "$artifact_mode" in
      dmg-only | dmg-and-zip) ;;
      *)
        echo "unsupported RELEASE_ARTIFACT_MODE for $RELEASE_TARGET: $artifact_mode" >&2
        exit 1
        ;;
    esac

    arch="${RELEASE_TARGET#mac_}"
    source_dmg="$TOOLS_PACK_DIR/out/mac/namespaces/$RELEASE_NAMESPACE/dmg/Open Design-$RELEASE_NAMESPACE.dmg"
    source_zip="$TOOLS_PACK_DIR/out/mac/namespaces/$RELEASE_NAMESPACE/zip/Open Design-$RELEASE_NAMESPACE.zip"
    versioned_dmg="open-design-$RELEASE_VERSION$RELEASE_ASSET_SUFFIX-mac-$arch.dmg"
    versioned_zip="open-design-$RELEASE_VERSION$RELEASE_ASSET_SUFFIX-mac-$arch.zip"

    if [ ! -f "$source_dmg" ]; then
      echo "expected dmg not found at $source_dmg" >&2
      exit 1
    fi
    cp "$source_dmg" "$RELEASE_ASSETS_DIR/$versioned_dmg"
    sha256_file "$RELEASE_ASSETS_DIR/$versioned_dmg"

    if [ "$artifact_mode" = "dmg-only" ]; then
      exit 0
    fi
    if [ ! -f "$source_zip" ]; then
      echo "expected zip not found at $source_zip" >&2
      exit 1
    fi
    cp "$source_zip" "$RELEASE_ASSETS_DIR/$versioned_zip"
    sha256_file "$RELEASE_ASSETS_DIR/$versioned_zip"

    zip_sha512="$(openssl dgst -sha512 -binary "$RELEASE_ASSETS_DIR/$versioned_zip" | openssl base64 -A)"
    zip_size="$(stat -f%z "$RELEASE_ASSETS_DIR/$versioned_zip")"
    version_prefix="${RELEASE_VERSION_PREFIX:-$RELEASE_CHANNEL/versions/$RELEASE_VERSION$RELEASE_ASSET_SUFFIX}"
    zip_url="${RELEASE_PUBLIC_ORIGIN%/}/$version_prefix/$versioned_zip"
    release_date="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    release_notes="${RELEASE_NOTES:-Open Design $RELEASE_VERSION$RELEASE_ASSET_SUFFIX}"
    cat > "$RELEASE_ASSETS_DIR/latest-mac.yml" <<EOF
version: "$RELEASE_VERSION"
files:
  - url: "$zip_url"
    sha512: "$zip_sha512"
    size: $zip_size
path: "$zip_url"
sha512: "$zip_sha512"
releaseDate: "$release_date"
releaseNotes: "$release_notes"
EOF
    ;;
  linux_x64)
    source_appimage="$TOOLS_PACK_DIR/out/linux/namespaces/$RELEASE_NAMESPACE/builder/Open Design-$RELEASE_NAMESPACE.AppImage"
    versioned_appimage="open-design-$RELEASE_VERSION$RELEASE_ASSET_SUFFIX-linux-x64.AppImage"
    if [ ! -f "$source_appimage" ]; then
      echo "expected AppImage not found at $source_appimage" >&2
      exit 1
    fi
    cp "$source_appimage" "$RELEASE_ASSETS_DIR/$versioned_appimage"
    sha256_file "$RELEASE_ASSETS_DIR/$versioned_appimage"
    ;;
  *)
    echo "unsupported RELEASE_TARGET for POSIX assets: $RELEASE_TARGET" >&2
    exit 1
    ;;
esac
