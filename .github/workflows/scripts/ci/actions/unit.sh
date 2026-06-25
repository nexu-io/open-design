#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname "$0")/../lib.sh"

ci_gate_timed_step "contracts-test" pnpm --filter @marketing-ax/contracts test
ci_gate_timed_step "host-test" pnpm --filter @marketing-ax/host test
ci_gate_timed_step "platform-test" pnpm --filter @marketing-ax/platform test
ci_gate_timed_step "sidecar-test" pnpm --filter @marketing-ax/sidecar test
ci_gate_timed_step "sidecar-proto-test" pnpm --filter @marketing-ax/sidecar-proto test
ci_gate_timed_step "tools-dev-test" pnpm --filter @marketing-ax/tools-dev test
ci_gate_timed_step "tools-pack-test" pnpm --filter @marketing-ax/tools-pack test
