import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DAEMON_STARTUP_TIMEOUT_MS,
  waitForDaemonRuntime,
  waitForDesktopRuntime,
  waitForWebRuntime,
} from "../src/sidecar-client.js";

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
      const previous = process.env[key];
      t.after(() => {
        if (previous == null) delete process.env[key];
        else process.env[key] = previous;
      });
      process.env[key] = String(timeoutMs);

      // Advance the clock around real IPC probes without a multi-minute wait.
      let elapsed = 0;
      t.mock.method(Date, "now", () => elapsed);
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
