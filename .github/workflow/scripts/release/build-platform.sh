#!/usr/bin/env bash
set -euo pipefail

required() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "$name is required" >&2
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
    release_timings_json="${release_timings_json:+$release_timings_json,}{\"step\":$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$name"),\"status\":\"success\",\"durationMs\":$duration}"
    echo "[$name] success in $(format_duration "$duration")"
  else
    local status=$?
    duration="$(( $(node -e 'process.stdout.write(String(Date.now()))') - started ))"
    release_timings_json="${release_timings_json:+$release_timings_json,}{\"step\":$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$name"),\"status\":\"failed\",\"durationMs\":$duration}"
    echo "[$name] failed in $(format_duration "$duration")"
    echo "##[endgroup]"
    return "$status"
  fi
  echo "##[endgroup]"
}

prepare_mac_signing() {
  if [ -n "${CSC_KEYCHAIN:-}" ]; then
    unset CSC_LINK
    unset CSC_KEY_PASSWORD
    return 0
  fi

  required APPLE_SIGNING_CERTIFICATE_BASE64
  required APPLE_SIGNING_CERTIFICATE_PASSWORD

  local cert_path="$RELEASE_WORK_DIR/open-design-signing.p12"
  if ! printf '%s' "$APPLE_SIGNING_CERTIFICATE_BASE64" | base64 --decode > "$cert_path" 2>/dev/null; then
    printf '%s' "$APPLE_SIGNING_CERTIFICATE_BASE64" | base64 -D > "$cert_path"
  fi
  export CSC_LINK="$cert_path"
  export CSC_KEY_PASSWORD="$APPLE_SIGNING_CERTIFICATE_PASSWORD"
}

prepare_mac_notarization() {
  required APPLE_ID
  required APPLE_TEAM_ID
  if [ -z "${APPLE_NOTARY_KEYCHAIN_PROFILE:-}" ]; then
    required APPLE_APP_SPECIFIC_PASSWORD
  fi
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

write_outputs() {
  node --input-type=module <<'NODE'
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const build = JSON.parse(readFileSync(process.env.BUILD_JSON_PATH, "utf8"));
const outputs = {
  build_json_path: process.env.BUILD_JSON_PATH,
  build_log_path: process.env.BUILD_LOG_PATH ?? "",
  release_target: process.env.RELEASE_TARGET,
  release_version: process.env.RELEASE_VERSION,
  ...(build.appPath ? { app_path: build.appPath } : {}),
  ...(build.dmgPath ? { dmg_path: build.dmgPath } : {}),
  ...(build.payloadPath ? { payload_path: build.payloadPath } : {}),
  ...(build.zipPath ? { zip_path: build.zipPath } : {}),
  ...(build.outputRoot ? { output_root: build.outputRoot } : {}),
};
mkdirSync(dirname(process.env.RELEASE_OUTPUTS_PATH), { recursive: true });
writeFileSync(process.env.RELEASE_OUTPUTS_PATH, `${JSON.stringify(outputs, null, 2)}\n`, "utf8");
NODE
}

required BUILD_JSON_PATH
required BUILD_LOG_PATH
required RELEASE_BUILD_TARGET
required RELEASE_NAMESPACE
required RELEASE_OUTPUTS_PATH
required RELEASE_SMOKE_MODE
required RELEASE_TARGET
required RELEASE_VERSION
required RELEASE_WORK_DIR
required TOOLS_PACK_CACHE_DIR
required TOOLS_PACK_DIR

case "$RELEASE_SMOKE_MODE" in
  skip | core | full) ;;
  *) echo "unsupported RELEASE_SMOKE_MODE: $RELEASE_SMOKE_MODE" >&2; exit 1 ;;
esac

mkdir -p "$RELEASE_WORK_DIR" "$TOOLS_PACK_CACHE_DIR" "$(dirname "$BUILD_JSON_PATH")" "$(dirname "$BUILD_LOG_PATH")"
: > "$BUILD_LOG_PATH"
release_timings_json=""

case "$RELEASE_TARGET" in
  mac_arm64 | mac_x64)
    sign_mode="${RELEASE_SIGN_MODE:-no}"
    case "$sign_mode" in
      no | sign-only | notarize) ;;
      *) echo "unsupported RELEASE_SIGN_MODE: $sign_mode" >&2; exit 1 ;;
    esac
    case "$RELEASE_BUILD_TARGET" in
      dmg | all) ;;
      *) echo "unsupported mac RELEASE_BUILD_TARGET: $RELEASE_BUILD_TARGET" >&2; exit 1 ;;
    esac

    if [ "$sign_mode" != "no" ]; then
      measure_step "prepare mac signing" prepare_mac_signing
      measure_step "select mac signing identity" select_mac_signing_identity
    fi
    if [ "$sign_mode" = "notarize" ]; then
      measure_step "prepare mac notarization" prepare_mac_notarization
    fi

    rm -rf "$TOOLS_PACK_DIR"
    build_args=(
      exec tools-pack mac build
      --dir "$TOOLS_PACK_DIR"
      --cache-dir "$TOOLS_PACK_CACHE_DIR"
      --namespace "$RELEASE_NAMESPACE"
      --portable
      --app-version "$RELEASE_VERSION"
      --mac-compression "${MAC_COMPRESSION:-normal}"
      --to "$RELEASE_BUILD_TARGET"
      --json
    )
    if [ "${REQUIRE_VELA_CLI:-false}" = "true" ]; then
      build_args+=(--require-vela-cli)
    fi
    if [ "$sign_mode" != "no" ]; then
      build_args+=(--signed)
    fi
    if [ "$sign_mode" = "notarize" ]; then
      build_args+=(--notarize)
    fi
    ;;
  linux_x64)
    if [ "$RELEASE_BUILD_TARGET" != "appimage" ]; then
      echo "unsupported linux_x64 RELEASE_BUILD_TARGET: $RELEASE_BUILD_TARGET" >&2
      exit 1
    fi
    rm -rf "$TOOLS_PACK_DIR"
    build_args=(
      exec tools-pack linux build
      --dir "$TOOLS_PACK_DIR"
      --cache-dir "$TOOLS_PACK_CACHE_DIR"
      --namespace "$RELEASE_NAMESPACE"
      --portable
      --app-version "$RELEASE_VERSION"
      --to appimage
      --containerized
      --json
    )
    ;;
  *)
    echo "unsupported RELEASE_TARGET for build-platform.sh: $RELEASE_TARGET" >&2
    exit 1
    ;;
esac

if build_output="$(pnpm "${build_args[@]}" 2> >(tee -a "$BUILD_LOG_PATH" >&2))"; then
  printf '%s\n' "$build_output" | tee "$BUILD_JSON_PATH"
  BUILD_JSON_PATH="$BUILD_JSON_PATH" RELEASE_TIMINGS_JSON="[$release_timings_json]" node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const path = process.env.BUILD_JSON_PATH;
const build = JSON.parse(readFileSync(path, "utf8"));
build.releaseScriptTimings = JSON.parse(process.env.RELEASE_TIMINGS_JSON ?? "[]");
writeFileSync(path, `${JSON.stringify(build, null, 2)}\n`, "utf8");
NODE
else
  build_status=$?
  printf '%s\n' "$build_output"
  exit "$build_status"
fi

if [ "$RELEASE_SMOKE_MODE" = "skip" ]; then
  echo "Skipping $RELEASE_TARGET packaged runtime smoke: smoke mode skip"
elif [ "$RELEASE_TARGET" = "linux_x64" ]; then
  required RELEASE_REPORT_DIR
  mkdir -p "$RELEASE_REPORT_DIR/screenshots"
  OD_PACKAGED_E2E_LINUX_APPIMAGE=1 \
  OD_PACKAGED_E2E_NAMESPACE="$RELEASE_NAMESPACE" \
  OD_PACKAGED_E2E_SCREENSHOT_PATH="$RELEASE_REPORT_DIR/screenshots/open-design-linux-smoke.png" \
  OD_PACKAGED_E2E_TOOLS_PACK_DIR="$TOOLS_PACK_DIR" \
  pnpm --dir e2e test specs/linux.spec.ts 2>&1 | tee "$RELEASE_REPORT_DIR/vitest.log"
else
  required RELEASE_REPORT_DIR
  update_build_json_path=""
  update_version=""
  if [ "$RELEASE_SMOKE_MODE" = "full" ] && [ "$RELEASE_TARGET" = "mac_arm64" ] && [ -z "${OD_PACKAGED_E2E_MAC_UPDATE_METADATA_URL:-}" ]; then
    if [[ "$RELEASE_VERSION" =~ ^([0-9]+\.[0-9]+\.[0-9]+)-beta\.([0-9]+)$ ]]; then
      update_version="${BASH_REMATCH[1]}-beta.$((BASH_REMATCH[2] + 1))"
      update_fixture_dir="$RELEASE_WORK_DIR/tools-pack-update-fixture"
      update_build_json_path="$RELEASE_WORK_DIR/mac-tools-pack-update-build.json"
      update_args=(
        exec tools-pack mac build
        --dir "$update_fixture_dir"
        --cache-dir "$TOOLS_PACK_CACHE_DIR"
        --namespace "$RELEASE_NAMESPACE"
        --portable
        --app-version "$update_version"
        --mac-compression "${MAC_COMPRESSION:-normal}"
        --to dmg
        --json
      )
      build_mac_update_fixture() {
        local update_output
        update_output="$(pnpm "${update_args[@]}")"
        printf '%s\n' "$update_output" > "$update_build_json_path"
      }
      measure_step "tools-pack mac build update fixture" build_mac_update_fixture
    else
      echo "full mac payload smoke requires beta version x.y.z-beta.N; got $RELEASE_VERSION" >&2
      exit 1
    fi
  fi
  OD_PACKAGED_E2E_BUILD_JSON_PATH="$BUILD_JSON_PATH" \
  OD_PACKAGED_E2E_BUILD_LOG_PATH="$BUILD_LOG_PATH" \
  OD_PACKAGED_E2E_MAC=1 \
  OD_PACKAGED_E2E_MAC_UPDATE_BUILD_JSON_PATH="$update_build_json_path" \
  OD_PACKAGED_E2E_MAC_UPDATE_METADATA_URL="${OD_PACKAGED_E2E_MAC_UPDATE_METADATA_URL:-}" \
  OD_PACKAGED_E2E_MAC_UPDATE_VERSION="${OD_PACKAGED_E2E_MAC_UPDATE_VERSION:-$update_version}" \
  OD_PACKAGED_E2E_MAC_SMOKE_PROFILE="$RELEASE_SMOKE_MODE" \
  OD_PACKAGED_E2E_NAMESPACE="$RELEASE_NAMESPACE" \
  OD_PACKAGED_E2E_RELEASE_CHANNEL=beta \
  OD_PACKAGED_E2E_RELEASE_VERSION="$RELEASE_VERSION" \
  OD_PACKAGED_E2E_REPORT_DIR="$RELEASE_REPORT_DIR" \
  OD_PACKAGED_E2E_TOOLS_PACK_DIR="$TOOLS_PACK_DIR" \
  pnpm --dir e2e exec tsx scripts/release-smoke.ts mac specs/mac.spec.ts
fi

write_outputs
