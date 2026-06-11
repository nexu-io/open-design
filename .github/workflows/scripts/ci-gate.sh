#!/usr/bin/env bash
set -Eeuo pipefail

provider=""
mode=""
results_path=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --provider)
      provider="${2:-}"
      shift 2
      ;;
    --mode)
      mode="${2:-}"
      shift 2
      ;;
    --results-path)
      results_path="${2:-}"
      shift 2
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [ -z "$provider" ] || [ -z "$mode" ]; then
  echo "usage: $0 --provider <runner|hosted> --mode <default|nix|full> [--results-path <path>]" >&2
  exit 2
fi

case "$provider" in
  runner)
    if [ "$mode" != "default" ]; then
      echo "runner only supports --mode default" >&2
      exit 2
    fi
    ;;
  hosted)
    if [ "$mode" != "nix" ] && [ "$mode" != "full" ]; then
      echo "hosted only supports --mode nix|full" >&2
      exit 2
    fi
    ;;
  *)
    echo "unknown provider: $provider" >&2
    exit 2
    ;;
esac

ci_root="${GITHUB_WORKSPACE:-$(pwd)}"
results_path="${results_path:-$ci_root/.od/ci-gate/ci-results.json}"
results_dir="$(dirname "$results_path")"
actions_jsonl="$results_dir/actions.jsonl"

export COREPACK_ENABLE_DOWNLOAD_PROMPT="${COREPACK_ENABLE_DOWNLOAD_PROMPT:-0}"
export COREPACK_HOME="${COREPACK_HOME:-$HOME/.cache/open-design-ci/corepack}"
export npm_config_store_dir="${npm_config_store_dir:-$HOME/.cache/open-design-ci/pnpm-store}"
export npm_config_fetch_retries="${npm_config_fetch_retries:-6}"
export npm_config_fetch_retry_maxtimeout="${npm_config_fetch_retry_maxtimeout:-120000}"
export npm_config_fetch_retry_mintimeout="${npm_config_fetch_retry_mintimeout:-20000}"
export npm_config_network_timeout="${npm_config_network_timeout:-180000}"

mkdir -p "$results_dir"
mkdir -p "$COREPACK_HOME"
mkdir -p "$npm_config_store_dir"
: > "$actions_jsonl"

event_name="${GITHUB_EVENT_NAME:-unknown}"
head_sha="${CI_GATE_HEAD_SHA:-${GITHUB_SHA:-unknown}}"
run_id="${GITHUB_RUN_ID:-unknown}"
run_attempt="${GITHUB_RUN_ATTEMPT:-unknown}"

actions=(
  nix
  guard
  i18n
  unit
  typecheck
  daemon
  web
  build
  browser
)

append_result() {
  local action="$1"
  local kind="$2"
  local status="$3"
  local steps_path="${4:-}"
  if [ -n "$steps_path" ] && [ -s "$steps_path" ]; then
    jq -nc \
      --arg action "$action" \
      --arg kind "$kind" \
      --arg status "$status" \
      --slurpfile steps "$steps_path" \
      '{
        action: $action,
        kind: $kind,
        status: $status,
        steps: $steps
      }' >> "$actions_jsonl"
    return 0
  fi

  jq -nc \
    --arg action "$action" \
    --arg kind "$kind" \
    --arg status "$status" \
    '{
      action: $action,
      kind: $kind,
      status: $status
    }' >> "$actions_jsonl"
}

is_real_action() {
  local action="$1"
  case "$provider:$mode:$action" in
    runner:default:nix)
      return 1
      ;;
    hosted:nix:nix)
      return 0
      ;;
    hosted:nix:*)
      return 1
      ;;
    *)
      return 0
      ;;
  esac
}

has_real_non_nix=false
for action in "${actions[@]}"; do
  if is_real_action "$action" && [ "$action" != "nix" ]; then
    has_real_non_nix=true
    break
  fi
done

setup_status="success"
if [ "$has_real_non_nix" = "true" ]; then
  package_manager="$(node -p "require('./package.json').packageManager")"
  echo "preparing workspace with $package_manager"
  set +e
  timeout 180s bash -lc 'corepack enable && corepack prepare "$1" --activate' _ "$package_manager"
  corepack_exit="$?"
  set -e
  if [ "$corepack_exit" != "0" ]; then
    setup_status="failure"
  else
    set +e
    timeout 1800s pnpm install --frozen-lockfile --prefer-offline --network-concurrency=8
    install_exit="$?"
    set -e
    if [ "$install_exit" != "0" ]; then
      setup_status="failure"
    fi
  fi
fi

overall_exit=0
for action in "${actions[@]}"; do
  action_steps_jsonl="$results_dir/${action}-steps.jsonl"
  : > "$action_steps_jsonl"
  export CI_GATE_ACTION_TIMINGS_PATH="$action_steps_jsonl"

  if ! is_real_action "$action"; then
    append_result "$action" "placeholder" "not-run"
    continue
  fi

  if [ "$action" != "nix" ] && [ "$setup_status" != "success" ]; then
    append_result "$action" "real" "failure"
    overall_exit=1
    continue
  fi

  echo "running action: $action"
  set +e
  "$ci_root/.github/workflows/scripts/ci/actions/$action.sh"
  action_exit="$?"
  set -e
  if [ "$action_exit" = "0" ]; then
    append_result "$action" "real" "success" "$action_steps_jsonl"
  else
    append_result "$action" "real" "failure" "$action_steps_jsonl"
    overall_exit=1
  fi
done

jq -sc \
  --arg provider "$provider" \
  --arg mode "$mode" \
  --arg eventName "$event_name" \
  --arg headSha "$head_sha" \
  --arg runId "$run_id" \
  --arg runAttempt "$run_attempt" \
  '{
    schemaVersion: 1,
    provider: $provider,
    mode: $mode,
    eventName: $eventName,
    headSha: $headSha,
    runId: $runId,
    runAttempt: $runAttempt,
    actions: .
  }' "$actions_jsonl" > "$results_path"

echo "ci results: $results_path"
echo "OD_CI_RESULTS_JSON $(base64 < "$results_path" | tr -d '\n')"
exit "$overall_exit"
