#!/usr/bin/env bash
# Real-CLI contract check — spot-check that the actual agent CLI's
# stream protocol still matches what the mock formatters emit. Catches
# drift like:
#   - real CLI adds a new event `type`
#   - real CLI changes a field name (e.g. `sessionID` → `sessionId`)
#   - real CLI's usage object gains/loses a sub-key
#
# When mocks drift toward "satisfy the current OD parser" instead of
# "mimic the actual CLI protocol", the OD-level smoke tests stay green
# but real-world behavior diverges. Periodic runs of this script (manual
# or scheduled in CI on a real-CLI-available runner) surface that drift
# before it becomes a real-PR debugging session.
#
#   bash mocks/scripts/contract-check.sh <agent>
#   bash mocks/scripts/contract-check.sh claude
#   bash mocks/scripts/contract-check.sh opencode
#
# Prereqs: the real agent CLI must be installed AND authenticated. This
# script DOES make a live LLM call (couple of cents of tokens) so it's
# not free.
#
# Output: side-by-side top-level event `type` distribution from real
# vs mock for the same prompt. A maintainer eyeballs the diff. Future
# work (see docs/MOCKS-CONTRACT-CHECK.md) is to lift this into a
# stricter structural compare.

set -euo pipefail

AGENT="${1:-}"
if [ -z "$AGENT" ]; then
  echo "usage: $0 <agent>" >&2
  echo "       supported: claude | opencode | codex" >&2
  exit 2
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
MOCKS_DIR="$(cd "$HERE/.." && pwd -P)"

# Fixed deterministic prompt — small, no creative variability, costs
# pennies. Picked to be a realistic OD-shaped task: 1-2 tool calls.
PROMPT='List the entries of the current working directory and tell me how many JSON files are present. Reply with just the count, like "N JSON files".'

real_out="$(mktemp -t contract-real.XXXX).jsonl"
mock_out="$(mktemp -t contract-mock.XXXX).jsonl"
trap 'rm -f "$real_out" "$mock_out"' EXIT

# Resolve the real CLI binary. We deliberately ignore mocks/bin/ PATH
# overlays.
real_bin=""
case "$AGENT" in
  claude)   real_bin="$(PATH=$(echo "$PATH" | tr ':' '\n' | grep -v "$MOCKS_DIR/bin" | paste -sd: -) command -v claude || true)" ;;
  codex)    real_bin="$(PATH=$(echo "$PATH" | tr ':' '\n' | grep -v "$MOCKS_DIR/bin" | paste -sd: -) command -v codex  || true)" ;;
  opencode) real_bin="$(PATH=$(echo "$PATH" | tr ':' '\n' | grep -v "$MOCKS_DIR/bin" | paste -sd: -) command -v opencode || true)" ;;
  *) echo "✗ unsupported agent for contract check: $AGENT" >&2; exit 2 ;;
esac
if [ -z "$real_bin" ]; then
  echo "✗ real '$AGENT' CLI not on PATH. Install + login, then re-run." >&2
  exit 1
fi
echo "real CLI:  $real_bin"
echo "prompt:    $PROMPT"
echo

# 1. Real CLI
echo "→ invoking real $AGENT…"
case "$AGENT" in
  claude)
    printf '%s' "$PROMPT" | "$real_bin" -p --output-format=stream-json --verbose >"$real_out" 2>&1 || true ;;
  codex)
    printf '%s' "$PROMPT" | "$real_bin" exec >"$real_out" 2>&1 || true ;;
  opencode)
    printf '%s' "$PROMPT" | "$real_bin" run >"$real_out" 2>&1 || true ;;
esac

# 2. Mock CLI — same prompt, PATH-overlayed to the mock bin.
# `bash -c` here would lose $PROMPT (parent shell var, not exported)
# and silently send an empty string to the mock — defeating the
# "same input on both sides" property the rest of the script relies on.
# A subshell scopes the PATH override locally, no var-passing dance.
echo "→ invoking mock $AGENT…"
(
  export PATH="$MOCKS_DIR/bin:$PATH"
  export OD_MOCKS_NO_DELAY=1
  case "$AGENT" in
    claude)
      printf '%s' "$PROMPT" | claude -p --output-format=stream-json --verbose >"$mock_out" 2>&1 ;;
    codex)
      printf '%s' "$PROMPT" | codex exec >"$mock_out" 2>&1 ;;
    opencode)
      printf '%s' "$PROMPT" | opencode run >"$mock_out" 2>&1 ;;
  esac
) || true

# 3. Compare top-level event `type` distributions (skip content)
summarize() {
  jq -r 'try .type catch empty' "$1" 2>/dev/null | sort | uniq -c | sort -rn || true
}
real_summary=$(summarize "$real_out")
mock_summary=$(summarize "$mock_out")

echo
echo "real:"
printf '%s\n' "${real_summary:-  (no parseable JSON events)}" | sed 's/^/  /'
echo
echo "mock:"
printf '%s\n' "${mock_summary:-  (no parseable JSON events)}" | sed 's/^/  /'
echo
echo "raw outputs kept at:"
echo "  real: $real_out"
echo "  mock: $mock_out"
echo "(diff manually — `diff <(jq -r .type $real_out|sort -u) <(jq -r .type $mock_out|sort -u)`)"
trap - EXIT   # leave the tmpfiles for the maintainer to inspect
