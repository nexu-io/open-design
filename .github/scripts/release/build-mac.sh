#!/usr/bin/env bash
set -euo pipefail

source_profile="${OPEN_DESIGN_RELEASE_PROFILE:-}"
if [ -n "$source_profile" ]; then
  # Self-hosted mac runners run as LaunchDaemons with a thin default PATH.
  # Source the runner profile explicitly when the workflow provides one.
  if ! command -v rehash >/dev/null 2>&1; then
    rehash() { hash -r; }
  fi
  # shellcheck disable=SC1090
  source "$source_profile"
fi

required() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "$name is required" >&2
    exit 1
  fi
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "$name is required" >&2
    exit 1
  fi
}

ensure_pnpm() {
  require_command corepack
  corepack enable
  corepack prepare pnpm@10.33.2 --activate
  hash -r
  local pnpm_version
  pnpm_version="$(pnpm --version)"
  if [ "$pnpm_version" != "10.33.2" ]; then
    echo "expected pnpm 10.33.2, got $pnpm_version" >&2
    exit 1
  fi
}

format_duration() {
  local ms="$1"
  if [ "$ms" -ge 60000 ]; then
    node -e 'process.stdout.write(`${Math.round((Number(process.argv[1]) / 60000) * 10) / 10}m`)' "$ms"
  else
    node -e 'process.stdout.write(`${Math.round((Number(process.argv[1]) / 1000) * 10) / 10}s`)' "$ms"
  fi
}

measure_step() {
  local name="$1"
  shift
  echo "##[group]$name"
  local started duration
  started="$(node -e 'process.stdout.write(String(Date.now()))')"
  if "$@"; then
    duration="$(( $(node -e 'process.stdout.write(String(Date.now()))') - started ))"
    timings_json="${timings_json:+$timings_json,}{\"step\":$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$name"),\"status\":\"success\",\"durationMs\":$duration}"
    echo "[$name] success in $(format_duration "$duration")"
  else
    local status=$?
    duration="$(( $(node -e 'process.stdout.write(String(Date.now()))') - started ))"
    timings_json="${timings_json:+$timings_json,}{\"step\":$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$name"),\"status\":\"failed\",\"durationMs\":$duration}"
    echo "[$name] failed in $(format_duration "$duration")"
    echo "##[endgroup]"
    return "$status"
  fi
  echo "##[endgroup]"
}

inspect_electron_framework_symlinks() {
  local electron_dist framework missing_links
  electron_dist="$(node -e 'const path = require("node:path"); const { createRequire } = require("node:module"); const requireFromDesktop = createRequire(path.join(process.cwd(), "apps/desktop/package.json")); const electron = requireFromDesktop.resolve("electron"); process.stdout.write(path.join(path.dirname(electron), "dist"));')"
  framework="$electron_dist/Electron.app/Contents/Frameworks/Electron Framework.framework"
  missing_links=0
  for link in \
    "$framework/Electron Framework" \
    "$framework/Helpers" \
    "$framework/Libraries" \
    "$framework/Resources" \
    "$framework/Versions/Current"; do
    if [ ! -L "$link" ]; then
      echo "diagnostic: expected Electron framework symlink, got non-symlink: $link"
      missing_links=1
    fi
  done
  if [ "$missing_links" -ne 0 ]; then
    ls -la "$framework" >&2 || true
    ls -la "$framework/Versions" >&2 || true
    echo "Continuing into tools-pack because electron-builder is the source of truth for whether packaging actually works."
  fi
}

prepare_mac_signing() {
  required APPLE_SIGNING_CERTIFICATE_BASE64
  required APPLE_SIGNING_CERTIFICATE_PASSWORD

  local cert_path="$RUNNER_TEMP/open-design-signing.p12"
  if ! printf '%s' "$APPLE_SIGNING_CERTIFICATE_BASE64" | base64 --decode > "$cert_path" 2>/dev/null; then
    printf '%s' "$APPLE_SIGNING_CERTIFICATE_BASE64" | base64 -D > "$cert_path"
  fi
  export CSC_LINK="$cert_path"
  export CSC_KEY_PASSWORD="$APPLE_SIGNING_CERTIFICATE_PASSWORD"
}

prepare_mac_notarization() {
  required APPLE_ID
  required APPLE_TEAM_ID
  required APPLE_NOTARY_KEYCHAIN_PROFILE
}

install_mac_signing_keychain() {
  local cert_path="$1"
  local helper="${OPEN_DESIGN_MAC_SIGNING_HELPER:-}"
  if [ -z "$helper" ]; then
    return 1
  fi

  local password_path="$RUNNER_TEMP/open-design-signing.p12.password"
  printf '%s' "$APPLE_SIGNING_CERTIFICATE_PASSWORD" > "$password_path"
  chmod 600 "$password_path"

  echo "mac signing: installing identity through sudo helper"
  set +e
  sudo -n "$helper" "$cert_path" "$password_path"
  local status=$?
  set -e
  if [ "$status" -ne 0 ]; then
    rm -f "$password_path"
    return "$status"
  fi
  rm -f "$password_path"

  export CSC_KEYCHAIN="${OPEN_DESIGN_MAC_SIGNING_KEYCHAIN:-/Library/Keychains/open-design-release-signing.keychain}"
  local wrapper_dir="${OPEN_DESIGN_MAC_SIGNING_WRAPPER_DIR:-/usr/local/libexec/open-design/wrappers}"
  if [ -x "$wrapper_dir/codesign" ]; then
    export PATH="$wrapper_dir:$PATH"
  fi
  security list-keychains -d user -s "$CSC_KEYCHAIN" /Library/Keychains/System.keychain
  unset CSC_LINK
  unset CSC_KEY_PASSWORD
  return 0
}

select_mac_signing_identity() {
  local keychain_path="${CSC_KEYCHAIN:-}"
  if [ -z "$keychain_path" ]; then
    return 0
  fi

  local identities identity_name csc_name
  identities="$(security find-identity -v -p codesigning "$keychain_path")"
  printf '%s\n' "$identities"
  identity_name="$(printf '%s\n' "$identities" | sed -n 's/.*"\(Developer ID Application:[^"]*\)".*/\1/p' | head -n 1)"
  if [ -z "$identity_name" ]; then
    echo "mac signing failed: no Developer ID Application identity found in $keychain_path" >&2
    exit 1
  fi

  csc_name="${identity_name#Developer ID Application: }"
  export CSC_NAME="$csc_name"
  echo "mac signing: selected CSC_NAME=$CSC_NAME"
}

capture_framework_diagnostics() {
  local namespace="$1"
  local output="${MAC_FRAMEWORK_DIAGNOSTICS_PATH:-$RUNNER_TEMP/mac-framework-diagnostics.txt}"
  local source_resolve_log="$RUNNER_TEMP/mac-framework-source-resolve.err"
  local source_framework built_framework
  source_framework="$(node -e 'const path = require("node:path"); const { createRequire } = require("node:module"); const requireFromDesktop = createRequire(path.join(process.cwd(), "apps/desktop/package.json")); const electron = requireFromDesktop.resolve("electron"); process.stdout.write(path.join(path.dirname(electron), "dist", "Electron.app", "Contents", "Frameworks", "Electron Framework.framework"));' 2>"$source_resolve_log" || true)"
  built_framework="$tools_pack_dir/out/mac/namespaces/$namespace/builder/mac-arm64/Open Design Beta.app/Contents/Frameworks/Electron Framework.framework"

  dump_framework() {
    local label="$1"
    local framework="$2"
    echo "## $label"
    echo "path=$framework"
    if [ ! -e "$framework" ] && [ ! -L "$framework" ]; then
      echo "missing"
      return 0
    fi
    echo "### top-level"
    ls -la "$framework" || true
    echo "### symlinks"
    find "$framework" -maxdepth 4 -type l -print0 | while IFS= read -r -d '' link; do
      printf '%s -> %s\n' "$link" "$(readlink "$link")"
    done || true
    echo "### selected stat"
    for path in \
      "$framework" \
      "$framework/Electron Framework" \
      "$framework/Versions" \
      "$framework/Versions/Current" \
      "$framework/Versions/Current/Electron Framework" \
      "$framework/Versions/A" \
      "$framework/Versions/A/Electron Framework" \
      "$framework/Resources" \
      "$framework/Versions/A/Resources/Info.plist"; do
      if [ -e "$path" ] || [ -L "$path" ]; then
        stat -f '%Sp %HT %N' "$path" || true
      else
        echo "missing: $path"
      fi
    done
    echo "### plist"
    plutil -p "$framework/Versions/A/Resources/Info.plist" 2>&1 || true
    echo "### codesign display"
    /usr/bin/codesign --display --verbose=4 "$framework/Electron Framework" 2>&1 || true
    /usr/bin/codesign --display --verbose=4 "$framework/Versions/Current/Electron Framework" 2>&1 || true
    /usr/bin/codesign --display --verbose=4 "$framework/Versions/A/Electron Framework" 2>&1 || true
    /usr/bin/codesign --display --verbose=4 "$framework" 2>&1 || true
  }

  {
    date -u
    if [ -n "$source_framework" ]; then
      dump_framework "source Electron Framework" "$source_framework"
    else
      echo "## source Electron Framework"
      echo "resolve failed"
      cat "$source_resolve_log" || true
    fi
    dump_framework "built Electron Framework" "$built_framework"
  } > "$output"
  cat "$output"
}

required RELEASE_VERSION
required RUNNER_TEMP

tools_pack_dir="${TOOLS_PACK_DIR:-$RUNNER_TEMP/tools-pack}"
cache_dir="${TOOLS_PACK_CACHE_DIR:-$RUNNER_TEMP/tools-pack-cache}"
build_json_path="${BUILD_JSON_PATH:-$RUNNER_TEMP/mac-tools-pack-build.json}"
build_log_path="${BUILD_LOG_PATH:-$RUNNER_TEMP/mac-tools-pack-build.log}"
namespace="${TOOLS_PACK_NAMESPACE:-release-beta}"
sign_mode="${MAC_SIGN_MODE:-sign-only}"
target="${MAC_BUILD_TARGET:-dmg}"
compression="${MAC_COMPRESSION:-normal}"
require_vela_cli="${REQUIRE_VELA_CLI:-true}"

case "$sign_mode" in
  no | sign-only | notarize) ;;
  *)
    echo "unsupported MAC_SIGN_MODE: $sign_mode" >&2
    exit 1
    ;;
esac

case "$require_vela_cli" in
  true | false) ;;
  *)
    echo "unsupported REQUIRE_VELA_CLI: $require_vela_cli" >&2
    exit 1
    ;;
esac

require_command node
ensure_pnpm
echo "node=$(node --version)"
echo "pnpm=$(pnpm --version)"
echo "tools_pack_dir=$tools_pack_dir"
echo "tools_pack_cache_dir=$cache_dir"

timings_json=""
mkdir -p "$cache_dir" "$(dirname "$build_json_path")" "$(dirname "$build_log_path")"
: > "$build_log_path"

measure_step "pnpm install" pnpm install --frozen-lockfile
measure_step "electron framework symlink inspection" inspect_electron_framework_symlinks

if [ "$sign_mode" != "no" ]; then
  measure_step "prepare mac signing" prepare_mac_signing
  if [ -n "${OPEN_DESIGN_MAC_SIGNING_HELPER:-}" ]; then
    measure_step "install mac signing keychain" install_mac_signing_keychain "$CSC_LINK"
  fi
  measure_step "select mac signing identity" select_mac_signing_identity
fi

if [ "$sign_mode" = "notarize" ]; then
  measure_step "prepare mac notarization" prepare_mac_notarization
fi

rm -rf "$tools_pack_dir"

build_args=(
  exec tools-pack mac build
  --dir "$tools_pack_dir"
  --cache-dir "$cache_dir"
  --namespace "$namespace"
  --portable
  --app-version "$RELEASE_VERSION"
  --mac-compression "$compression"
  --to "$target"
  --json
)
if [ "$require_vela_cli" = "true" ]; then
  build_args+=(--require-vela-cli)
fi
if [ "$sign_mode" != "no" ]; then
  build_args+=(--signed)
fi
if [ "$sign_mode" = "notarize" ]; then
  build_args+=(--notarize)
fi

if build_output="$(pnpm "${build_args[@]}" 2> >(tee -a "$build_log_path" >&2))"; then
  printf '%s\n' "$build_output" | tee "$build_json_path"
  BUILD_JSON_PATH="$build_json_path" TIMINGS_JSON="[$timings_json]" node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const path = process.env.BUILD_JSON_PATH;
const build = JSON.parse(readFileSync(path, "utf8"));
const wrapperTimings = JSON.parse(process.env.TIMINGS_JSON ?? "[]");
build.releaseScriptTimings = wrapperTimings;
writeFileSync(path, `${JSON.stringify(build, null, 2)}\n`, "utf8");
NODE
else
  build_status=$?
  printf '%s\n' "$build_output"
  capture_framework_diagnostics "$namespace" || true
  exit "$build_status"
fi
