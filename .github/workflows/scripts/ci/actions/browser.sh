#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname "$0")/../lib.sh"

playwright_flags="${CI_GATE_PLAYWRIGHT_INSTALL_FLAGS:-chromium}"

# shellcheck disable=SC2086
ci_gate_timed_step "playwright-install" pnpm -C e2e exec playwright install $playwright_flags
ci_gate_timed_step "daemon-build" pnpm --filter @open-design/daemon build
ci_gate_timed_step "desktop-build" pnpm --filter @open-design/desktop build
ci_gate_timed_step "web-build-sidecar" pnpm --filter @open-design/web build:sidecar
ci_gate_timed_step "e2e-vitest" pnpm --filter @open-design/e2e test
ci_gate_timed_step "playwright-clean" pnpm -C e2e exec tsx scripts/playwright.ts clean
ci_gate_timed_step "playwright-critical" pnpm -C e2e run test:ui:critical
