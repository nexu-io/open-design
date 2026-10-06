import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupFixtures, expectedShellBuildHash, powershell, prepareExactFixture, run, terminalRoot, verifyExactLifecycle, writeDistributionRequest, writeSceneRequest, type TerminalOptions } from "./helpers.js";

afterEach(cleanupFixtures);

describe("Terminal Windows carrier", () => {
  it.skipIf(process.platform !== "win32" || process.arch !== "x64")(
    "runs PowerShell scene, zip distribution, lifecycle, update, install, and tamper rejection",
    () => {
      const target = "win32-x64";
      const fixture = prepareExactFixture(target);
      if (fixture == null) {
        throw new Error(`locked Node archive for ${target} is required to run the native Windows E2E test`);
      }
      const { archive, closureFile, directories, lock, locked, releases, standaloneDirectory, sidecarDirectory, platformDirectory, work } = fixture;
      const scene = join(work, "scene");
      const sceneRequest = join(work, "scene-request.json");
      const sceneReceipt = join(work, "scene-receipt.json");
      writeSceneRequest(sceneRequest, { target, shellVersion: readFileSync(join(terminalRoot, "version"), "utf8").trim(), nodeVersion: lock.version, nodeArchive: archive, nodeArchiveSha256: locked.sha256, closureFile, standaloneDirectory, sidecarDirectory, platformDirectory, sceneDirectory: scene });
      powershell(join(terminalRoot, "ps1/scene.ps1"), ["-Request", sceneRequest, "-Receipt", sceneReceipt]);
      const sceneSha = JSON.parse(readFileSync(sceneReceipt, "utf8")).sceneManifestSha256 as string;
      expect(JSON.parse(readFileSync(join(scene, "scene.json"), "utf8"))).toMatchObject({ shellBuildHash: expectedShellBuildHash(scene, target, locked.sha256) });
      const distributionRequest = join(work, "distribution-request.json");
      writeDistributionRequest(distributionRequest, { target, sceneDirectory: scene, sceneManifestSha256: sceneSha, releaseDocumentsDirectory: directories.documents, trustFile: releases.trustFile, release: { ...releases.beta1.release, releaseVersion: "0.1.0-somechan.2" }, outputDirectory: directories.output });
      const mismatched = powershell(join(terminalRoot, "ps1/distribution.ps1"), ["-Request", distributionRequest, "-Receipt", join(work, "mismatched-distribution-receipt.json")], { allowFailure: true });
      expect(mismatched.status).not.toBe(0);
      writeDistributionRequest(distributionRequest, { target, sceneDirectory: scene, sceneManifestSha256: sceneSha, releaseDocumentsDirectory: directories.documents, trustFile: releases.trustFile, release: releases.beta1.release, outputDirectory: directories.output });
      const distributionReceipt = join(work, "distribution-receipt.json");
      powershell(join(terminalRoot, "ps1/distribution.ps1"), ["-Request", distributionRequest, "-Receipt", distributionReceipt]);
      const distribution = join(directories.output, `nexu-terminal-${target}-0.1.0-somechan.1.zip`);
      expect(JSON.parse(readFileSync(distributionReceipt, "utf8"))).toMatchObject({ operation: "terminal.distribution.build", target, archive: { file: distribution } });
      run("powershell.exe", ["-NoProfile", "-Command", "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1]", distribution, directories.unpacked]);
      const root = join(directories.unpacked, "nexu-terminal");
      const terminal = (installRoot: string, storeRoot: string, channel: string, namespace: string, operation: string, options: TerminalOptions = {}) => {
        const result = powershell(join(installRoot, "ps1/terminal.ps1"), ["-Root", installRoot, "-StoreRoot", storeRoot, "-Channel", channel, "-Namespace", namespace, "-Operation", operation,
          ...(options.attachmentId == null ? [] : ["-AttachmentId", options.attachmentId]),
          ...(options.attachmentCapability == null ? [] : ["-AttachmentCapability", options.attachmentCapability]),
          ...(options.channelHeadUrl == null ? [] : ["-ChannelHeadUrl", options.channelHeadUrl]),
          ...(options.activationPolicy == null ? [] : ["-ActivationPolicy", options.activationPolicy]),
          ...(options.feedbackFile == null ? [] : ["-Feedback", options.feedbackFile])]);
        return JSON.parse(result.stdout) as Record<string, any>;
      };
      const rejected = powershell(join(root, "ps1/terminal.ps1"), ["-Root", root, "-StoreRoot", directories.store, "-Channel", "somechan", "-Namespace", "shared", "-Operation", "heartbeat", "-AttachmentId", "missing"], { allowFailure: true });
      expect(rejected.status).not.toBe(0);
      expect(JSON.parse(rejected.stdout)).toMatchObject({ outcome: "rejected", operation: "heartbeat", error: { code: "operation-failed" } });
      verifyExactLifecycle(root, directories.store, terminal, releases);

      const installed = join(work, "installed");
      powershell(join(root, "ps1/install.ps1"), ["-Root", installed, "-Channel", "somechan", "-Namespace", "installed"]);
      const before = terminal(installed, join(work, "installed-store"), "somechan", "installed", "probe");
      writeFileSync(join(installed, "runtime/fossil.mjs"), `${readFileSync(join(installed, "runtime/fossil.mjs"), "utf8")}\n`);
      const tampered = powershell(join(installed, "ps1/terminal.ps1"), ["-Root", installed, "-Channel", "somechan", "-Namespace", "installed", "-Operation", "probe"], { allowFailure: true });
      expect(tampered.status).not.toBe(0);
      expect(before.shell.digest).toMatch(/^[a-f0-9]{64}$/);
    },
  );
});
