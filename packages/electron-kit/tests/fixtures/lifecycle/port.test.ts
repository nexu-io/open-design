import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ElectronFixtureLifecyclePort } from "@/fixtures/lifecycle/port.js";
import { createStandaloneGenerationBinding } from "@open-design/standalone";

afterEach(() => vi.unstubAllEnvs());

const generation = {
  schemaVersion: 4 as const,
  id: "c".repeat(64),
  channel: "dev",
  releaseVersion: "0.1.0",
  standaloneVersion: "fixture-v1",
  sourceCommit: "fixture",
  minimumShellVersions: { electron: "0.1.0" },
  launcher: {
    protocol: "standalone-launcher-v1" as const,
    resourceId: "standalone-launcher",
    blobSha256: "d".repeat(64),
    entrypoint: "launcher.mjs",
    path: resolve(".electron-kit-fixture", "launcher.mjs"),
  },
  resources: {
    "standalone-launcher": {
      component: "standalone.launcher" as const,
      blobSha256: "d".repeat(64),
      entrypoint: "launcher.mjs",
      materialization: { type: "file" as const, entrypoint: "launcher.mjs" },
      mediaType: "text/javascript",
      path: resolve(".electron-kit-fixture", "launcher.mjs"),
      size: 0,
      sync: true as const,
    },
  },
};
const scope = { channel: "dev", namespace: "electron-kit-test" };
const attachment = {
  id: "electron-test",
  shell: { type: "electron", version: "0.1.0", buildHash: "a".repeat(64), digest: "b".repeat(64) },
};
const binding = createStandaloneGenerationBinding(generation, scope);

describe("Electron fixture lifecycle", () => {
  it("crosses readiness, heartbeat and a fenced Shell-install transition", async () => {
    const lifecycle = new ElectronFixtureLifecyclePort(fileURLToPath(new URL("../../../dist/fixtures/lifecycle/sidecar.cjs", import.meta.url)), process.execPath);
    const started = await lifecycle.start(scope, generation, attachment, binding);
    expect(started.state).toBe("running");
    await expect(lifecycle.awaitReady(scope, {
      generationId: generation.id,
      bindingDigest: binding.digest,
      instanceId: started.instanceId!,
      attachmentId: attachment.id,
    })).resolves.toMatchObject({ attachmentId: attachment.id });
    await expect(lifecycle.heartbeat(scope, attachment)).resolves.toMatchObject({ references: 1 });

    const result = await lifecycle.beginTransition(scope, "shell-install", {
      ownerAttachmentId: attachment.id,
      ownerShellType: "electron",
    });
    expect(result.state).toBe("acquired");
    if (result.state !== "acquired") return;
    await result.transition.forceStop();
    const restarted = await result.transition.completeBoundStart(generation, attachment, binding);
    expect(restarted).toMatchObject({ state: "running", references: 1 });
    await lifecycle.awaitReady(scope, {
      generationId: generation.id,
      bindingDigest: binding.digest,
      instanceId: restarted.instanceId!,
      attachmentId: attachment.id,
    });
    const released = await lifecycle.release(scope, attachment.id);
    await lifecycle.stop(scope, released.fence);
    await expect(lifecycle.status(scope)).resolves.toMatchObject({ state: "stopped", references: 0 });
  });

  it("lets fixture Closure schedule the exposed Shell updater before readiness", async () => {
    vi.stubEnv("ELECTRON_KIT_FIXTURE_PREPARE_UPDATE", "1");
    const lifecycle = new ElectronFixtureLifecyclePort(fileURLToPath(new URL("../../../dist/fixtures/lifecycle/sidecar.cjs", import.meta.url)), process.execPath);
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
    const started = await lifecycle.start(scope, generation, attachment, binding);
    await lifecycle.awaitReady(scope, { generationId: generation.id, bindingDigest: binding.digest, instanceId: started.instanceId!, attachmentId: attachment.id });
    expect(actions).toEqual(["check", "download"]);
    const released = await lifecycle.release(scope, attachment.id);
    await lifecycle.stop(scope, released.fence);
  });
});
