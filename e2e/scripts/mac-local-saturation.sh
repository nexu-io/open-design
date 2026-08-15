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

if [[ ! "$NAMESPACE" =~ ^[a-z0-9][a-z0-9._-]{0,127}$ ]]; then
  echo "Mac local saturation namespace must be a lowercase filesystem-safe segment: $NAMESPACE" >&2
  exit 2
fi

mkdir -p "$RUN_ROOT"
cd "$WORKSPACE_ROOT"

pnpm --filter @open-design/tools-pack build:workspace

# Local saturation is deliberately non-portable: LaunchServices must consume
# the same isolated namespace root as tools-pack without inheriting test env.
OD_PACKAGED_E2E_HEADLESS=1 \
OPEN_DESIGN_AMR_PROFILE=test \
pnpm exec tools-pack mac build \
  --dir "$TOOLS_PACK_DIR" \
  --cache-dir "$WORKSPACE_ROOT/.tmp/tools-pack/cache" \
  --namespace "$NAMESPACE" \
  --debug-channel local \
  --mac-compression normal \
  --sign-mode unsigned \
  --to dmg \
  --json > "$BUILD_JSON"

RELEASE_VERSION="$(node -e 'const fs=require("node:fs"); const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).releaseVersion; if(typeof v!=="string") process.exit(1); process.stdout.write(v)' "$BUILD_JSON")"
SHELL_VERSION="$(node -e 'const fs=require("node:fs"); const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).shell?.version; if(typeof v!=="string") process.exit(1); process.stdout.write(v)' "$BUILD_JSON")"

OD_PACKAGED_E2E_BUILD_JSON_PATH="$BUILD_JSON" \
OD_PACKAGED_E2E_MAC=1 \
OD_PACKAGED_E2E_MAC_SMOKE_PROFILE=core \
OD_PACKAGED_E2E_NAMESPACE="$NAMESPACE" \
OD_PACKAGED_E2E_RELEASE_CHANNEL=local \
OD_PACKAGED_E2E_RELEASE_VERSION="$RELEASE_VERSION" \
OD_PACKAGED_E2E_SHELL_VERSION="$SHELL_VERSION" \
OD_PACKAGED_E2E_STANDALONE_SEED_EMBEDDED=1 \
OD_PACKAGED_E2E_REPORT_DIR="$REPORT_DIR" \
OD_PACKAGED_E2E_TOOLS_PACK_DIR="$TOOLS_PACK_DIR" \
OD_PACKAGED_E2E_HEADLESS=1 \
pnpm --dir e2e exec tsx scripts/release-smoke.ts mac specs/mac.spec.ts

echo "Mac local saturation report: $REPORT_DIR"
