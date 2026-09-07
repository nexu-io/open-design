import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createStandaloneGenerationBinding,
  StandaloneHostLifecycle,
  StandaloneHostRuntime,
  StandaloneHostControlClient,
  type GenerationRecord,
  type StandaloneShellIdentity,
} from "../src/index.js";

import {
  STANDALONE_HOST_CONTROL_ACTION,
  validateStandaloneHostControlRequest,
} from "../src/index.js";

const scope = Object.freeze({ channel: "betahyx", namespace: "electron-foundation" });
const launcherPath = resolve("/installed/launcher.mjs");
const shell: StandaloneShellIdentity = Object.freeze({
  type: "electron",
  version: "0.1.0",
  buildHash: "a".repeat(64),
  digest: "b".repeat(64),
});
const generation: GenerationRecord = {
  schemaVersion: 4,
  id: "c".repeat(64),
  channel: scope.channel,
  releaseVersion: "0.1.0-betahyx.1",
  standaloneVersion: "0.1.0",
  sourceCommit: "7a4175c86fe305b6432081c3dc269cd4bd4ec04d",
  minimumShellVersions: { electron: "0.1.0" },
  launcher: {
    protocol: "standalone-launcher-v1",
    resourceId: "standalone-launcher",
    blobSha256: "d".repeat(64),
    entrypoint: launcherPath,
    path: launcherPath,
  },
  resources: {
    "standalone-launcher": {
      component: "standalone.launcher",
      blobSha256: "d".repeat(64),
      entrypoint: launcherPath,
      materialization: { type: "file", entrypoint: "launcher.mjs" },
      mediaType: "text/javascript",
      path: launcherPath,
      size: 42,
      sync: true,
    },
  },
};
const binding = createStandaloneGenerationBinding(generation, scope);

function startRequest() {
  return {
    schemaVersion: 1,
    operation: "lifecycle.start",
    scope,
    generation,
    binding,
    attachment: { id: "electron-1", shell },
    attachmentCapability: null,
  } as const;
}

describe("Standalone host finite control contract", () => {
  it("releases a newly reserved attachment if the generation cannot be loaded", async () => {
    const lifecycle = new StandaloneHostLifecycle(scope);
    const host = new StandaloneHostRuntime({
      scope, lifecycle,
      capabilities: () => ({ invoke: async (request) => ({ ...request, outcome: "unsupported" }) }),
      resolveGeneration: async () => { throw new Error("generation unavailable"); },
    });
    const client = new StandaloneHostControlClient(scope, (request) => host.request(request));
    await expect(client.start(scope, generation, startRequest().attachment, binding)).rejects.toThrow("generation unavailable");
    expect((await lifecycle.status()).references).toBe(0);
    await host.stop();
    expect(await lifecycle.status()).toMatchObject({ state: "stopped", references: 0 });
  });

  it("does not close a live runtime handle when another caller guesses its attachment id", async () => {
    let closes = 0;
    const runtimeStatus = { state: "running" as const, instanceId: "runtime-1", references: 1, generationId: generation.id, bindingDigest: binding.digest };
    const host = new StandaloneHostRuntime({
      scope,
      lifecycle: new StandaloneHostLifecycle(scope),
      capabilities: () => ({ invoke: async (request) => ({ ...request, outcome: "unsupported" }) }),
      resolveGeneration: async () => async () => ({
        readStatus: async () => runtimeStatus,
        invoke: async (request) => ({ ...request, outcome: "unsupported" }),
        close: async () => { closes++; return { ...runtimeStatus, state: "stopped" }; },
        waitForTerminal: async () => ({ ...runtimeStatus, state: "stopped" }),
      }),
    });
    const owner = new StandaloneHostControlClient(scope, (request) => host.request(request));
    const foreign = new StandaloneHostControlClient(scope, (request) => host.request(request));
    const attachment = startRequest().attachment;
    await owner.start(scope, generation, attachment, binding);
    await expect(foreign.start(scope, generation, attachment, binding)).rejects.toThrow("capability is required");
    const credential = owner.exportAttachmentCredential(attachment.id);
    foreign.restoreAttachmentCredential({ ...credential, attachmentCapability: "forged-capability" });
    await expect(foreign.heartbeat(scope, attachment)).rejects.toThrow("capability is invalid");
    expect(closes).toBe(0);
    expect((await owner.heartbeat(scope, attachment)).references).toBe(1);
    const resumed = new StandaloneHostControlClient(scope, (request) => host.request(request));
    resumed.restoreAttachmentCredential(credential);
    expect((await resumed.heartbeat(scope, attachment)).references).toBe(1);
    await resumed.release(scope, attachment.id);
    expect(closes).toBe(1);
    await expect(owner.heartbeat(scope, attachment)).rejects.toThrow();
  });

  it.each(["terminal", "electron"])("shares one lifecycle when %s attaches first", async (firstType) => {
    const lifecycle = new StandaloneHostLifecycle(scope);
    const first = { id: `${firstType}-1`, shell: { ...shell, type: firstType } };
    const secondType = firstType === "terminal" ? "electron" : "terminal";
    const second = { id: `${secondType}-1`, shell: { ...shell, type: secondType } };
    const firstStarted = await lifecycle.start(generation, first, binding, null);
    const secondStarted = await lifecycle.start(generation, second, binding, null);
    expect(secondStarted.status.instanceId).toBe(firstStarted.status.instanceId);
    expect(secondStarted.status.references).toBe(2);
    await expect(lifecycle.release(first.id, secondStarted.attachmentCapability)).rejects.toThrow("capability is invalid");
    expect(await lifecycle.beginTransition("content-restart", { ownerAttachmentId: first.id })).toMatchObject({ state: "blocked", reason: "occupied" });
    const acquired = await lifecycle.beginTransition("content-restart", { ownerAttachmentId: first.id, force: true });
    if (acquired.state !== "acquired") throw new Error("forced transition was not acquired");
    const sealed = await lifecycle.forceStopTransition(acquired.transition.token, acquired.transition.fence);
    expect(sealed.phase).toBe("stopped-sealed");
    await expect(lifecycle.heartbeat(first, firstStarted.attachmentCapability)).rejects.toThrow();
    expect((await lifecycle.completeTransitionStart(sealed.token, sealed.fence, generation, second, binding)).status.references).toBe(1);
  });

  it.each(["terminal", "electron"])("accepts %s attachment identity without a Shell-specific dialect", (type) => {
    const request = { ...startRequest(), attachment: { id: `${type}-1`, shell: { ...shell, type } } };
    expect(validateStandaloneHostControlRequest(request, scope)).toEqual(request);
  });

  it("uses one named Sidecar action and accepts an exact bound start", () => {
    expect(STANDALONE_HOST_CONTROL_ACTION).toBe("standalone.host.control.v1");
    expect(validateStandaloneHostControlRequest(startRequest(), scope)).toEqual(startRequest());
  });

  it("rejects unknown operations and surplus fields", () => {
    expect(() => validateStandaloneHostControlRequest({ schemaVersion: 1, operation: "lifecycle.erase", scope }, scope))
      .toThrow("unsupported Standalone host control operation");
    expect(() => validateStandaloneHostControlRequest({ ...startRequest(), command: "surplus" }, scope))
      .toThrow("fields must be exactly");
    expect(() => validateStandaloneHostControlRequest({ schemaVersion: 1, operation: "lifecycle.status", scope: { ...scope, path: "/tmp" } }, scope))
      .toThrow("control scope fields must be exactly");
  });

  it("rejects cross-scope and altered generation bindings", () => {
    expect(() => validateStandaloneHostControlRequest(startRequest(), { ...scope, namespace: "other" }))
      .toThrow("escaped its scope");
    expect(() => validateStandaloneHostControlRequest({
      ...startRequest(),
      binding: { ...binding, digest: "e".repeat(64) },
    }, scope)).toThrow("generation binding is not exact");
  });

  it("enumerates updater actions and validates installed Shell proofs", () => {
    const invoke = { schemaVersion: 1, operation: "updater.invoke", scope, shellType: "electron", action: "install" } as const;
    expect(validateStandaloneHostControlRequest(invoke, scope)).toEqual(invoke);
    expect(() => validateStandaloneHostControlRequest({ ...invoke, action: "replace-binary" }, scope))
      .toThrow("updater action is invalid");
    expect(validateStandaloneHostControlRequest({
      schemaVersion: 1,
      operation: "updater.confirm-installed",
      scope,
      shellType: "electron",
      proof: shell,
    }, scope)).toMatchObject({ operation: "updater.confirm-installed", proof: shell });
  });
});
