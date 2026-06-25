#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname "$0")/../lib.sh"

ci_gate_timed_step "daemon-build" pnpm --filter @marketing-ax/daemon build
ci_gate_timed_step "desktop-build" pnpm --filter @marketing-ax/desktop build
ci_gate_timed_step "web-build-sidecar" pnpm --filter @marketing-ax/web build:sidecar
ci_gate_timed_step "workspace-build" pnpm -r --filter '!@marketing-ax/landing-page' --workspace-concurrency=1 --if-present run build
