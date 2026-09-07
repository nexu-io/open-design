import { resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { createStandaloneGenerationBinding, type GenerationRecord } from "@open-design/standalone";

import { StandaloneHostLifecycle } from "@open-design/standalone";
import { ElectronStandaloneLifecycleLedger } from "@/adapters/standalone/lifecycle-ledger.js";

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

describe("Electron Standalone Sidecar-host lifecycle", () => {
  it("serializes attachments and requires the opaque capability on mutation", async () => {
    let now = new Date("2026-09-04T00:00:00.000Z");
    const lifecycle = new StandaloneHostLifecycle(scope, { clock: () => now, heartbeatIntervalMs: 100, leaseDurationMs: 1_000 });
    const first = { id: "electron-1", shell };
    const second = { id: "electron-2", shell };
    const [startedFirst, startedSecond] = await Promise.all([
      lifecycle.start(generation, first, binding, null),
      lifecycle.start(generation, second, binding, null),
    ]);
    expect(startedFirst.status.instanceId).toBe(startedSecond.status.instanceId);
    expect((await lifecycle.status()).references).toBe(2);
    await expect(lifecycle.heartbeat(first, "wrong-capability")).rejects.toThrow("capability is invalid");

    now = new Date("2026-09-04T00:00:00.100Z");
    expect((await lifecycle.heartbeat(first, startedFirst.attachmentCapability)).references).toBe(2);
    expect((await lifecycle.release(second.id, startedSecond.attachmentCapability)).references).toBe(1);
  });

  it("does not allow attachment identity reuse without its original capability", async () => {
    const lifecycle = new StandaloneHostLifecycle(scope, { heartbeatIntervalMs: 100, leaseDurationMs: 1_000 });
    const attachment = { id: "electron-1", shell };
    const started = await lifecycle.start(generation, attachment, binding, null);
    await expect(lifecycle.start(generation, attachment, binding, "wrong-capability")).rejects.toThrow("capability is invalid");
    expect((await lifecycle.start(generation, attachment, binding, started.attachmentCapability)).status.references).toBe(1);
  });

  it("expires abandoned attachments and fences explicit stop", async () => {
    let now = new Date("2026-09-04T00:00:00.000Z");
    const lifecycle = new StandaloneHostLifecycle(scope, { clock: () => now, heartbeatIntervalMs: 100, leaseDurationMs: 1_000 });
    await lifecycle.start(generation, { id: "electron-1", shell }, binding, null);
    now = new Date("2026-09-04T00:00:02.000Z");
    const expired = await lifecycle.status();
    expect(expired).toMatchObject({ state: "stopped", references: 0, generationId: null, fence: 2 });
    await expect(lifecycle.stop(1)).rejects.toThrow("stale shared lifecycle stop fence");
    expect(await lifecycle.stop(expired.fence)).toMatchObject({ state: "stopped", fence: 3 });
  });

  it("recovers the single durable ledger across host replacement without a second lock", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "electron-lifecycle-ledger-"));
    try {
      const ledger = new ElectronStandaloneLifecycleLedger(root, scope);
      const attachment = { id: "electron-1", shell };
      const firstHost = new StandaloneHostLifecycle(scope, { heartbeatIntervalMs: 100, leaseDurationMs: 1_000, statePort: ledger });
      const started = await firstHost.start(generation, attachment, binding, null);
      const replacementHost = new StandaloneHostLifecycle(scope, { heartbeatIntervalMs: 100, leaseDurationMs: 1_000, statePort: ledger });
      expect(await replacementHost.status()).toMatchObject({ state: "running", references: 1, bindingDigest: binding.digest });
      await expect(replacementHost.start(generation, attachment, binding, null)).rejects.toThrow("capability is required");
      expect((await replacementHost.heartbeat(attachment, started.attachmentCapability)).references).toBe(1);
      const current = await replacementHost.status();
      expect(await replacementHost.stop(current.fence)).toMatchObject({ state: "stopped", references: 0 });
      expect(await ledger.read()).toMatchObject({ state: "stopped", attachments: [] });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("recovers and seals one transition through the durable ledger", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "electron-transition-ledger-"));
    try {
      const ledger = new ElectronStandaloneLifecycleLedger(root, scope);
      const attachment = { id: "electron-1", shell };
      const firstHost = new StandaloneHostLifecycle(scope, { heartbeatIntervalMs: 100, leaseDurationMs: 1_000, transitionHeartbeatIntervalMs: 100, transitionLeaseDurationMs: 1_000, statePort: ledger });
      await firstHost.start(generation, attachment, binding, null);
      expect(await firstHost.beginTransition("shell-install", { attemptId: "install-1" })).toMatchObject({ state: "blocked", reason: "occupied" });
      const acquired = await firstHost.beginTransition("shell-install", { attemptId: "install-1", force: true });
      if (acquired.state !== "acquired") throw new Error("transition was not acquired");

      const continuation = new StandaloneHostLifecycle(scope, { heartbeatIntervalMs: 100, leaseDurationMs: 1_000, transitionHeartbeatIntervalMs: 100, transitionLeaseDurationMs: 1_000, statePort: ledger });
      expect(await continuation.beginTransition("shell-install", { attemptId: "install-1", force: true })).toEqual(acquired);
      const sealed = await continuation.forceStopTransition(acquired.transition.token, acquired.transition.fence);
      expect(sealed).toMatchObject({ attemptId: "install-1", phase: "stopped-sealed", fence: 2 });
      expect(await ledger.read()).toMatchObject({ state: "stopped", transition: { token: "install-1", phase: "stopped-sealed", fence: 2 } });
      await expect(continuation.completeStoppedTransitionStart("shell-install", "different-install", generation, attachment, binding)).resolves.toBeNull();
      const restarted = await continuation.completeTransitionStart(sealed.token, sealed.fence, generation, attachment, binding);
      expect(restarted.status).toMatchObject({ state: "running", references: 1 });
      expect((await ledger.read())?.transition).toBeNull();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it.each([
    {
      first: { kind: "shell-install" as const, attemptId: "shell-install-1" },
      second: { kind: "content-restart" as const, attemptId: "content-restart-1" },
    },
    {
      first: { kind: "content-restart" as const, attemptId: "content-restart-1" },
      second: { kind: "shell-install" as const, attemptId: "shell-install-1" },
    },
  ])("grants only the first of concurrent $first.kind and $second.kind requests", async ({ first, second }) => {
    const lifecycle = new StandaloneHostLifecycle(scope);
    const [winner, blocked] = await Promise.all([
      lifecycle.beginTransition(first.kind, { attemptId: first.attemptId }),
      lifecycle.beginTransition(second.kind, { attemptId: second.attemptId }),
    ]);

    expect(winner).toMatchObject({ state: "acquired", transition: { attemptId: first.attemptId, phase: "reserved" } });
    expect(blocked).toEqual({ state: "blocked", reason: "transition-active", occupants: [] });
    expect(await lifecycle.beginTransition(first.kind, { attemptId: first.attemptId })).toEqual(winner);
    expect(await lifecycle.beginTransition(second.kind, { attemptId: second.attemptId }))
      .toEqual({ state: "blocked", reason: "transition-active", occupants: [] });
  });

  it("atomically resumes a content restart after the sealed host crashes", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "electron-content-transition-recovery-"));
    try {
      const ledger = new ElectronStandaloneLifecycleLedger(root, scope);
      const attachment = { id: "electron-1", shell };
      const firstHost = new StandaloneHostLifecycle(scope, { heartbeatIntervalMs: 100, leaseDurationMs: 1_000, transitionHeartbeatIntervalMs: 100, transitionLeaseDurationMs: 1_000, statePort: ledger });
      await firstHost.start(generation, attachment, binding, null);
      const acquired = await firstHost.beginTransition("content-restart", { ownerAttachmentId: attachment.id });
      if (acquired.state !== "acquired") throw new Error("content transition was not acquired");
      await firstHost.forceStopTransition(acquired.transition.token, acquired.transition.fence);

      const replacementHost = new StandaloneHostLifecycle(scope, { heartbeatIntervalMs: 100, leaseDurationMs: 1_000, transitionHeartbeatIntervalMs: 100, transitionLeaseDurationMs: 1_000, statePort: ledger });
      const recovered = await replacementHost.completeStoppedTransitionStart("content-restart", null, generation, attachment, binding);
      expect(recovered?.status).toMatchObject({ state: "running", generationId: generation.id, bindingDigest: binding.digest, references: 1 });
      expect((await ledger.read())?.transition).toBeNull();
      await expect(replacementHost.completeStoppedTransitionStart("content-restart", null, generation, attachment, binding)).resolves.toBeNull();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("fences an expired sealed transition before falling back to a normal cold start", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "electron-content-transition-expiry-"));
    try {
      let now = new Date("2026-09-04T00:00:00.000Z");
      const ledger = new ElectronStandaloneLifecycleLedger(root, scope);
      const attachment = { id: "electron-1", shell };
      const firstHost = new StandaloneHostLifecycle(scope, { clock: () => now, heartbeatIntervalMs: 100, leaseDurationMs: 1_000, transitionHeartbeatIntervalMs: 100, transitionLeaseDurationMs: 1_000, statePort: ledger });
      await firstHost.start(generation, attachment, binding, null);
      const acquired = await firstHost.beginTransition("content-restart", { ownerAttachmentId: attachment.id });
      if (acquired.state !== "acquired") throw new Error("content transition was not acquired");
      const sealed = await firstHost.forceStopTransition(acquired.transition.token, acquired.transition.fence);

      now = new Date("2026-09-04T00:00:02.000Z");
      const replacementHost = new StandaloneHostLifecycle(scope, { clock: () => now, heartbeatIntervalMs: 100, leaseDurationMs: 1_000, transitionHeartbeatIntervalMs: 100, transitionLeaseDurationMs: 1_000, statePort: ledger });
      await expect(replacementHost.completeStoppedTransitionStart("content-restart", null, generation, attachment, binding)).resolves.toBeNull();
      const restarted = await replacementHost.start(generation, attachment, binding, null);
      expect(restarted.status).toMatchObject({ state: "running", references: 1, fence: sealed.fence + 2 });
      expect((await ledger.read())?.transition).toBeNull();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
