import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FossilHandoffHost,
  createStandaloneGenerationBinding,
  resolveStandaloneGenerationHandoff,
  sha256Hex,
  type GenerationRecord,
  type StandaloneGenerationHandoff,
  type StandaloneHandoffRequest,
} from "@open-design/standalone";

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
    launcher: { protocol: "standalone-launcher-v1", resourceId: "standalone-launcher", blobSha256: digest, entrypoint: path, path },
    resources: {
      "standalone-launcher": {
        component: "standalone.launcher",
        blobSha256: digest,
        entrypoint: path,
        materialization: { type: "file", entrypoint: "launcher.mjs" },
        mediaType: "text/javascript",
        path,
        size: readFileSync(path).byteLength,
        sync: true,
      },
    },
  };
}

describe("Terminal bootloader handoff host", () => {
  it("loads one product-owned generation handoff for Terminal and Electron-shaped attachments", async () => {
    const root = mkdtempSync(join(tmpdir(), "terminal-bootloader-handoff-")); roots.push(root);
    const launcherPath = join(root, "launcher.mjs");
    copyFileSync(join(import.meta.dirname, "fixtures/standalone-launcher.mjs"), launcherPath);
    const launcherDigest = sha256Hex(readFileSync(launcherPath));
    const binding = createStandaloneGenerationBinding(generation(launcherPath, launcherDigest), { channel: "somechan", namespace: "shared" });
    const imports = vi.fn(async (selected): Promise<StandaloneGenerationHandoff> => {
      expect(selected.launcher.path).toBe(launcherPath);
      expect(sha256Hex(readFileSync(selected.launcher.path))).toBe(selected.launcher.blobSha256);
      const module = await import(pathToFileURL(selected.launcher.path).href) as Record<string, unknown>;
      return resolveStandaloneGenerationHandoff(module);
    });
    const host = new FossilHandoffHost(imports);
    const request = (id: string, type: "terminal" | "electron", version: string): StandaloneHandoffRequest => ({
      binding,
      attachment: { id, shell: { ...shell, type, version } },
      capabilities: {
        invoke: async (value) => ({ requestId: value.requestId, attachmentId: value.attachmentId, bindingDigest: value.bindingDigest, outcome: "unsupported" }),
      },
    });
    const terminal = await host.handoff(request("terminal", "terminal", "0.1.0"));
    const electron = await host.handoff(request("electron", "electron", "1.0.0"));
    expect(imports).toHaveBeenCalledTimes(1);
    await expect(terminal.close()).resolves.toMatchObject({ state: "stopped", references: 1 });
    await expect(electron.close()).resolves.toMatchObject({ state: "stopped", references: 0 });
  });
});
