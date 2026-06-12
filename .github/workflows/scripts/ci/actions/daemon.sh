#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname "$0")/../lib.sh"

ci_gate_timed_step "daemon-build" pnpm --filter @open-design/daemon build
ci_gate_timed_step "daemon-test" pnpm --filter @open-design/daemon test
