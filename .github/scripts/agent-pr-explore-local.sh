#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  .github/scripts/agent-pr-explore-local.sh <pr-number>

Runs the Docker-isolated PR exploration path from a local or self-hosted
machine, without relying on a GitHub Actions workflow being present on main.

Required on the host:
  docker, gh, jq, node/npm, expect-cli@0.1.3

Optional environment:
  BASE_REPO=nexu-io/open-design
  RUNNER_TEMP=/tmp/od-agent-pr-explore-local
  OD_EXPECT_TIMEOUT_SECONDS=1200
  OD_SANDBOX_CPUS=4
  OD_SANDBOX_MEMORY=8g
  OD_ALLOW_NPX_EXPECT_CLI=1
  OD_TRACE_R2_UPLOAD=1
  R2_ACCOUNT_ID=...
  R2_ACCESS_KEY_ID=...
  R2_SECRET_ACCESS_KEY=...
  R2_BUCKET=...
  R2_PUBLIC_ORIGIN=https://...
USAGE
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

pr_number="${1:-${PR_NUMBER:-}}"
if ! [[ "$pr_number" =~ ^[0-9]+$ ]]; then
  usage >&2
  exit 2
fi

base_repo="${BASE_REPO:-nexu-io/open-design}"
runner_temp="${RUNNER_TEMP:-/tmp/od-agent-pr-explore-local}"

for command_name in docker gh jq node; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "::error::$command_name is required on the mini/local runner" >&2
    exit 1
  fi
done

if [ -z "${GH_TOKEN:-}" ]; then
  if ! GH_TOKEN="$(gh auth token 2>/dev/null)"; then
    echo "::error::GH_TOKEN is not set and gh auth token failed. Run gh auth login or export GH_TOKEN." >&2
    exit 1
  fi
  export GH_TOKEN
fi

if ! command -v expect-cli >/dev/null 2>&1 && [ "${OD_ALLOW_NPX_EXPECT_CLI:-0}" != "1" ]; then
  echo "::error::expect-cli is not installed. Install it on the mini with: npm install -g expect-cli@${OD_EXPECT_CLI_VERSION:-0.1.3}" >&2
  echo "        For a one-off smoke run, set OD_ALLOW_NPX_EXPECT_CLI=1 to use the pinned npx fallback." >&2
  exit 1
fi

mkdir -p "$runner_temp"

pr_json="$(gh pr view "$pr_number" --repo "$base_repo" --json state,isDraft,headRefOid,baseRefOid,headRepositoryOwner,headRepository)"
state="$(jq -r '.state' <<<"$pr_json")"
draft="$(jq -r '.isDraft' <<<"$pr_json")"
head_sha="$(jq -r '.headRefOid' <<<"$pr_json")"
base_sha="$(jq -r '.baseRefOid' <<<"$pr_json")"
head_repo="$(jq -r '.headRepositoryOwner.login + "/" + .headRepository.name' <<<"$pr_json")"

if [ "$state" != "OPEN" ]; then
  echo "::error::Refusing to explore PR $pr_number because state is $state." >&2
  exit 1
fi
if [ "$draft" != "false" ]; then
  echo "::error::Refusing to explore draft PR $pr_number." >&2
  exit 1
fi
if ! [[ "$head_sha" =~ ^[0-9a-f]{40}$ && "$base_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "::error::Invalid PR SHA metadata for PR $pr_number." >&2
  exit 1
fi

echo "Running agent PR exploration locally"
echo "  PR:        $base_repo#$pr_number"
echo "  Head:      $head_repo@$head_sha"
echo "  Base SHA:  $base_sha"
echo "  Temp root: $runner_temp"

PR_NUMBER="$pr_number" \
HEAD_SHA="$head_sha" \
HEAD_REPO="$head_repo" \
BASE_REPO="$base_repo" \
BASE_SHA="$base_sha" \
RUNNER_TEMP="$runner_temp" \
GH_TOKEN="$GH_TOKEN" \
.github/scripts/agent-pr-explore-sandbox.sh

echo
echo "Artifacts:"
echo "  $runner_temp/agent-pr-explore-sandbox/artifacts"
