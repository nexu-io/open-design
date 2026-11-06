import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  FossilHandoffHost,
  StandaloneHandoffError,
  createStandaloneGenerationBinding,
  createStandaloneGenerationBootloader,
  type GenerationRecord,
  type StandaloneHandoffRequest,
  type StandaloneRuntimeHandle,
  type StandaloneRuntimeStatus,
  type StandaloneShellCapabilityPort,
} from "../src/index.js";

const terminal = Object.freeze({
  type: "terminal",
  version: "0.1.0",
  buildHash: "b".repeat(64),
  digest: "c".repeat(64),
});

function generation(id = "a".repeat(64)): GenerationRecord {
  const launcherPath = join(process.cwd(), "fixtures", id, "launcher.mjs");
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
      blobSha256: "e".repeat(64),
      entrypoint: "launcher.mjs",
      path: launcherPath,
    },
    resources: {
      "standalone-launcher": {
        component: "standalone.launcher",
        blobSha256: "e".repeat(64),
        entrypoint: "launcher.mjs",
        materialization: { type: "file", entrypoint: "launcher.mjs" },
        mediaType: "text/javascript",
        path: launcherPath,
        size: 1,
        sync: true,
      },
    },
  };
}

function request(
  id: string,
  generationId = "a".repeat(64),
  capability: StandaloneShellCapabilityPort["invoke"] = vi.fn(async (value) => ({
    requestId: value.requestId,
    attachmentId: value.attachmentId,
    bindingDigest: value.bindingDigest,
    outcome: "accepted" as const,
    output: id,
  })),
): StandaloneHandoffRequest {
  return {
    binding: createStandaloneGenerationBinding(generation(generationId), { channel: "somechan", namespace: "shared" }),
    attachment: { id, shell: terminal },
    capabilities: { invoke: capability },
  };
}

function body(bindingDigest: string, generationId: string) {
  let references = 1;
  let state: StandaloneRuntimeStatus["state"] = "running";
  let resolveTerminal!: (status: StandaloneRuntimeStatus) => void;
  const terminalStatus = new Promise<StandaloneRuntimeStatus>((resolve) => { resolveTerminal = resolve; });
  const status = (): StandaloneRuntimeStatus => ({
    bindingDigest,
    generationId,
    instanceId: "fixture-body",
    state,
    references,
  });
  const handle: StandaloneRuntimeHandle = {
    readStatus: async () => status(),
    invoke: async (command) => ({
      requestId: command.requestId,
      attachmentId: command.attachmentId,
      bindingDigest,
      outcome: "accepted",
      output: command.command,
    }),
    close: async () => {
      references = 0;
      state = "stopped";
      const result = status();
      resolveTerminal(result);
      return result;
    },
    waitForTerminal: async () => terminalStatus,
  };
  return { handle, status };
}

describe("immutable bootloader handoff", () => {
  it("binds one typed standalone.launcher to an exact generation and scope", () => {
    const first = createStandaloneGenerationBinding(generation(), { channel: "somechan", namespace: "shared" });
    const same = createStandaloneGenerationBinding(generation(), { channel: "somechan", namespace: "shared" });
    const otherScope = createStandaloneGenerationBinding(generation(), { channel: "somechan", namespace: "other" });
    expect(first).toEqual(same);
    expect(first.digest).not.toBe(otherScope.digest);
    expect(first.launcher).toMatchObject({ resourceId: "standalone-launcher", blobSha256: "e".repeat(64) });
  });

  it("imports once, starts one body, multiplexes capabilities, and closes on the final attachment", async () => {
    const starts = vi.fn(async (initial: StandaloneHandoffRequest) => {
      const runtime = body(initial.binding.digest, initial.binding.generationId);
      const capability = await initial.capabilities.invoke({
        requestId: "capability-a",
        attachmentId: "terminal-a",
        bindingDigest: initial.binding.digest,
        capability: "shell.update",
      });
      expect(capability.output).toBe("terminal-a");
      return runtime.handle;
    });
    const generationBootloader = createStandaloneGenerationBootloader(starts);
    const imports = vi.fn(async () => generationBootloader);
    const fossil = new FossilHandoffHost(imports);
    const firstRequest = request("terminal-a");
    const secondRequest = request("terminal-b");

    const first = await fossil.handoff(firstRequest);
    const replay = await fossil.handoff(firstRequest);
    const second = await fossil.handoff(secondRequest);
    expect(replay).toBe(first);
    expect(imports).toHaveBeenCalledTimes(1);
    expect(starts).toHaveBeenCalledTimes(1);
    await expect(second.invoke({
      requestId: "command-b",
      attachmentId: "terminal-b",
      bindingDigest: secondRequest.binding.digest,
      command: "status",
    })).resolves.toMatchObject({ outcome: "accepted", output: "status" });
    await expect(first.close()).resolves.toMatchObject({ state: "stopped", references: 1 });
    await expect(second.readStatus()).resolves.toMatchObject({ state: "running" });
    await expect(second.close()).resolves.toMatchObject({ state: "stopped", references: 0 });
    await expect(second.waitForTerminal()).resolves.toMatchObject({ state: "stopped", bindingDigest: secondRequest.binding.digest });
  });

  it("fails closed on another generation or changed attachment identity", async () => {
    const bootloader = createStandaloneGenerationBootloader(async (initial) => body(initial.binding.digest, initial.binding.generationId).handle);
    const fossil = new FossilHandoffHost(async () => bootloader);
    await fossil.handoff(request("terminal"));
    await expect(fossil.handoff(request("terminal", "f".repeat(64)))).rejects.toMatchObject({ code: "handoff-conflict" });
    const changed = request("terminal");
    await expect(fossil.handoff({
      ...changed,
      attachment: { ...changed.attachment, shell: { ...terminal, digest: "f".repeat(64) } },
    })).rejects.toMatchObject({ code: "attachment-conflict" });
  });

  it("keeps selected launcher failure sticky and never invokes a fallback", async () => {
    const failure = new Error("selected generation failed");
    const imports = vi.fn(async () => { throw failure; });
    const fossil = new FossilHandoffHost(imports);
    await expect(fossil.handoff(request("terminal-a"))).rejects.toBe(failure);
    await expect(fossil.handoff(request("terminal-b"))).rejects.toBe(failure);
    expect(imports).toHaveBeenCalledTimes(1);
  });

  it("rejects runtime and capability results that escape the exact binding", async () => {
    const initial = request("terminal", undefined, vi.fn(async (value) => ({
      requestId: value.requestId,
      attachmentId: value.attachmentId,
      bindingDigest: "0".repeat(64),
      outcome: "accepted" as const,
    })));
    const bootloader = createStandaloneGenerationBootloader(async (bodyRequest) => {
      await expect(bodyRequest.capabilities.invoke({
        requestId: "escaped",
        attachmentId: "terminal",
        bindingDigest: bodyRequest.binding.digest,
        capability: "shell.update",
      })).rejects.toMatchObject({ code: "runtime-invalid" });
      return body(bodyRequest.binding.digest, bodyRequest.binding.generationId).handle;
    });
    const fossil = new FossilHandoffHost(async () => bootloader);
    const handle = await fossil.handoff(initial);
    await expect(handle.invoke({
      requestId: "wrong-binding",
      attachmentId: "terminal",
      bindingDigest: "0".repeat(64),
      command: "status",
    })).rejects.toBeInstanceOf(StandaloneHandoffError);
  });
});
