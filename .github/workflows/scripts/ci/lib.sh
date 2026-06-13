#!/usr/bin/env bash
set -Eeuo pipefail

ci_gate_now_ms() {
  python3 -c 'import time; print(int(time.time() * 1000))'
}

ci_gate_append_step_timing() {
  local step_name="$1"
  local duration_ms="$2"
  local step_status="$3"
  local timings_path="${CI_GATE_ACTION_TIMINGS_PATH:-}"

  if [ -z "$timings_path" ]; then
    return 0
  fi

  jq -nc \
    --arg name "$step_name" \
    --argjson durationMs "$duration_ms" \
    --arg status "$step_status" \
    '{
      name: $name,
      durationMs: $durationMs,
      status: $status
    }' >> "$timings_path"
}

ci_gate_timed_step() {
  local step_name="$1"
  shift

  local started_at
  local finished_at
  local duration_ms
  local step_exit
  local step_timeout_seconds="${CI_GATE_STEP_TIMEOUT_SECONDS:-600}"

  started_at="$(ci_gate_now_ms)"
  set +e
  timeout "${step_timeout_seconds}s" "$@"
  step_exit="$?"
  set -e
  finished_at="$(ci_gate_now_ms)"
  duration_ms="$((finished_at - started_at))"

  if [ "$step_exit" = "0" ]; then
    ci_gate_append_step_timing "$step_name" "$duration_ms" "success"
  else
    ci_gate_append_step_timing "$step_name" "$duration_ms" "failure"
  fi

  return "$step_exit"
}
