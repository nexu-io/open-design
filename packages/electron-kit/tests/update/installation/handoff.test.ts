import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { scheduleElectronInstallerHandoff, stageElectronInstallerArtifact } from "@/update/installation/index.js";

describe("Electron installer after-quit handoff", () => {
  it("re-verifies the artifact and lets a detached helper observe parent exit", async () => {
    const root = await mkdtemp(join(tmpdir(), "electron-installer-"));
    const artifactPath = join(root, "fixture.dmg");
    const artifact = Buffer.from("verified fixture installer");
    await writeFile(artifactPath, artifact);
    try {
      const digest = createHash("sha256").update(artifact).digest("hex");
      const staged = await stageElectronInstallerArtifact({
        artifact: { path: artifactPath, sha256: digest, size: artifact.byteLength, mediaType: "application/x-apple-diskimage" },
        authorityRoot: join(root, "authority"),
      });
      const receipt = await scheduleElectronInstallerHandoff({
        installAttemptId: "0198f07a-104f-7750-b9ab-4659e48ac69b",
        handoff: {
          interaction: "restart-and-install",
          releaseVersion: "0.2.0",
          target: "darwin-arm64",
          artifact: {
            path: staged.artifact.path,
            sha256: digest,
            size: artifact.byteLength,
            mediaType: "application/x-apple-diskimage",
            device: staged.artifact.device,
            inode: staged.artifact.inode,
          },
          shell: { type: "electron", version: "0.2.0", buildHash: "a".repeat(64) },
        },
        artifactIdentity: staged.artifact,
        platformTrust: {
          schemaVersion: 1,
          operation: "electron.macos-installer.trust",
          mode: "verify-only",
          container: staged.artifact,
          release: {
            channel: "betahyx",
            releaseVersion: "0.2.0",
            shell: { type: "electron", version: "0.2.0", buildHash: "a".repeat(64) },
            installIdentity: { appId: "io.open-design.test", executableName: "test", namespace: "test", productName: "Test" },
            designatedRequirement: 'identifier "io.open-design.test"',
            teamIdentifier: "adhoc",
          },
          app: { provider: "verify-only", appBundleName: "test.app", bundleId: "io.open-design.test", executableName: "test", productName: "Test", designatedRequirement: 'identifier "io.open-design.test"', teamIdentifier: "adhoc", codesignVerified: true, gatekeeperAssessed: false },
        },
        mode: "verify-only",
        nodeExecutablePath: process.execPath,
        parentPid: 2_147_483_647,
        runtimeRoot: root,
        timeoutMs: 1_000,
      });
      expect(receipt.installAttemptId).toBe("0198f07a-104f-7750-b9ab-4659e48ac69b");
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const result = await readFile(receipt.resultPath, "utf8").catch(() => null);
        if (result != null) {
          expect(JSON.parse(result)).toMatchObject({ state: "verified", artifactPath: staged.artifact.path, installAttemptId: receipt.installAttemptId });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error("installer helper did not produce a result");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
