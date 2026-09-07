import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it, vi } from "vitest";
import {
  createStandaloneGenerationBinding,
  createStandaloneRuntimeLayoutCapabilityHandler,
  createStandaloneShellCapabilityRouter,
  createStandaloneShellUpdaterCapabilityHandler,
  initialShellUpdaterSnapshot,
  type GenerationRecord,
} from "@open-design/standalone";

const sidecars = vi.hoisted(() => ({
  invoked: [] as Array<{ app: string; input: unknown; type: string }>,
  spawned: [] as Array<{ app: string; env: NodeJS.ProcessEnv }>,
}));
vi.mock("@open-design/sidecar", () => ({
  async stopSidecar() { return { forcedPids: [], remainingPids: [] }; },
  async spawnSidecar(input: { env: NodeJS.ProcessEnv; stamp: { app: string } }) {
    sidecars.spawned.push({ app: input.stamp.app, env: input.env });
    return {
      process: { exitCode: null, pid: 4000 + sidecars.spawned.length, signalCode: null, once() {} },
      async stop() { return { forcedPids: [], remainingPids: [] }; },
    };
  },
  async getSidecarStatus(stamp: { app: string }) {
    return stamp.app === "daemon"
      ? { state: "running", url: "http://127.0.0.1:17578" }
      : { state: "running", url: "http://127.0.0.1:17579" };
  },
  async invokeSidecar(stamp: { app: string }, type: string, input: unknown) {
    sidecars.invoked.push({ app: stamp.app, input, type });
    return { accepted: true };
  },
}));

import { prepareClosureShellUpdate } from "../src/index.js";
import { standaloneGenerationHandoff } from "../src/launcher.js";

describe("Closure generation runtime", () => {
  it.each(["electron", "terminal"])("shares exact daemon/Web resources and authenticates the invoking attachment when %s starts first", async (firstType) => {
    sidecars.spawned.length = 0;
    sidecars.invoked.length = 0;
    const runtimeRoot = join(tmpdir(), "closure-runtime-test");
    const generation: GenerationRecord = {
      schemaVersion: 4,
      id: "a".repeat(64),
      channel: "betahyx",
      releaseVersion: "0.1.0-betahyx.1",
      standaloneVersion: "0.1.0",
      sourceCommit: "b".repeat(40),
      minimumShellVersions: { electron: "0.1.0", terminal: "0.1.0" },
      launcher: { protocol: "standalone-launcher-v1", resourceId: "standalone-launcher", blobSha256: "b".repeat(64), entrypoint: "/fixture/launcher.mjs", path: "/fixture/launcher.mjs" },
      resources: {
        "standalone-launcher": { component: "standalone.launcher", blobSha256: "b".repeat(64), entrypoint: "/fixture/launcher.mjs", materialization: { type: "file", entrypoint: "launcher.mjs" }, mediaType: "text/javascript", path: "/fixture/launcher.mjs", size: 42, sync: true },
        "open-design-daemon": { component: "standalone.resource", blobSha256: "f".repeat(64), entrypoint: "/fixture/daemon/sidecar.mjs", materialization: { type: "zip", entrypoint: "sidecar.mjs", treeSha256: "1".repeat(64) }, mediaType: "application/zip", path: "/fixture/daemon", size: 43, sync: true },
        "open-design-web": { component: "standalone.resource", blobSha256: "9".repeat(64), entrypoint: "/fixture/web/sidecar.mjs", materialization: { type: "zip", entrypoint: "sidecar.mjs", treeSha256: "2".repeat(64) }, mediaType: "application/zip", path: "/fixture/web", size: 44, sync: true },
      },
    };
    const scope = { channel: "betahyx", namespace: "closure-runtime" } as const;
    const binding = createStandaloneGenerationBinding(generation, scope);
    const updater = {
      shellType: firstType,
      readSnapshot: async () => initialShellUpdaterSnapshot(firstType),
      waitForChange: async () => initialShellUpdaterSnapshot(firstType),
      invoke: async () => ({ outcome: "unsupported" as const, snapshot: initialShellUpdaterSnapshot(firstType) }),
      confirmInstalled: async () => ({ outcome: "unsupported" as const, snapshot: initialShellUpdaterSnapshot(firstType) }),
    };
    const request = {
      binding,
      attachment: { id: `${firstType}-fixture`, shell: { type: firstType, version: "0.1.0", buildHash: "d".repeat(64), digest: "e".repeat(64) } },
      capabilities: createStandaloneShellCapabilityRouter([
        createStandaloneShellUpdaterCapabilityHandler(updater),
        createStandaloneRuntimeLayoutCapabilityHandler({
          scope,
          layout: { dataRoot: join(runtimeRoot, "data"), logsRoot: join(runtimeRoot, "logs"), resourceStoreRoot: join(runtimeRoot, "store"), runtimeRoot: join(runtimeRoot, "processes"), sidecarSupervisorPath: join(runtimeRoot, "supervisor.mjs") },
        }),
      ]),
    };
    const handle = await standaloneGenerationHandoff(request);
    const otherType = firstType === "electron" ? "terminal" : "electron";
    const other = await standaloneGenerationHandoff({ ...request, attachment: { id: `${otherType}-fixture`, shell: { ...request.attachment.shell, type: otherType } } });
    const electron = firstType === "electron" ? handle : other;
    const terminal = firstType === "terminal" ? handle : other;
    try {
    await expect(handle.readStatus()).resolves.toMatchObject({ state: "running", bindingDigest: request.binding.digest, generationId: request.binding.generationId });
    await expect(handle.invoke({
      requestId: "renderer-read",
      attachmentId: request.attachment.id,
      bindingDigest: request.binding.digest,
      command: "open-design.product-runtime.read.v1",
      input: { schemaVersion: 1, operation: "read" },
    })).resolves.toMatchObject({
      outcome: "accepted",
      output: { daemon: { url: "http://127.0.0.1:17578" }, web: { url: "http://127.0.0.1:17579" } },
    });
    const authSecret = Buffer.alloc(32, 9).toString("base64");
    await expect(electron.invoke({
      requestId: "electron-auth",
      attachmentId: "electron-fixture",
      bindingDigest: request.binding.digest,
      command: "open-design.electron-auth.register.v1",
      input: { schemaVersion: 1, operation: "register", secret: authSecret },
    })).resolves.toMatchObject({ outcome: "accepted", output: { schemaVersion: 1, accepted: true } });
    expect(sidecars.spawned.map(({ app }) => app)).toEqual(["daemon", "web"]);
    expect(sidecars.spawned[0]!.env.OD_REQUIRE_DESKTOP_AUTH).toBe(firstType === "electron" ? "1" : undefined);
    expect(sidecars.spawned[1]!.env).toMatchObject({ OD_PORT: "17578", OD_WEB_OUTPUT_MODE: "standalone" });
    expect(sidecars.invoked).toContainEqual({ app: "daemon", type: "register-desktop-auth", input: { secret: authSecret } });
    await expect(terminal.invoke({
      requestId: "terminal-cannot-register-electron-auth", attachmentId: "terminal-fixture", bindingDigest: binding.digest,
      command: "open-design.electron-auth.register.v1", input: { schemaVersion: 1, operation: "register", secret: authSecret },
    }, { attachment: { id: "terminal-fixture", shell: { ...request.attachment.shell, type: "electron" } } })).resolves.toMatchObject({ outcome: "failed" });
    expect(sidecars.invoked.filter(({ type }) => type === "register-desktop-auth")).toHaveLength(1);
    await expect(handle.close()).resolves.toMatchObject({ state: "stopped", references: 1 });
    await expect(handle.invoke({ requestId: "closed", attachmentId: request.attachment.id, bindingDigest: binding.digest, command: "open-design.product-runtime.read.v1" }))
      .rejects.toThrow("runtime attachment is closed");
    await expect(other.close()).resolves.toMatchObject({ state: "stopped", references: 0 });
    } finally {
      await other.close();
      await handle.close();
    }
  });

  it("drives a Shell-owned updater through check and download when the Closure floor is not met", async () => {
    let revision = 0;
    let state: "idle" | "available" | "ready" = "idle";
    const snapshots: string[] = [];
    const updater = {
      shellType: "electron",
      readSnapshot: async () => ({ schemaVersion: 3 as const, revision, shellType: "electron", state, actions: [], blockedBy: [] }),
      waitForChange: async () => ({ schemaVersion: 3 as const, revision, shellType: "electron", state, actions: [], blockedBy: [] }),
      invoke: async (action: string) => {
        revision += 1;
        state = action === "check" ? "available" : "ready";
        return { outcome: "accepted" as const, snapshot: { schemaVersion: 3 as const, revision, shellType: "electron", state, actions: [], blockedBy: [], ...(state === "ready" ? { progress: { completed: 2, total: 2 } } : {}) } };
      },
      confirmInstalled: async () => ({ outcome: "unsupported" as const, snapshot: { schemaVersion: 3 as const, revision, shellType: "electron", state, actions: [], blockedBy: [] } }),
    };
    await expect(prepareClosureShellUpdate({
      requirement: { type: "electron", minVersion: "2.0.0", buildHash: "b".repeat(64) },
      shell: { type: "electron", version: "1.0.0", buildHash: "b".repeat(64), digest: "a".repeat(64) },
      updater,
      onSnapshot: (snapshot) => { snapshots.push(snapshot.state); },
    })).resolves.toMatchObject({ state: "update-required", minimumVersion: "2.0.0", snapshot: { state: "ready", progress: { completed: 2, total: 2 } } });
    expect(snapshots).toEqual(["idle", "available", "ready"]);
  });

  it("does not enter the Shell handler when the current Shell satisfies the fossil floor", async () => {
    const updater = {
      shellType: "electron",
      readSnapshot: async () => { throw new Error("must not read a compatible Shell updater"); },
      waitForChange: async () => { throw new Error("must not wait on a compatible Shell updater"); },
      invoke: async () => { throw new Error("must not invoke a compatible Shell updater"); },
      confirmInstalled: async () => { throw new Error("must not confirm a compatible Shell updater"); },
    };
    await expect(prepareClosureShellUpdate({
      requirement: { type: "electron", minVersion: "1.2.0", buildHash: "b".repeat(64) },
      shell: { type: "electron", version: "1.2.0", buildHash: "b".repeat(64), digest: "a".repeat(64) },
      updater,
    })).resolves.toEqual({ state: "compatible" });
  });

  it("fails closed when the available updater belongs to another Shell type", async () => {
    let invoked = false;
    const updater = {
      shellType: "terminal",
      readSnapshot: async () => { invoked = true; throw new Error("wrong updater must remain isolated"); },
      waitForChange: async () => { invoked = true; throw new Error("wrong updater must remain isolated"); },
      invoke: async () => { invoked = true; throw new Error("wrong updater must remain isolated"); },
      confirmInstalled: async () => { invoked = true; throw new Error("wrong updater must remain isolated"); },
    };
    await expect(prepareClosureShellUpdate({
      requirement: { type: "electron", minVersion: "2.0.0", buildHash: "b".repeat(64) },
      shell: { type: "electron", version: "1.0.0", buildHash: "b".repeat(64), digest: "a".repeat(64) },
      updater,
    })).resolves.toEqual({ state: "update-required", currentVersion: "1.0.0", minimumVersion: "2.0.0", snapshot: null });
    expect(invoked).toBe(false);
  });
});
