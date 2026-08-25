import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ElectronFixtureLifecyclePort } from "@/lifecycle/fixture-port.js";

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
    const lifecycle = new ElectronFixtureLifecyclePort(fileURLToPath(new URL("../../dist/lifecycle/fixture-sidecar.cjs", import.meta.url)));
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
});
