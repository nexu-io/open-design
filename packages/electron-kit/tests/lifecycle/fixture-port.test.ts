import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ElectronFixtureLifecyclePort } from "@/lifecycle/fixture-port.js";

afterEach(() => vi.unstubAllEnvs());

const generation = {
  schemaVersion: 3 as const,
  id: "c".repeat(64),
  channel: "dev",
  releaseVersion: "0.1.0",
  standaloneVersion: "fixture-v1",
  sourceCommit: "fixture",
  minimumShellVersions: { electron: "0.1.0" },
  resources: {},
};
const scope = { channel: "dev", namespace: "electron-kit-test" };
const attachment = {
  id: "electron-test",
  shell: { type: "electron", version: "0.1.0", buildHash: "a".repeat(64), digest: "b".repeat(64) },
};

describe("Electron fixture lifecycle", () => {
  it("crosses readiness, heartbeat and a fenced Shell-install transition", async () => {
    const lifecycle = new ElectronFixtureLifecyclePort(fileURLToPath(new URL("../../dist/lifecycle/fixture-sidecar.cjs", import.meta.url)), process.execPath);
    const started = await lifecycle.start(scope, generation, attachment);
    expect(started.state).toBe("running");
    await expect(lifecycle.awaitReady(scope, {
      generationId: generation.id,
      instanceId: started.instanceId!,
      attachmentId: attachment.id,
    })).resolves.toMatchObject({ attachmentId: attachment.id });
    await expect(lifecycle.heartbeat(scope, attachment)).resolves.toMatchObject({ references: 1 });

    const result = await lifecycle.beginTransition(scope, "shell-install", { ownerShellType: "electron" });
    expect(result.state).toBe("acquired");
    if (result.state !== "acquired") return;
    await result.transition.forceStop();
    const restarted = await result.transition.completeStart(generation, attachment);
    expect(restarted).toMatchObject({ state: "running", references: 1 });
    await lifecycle.awaitReady(scope, {
      generationId: generation.id,
      instanceId: restarted.instanceId!,
      attachmentId: attachment.id,
    });
    const released = await lifecycle.release(scope, attachment.id);
    await lifecycle.stop(scope, released.fence);
    await expect(lifecycle.status(scope)).resolves.toMatchObject({ state: "stopped", references: 0 });
  });

  it("lets fixture Closure schedule the exposed Shell updater before readiness", async () => {
    vi.stubEnv("ELECTRON_KIT_FIXTURE_PREPARE_UPDATE", "1");
    const lifecycle = new ElectronFixtureLifecyclePort(fileURLToPath(new URL("../../dist/lifecycle/fixture-sidecar.cjs", import.meta.url)), process.execPath);
    const actions: string[] = [];
    let state = "idle";
    lifecycle.exposeShellUpdater({
      shellType: "electron",
      readSnapshot: async () => ({ state } as any),
      waitForChange: async () => ({ state } as any),
      invoke: async (action) => {
        actions.push(action);
        state = action === "check" ? "available" : "ready";
        return { outcome: "accepted", snapshot: { state } as any };
      },
      confirmInstalled: async () => ({ outcome: "unsupported", snapshot: { state } as any }),
    });
    const started = await lifecycle.start(scope, generation, attachment);
    await lifecycle.awaitReady(scope, { generationId: generation.id, instanceId: started.instanceId!, attachmentId: attachment.id });
    expect(actions).toEqual(["check", "download"]);
    const released = await lifecycle.release(scope, attachment.id);
    await lifecycle.stop(scope, released.fence);
  });
});
