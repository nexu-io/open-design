#!/usr/bin/env bash
set -euo pipefail

for name in ENABLE_LINUX ENABLE_MAC ENABLE_MAC_INTEL ENABLE_WIN R2_METADATA_URL RELEASE_CHANNEL RELEASE_VERSION RUNNER_TEMP; do
  if [ -z "${!name:-}" ]; then
    echo "$name is required" >&2
    exit 1
  fi
done

mac_artifact_mode="${MAC_ARTIFACT_MODE:-dmg-and-zip}"
report_zip_url="${R2_REPORT_ZIP_URL:-}"
case "$mac_artifact_mode" in
  dmg-only | dmg-and-zip) ;;
  *)
    echo "unsupported MAC_ARTIFACT_MODE: $mac_artifact_mode" >&2
    exit 1
    ;;
esac

downloaded_report_zip="$RUNNER_TEMP/report.zip"
if [ -n "$report_zip_url" ]; then
  if ! command -v unzip >/dev/null 2>&1; then
    echo "unzip is required to verify R2_REPORT_ZIP_URL" >&2
    exit 1
  fi
  curl -fsSL "$report_zip_url?run=${GITHUB_RUN_ID:-local}" -o "$downloaded_report_zip"
  unzip -t "$downloaded_report_zip" >/dev/null
fi

require_report_file() {
  local path="$1"
  if [ -n "$report_zip_url" ]; then
    if ! unzip -Z1 "$downloaded_report_zip" | grep -Fx "$path" >/dev/null; then
      echo "report.zip is missing expected file: $path" >&2
      exit 1
    fi
  else
    if [ -z "${R2_REPORT_URL:-}" ]; then
      echo "R2_REPORT_URL is required when R2_REPORT_ZIP_URL is not set" >&2
      exit 1
    fi
    curl -fsSI "${R2_REPORT_URL}${path}" >/dev/null
  fi
}

downloaded_metadata="$RUNNER_TEMP/metadata.json"
curl -fsSL "$R2_METADATA_URL?run=${GITHUB_RUN_ID:-local}" -o "$downloaded_metadata"
DOWNLOADED_METADATA="$downloaded_metadata" \
EXPECTED_CHANNEL="$RELEASE_CHANNEL" \
EXPECTED_NIGHTLY_NUMBER="${NIGHTLY_NUMBER:-}" \
EXPECTED_RELEASE_VERSION="$RELEASE_VERSION" \
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
const metadata = JSON.parse(readFileSync(process.env.DOWNLOADED_METADATA, "utf8"));
if (metadata.channel !== process.env.EXPECTED_CHANNEL) {
  throw new Error("unexpected metadata channel: " + metadata.channel);
}
if (metadata.channel === "beta") {
  if (metadata.betaVersion !== process.env.EXPECTED_RELEASE_VERSION) {
    throw new Error("unexpected metadata betaVersion: " + metadata.betaVersion);
  }
} else {
  if (metadata.releaseVersion !== process.env.EXPECTED_RELEASE_VERSION) {
    throw new Error("unexpected metadata releaseVersion: " + metadata.releaseVersion);
  }
  if (metadata.channel === "nightly") {
    if (metadata.nightlyVersion !== process.env.EXPECTED_RELEASE_VERSION) {
      throw new Error("unexpected metadata nightlyVersion: " + metadata.nightlyVersion);
    }
    if (metadata.nightlyNumber !== Number(process.env.EXPECTED_NIGHTLY_NUMBER)) {
      throw new Error("unexpected metadata nightlyNumber: " + metadata.nightlyNumber);
    }
  }
}
NODE

if [ "$ENABLE_MAC" = "true" ]; then
  for name in R2_MAC_DMG_URL; do
    if [ -z "${!name:-}" ]; then
      echo "$name is required when ENABLE_MAC=true" >&2
      exit 1
    fi
  done
  curl -fsSI "$R2_MAC_DMG_URL" >/dev/null
  if [ "$mac_artifact_mode" != "dmg-only" ]; then
    for name in R2_MAC_FEED_URL R2_MAC_ZIP_URL; do
      if [ -z "${!name:-}" ]; then
        echo "$name is required when ENABLE_MAC=true and MAC_ARTIFACT_MODE=$mac_artifact_mode" >&2
        exit 1
      fi
    done
    downloaded_feed="$RUNNER_TEMP/latest-mac.yml"
    curl -fsSL "$R2_MAC_FEED_URL?run=${GITHUB_RUN_ID:-local}" -o "$downloaded_feed"
    grep -F "version: \"$RELEASE_VERSION\"" "$downloaded_feed"
    grep -F "$R2_MAC_ZIP_URL" "$downloaded_feed"
    curl -fsSI "$R2_MAC_ZIP_URL" >/dev/null
  fi
  require_report_file "mac/manifest.json"
  require_report_file "mac/screenshots/open-design-mac-smoke.png"
  require_report_file "mac/tools-pack.json"
  require_report_file "mac/tools-pack.log"
  require_report_file "mac/vitest.log"
fi

if [ "$ENABLE_WIN" = "true" ]; then
  for name in R2_WIN_FEED_URL R2_WIN_INSTALLER_URL; do
    if [ -z "${!name:-}" ]; then
      echo "$name is required when ENABLE_WIN=true" >&2
      exit 1
    fi
  done
  downloaded_feed="$RUNNER_TEMP/latest.yml"
  curl -fsSL "$R2_WIN_FEED_URL?run=${GITHUB_RUN_ID:-local}" -o "$downloaded_feed"
  grep -F "version: \"$RELEASE_VERSION\"" "$downloaded_feed"
  grep -F "$R2_WIN_INSTALLER_URL" "$downloaded_feed"
  curl -fsSI "$R2_WIN_INSTALLER_URL" >/dev/null
  require_report_file "win/manifest.json"
  require_report_file "win/screenshots/open-design-win-smoke.png"
  require_report_file "win/tools-pack.json"
  require_report_file "win/vitest.log"
fi

if [ "$ENABLE_MAC_INTEL" = "true" ]; then
  for name in R2_MAC_INTEL_DMG_URL R2_MAC_INTEL_ZIP_URL; do
    if [ -z "${!name:-}" ]; then
      echo "$name is required when ENABLE_MAC_INTEL=true" >&2
      exit 1
    fi
  done
  curl -fsSI "$R2_MAC_INTEL_DMG_URL" >/dev/null
  curl -fsSI "$R2_MAC_INTEL_ZIP_URL" >/dev/null
fi

if [ "$ENABLE_LINUX" = "true" ]; then
  if [ -z "${R2_LINUX_APPIMAGE_URL:-}" ]; then
    echo "R2_LINUX_APPIMAGE_URL is required when ENABLE_LINUX=true" >&2
    exit 1
  fi
  curl -fsSI "$R2_LINUX_APPIMAGE_URL" >/dev/null
fi
