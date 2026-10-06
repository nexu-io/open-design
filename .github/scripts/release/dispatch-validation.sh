#!/usr/bin/env bash
# Dispatch one prerelease validation lane (code tests, packaged smoke, or the
# progressive Feishu card) as a workflow run of its own.
#
# Why a dispatch and not a job: release-prerelease.yml holds a single
# repository-wide concurrency group (`open-design-release-prerelease`,
# cancel-in-progress: false). Anything that outlives `publish` inside that
# workflow keeps the group held, which stops the NEXT prerelease from starting.
# Validation is exactly that kind of work, so it has to leave the workflow.
#
# This helper is the one place that knows how to aim `gh workflow run` at a ref
# that actually carries the target workflow file: the built branch first, so a
# lane edited on a release branch is the lane that runs for that branch, then
# the repository default branch, so a release branch cut before these lanes
# existed still gets validated. The lane checks out the built commit either way
# — the ref chosen here decides whose workflow DEFINITION runs, not which code
# is tested.
#
# usage: PRIMARY_REF=... FALLBACK_REF=... dispatch-validation.sh <workflow-file> [gh args...]
set -euo pipefail

workflow="${1:?usage: dispatch-validation.sh <workflow-file> [gh workflow run args...]}"
shift

refs=()
for candidate in "${PRIMARY_REF:-}" "${FALLBACK_REF:-}"; do
  [ -n "$candidate" ] || continue
  duplicate=0
  for seen in ${refs[@]+"${refs[@]}"}; do
    [ "$seen" = "$candidate" ] && duplicate=1
  done
  [ "$duplicate" -eq 0 ] && refs+=("$candidate")
done

if [ "${#refs[@]}" -eq 0 ]; then
  echo "::error::dispatch-validation needs PRIMARY_REF or FALLBACK_REF to dispatch $workflow" >&2
  exit 1
fi

for ref in "${refs[@]}"; do
  if gh workflow run "$workflow" --ref "$ref" "$@"; then
    echo "dispatched $workflow on ref $ref"
    if [ -n "${GITHUB_SERVER_URL:-}" ] && [ -n "${GH_REPO:-}" ]; then
      # The dispatched run carries the origin run id in its run-name, so this
      # listing is how a human walks from this pipeline to its validation lane.
      echo "runs: ${GITHUB_SERVER_URL}/${GH_REPO}/actions/workflows/${workflow}"
    fi
    exit 0
  fi
  echo "::warning::could not dispatch $workflow on ref $ref"
done

echo "::error::$workflow was not dispatched on any of: ${refs[*]}" >&2
exit 1
