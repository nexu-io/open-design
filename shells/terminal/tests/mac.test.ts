import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupFixtures, expectedShellBuildHash, prepareExactFixture, run, terminalRoot, verifyExactLifecycle, writeDistributionRequest, writeSceneRequest, type TerminalOptions } from "./helpers.js";

afterEach(cleanupFixtures);

describe("Terminal macOS carrier", () => {
  it.skipIf(process.platform !== "darwin" || !new Set(["arm64", "x64"]).has(process.arch))(
    "runs sh scene, tar distribution, lifecycle, update, install, and tamper rejection",
    async () => {
      const target = process.arch === "arm64" ? "darwin-arm64" : "darwin-x64";
      const fixture = await prepareExactFixture(target);
      if (fixture == null) {
        throw new Error(`locked Node archive for ${target} is required to run the native macOS E2E test`);
      }
      const { nodePlatform, closureFile, launcherFile, directories, lock, locked, releases, standaloneDirectory, sidecarDirectory, platformDirectory, work } = fixture;
      const scene = join(work, "scene");
      const sceneRequest = join(work, "scene-request.json");
      const sceneReceipt = join(work, "scene-receipt.json");
      writeSceneRequest(sceneRequest, { target, shellVersion: readFileSync(join(terminalRoot, "version"), "utf8").trim(), nodeVersion: lock.version, nodePlatform, nodeArchiveSha256: locked.sha256, closureFile, launcherFile, standaloneDirectory, sidecarDirectory, platformDirectory, sceneDirectory: scene });
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
      const contribution = JSON.parse(readFileSync(join(directories.output, "shell-contribution.json"), "utf8"));
      expect(contribution).toMatchObject({ operation: "shell.distribution.contribute", shell: { type: "terminal", buildHash: expectedShellBuildHash(scene, target, locked.sha256) }, target, artifact: { file: distribution } });
      expect(contribution).not.toHaveProperty("updater");
      run("tar", ["-xzf", distribution, "-C", directories.unpacked]);
      const root = join(directories.unpacked, "nexu-terminal");
      const physicalRoot = join(root, "carrier/node");
      expect(existsSync(join(physicalRoot, "lib/node_modules/npm"))).toBe(false);
      expect(existsSync(join(physicalRoot, "node_modules/npm"))).toBe(false);
      const native = JSON.parse(run(join(physicalRoot, "bin/node"), [join(physicalRoot, "platform-check.cjs")]).stdout);
      expect(native).toMatchObject({ node: lock.version, sqlite: 42, pty: "shell-native-ready" });
      expect(native.nativePaths.length).toBeGreaterThanOrEqual(2);
      for (const path of native.nativePaths) expect(path.startsWith(realpathSync(physicalRoot) + "/")).toBe(true);
      // Corruption must fail before any shared Store state is created. Restore the
      // actual addon before exercising the ordinary lifecycle on this installation.
      const addon = native.nativePaths[0] as string;
      const addonBytes = readFileSync(addon);
      const untouchedStore = join(work, "damaged-platform-store");
      try {
        writeFileSync(addon, "corrupt native addon");
        const rejected = run("sh", [join(root, "sh/terminal.sh"), "--root", root,
          "--store-root", untouchedStore, "--channel", "somechan", "--namespace", "physical-damage",
          "--operation", "start", "--attachment-id", "physical-damage"], { allowFailure: true });
        expect(rejected.status).not.toBe(0);
        expect(JSON.parse(rejected.stdout)).toMatchObject({ outcome: "rejected",
          error: { message: expect.stringContaining("physical Node platform is unavailable") } });
        expect(existsSync(untouchedStore)).toBe(false);
      } finally { writeFileSync(addon, addonBytes); }
      expect(existsSync(join(root, "runtime/fixture-lifecycle.mjs"))).toBe(false);
      expect(existsSync(join(root, "runtime/fixture-shell-updater.mjs"))).toBe(false);
      expect(JSON.parse(readFileSync(join(root, "install-manifest.json"), "utf8"))).not.toHaveProperty("fixtureLifecycle");
      expect(JSON.parse(readFileSync(join(root, "install-manifest.json"), "utf8"))).not.toHaveProperty("fixtureShellUpdater");
      expect(JSON.parse(readFileSync(join(root, "install-manifest.json"), "utf8"))).toMatchObject({ capabilities: { shellUpdater: "unavailable" } });
      const terminal = (installRoot: string, storeRoot: string, channel: string, namespace: string, operation: string, options: TerminalOptions = {}) => {
        const result = run("sh", [join(installRoot, "sh/terminal.sh"), "--root", installRoot, "--store-root", storeRoot,
          "--namespace-root", join(storeRoot, "explicit-scopes", channel, namespace), "--channel", channel, "--namespace", namespace, "--operation", operation,
          ...(options.attachmentId == null ? [] : ["--attachment-id", options.attachmentId]),
          ...(options.attachmentCapability == null ? [] : ["--attachment-capability", options.attachmentCapability]),
          ...(options.channelHeadUrl == null ? [] : ["--channel-head-url", options.channelHeadUrl]),
          ...(options.activationPolicy == null ? [] : ["--activation-policy", options.activationPolicy]),
          ...(options.feedbackFile == null ? [] : ["--feedback", options.feedbackFile])]);
        return JSON.parse(result.stdout) as Record<string, any>;
      };
      const rejected = run("sh", [join(root, "sh/terminal.sh"), "--root", root, "--store-root", directories.store,
        "--namespace-root", join(directories.store, "explicit-scopes", "somechan", "shared"),
        "--channel", "somechan", "--namespace", "shared", "--operation", "heartbeat", "--attachment-id", "missing"], { allowFailure: true });
      expect(rejected.status).not.toBe(0);
      expect(JSON.parse(rejected.stdout)).toMatchObject({ outcome: "rejected", operation: "heartbeat", error: { code: "operation-failed" } });
      const conflicting = run("sh", [join(root, "sh/terminal.sh"), "--root", root, "--store-root", directories.store,
        "--namespace-root", join(directories.store, "conflicting-scope"),
        "--channel", "somechan", "--namespace", "shared", "--operation", "status"], { allowFailure: true });
      expect(conflicting.status).not.toBe(0);
      expect(JSON.parse(conflicting.stdout)).toMatchObject({ outcome: "rejected", error: { message: expect.stringContaining("differs from its launch contract") } });
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
