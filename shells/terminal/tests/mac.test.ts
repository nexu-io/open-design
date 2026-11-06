import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupFixtures, expectedShellBuildHash, prepareExactFixture, run, terminalRoot, verifyExactLifecycle, writeDistributionRequest, writeSceneRequest, type TerminalOptions } from "./helpers.js";

afterEach(cleanupFixtures);

describe("Terminal macOS carrier", () => {
  it.skipIf(process.platform !== "darwin" || !new Set(["arm64", "x64"]).has(process.arch))(
    "runs sh scene, tar distribution, lifecycle, update, install, and tamper rejection",
    () => {
      const target = `darwin-${process.arch}`;
      const fixture = prepareExactFixture(target);
      if (fixture == null) {
        throw new Error(`locked Node archive for ${target} is required to run the native macOS E2E test`);
      }
      const { archive, closureFile, directories, lock, locked, releases, standaloneDirectory, sidecarDirectory, platformDirectory, work } = fixture;
      const scene = join(work, "scene");
      const sceneRequest = join(work, "scene-request.json");
      const sceneReceipt = join(work, "scene-receipt.json");
      writeSceneRequest(sceneRequest, { target, shellVersion: readFileSync(join(terminalRoot, "version"), "utf8").trim(), nodeVersion: lock.version, nodeArchive: archive, nodeArchiveSha256: locked.sha256, closureFile, standaloneDirectory, sidecarDirectory, platformDirectory, sceneDirectory: scene });
      run("sh", [join(terminalRoot, "sh/scene.sh"), "--request", sceneRequest, "--receipt", sceneReceipt]);
      const sceneSha = JSON.parse(readFileSync(sceneReceipt, "utf8")).sceneManifestSha256 as string;
      expect(JSON.parse(readFileSync(join(scene, "scene.json"), "utf8"))).toMatchObject({ shellBuildHash: expectedShellBuildHash(scene, target, locked.sha256) });
      const distributionRequest = join(work, "distribution-request.json");
      writeDistributionRequest(distributionRequest, { target, sceneDirectory: scene, sceneManifestSha256: sceneSha, releaseDocumentsDirectory: directories.documents, trustFile: releases.trustFile, release: { ...releases.beta1.release, releaseVersion: "0.1.0-somechan.2" }, outputDirectory: directories.output });
      const mismatched = run("sh", [join(terminalRoot, "sh/distribution.sh"), "--request", distributionRequest, "--receipt", join(work, "mismatched-distribution-receipt.json")], { allowFailure: true });
      expect(mismatched.status).not.toBe(0);
      writeDistributionRequest(distributionRequest, { target, sceneDirectory: scene, sceneManifestSha256: sceneSha, releaseDocumentsDirectory: directories.documents, trustFile: releases.trustFile, release: releases.beta1.release, outputDirectory: directories.output });
      const distributionReceipt = join(work, "distribution-receipt.json");
      run("sh", [join(terminalRoot, "sh/distribution.sh"), "--request", distributionRequest, "--receipt", distributionReceipt]);
      const distribution = join(directories.output, `nexu-terminal-${target}-0.1.0-somechan.1.tar.gz`);
      expect(JSON.parse(readFileSync(distributionReceipt, "utf8"))).toMatchObject({ operation: "terminal.distribution.build", target, archive: { file: distribution } });
      run("tar", ["-xzf", distribution, "-C", directories.unpacked]);
      const root = join(directories.unpacked, "nexu-terminal");
      const terminal = (installRoot: string, storeRoot: string, channel: string, namespace: string, operation: string, options: TerminalOptions = {}) => {
        const result = run("sh", [join(installRoot, "sh/terminal.sh"), "--root", installRoot, "--store-root", storeRoot, "--channel", channel, "--namespace", namespace, "--operation", operation,
          ...(options.attachmentId == null ? [] : ["--attachment-id", options.attachmentId]),
          ...(options.attachmentCapability == null ? [] : ["--attachment-capability", options.attachmentCapability]),
          ...(options.channelHeadUrl == null ? [] : ["--channel-head-url", options.channelHeadUrl]),
          ...(options.activationPolicy == null ? [] : ["--activation-policy", options.activationPolicy]),
          ...(options.feedbackFile == null ? [] : ["--feedback", options.feedbackFile])]);
        return JSON.parse(result.stdout) as Record<string, any>;
      };
      const rejected = run("sh", [join(root, "sh/terminal.sh"), "--root", root, "--store-root", directories.store, "--channel", "somechan", "--namespace", "shared", "--operation", "heartbeat", "--attachment-id", "missing"], { allowFailure: true });
      expect(rejected.status).not.toBe(0);
      expect(JSON.parse(rejected.stdout)).toMatchObject({ outcome: "rejected", operation: "heartbeat", error: { code: "operation-failed" } });
      verifyExactLifecycle(root, directories.store, terminal, releases);

      const installed = join(work, "installed");
      run("sh", [join(root, "sh/install.sh"), "--root", installed, "--channel", "somechan", "--namespace", "installed"]);
      const before = terminal(installed, join(work, "installed-store"), "somechan", "installed", "probe");
      writeFileSync(join(installed, "runtime/fossil.mjs"), `${readFileSync(join(installed, "runtime/fossil.mjs"), "utf8")}\n`);
      const tampered = run("sh", [join(installed, "sh/terminal.sh"), "--root", installed, "--channel", "somechan", "--namespace", "installed", "--operation", "probe"], { allowFailure: true });
      expect(tampered.status).not.toBe(0);
      expect(before.shell.digest).toMatch(/^[a-f0-9]{64}$/);
    },
  );
});
