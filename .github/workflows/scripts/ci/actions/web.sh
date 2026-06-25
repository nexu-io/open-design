#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname "$0")/../lib.sh"

ci_gate_timed_step "web-build-sidecar" pnpm --filter @marketing-ax/web build:sidecar
ci_gate_timed_step "web-test" pnpm --filter @marketing-ax/web test
