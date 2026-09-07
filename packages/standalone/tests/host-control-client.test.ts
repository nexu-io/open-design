import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createStandaloneGenerationBinding,
  type GenerationRecord,
  type LifecycleStatus,
} from "../src/index.js";

import {
  StandaloneHostControlClient,
  standaloneHostControlRequestTimeoutMs,
  type StandaloneHostControlTransport,
} from "../src/index.js";
import type { StandaloneHostControlRequest } from "../src/index.js";

const scope = Object.freeze({ channel: "betahyx", namespace: "electron-foundation" });
const shell = Object.freeze({ type: "electron", version: "0.1.0", buildHash: "a".repeat(64), digest: "b".repeat(64) });
const launcherPath = resolve("/installed/launcher.mjs");
const generation: GenerationRecord = {
  schemaVersion: 4,
  id: "c".repeat(64),
  channel: scope.channel,
  releaseVersion: "0.1.0-betahyx.1",
  standaloneVersion: "0.1.0",
  sourceCommit: "7a4175c86fe305b6432081c3dc269cd4bd4ec04d",
  minimumShellVersions: { electron: "0.1.0" },
  launcher: { protocol: "standalone-launcher-v1", resourceId: "standalone-launcher", blobSha256: "d".repeat(64), entrypoint: launcherPath, path: launcherPath },
  resources: {
    "standalone-launcher": { component: "standalone.launcher", blobSha256: "d".repeat(64), entrypoint: launcherPath, materialization: { type: "file", entrypoint: "launcher.mjs" }, mediaType: "text/javascript", path: launcherPath, size: 42, sync: true },
  },
};
const binding = createStandaloneGenerationBinding(generation, scope);
const attachment = Object.freeze({ id: "electron-1", shell });

function runningStatus(bindingDigest = binding.digest): LifecycleStatus {
  return {
    scope,
    state: "running",
    generationId: generation.id,
    bindingDigest,
    instanceId: "instance-1",
    references: 1,
    occupants: [{ attachmentId: attachment.id, generationId: generation.id, shell }],
    fence: 1,
    lease: { heartbeatIntervalMs: 1_000, expiresAt: "2026-09-04T00:01:00.000Z" },
  };
}

function stoppedStatus(): LifecycleStatus {
  return { scope, state: "stopped", generationId: null, bindingDigest: null, instanceId: null, references: 0, occupants: [], fence: 2, lease: null };
}

describe("Electron Standalone control client", () => {
  it("gives physical lifecycle and updater operations bounded operation-level deadlines", () => {
    expect(standaloneHostControlRequestTimeoutMs({ operation: "lifecycle.status" })).toBe(5_000);
    expect(standaloneHostControlRequestTimeoutMs({ operation: "lifecycle.start" })).toBe(120_000);
    expect(standaloneHostControlRequestTimeoutMs({ operation: "lifecycle.release" })).toBe(60_000);
    expect(standaloneHostControlRequestTimeoutMs({ operation: "runtime.invoke" })).toBe(120_000);
    expect(standaloneHostControlRequestTimeoutMs({ operation: "updater.invoke" })).toBe(600_000);
    expect(standaloneHostControlRequestTimeoutMs({ operation: "updater.wait", timeoutMs: 30_000 })).toBe(32_000);
  });

  it("keeps the opaque capability inside lifecycle and runtime requests", async () => {
    const requests: StandaloneHostControlRequest[] = [];
    const transport: StandaloneHostControlTransport = async (request) => {
      requests.push(request);
      if (request.operation === "lifecycle.start") return { status: runningStatus(), attachmentCapability: "opaque-capability-1" };
      if (request.operation === "lifecycle.ready") return request.readiness;
      if (request.operation === "lifecycle.heartbeat" || request.operation === "lifecycle.status") return runningStatus();
      if (request.operation === "runtime.invoke") return { requestId: request.command.requestId, attachmentId: request.command.attachmentId, bindingDigest: request.command.bindingDigest, outcome: "unsupported", error: { code: "unavailable" } };
      if (request.operation === "lifecycle.release") return stoppedStatus();
      throw new Error(`unexpected operation: ${request.operation}`);
    };
    const client = new StandaloneHostControlClient(scope, transport);
    const started = await client.start(scope, generation, attachment, binding);
    await client.awaitReady(scope, { generationId: generation.id, bindingDigest: binding.digest, instanceId: started.instanceId!, attachmentId: attachment.id });
    await client.heartbeat(scope, attachment);
    await client.invoke({ requestId: "request-1", attachmentId: attachment.id, bindingDigest: binding.digest, command: "ping" });
    await client.release(scope, attachment.id);

    expect(requests[0]).toMatchObject({ operation: "lifecycle.start", attachmentCapability: null });
    expect(requests[2]).toMatchObject({ operation: "lifecycle.heartbeat", attachmentCapability: "opaque-capability-1" });
    expect(requests[3]).toMatchObject({ operation: "runtime.invoke", attachmentCapability: "opaque-capability-1" });
    expect(requests[4]).toMatchObject({ operation: "lifecycle.release", attachmentCapability: "opaque-capability-1" });
    await expect(client.heartbeat(scope, attachment)).rejects.toThrow("capability is unavailable");
  });

  it("rejects a start response for another binding before retaining capability", async () => {
    const client = new StandaloneHostControlClient(scope, async () => ({
      status: runningStatus("e".repeat(64)),
      attachmentCapability: "opaque-capability-1",
    }));
    await expect(client.start(scope, generation, attachment, binding)).rejects.toThrow("different started generation");
    await expect(client.heartbeat(scope, attachment)).rejects.toThrow("capability is unavailable");
  });
});
