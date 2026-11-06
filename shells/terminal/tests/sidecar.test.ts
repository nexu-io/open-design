import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  convergeSidecarLaunch,
  getSidecarStatus,
  invokeSidecar,
  stopSidecar,
  type SidecarStamp,
} from "@open-design/sidecar";
import {
  createStandaloneGenerationBinding,
  sha256Hex,
  type GenerationRecord,
} from "@open-design/standalone";

import { repoRoot, terminalRoot } from "./helpers.js";

const roots: string[] = [];
const stamps: SidecarStamp[] = [];
afterEach(async () => {
  for (const stamp of stamps.splice(0)) await stopSidecar(stamp).catch(() => undefined);
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function generation(path: string, digest: string, id: string): GenerationRecord {
  return {
    schemaVersion: 4,
    id,
    channel: "somechan",
    releaseVersion: "0.1.0-somechan.1",
    standaloneVersion: "0.1.0",
    sourceCommit: "d".repeat(40),
    minimumShellVersions: { terminal: "0.1.0" },
    launcher: {
      protocol: "standalone-launcher-v1",
      resourceId: "standalone-launcher",
      blobSha256: digest,
      entrypoint: "launcher.mjs",
      path,
    },
    resources: {
      "standalone-launcher": {
        component: "standalone.launcher",
        blobSha256: digest,
        entrypoint: "launcher.mjs",
        materialization: { type: "file", entrypoint: "launcher.mjs" },
        mediaType: "text/javascript",
        path,
        size: readFileSync(path).byteLength,
        sync: true,
      },
    },
  };
}

async function waitForSuccessor(stamp: SidecarStamp, generationPid: number, previousHostPid: number) {
  const deadline = Date.now() + 10_000;
  let last: any = null;
  while (Date.now() < deadline) {
    try {
      last = await getSidecarStatus<any>(stamp, { generationPid, timeoutMs: 500 });
      if (last.hostPid !== previousHostPid && last.previousHostPid === previousHostPid) return last;
    } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  throw new Error(`Terminal Sidecar successor did not become ready: ${JSON.stringify(last)}`);
}

async function waitForSidecarExit(stamp: SidecarStamp, generationPid: number) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try { await getSidecarStatus(stamp, { generationPid, timeoutMs: 250 }); }
    catch { return; }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  throw new Error("crashed Terminal Sidecar generation remained addressable");
}

describe("Terminal Sidecar refinement", () => {
  it("keeps the Sidecar generation root while handing an exact Standalone binding to a fresh host", async () => {
    const root = mkdtempSync(join(tmpdir(), "terminal-sidecar-refinement-"));
    roots.push(root);
    const storeRoot = join(root, "store");
    const runtimeRoot = join(root, "runtime");
    const launcherA = join(root, "launcher-a.mjs");
    const launcherB = join(root, "launcher-b.mjs");
    const standaloneEntrypoint = resolve(repoRoot, "packages/standalone/dist/index.mjs");
    copyFileSync(standaloneEntrypoint, launcherA);
    copyFileSync(standaloneEntrypoint, launcherB);
    const firstGeneration = generation(launcherA, sha256Hex(readFileSync(launcherA)), "a".repeat(64));
    const secondGeneration = generation(launcherB, sha256Hex(readFileSync(launcherB)), "b".repeat(64));
    const scope = { channel: "somechan", namespace: `handoff-${process.pid}` };
    const firstBinding = createStandaloneGenerationBinding(firstGeneration, scope);
    const secondBinding = createStandaloneGenerationBinding(secondGeneration, scope);
    const stamp = { ...scope, source: "standalone", mode: "runtime", app: "standalone" };
    stamps.push(stamp);
    const sidecarHost = resolve(terminalRoot, "runtime/sidecar-host.mjs");
    const config = {
      schemaVersion: 1,
      ...scope,
      storeRoot,
      runtimeRoot,
      standaloneEntrypoint,
      sidecarHost,
    };
    const launchRequest = {
      args: [resolve(terminalRoot, "runtime/sidecar-bootstrap.mjs")],
      command: process.execPath,
      env: { ...process.env, OD_TERMINAL_SIDECAR_CONFIG_V1: JSON.stringify(config) },
      resources: { dataRoot: storeRoot, ownerPid: null, port: 0, runtimeRoot },
      stamp,
    } as const;
    const [converged, concurrent] = await Promise.all([
      convergeSidecarLaunch(launchRequest, { stabilityMs: 100, timeoutMs: 15_000 }),
      convergeSidecarLaunch(launchRequest, { stabilityMs: 100, timeoutMs: 15_000 }),
    ]);
    const generationPid = converged.description.resources.pid;
    expect(concurrent.description.resources.pid).toBe(generationPid);
    const attachment = { id: "terminal-a", shell: { type: "terminal", version: "0.1.0", buildHash: "c".repeat(64), digest: "d".repeat(64) } };
    const [first, concurrentAttachment] = await Promise.all([
      invokeSidecar<any>(stamp, "standalone.request.v1", {
        schemaVersion: 1,
        domain: "lifecycle",
        operation: "start",
        scope,
        generation: firstGeneration,
        binding: firstBinding,
        attachment,
      }),
      invokeSidecar<any>(stamp, "standalone.request.v1", {
        schemaVersion: 1,
        domain: "lifecycle",
        operation: "start",
        scope,
        generation: firstGeneration,
        binding: firstBinding,
        attachment: { ...attachment, id: "terminal-concurrent" },
      }),
    ]);
    expect(first).toMatchObject({ bindingDigest: firstBinding.digest, attachmentCapability: expect.any(String) });
    expect(concurrentAttachment).toMatchObject({ bindingDigest: firstBinding.digest, attachmentCapability: expect.any(String) });
    expect([first.references, concurrentAttachment.references].sort()).toEqual([1, 2]);
    await expect(invokeSidecar<any>(stamp, "standalone.request.v1", {
      schemaVersion: 1,
      domain: "maintenance",
      operation: "sweep-if-idle",
      scope,
    })).resolves.toMatchObject({ status: "deferred", reason: "occupied", occupants: expect.arrayContaining([
      expect.objectContaining({ attachmentId: attachment.id }),
      expect.objectContaining({ attachmentId: "terminal-concurrent" }),
    ]) });
    const originalHost = await getSidecarStatus<any>(stamp, { generationPid });
    expect(originalHost).toMatchObject({ control: "ready", generationPid, hostPid: expect.any(Number) });
    await invokeSidecar(stamp, "standalone.request.v1", {
      schemaVersion: 1,
      domain: "lifecycle",
      operation: "release",
      scope,
      attachmentId: attachment.id,
      attachmentCapability: first.attachmentCapability,
    });
    await invokeSidecar(stamp, "standalone.request.v1", {
      schemaVersion: 1,
      domain: "lifecycle",
      operation: "release",
      scope,
      attachmentId: "terminal-concurrent",
      attachmentCapability: concurrentAttachment.attachmentCapability,
    });
    await expect(invokeSidecar<any>(stamp, "standalone.request.v1", {
      schemaVersion: 1,
      domain: "maintenance",
      operation: "sweep-if-idle",
      scope,
    })).resolves.toMatchObject({ status: "complete" });
    const idle = await invokeSidecar<any>(stamp, "standalone.request.v1", { schemaVersion: 1, domain: "lifecycle", operation: "status", scope });
    await invokeSidecar(stamp, "standalone.request.v1", { schemaVersion: 1, domain: "lifecycle", operation: "stop", scope, fence: idle.fence });
    await invokeSidecar(stamp, "standalone.request.v1", {
      schemaVersion: 1,
      domain: "generation",
      operation: "handoff",
      scope,
      bindingDigest: secondBinding.digest,
      generationId: secondBinding.generationId,
    });
    const successor = await waitForSuccessor(stamp, generationPid, originalHost.hostPid);
    expect(successor).toMatchObject({ control: "ready", generationPid, previousHostPid: originalHost.hostPid });
    const second = await invokeSidecar<any>(stamp, "standalone.request.v1", {
      schemaVersion: 1,
      domain: "lifecycle",
      operation: "start",
      scope,
      generation: secondGeneration,
      binding: secondBinding,
      attachment: { ...attachment, id: "terminal-b" },
    });
    expect(second).toMatchObject({ bindingDigest: secondBinding.digest, references: 1 });
    await invokeSidecar(stamp, "standalone.request.v1", {
      schemaVersion: 1,
      domain: "lifecycle",
      operation: "release",
      scope,
      attachmentId: "terminal-b",
      attachmentCapability: second.attachmentCapability,
    });
    await expect(invokeSidecar(stamp, "standalone.request.v1", {
      schemaVersion: 1,
      domain: "lifecycle",
      operation: "status",
      scope,
      fault: "crash",
    })).resolves.toMatchObject({ accepted: true });
    await waitForSidecarExit(stamp, generationPid);
    const recovered = await convergeSidecarLaunch(launchRequest, { stabilityMs: 100, timeoutMs: 15_000 });
    expect(recovered.description.resources.pid).not.toBe(generationPid);
    await expect(getSidecarStatus(stamp, { generationPid: recovered.description.resources.pid })).resolves.toMatchObject({ control: "ready" });
  }, 45_000);
});
