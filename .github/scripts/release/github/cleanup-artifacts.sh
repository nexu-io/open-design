#!/usr/bin/env bash
set -euo pipefail

for name in GITHUB_REPOSITORY GITHUB_RUN_ID; do
  if [ -z "${!name:-}" ]; then
    echo "$name is required" >&2
    exit 1
  fi
done

if [ -z "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]; then
  echo "GH_TOKEN or GITHUB_TOKEN is required" >&2
  exit 1
fi

artifacts_file="$(mktemp)"
trap 'rm -f "$artifacts_file"' EXIT

gh api --paginate \
  -H "Accept: application/vnd.github+json" \
  "/repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/artifacts?per_page=100" \
  --jq '.artifacts[] | select(.expired | not) | [.id, .name] | @tsv' \
  > "$artifacts_file"

if [ ! -s "$artifacts_file" ]; then
  echo "No workflow artifacts to delete for run $GITHUB_RUN_ID"
  exit 0
fi

deleted_count=0
while IFS=$'\t' read -r artifact_id artifact_name; do
  if [ -z "$artifact_id" ]; then
    continue
  fi

  echo "Deleting workflow artifact $artifact_name ($artifact_id)"
  gh api \
    -X DELETE \
    -H "Accept: application/vnd.github+json" \
    "/repos/$GITHUB_REPOSITORY/actions/artifacts/$artifact_id"
  deleted_count=$((deleted_count + 1))
done < "$artifacts_file"

echo "Deleted $deleted_count workflow artifacts from run $GITHUB_RUN_ID"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo ""
    echo "### Workflow artifacts"
    echo ""
    echo "Deleted $deleted_count intermediate Actions artifacts after publish."
  } >> "$GITHUB_STEP_SUMMARY"
fi
