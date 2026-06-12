#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname "$0")/../lib.sh"

playwright_flags="${CI_GATE_PLAYWRIGHT_INSTALL_FLAGS:-chromium}"

read -r daemon_port web_port < <(
  node --input-type=module -e '
    import net from "node:net";

    const listen = () =>
      new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          if (address == null || typeof address === "string") {
            server.close(() => reject(new Error("expected TCP address")));
            return;
          }
          server.close(() => resolve(address.port));
        });
      });

    const ports = await Promise.all([listen(), listen()]);
    console.log(ports.join(" "));
  '
)

export OD_PORT="$daemon_port"
export OD_WEB_PORT="$web_port"
export OD_E2E_NAMESPACE="ci-browser-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"

# shellcheck disable=SC2086
ci_gate_timed_step "playwright-install" pnpm -C e2e exec playwright install $playwright_flags
ci_gate_timed_step "daemon-build" pnpm --filter @open-design/daemon build
ci_gate_timed_step "desktop-build" pnpm --filter @open-design/desktop build
ci_gate_timed_step "web-build-sidecar" pnpm --filter @open-design/web build:sidecar
ci_gate_timed_step "e2e-vitest" pnpm --filter @open-design/e2e test
ci_gate_timed_step "playwright-clean" pnpm -C e2e exec tsx scripts/playwright.ts clean
ci_gate_timed_step "playwright-critical" pnpm -C e2e run test:ui:critical
