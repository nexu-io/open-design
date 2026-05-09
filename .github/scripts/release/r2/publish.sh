#!/usr/bin/env bash
set -euo pipefail

for name in AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY BASE_VERSION BRANCH_NAME CLOUDFLARE_R2_RELEASES_BUCKET CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN CLOUDFLARE_R2_RELEASES_URL ENABLE_LINUX ENABLE_MAC ENABLE_MAC_INTEL ENABLE_WIN GITHUB_OUTPUT RELEASE_CHANNEL RELEASE_SIGNED RELEASE_VERSION RUNNER_TEMP STATE_SOURCE; do
  if [ -z "${!name:-}" ]; then
    echo "$name is required" >&2
    exit 1
  fi
done

asset_version_suffix="${ASSET_VERSION_SUFFIX:-}"
mac_intel_asset_suffix="${MAC_INTEL_ASSET_SUFFIX:-$asset_version_suffix}"
win_asset_suffix="${WIN_ASSET_SUFFIX:-$asset_version_suffix}"
linux_asset_suffix="${LINUX_ASSET_SUFFIX:-$asset_version_suffix}"
mac_artifact_mode="${MAC_ARTIFACT_MODE:-dmg-and-zip}"
release_root="${RELEASE_ROOT:-$RUNNER_TEMP/release-assets}"
report_root="${REPORT_ROOT:-$RUNNER_TEMP/release-report}"
report_mode="${REPORT_MODE:-directory}"
report_zip_path="${REPORT_ZIP_PATH:-$RUNNER_TEMP/release-report.zip}"
public_origin="${CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN%/}"
version_prefix="${RELEASE_VERSION_PREFIX:-$RELEASE_CHANNEL/versions/$RELEASE_VERSION$asset_version_suffix}"
latest_prefix="${RELEASE_CHANNEL}/latest"

case "$mac_artifact_mode" in
  dmg-only | dmg-and-zip) ;;
  *)
    echo "unsupported MAC_ARTIFACT_MODE: $mac_artifact_mode" >&2
    exit 1
    ;;
esac

case "$report_mode" in
  directory | zip) ;;
  *)
    echo "unsupported REPORT_MODE: $report_mode" >&2
    exit 1
    ;;
esac

upload() {
  local file_path="$1"
  local object_key="$2"
  local content_type="$3"
  local cache_control="$4"
  if [ ! -f "$file_path" ]; then
    echo "expected upload file not found: $file_path" >&2
    exit 1
  fi
  aws --endpoint-url "${CLOUDFLARE_R2_RELEASES_URL%/}" s3api put-object \
    --bucket "$CLOUDFLARE_R2_RELEASES_BUCKET" \
    --key "$object_key" \
    --body "$file_path" \
    --content-type "$content_type" \
    --cache-control "$cache_control" \
    --no-cli-pager >/dev/null
}

report_content_type() {
  case "$1" in
    *.html) printf '%s' "text/html; charset=utf-8" ;;
    *.json) printf '%s' "application/json; charset=utf-8" ;;
    *.log) printf '%s' "text/plain; charset=utf-8" ;;
    *.png) printf '%s' "image/png" ;;
    *.txt) printf '%s' "text/plain; charset=utf-8" ;;
    *.xml) printf '%s' "application/xml; charset=utf-8" ;;
    *) printf '%s' "application/octet-stream" ;;
  esac
}

upload_report_tree() {
  local root="$1"
  if [ ! -d "$root" ]; then
    echo "e2e spec report root does not exist at $root; skipping"
    return
  fi
  local uploaded_count=0
  while IFS= read -r -d '' file_path; do
    local relative_path="${file_path#"${root}/"}"
    upload "$file_path" "$version_prefix/report/$relative_path" "$(report_content_type "$relative_path")" "public, max-age=31536000, immutable"
    uploaded_count=$((uploaded_count + 1))
  done < <(find "$root" -type f -print0 | sort -z)
  echo "uploaded e2e spec report files: $uploaded_count"
}

upload_report_zip() {
  local root="$1"
  local zip_path="$2"
  if ! command -v zip >/dev/null 2>&1; then
    echo "zip is required to publish REPORT_MODE=zip" >&2
    exit 1
  fi

  mkdir -p "$root"
  if ! find "$root" -type f -print -quit | grep -q .; then
    printf '%s\n' "No release report files were generated for this run." > "$root/README.txt"
  fi

  rm -f "$zip_path"
  (
    cd "$root"
    zip -qr "$zip_path" .
  )
  upload "$zip_path" "$version_prefix/report.zip" "application/zip" "public, max-age=31536000, immutable"
  echo "uploaded release report zip: $zip_path"
}

mac_dmg="open-design-$RELEASE_VERSION$asset_version_suffix-mac-arm64.dmg"
mac_zip="open-design-$RELEASE_VERSION$asset_version_suffix-mac-arm64.zip"
mac_intel_dmg="open-design-$RELEASE_VERSION$mac_intel_asset_suffix-mac-x64.dmg"
mac_intel_zip="open-design-$RELEASE_VERSION$mac_intel_asset_suffix-mac-x64.zip"
win_installer="open-design-$RELEASE_VERSION$win_asset_suffix-win-x64-setup.exe"
linux_appimage="open-design-$RELEASE_VERSION$linux_asset_suffix-linux-x64.AppImage"
metadata_path="$release_root/metadata.json"

if [ "$ENABLE_MAC" = "true" ]; then
  upload "$release_root/mac/$mac_dmg" "$version_prefix/$mac_dmg" "application/x-apple-diskimage" "public, max-age=31536000, immutable"
  upload "$release_root/mac/$mac_dmg.sha256" "$version_prefix/$mac_dmg.sha256" "text/plain; charset=utf-8" "public, max-age=31536000, immutable"
  {
    echo "mac_dmg_url=$public_origin/$version_prefix/$mac_dmg"
  } >> "$GITHUB_OUTPUT"
  if [ "$mac_artifact_mode" != "dmg-only" ]; then
    upload "$release_root/mac/$mac_zip" "$version_prefix/$mac_zip" "application/zip" "public, max-age=31536000, immutable"
    upload "$release_root/mac/$mac_zip.sha256" "$version_prefix/$mac_zip.sha256" "text/plain; charset=utf-8" "public, max-age=31536000, immutable"
    upload "$release_root/mac/latest-mac.yml" "$version_prefix/latest-mac.yml" "application/x-yaml; charset=utf-8" "public, max-age=31536000, immutable"
    upload "$release_root/mac/latest-mac.yml" "$latest_prefix/latest-mac.yml" "application/x-yaml; charset=utf-8" "public, max-age=60, must-revalidate"
    {
      echo "mac_zip_url=$public_origin/$version_prefix/$mac_zip"
      echo "mac_feed_url=$public_origin/$latest_prefix/latest-mac.yml"
    } >> "$GITHUB_OUTPUT"
  fi
fi

if [ "$ENABLE_WIN" = "true" ]; then
  upload "$release_root/win/$win_installer" "$version_prefix/$win_installer" "application/vnd.microsoft.portable-executable" "public, max-age=31536000, immutable"
  upload "$release_root/win/$win_installer.sha256" "$version_prefix/$win_installer.sha256" "text/plain; charset=utf-8" "public, max-age=31536000, immutable"
  upload "$release_root/win/latest.yml" "$version_prefix/latest.yml" "application/x-yaml; charset=utf-8" "public, max-age=31536000, immutable"
  upload "$release_root/win/latest.yml" "$latest_prefix/latest.yml" "application/x-yaml; charset=utf-8" "public, max-age=60, must-revalidate"
  {
    echo "win_installer_url=$public_origin/$version_prefix/$win_installer"
    echo "win_feed_url=$public_origin/$latest_prefix/latest.yml"
  } >> "$GITHUB_OUTPUT"
fi

if [ "$ENABLE_MAC_INTEL" = "true" ]; then
  upload "$release_root/mac-intel/$mac_intel_dmg" "$version_prefix/$mac_intel_dmg" "application/x-apple-diskimage" "public, max-age=31536000, immutable"
  upload "$release_root/mac-intel/$mac_intel_zip" "$version_prefix/$mac_intel_zip" "application/zip" "public, max-age=31536000, immutable"
  upload "$release_root/mac-intel/$mac_intel_dmg.sha256" "$version_prefix/$mac_intel_dmg.sha256" "text/plain; charset=utf-8" "public, max-age=31536000, immutable"
  upload "$release_root/mac-intel/$mac_intel_zip.sha256" "$version_prefix/$mac_intel_zip.sha256" "text/plain; charset=utf-8" "public, max-age=31536000, immutable"
  {
    echo "mac_intel_dmg_url=$public_origin/$version_prefix/$mac_intel_dmg"
    echo "mac_intel_zip_url=$public_origin/$version_prefix/$mac_intel_zip"
  } >> "$GITHUB_OUTPUT"
fi

if [ "$ENABLE_LINUX" = "true" ]; then
  upload "$release_root/linux/$linux_appimage" "$version_prefix/$linux_appimage" "application/octet-stream" "public, max-age=31536000, immutable"
  upload "$release_root/linux/$linux_appimage.sha256" "$version_prefix/$linux_appimage.sha256" "text/plain; charset=utf-8" "public, max-age=31536000, immutable"
  {
    echo "linux_appimage_url=$public_origin/$version_prefix/$linux_appimage"
  } >> "$GITHUB_OUTPUT"
fi

if [ "$report_mode" = "zip" ]; then
  upload_report_zip "$report_root" "$report_zip_path"
else
  upload_report_tree "$report_root"
fi

RELEASE_ROOT="$release_root" \
PUBLIC_ORIGIN="$public_origin" \
VERSION_PREFIX="$version_prefix" \
LATEST_PREFIX="$latest_prefix" \
REPORT_MODE="$report_mode" \
REPORT_ZIP_PATH="$report_zip_path" \
MAC_DMG="$mac_dmg" \
MAC_ZIP="$mac_zip" \
MAC_INTEL_DMG="$mac_intel_dmg" \
MAC_INTEL_ZIP="$mac_intel_zip" \
WIN_INSTALLER="$win_installer" \
LINUX_APPIMAGE="$linux_appimage" \
MAC_ARTIFACT_MODE="$mac_artifact_mode" \
METADATA_PATH="$metadata_path" \
node --input-type=module <<'NODE'
import { existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const env = process.env;
const enabled = (name) => env[name] === "true";
const publicOrigin = env.PUBLIC_ORIGIN;
const versionPrefix = env.VERSION_PREFIX;
const latestPrefix = env.LATEST_PREFIX;
const releaseRoot = env.RELEASE_ROOT;
const url = (prefix, name) => `${publicOrigin}/${prefix}/${name}`;
const mustExist = (path) => {
  if (!existsSync(path)) throw new Error(`metadata source file missing: ${path}`);
  return statSync(path).size;
};
const fileEntryFromPath = (path, name, contentType) => ({
  contentType,
  name,
  size: mustExist(path),
  url: url(versionPrefix, name),
});
const fileEntry = (directory, name, contentType) => {
  const path = join(releaseRoot, directory, name);
  return {
    contentType,
    name,
    sha256Url: url(versionPrefix, `${name}.sha256`),
    size: mustExist(path),
    url: url(versionPrefix, name),
  };
};

const platforms = {};
if (enabled("ENABLE_MAC")) {
  const artifacts = {
    dmg: fileEntry("mac", env.MAC_DMG, "application/x-apple-diskimage"),
  };
  const feed = env.MAC_ARTIFACT_MODE === "dmg-only"
    ? null
    : {
        latestUrl: url(latestPrefix, "latest-mac.yml"),
        name: "latest-mac.yml",
        url: url(versionPrefix, "latest-mac.yml"),
      };
  if (env.MAC_ARTIFACT_MODE !== "dmg-only") {
    artifacts.zip = fileEntry("mac", env.MAC_ZIP, "application/zip");
  }
  platforms.mac = {
    arch: "arm64",
    enabled: true,
    feed,
    signed: env.RELEASE_SIGNED === "true",
    artifacts,
  };
}
if (enabled("ENABLE_WIN")) {
  platforms.win = {
    arch: "x64",
    enabled: true,
    feed: {
      latestUrl: url(latestPrefix, "latest.yml"),
      name: "latest.yml",
      url: url(versionPrefix, "latest.yml"),
    },
    signed: false,
    artifacts: {
      installer: fileEntry("win", env.WIN_INSTALLER, "application/vnd.microsoft.portable-executable"),
    },
  };
}
if (enabled("ENABLE_LINUX")) {
  platforms.linux = {
    arch: "x64",
    enabled: true,
    feed: null,
    signed: false,
    artifacts: {
      appImage: fileEntry("linux", env.LINUX_APPIMAGE, "application/octet-stream"),
    },
  };
}
if (enabled("ENABLE_MAC_INTEL")) {
  platforms.macIntel = {
    arch: "x64",
    enabled: true,
    feed: null,
    signed: false,
    artifacts: {
      dmg: fileEntry("mac-intel", env.MAC_INTEL_DMG, "application/x-apple-diskimage"),
      zip: fileEntry("mac-intel", env.MAC_INTEL_ZIP, "application/zip"),
    },
  };
}

const commonMetadata = {
  channel: env.RELEASE_CHANNEL,
  generatedAt: new Date().toISOString(),
  github: {
    branch: env.BRANCH_NAME,
    commit: env.GITHUB_SHA,
    repository: env.GITHUB_REPOSITORY,
    runAttempt: Number(env.GITHUB_RUN_ATTEMPT),
    runId: Number(env.GITHUB_RUN_ID),
    workflow: env.GITHUB_WORKFLOW,
  },
  platforms,
  r2: {
    latestMetadataUrl: url(latestPrefix, "metadata.json"),
    latestPrefix,
    publicOrigin,
    report: env.REPORT_MODE === "zip"
      ? {
          type: "zip",
          ...fileEntryFromPath(env.REPORT_ZIP_PATH, "report.zip", "application/zip"),
        }
      : {
          type: "directory",
          url: url(versionPrefix, "report/"),
        },
    reportUrl: env.REPORT_MODE === "directory" ? url(versionPrefix, "report/") : null,
    reportZipUrl: env.REPORT_MODE === "zip" ? url(versionPrefix, "report.zip") : null,
    versionMetadataUrl: url(versionPrefix, "metadata.json"),
    versionPrefix,
  },
  signed: env.RELEASE_SIGNED === "true",
  stateSource: env.STATE_SOURCE,
  version: 1,
};

let metadata;
if (env.RELEASE_CHANNEL === "beta") {
  metadata = {
    assetVersionSuffix: env.ASSET_VERSION_SUFFIX ?? "",
    baseVersion: env.BASE_VERSION,
    betaNumber: Number(env.RELEASE_VERSION.split("-beta.")[1]),
    betaVersion: env.RELEASE_VERSION,
    ...commonMetadata,
  };
} else {
  metadata = {
    baseVersion: env.BASE_VERSION,
    releaseVersion: env.RELEASE_VERSION,
    stableVersion: env.BASE_VERSION,
    ...commonMetadata,
  };
  if (env.RELEASE_CHANNEL === "nightly") {
    metadata.nightlyNumber = Number(env.NIGHTLY_NUMBER);
    metadata.nightlyVersion = env.RELEASE_VERSION;
  } else {
    metadata.versionTag = env.VERSION_TAG;
  }
}

writeFileSync(env.METADATA_PATH, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
NODE

upload "$metadata_path" "$version_prefix/metadata.json" "application/json; charset=utf-8" "public, max-age=31536000, immutable"
upload "$metadata_path" "$latest_prefix/metadata.json" "application/json; charset=utf-8" "public, max-age=60, must-revalidate"

{
  echo "metadata_url=$public_origin/$latest_prefix/metadata.json"
  echo "version_metadata_url=$public_origin/$version_prefix/metadata.json"
  echo "version_prefix=$version_prefix"
  if [ "$report_mode" = "zip" ]; then
    echo "report_zip_url=$public_origin/$version_prefix/report.zip"
  else
    echo "report_url=$public_origin/$version_prefix/report/"
  fi
} >> "$GITHUB_OUTPUT"
