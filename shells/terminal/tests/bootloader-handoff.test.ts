import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FossilHandoffHost,
  createStandaloneGenerationBinding,
  sha256Hex,
  type GenerationRecord,
  type StandaloneGenerationHandoff,
  type StandaloneHandoffRequest,
  type StandaloneRuntimeHandle,
  type StandaloneRuntimeStatus,
} from "@open-design/standalone";

import { repoRoot } from "./helpers.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const shell = Object.freeze({
  type: "terminal",
  version: "0.1.0",
  buildHash: "b".repeat(64),
  digest: "c".repeat(64),
});

function generation(path: string, digest: string, id = "a".repeat(64)): GenerationRecord {
  return {
    schemaVersion: 4,
    id,
    channel: "somechan",
    releaseVersion: "0.1.0-somechan.1",
    standaloneVersion: "0.1.0",
    sourceCommit: "d".repeat(40),
    minimumShellVersions: { terminal: "0.1.0", electron: "1.0.0" },
    launcher: { protocol: "standalone-launcher-v1", resourceId: "standalone-launcher", blobSha256: digest, entrypoint: "launcher.mjs", path },
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

function runtime(initial: StandaloneHandoffRequest): StandaloneRuntimeHandle {
  let state: StandaloneRuntimeStatus["state"] = "running";
  let resolveTerminal!: (status: StandaloneRuntimeStatus) => void;
  const terminal = new Promise<StandaloneRuntimeStatus>((resolve) => { resolveTerminal = resolve; });
  const status = (): StandaloneRuntimeStatus => ({
    bindingDigest: initial.binding.digest,
    generationId: initial.binding.generationId,
    instanceId: "terminal-fake-sidecar",
    references: state === "running" ? 1 : 0,
    state,
  });
  return {
    readStatus: async () => status(),
    invoke: async (command) => ({
      requestId: command.requestId,
      attachmentId: command.attachmentId,
      bindingDigest: initial.binding.digest,
      outcome: "accepted",
      output: { command: command.command },
    }),
    close: async () => {
      state = "stopped";
      const stopped = status();
      resolveTerminal(stopped);
      return stopped;
    },
    waitForTerminal: async () => terminal,
  };
}

describe("Terminal bootloader handoff host", () => {
  it("loads the materialized generation launcher once and covers Electron-shaped attachments and progress callbacks", async () => {
    const root = mkdtempSync(join(tmpdir(), "terminal-bootloader-handoff-")); roots.push(root);
    const launcherPath = join(root, "launcher.mjs");
    copyFileSync(join(repoRoot, "packages/standalone/dist/index.mjs"), launcherPath);
    const launcherDigest = sha256Hex(readFileSync(launcherPath));
    const binding = createStandaloneGenerationBinding(generation(launcherPath, launcherDigest), { channel: "somechan", namespace: "shared" });
    const starts = vi.fn(async (initial: StandaloneHandoffRequest) => runtime(initial));
    const imports = vi.fn(async (selected): Promise<StandaloneGenerationHandoff> => {
      expect(selected.launcher.path).toBe(launcherPath);
      expect(sha256Hex(readFileSync(selected.launcher.path))).toBe(selected.launcher.blobSha256);
      const module = await import(pathToFileURL(selected.launcher.path).href) as typeof import("@open-design/standalone");
      return module.createStandaloneGenerationBootloader(starts);
    });
    const host = new FossilHandoffHost(imports);
    const progress: string[] = [];
    const request = (id: string, type: "terminal" | "electron", version: string): StandaloneHandoffRequest => ({
      binding,
      attachment: { id, shell: { ...shell, type, version } },
      capabilities: {
        invoke: async (value) => {
          progress.push(`${value.attachmentId}:${value.capability}`);
          return { requestId: value.requestId, attachmentId: value.attachmentId, bindingDigest: value.bindingDigest, outcome: "accepted", output: { completed: 1, total: 1 } };
        },
      },
    });
    const terminal = await host.handoff(request("terminal", "terminal", "0.1.0"));
    const electron = await host.handoff(request("electron", "electron", "1.0.0"));
    expect(imports).toHaveBeenCalledTimes(1);
    expect(starts).toHaveBeenCalledTimes(1);
    const bodyRequest = starts.mock.calls[0]![0];
    await expect(bodyRequest.capabilities.invoke({
      requestId: "progress",
      attachmentId: "electron",
      bindingDigest: binding.digest,
      capability: "cold-start.progress",
    })).resolves.toMatchObject({ outcome: "accepted", output: { completed: 1, total: 1 } });
    expect(progress).toEqual(["electron:cold-start.progress"]);
    await expect(terminal.close()).resolves.toMatchObject({ state: "stopped", references: 1 });
    await expect(electron.close()).resolves.toMatchObject({ state: "stopped", references: 0 });
  });
});
