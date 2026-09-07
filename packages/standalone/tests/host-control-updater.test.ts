import { describe, expect, it, vi } from "vitest";

import { StandaloneHostControlUpdater, initialShellUpdaterSnapshot, type StandaloneHostControlRequest } from "../src/index.js";

const scope = Object.freeze({ channel: "betahyx", namespace: "shared" });
const identity = { type: "terminal", version: "0.1.0", buildHash: "a".repeat(64), digest: "b".repeat(64) };

describe("Standalone host updater client", () => {
  it.each(["electron", "terminal"])("dispatches every finite updater operation for %s", async (shellType) => {
    const snapshot = initialShellUpdaterSnapshot(shellType);
    const transport = vi.fn(async (request: StandaloneHostControlRequest) => {
      return request.operation === "updater.read" || request.operation === "updater.wait"
        ? snapshot : { outcome: "accepted", snapshot };
    });
    const client = new StandaloneHostControlUpdater(shellType, scope, transport);
    expect(await client.readSnapshot()).toEqual(snapshot);
    expect(await client.waitForChange(0, 100)).toEqual(snapshot);
    expect(await client.invoke("check")).toEqual({ outcome: "accepted", snapshot });
    expect(await client.confirmInstalled({ ...identity, type: shellType })).toEqual({ outcome: "accepted", snapshot });
    expect(transport.mock.calls.map(([request]) => request.operation)).toEqual([
      "updater.read", "updater.wait", "updater.invoke", "updater.confirm-installed",
    ]);
    for (const [request] of transport.mock.calls) expect(request).toMatchObject({ schemaVersion: 1, scope, shellType });
  });

  it("rejects cross-Shell responses on every operation", async () => {
    const snapshot = initialShellUpdaterSnapshot("electron");
    const client = new StandaloneHostControlUpdater("terminal", scope, async (request) => {
      return request.operation === "updater.read" || request.operation === "updater.wait"
        ? snapshot : { outcome: "accepted", snapshot };
    });
    for (const call of [() => client.readSnapshot(), () => client.waitForChange(0, 100), () => client.invoke("check"), () => client.confirmInstalled(identity)]) {
      await expect(call()).rejects.toThrow("Shell type");
    }
  });

  it("rejects a foreign installed proof before transport", async () => {
    const transport = vi.fn();
    const client = new StandaloneHostControlUpdater("terminal", scope, transport);
    await expect(client.confirmInstalled({ ...identity, type: "electron" })).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
});
