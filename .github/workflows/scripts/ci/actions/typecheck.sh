#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname "$0")/../lib.sh"

ci_gate_timed_step "daemon-build" pnpm --filter @open-design/daemon build
ci_gate_timed_step "desktop-build" pnpm --filter @open-design/desktop build
ci_gate_timed_step "web-build-sidecar" pnpm --filter @open-design/web build:sidecar
ci_gate_timed_step "workspace-typecheck" pnpm -r --filter '!open-design' --filter '!@open-design/landing-page' --workspace-concurrency=4 --if-present run typecheck
ci_gate_timed_step "scripts-tsc" pnpm exec tsc -p scripts/tsconfig.json --noEmit
