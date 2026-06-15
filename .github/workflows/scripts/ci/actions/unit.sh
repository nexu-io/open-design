#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname "$0")/../lib.sh"

ci_gate_timed_step "contracts-test" pnpm --filter @open-design/contracts test
ci_gate_timed_step "host-test" pnpm --filter @open-design/host test
ci_gate_timed_step "platform-test" pnpm --filter @open-design/platform test
ci_gate_timed_step "sidecar-test" pnpm --filter @open-design/sidecar test
ci_gate_timed_step "sidecar-proto-test" pnpm --filter @open-design/sidecar-proto test
ci_gate_timed_step "tools-dev-test" pnpm --filter @open-design/tools-dev test
ci_gate_timed_step "tools-pack-test" pnpm --filter @open-design/tools-pack test
