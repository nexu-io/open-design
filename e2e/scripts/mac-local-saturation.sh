#!/usr/bin/env bash
set -euo pipefail

E2E_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_ROOT="$(dirname "$E2E_ROOT")"
RUN_ID="${OD_MAC_LOCAL_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
RUN_SLUG="$(printf '%s' "$RUN_ID" | tr '[:upper:]' '[:lower:]')"
RUN_ROOT="${OD_MAC_LOCAL_RUN_ROOT:-$WORKSPACE_ROOT/.tmp/e2e/mac-local-saturation/$RUN_ID}"
TOOLS_PACK_DIR="$RUN_ROOT/tools-pack"
BUILD_JSON="$RUN_ROOT/tools-pack.json"
REPORT_DIR="$RUN_ROOT/report"
NAMESPACE="${OD_PACKAGED_E2E_NAMESPACE:-mac-local-$RUN_SLUG}"
SMOKE_PROFILE="${OD_MAC_LOCAL_SMOKE_PROFILE:-full}"

if [[ "$SMOKE_PROFILE" != "core" && "$SMOKE_PROFILE" != "full" ]]; then
  echo "Mac local saturation profile must be core or full: $SMOKE_PROFILE" >&2
  exit 2
fi

if [[ ! "$NAMESPACE" =~ ^[a-z0-9][a-z0-9._-]{0,127}$ ]]; then
  echo "Mac local saturation namespace must be a lowercase filesystem-safe segment: $NAMESPACE" >&2
  exit 2
fi

mkdir -p "$RUN_ROOT"
cd "$WORKSPACE_ROOT"

pnpm --filter @open-design/tools-pack build:workspace

# Core remains on the ordinary isolated local channel. Full updater saturation
# uses a run-unique exact identity: updater metadata is release-shaped, while
# the namespace and product profile cannot collide with a real release channel.
RELEASE_CHANNEL=local
DEBUG_CHANNEL=local
BUILD_VERSION_ARGS=()
UPDATE_ENV_ARGS=()
STANDALONE_SEED_EMBEDDED=1
if [[ "$SMOKE_PROFILE" == "full" ]]; then
  RUN_DIGEST="$(printf '%s' "$RUN_ID" | shasum -a 256 | cut -c1-8)"
  RELEASE_CHANNEL="${OD_MAC_LOCAL_EXACT_NAME:-e2e$RUN_DIGEST}"
  if [[ ! "$RELEASE_CHANNEL" =~ ^[a-z0-9]{1,12}$ || "$RELEASE_CHANNEL" == "local" ]]; then
    echo "Mac full saturation exact name must be 1-12 lowercase letters or digits: $RELEASE_CHANNEL" >&2
    exit 2
  fi
  BASE_VERSION="$(node -p 'require("./package.json").version')"
  RELEASE_VERSION="$BASE_VERSION-$RELEASE_CHANNEL.1"
  UPDATE_VERSION="$BASE_VERSION-$RELEASE_CHANNEL.2"
  DEBUG_CHANNEL="exact:$RELEASE_CHANNEL"
  STANDALONE_SEED_EMBEDDED=0
  BUILD_VERSION_ARGS=(
    --release-version "$RELEASE_VERSION"
    --shell-version "$RELEASE_VERSION"
    --launcher-version "$RELEASE_VERSION"
  )
fi

build_mac() {
  local output="$1"
  local destination="$2"
  shift 2
  OD_PACKAGED_E2E_HEADLESS=1 \
  OPEN_DESIGN_AMR_PROFILE=test \
  pnpm exec tools-pack mac build \
    --dir "$destination" \
    --cache-dir "$WORKSPACE_ROOT/.tmp/tools-pack/cache" \
    --namespace "$NAMESPACE" \
    --debug-channel "$DEBUG_CHANNEL" \
    --mac-compression normal \
    --sign-mode unsigned \
    "$@" \
    --json > "$output"
}

# Local saturation is deliberately non-portable: LaunchServices must consume
# the same isolated namespace root as tools-pack without inheriting test env.
build_mac "$BUILD_JSON" "$TOOLS_PACK_DIR" "${BUILD_VERSION_ARGS[@]}" --to dmg

RELEASE_VERSION="$(node -e 'const fs=require("node:fs"); const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).releaseVersion; if(typeof v!=="string") process.exit(1); process.stdout.write(v)' "$BUILD_JSON")"
SHELL_VERSION="$(node -e 'const fs=require("node:fs"); const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).shell?.version; if(typeof v!=="string") process.exit(1); process.stdout.write(v)' "$BUILD_JSON")"

if [[ "$SMOKE_PROFILE" == "full" ]]; then
  UPDATE_BUILD_JSON="$RUN_ROOT/tools-pack-update.json"
  CLOSURE_DIR="$RUN_ROOT/closure"
  SHARED_BUILD_JSON="$CLOSURE_DIR/shared.json"
  TARGET_BUILD_JSON="$CLOSURE_DIR/target.json"
  CLOSURE_MANIFEST="$CLOSURE_DIR/distribution.json"
  MAC_TARGET="$(node -p 'process.arch === "x64" ? "darwin-x64" : "darwin-arm64"')"
  mkdir -p "$CLOSURE_DIR"

  build_mac "$UPDATE_BUILD_JSON" "$RUN_ROOT/tools-pack-update" \
    --release-version "$RELEASE_VERSION" \
    --shell-version "$UPDATE_VERSION" \
    --launcher-version "$UPDATE_VERSION" \
    --to app

  pnpm exec tools-pack closure build-distribution-shared \
    --blob-origin https://local.invalid \
    --channel "$RELEASE_CHANNEL" \
    --dir "$CLOSURE_DIR/tools-pack" \
    --min-shell-version "$RELEASE_VERSION" \
    --skip-workspace-build \
    --version "$RELEASE_VERSION" \
    --json > "$SHARED_BUILD_JSON"
  pnpm exec tools-pack closure build-distribution-target \
    --blob-origin https://local.invalid \
    --channel "$RELEASE_CHANNEL" \
    --dir "$CLOSURE_DIR/tools-pack" \
    --platform "$MAC_TARGET" \
    --skip-workspace-build \
    --version "$RELEASE_VERSION" \
    --json > "$TARGET_BUILD_JSON"

  SHARED_CONTRIBUTION="$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).contributionPath' "$SHARED_BUILD_JSON")"
  TARGET_CONTRIBUTION="$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).contributionPath' "$TARGET_BUILD_JSON")"
  SHARED_BLOB_ROOT="$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).blobRoot' "$SHARED_BUILD_JSON")"
  TARGET_BLOB_ROOT="$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).blobRoot' "$TARGET_BUILD_JSON")"
  CLOSURE_BLOB_ROOTS_JSON="$(node -p 'JSON.stringify(process.argv.slice(1))' "$SHARED_BLOB_ROOT" "$TARGET_BLOB_ROOT")"
  pnpm exec tools-release merge-closure-distribution \
    "$SHARED_CONTRIBUTION" \
    "$TARGET_CONTRIBUTION" \
    --output "$CLOSURE_MANIFEST"

  UPDATE_ENV_ARGS=(
    "OD_PACKAGED_E2E_CLOSURE_BLOB_ROOTS_JSON=$CLOSURE_BLOB_ROOTS_JSON"
    "OD_PACKAGED_E2E_CLOSURE_DISTRIBUTION_MANIFEST_PATH=$CLOSURE_MANIFEST"
    "OD_PACKAGED_E2E_MAC_SMOKE_LANES=shell,standalone"
    "OD_PACKAGED_E2E_MAC_UPDATE_BUILD_JSON_PATH=$UPDATE_BUILD_JSON"
    "OD_PACKAGED_E2E_MAC_UPDATE_FIXTURE=tools-serve"
    "OD_PACKAGED_E2E_MAC_UPDATE_VERSION=$UPDATE_VERSION"
  )
fi

env \
  OD_PACKAGED_E2E_BUILD_JSON_PATH="$BUILD_JSON" \
  OD_PACKAGED_E2E_MAC=1 \
  OD_PACKAGED_E2E_MAC_SMOKE_PROFILE="$SMOKE_PROFILE" \
  OD_PACKAGED_E2E_NAMESPACE="$NAMESPACE" \
  OD_PACKAGED_E2E_RELEASE_CHANNEL="$RELEASE_CHANNEL" \
  OD_PACKAGED_E2E_RELEASE_VERSION="$RELEASE_VERSION" \
  OD_PACKAGED_E2E_SHELL_VERSION="$SHELL_VERSION" \
  OD_PACKAGED_E2E_STANDALONE_SEED_EMBEDDED="$STANDALONE_SEED_EMBEDDED" \
  OD_PACKAGED_E2E_REPORT_DIR="$REPORT_DIR" \
  OD_PACKAGED_E2E_TOOLS_PACK_DIR="$TOOLS_PACK_DIR" \
  OD_PACKAGED_E2E_HEADLESS=1 \
  "${UPDATE_ENV_ARGS[@]}" \
  pnpm --dir e2e exec tsx scripts/release-smoke.ts mac specs/mac.spec.ts

echo "Mac local saturation report: $REPORT_DIR"
