import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { createElectronFixtureStandaloneAuthorityFactory } from "@/fixtures/authority.js";

const manifest = {
  schemaVersion: 1 as const,
  appId: "io.nexu.electron-test",
  productName: "Electron Test",
  publisher: "Open Design",
  executableName: "electron-test",
  version: "0.1.0",
  channel: "dev",
  namespace: "electron-test",
  protocol: "od-test",
  window: { width: 800, height: 600, title: "Electron Test" },
  shell: { type: "electron", version: "0.1.0", buildHash: "a".repeat(64), digest: "b".repeat(64) },
};

describe("Electron Standalone authority boundary", () => {
  it("contains fixture lifecycle behind one exact runtime handle", async () => {
    const observeFeedback = vi.fn();
    const authority = createElectronFixtureStandaloneAuthorityFactory(manifest, { sidecarRelativePath: "sidecar.cjs" })({
      runtimeRoot: fileURLToPath(new URL("../../.tmp/authority", import.meta.url)),
      resourceRoot: fileURLToPath(new URL("../../dist/fixtures/lifecycle", import.meta.url)),
      officialNodeExecutablePath: process.execPath,
      observeFeedback,
    });
    const prepared = await authority.prepare({
      correlationId: "authority-test",
      releaseVersion: manifest.version,
      scope: { channel: manifest.channel, namespace: `authority-${process.pid}` },
      shell: manifest.shell,
    });
    const handle = await prepared.start({
      attachment: { id: "electron-authority-test", shell: manifest.shell },
      capabilities: {
        async invoke(request) {
          return { ...request, outcome: "unsupported", error: { code: "test-unavailable" } };
        },
      },
    });
    await expect(handle.readStatus()).resolves.toMatchObject({
      bindingDigest: prepared.binding.digest,
      generationId: prepared.generation.id,
      references: 1,
      state: "running",
    });
    await expect(handle.invoke({
      requestId: "command-1",
      attachmentId: "electron-authority-test",
      bindingDigest: prepared.binding.digest,
      command: "unknown",
    })).resolves.toMatchObject({ outcome: "unsupported", error: { code: "fixture-command-unavailable" } });
    await expect(handle.close()).resolves.toMatchObject({ references: 0, state: "stopped" });
    await expect(handle.close()).resolves.toMatchObject({ references: 0, state: "stopped" });
    expect(observeFeedback).toHaveBeenCalledWith(expect.objectContaining({
      operationId: "authority-test",
      phase: "generation-prepared",
    }));
  });
});
