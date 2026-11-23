import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname } from "node:path";
import { describe, it, type TestContext } from "node:test";

import { resolveSidecarClientEndpoint } from "@open-design/sidecar";

import {
  DAEMON_STARTUP_TIMEOUT_MS,
  waitForDaemonRuntime,
  waitForDesktopRuntime,
  waitForWebRuntime,
} from "../src/sidecar-client.js";

function setStartupTimeout(t: TestContext, key: string, timeoutMs: number): void {
  const previous = process.env[key];
  t.after(() => {
    if (previous == null) delete process.env[key];
    else process.env[key] = previous;
  });
  process.env[key] = String(timeoutMs);
}

describe("sidecar startup waits", () => {
  it("allows daemon initialization to continue past the legacy 35 second deadline", () => {
    assert.equal(DAEMON_STARTUP_TIMEOUT_MS, 120_000);
  });

  const startupWaits = [
    ["daemon", waitForDaemonRuntime, "OD_TOOLS_DEV_DAEMON_STARTUP_TIMEOUT_MS", 600_000],
    ["web", waitForWebRuntime, "OD_TOOLS_DEV_WEB_STARTUP_TIMEOUT_MS", 300_000],
  ] as const;

  for (const [appName, waitForRuntime, key, timeoutMs] of startupWaits) {
    it(`honors the configured ${appName} startup deadline`, async (t) => {
      setStartupTimeout(t, key, timeoutMs);

      // Advance the clock around real IPC probes without a multi-minute wait.
      let elapsed = 0;
      t.mock.method(performance, "now", () => elapsed);
      await assert.rejects(
        waitForRuntime(
          { base: "unused", namespace: `startup-timeout-${appName}-${process.pid}` },
          undefined,
          () => {
            elapsed += timeoutMs / 4;
            return elapsed <= timeoutMs * 1.25;
          },
        ),
        new RegExp(`${appName} did not expose status in time \\(${timeoutMs} ms\\)`),
      );
      assert.ok(elapsed >= timeoutMs);
    });

    for (const listening of [false, true]) {
      const endpointState = listening ? "unresponsive" : "absent";
      it(`keeps a short ${appName} deadline when its status endpoint is ${endpointState}`, async (t) => {
        const budgetMs = 40;
        setStartupTimeout(t, key, budgetMs);
        const namespace = `short-wait-${appName}-${endpointState}-${process.pid}`;
        let probed = false;
        if (listening) {
          const endpoint = resolveSidecarClientEndpoint({ app: appName, channel: "local", mode: "dev", namespace, source: "tools-dev" });
          if (process.platform !== "win32") await mkdir(dirname(endpoint), { recursive: true });
          const server = createServer((socket) => socket.once("data", () => { probed = true; }));
          await once(server.listen(endpoint), "listening");
          t.after(() => server[Symbol.asyncDispose]());
        }

        const startedAt = performance.now();
        await assert.rejects(waitForRuntime({ base: "unused", namespace }), /did not expose status in time \(40 ms\)/);
        const elapsedMs = performance.now() - startedAt;
        assert.ok(!listening || probed, "the client should reach the listening endpoint");
        assert.ok(elapsedMs >= 35 && elapsedMs < 130, `a ${budgetMs} ms deadline took ${elapsedMs.toFixed(1)} ms`);
      });
    }
  }

  it("fails immediately when a spawned app exits before publishing status", async () => {
    const waits = [
      ["daemon", waitForDaemonRuntime],
      ["web", waitForWebRuntime],
      ["desktop", waitForDesktopRuntime],
    ] as const;

    for (const [appName, waitForRuntime] of waits) {
      const startedAt = Date.now();
      await assert.rejects(
        waitForRuntime(
          { base: "unused", namespace: `exited-${appName}-${process.pid}` },
          5_000,
          () => false,
        ),
        new RegExp(`${appName} exited before exposing status`),
      );
      assert.ok(Date.now() - startedAt < 1_000);
    }
  });
});
