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
    const install = vi.fn(async (request) => ({
      schemaVersion: 1 as const,
      state: "armed" as const,
      installAttemptId: request.installAttemptId,
      artifactPath: request.handoff.artifact.path,
      artifactSha256: request.handoff.artifact.sha256,
      helperPath: "/tmp/installer-helper.mjs",
      resultPath: "/tmp/installer-result.json",
      mode: "verify-only" as const,
      parentPid: request.parentPid,
    }));
    const installation = {
      handoff: {
        interaction: "restart-and-install" as const,
        releaseVersion: "0.1.1",
        target: "darwin-arm64",
        artifact: {
          path: "/tmp/electron-installer.dmg",
          sha256: "d".repeat(64),
          size: 42,
          mediaType: "application/x-apple-diskimage",
        },
        shell: { type: "electron", version: "0.1.1", buildHash: "e".repeat(64) },
      },
      installAttemptId: "install-1",
      nodeExecutablePath: process.execPath,
      parentPid: process.pid,
      runtimeRoot: "/tmp/electron-runtime",
      mode: "verify-only" as const,
    };
    await expect(prepared.armShellInstallation({ install, request: installation }))
      .resolves.toMatchObject({ state: "armed", installAttemptId: "install-1" });
    expect(install).toHaveBeenCalledWith(installation);
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
