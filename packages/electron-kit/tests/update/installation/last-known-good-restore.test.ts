import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  captureMacElectronLastKnownGood,
  identifyMacElectronLastKnownGoodTree,
  prepareMacElectronLastKnownGoodRestore,
  readMacElectronLastKnownGoodRestoreResult,
  scheduleMacElectronLastKnownGoodRestore,
} from "@/update/installation/index.js";

const shell = Object.freeze({ type: "electron", version: "0.1.0", buildHash: "a".repeat(64), digest: "b".repeat(64) });
const installIdentity = Object.freeze({ appId: "io.open-design.betahyx", executableName: "open-design-betahyx", namespace: "release-betahyx", productName: "Open Design Betahyx" });
const claim = Object.freeze({ bindingDigest: "c".repeat(64), generationId: "d".repeat(64), handoffDigest: "e".repeat(64), installAttemptId: "attempt-1", lifecycleFence: 3, revision: 7 });
const trust = Object.freeze({ schemaVersion: 1 as const, operation: "electron.macos-installer.trust" as const, mode: "verify-only" as const,
  container: { path: "/fixture/update.dmg", sha256: "f".repeat(64), size: 1, device: "1", inode: "2" },
  release: { channel: "betahyx", releaseVersion: "0.1.0-betahyx.1", shell, installIdentity, designatedRequirement: "identifier io.open-design.betahyx", teamIdentifier: "VERIFYONLY" },
  app: { provider: "verify-only" as const, appBundleName: "Open Design Betahyx.app", bundleId: installIdentity.appId, executableName: installIdentity.executableName, productName: installIdentity.productName, designatedRequirement: "identifier io.open-design.betahyx", teamIdentifier: "VERIFYONLY", codesignVerified: true, gatekeeperAssessed: false } });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "electron-macos-lkg-restore-"));
  const appPath = join(root, "Open Design Betahyx.app");
  await mkdir(join(appPath, "Contents", "MacOS"), { recursive: true });
  await writeFile(join(appPath, "Contents", "Info.plist"), "lkg-plist");
  await writeFile(join(appPath, "Contents", "MacOS", "open-design-betahyx"), "lkg-executable");
  const authorityRoot = join(root, "authority"), runtimeRoot = join(root, "runtime");
  const capture = await captureMacElectronLastKnownGood({ appPath, authorityRoot, shell, installIdentity });
  return { root, appPath, capture, runtimeRoot };
}

async function waitResult(preparation: Awaited<ReturnType<typeof prepareMacElectronLastKnownGoodRestore>>) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await readMacElectronLastKnownGoodRestoreResult(preparation);
    if (result != null) return result;
    await new Promise((done) => setTimeout(done, 25));
  }
  throw new Error("LKG restore helper did not produce a result");
}

describe("macOS Electron LKG detached restore", () => {
  it("retains the candidate, atomically restores the captured tree, and makes duplicate scheduling harmless", async () => {
    const value = await fixture();
    try {
      await writeFile(join(value.appPath, "Contents", "Info.plist"), "candidate-plist");
      const candidate = await identifyMacElectronLastKnownGoodTree(value.appPath);
      const preparation = await prepareMacElectronLastKnownGoodRestore({
        capture: value.capture,
        claim,
        trust,
        recoveryId: "restore-1",
        nodeExecutablePath: process.execPath,
        parentPid: 2_147_483_647,
        runtimeRoot: value.runtimeRoot,
        relaunchArguments: ["--od-installer-recovery-action=abandon-and-restore"],
        relaunch: false,
        mode: "verify-only",
      });
      const armed = await scheduleMacElectronLastKnownGoodRestore(preparation);
      expect(armed).toMatchObject({ state: "armed", recoveryId: "restore-1", claim });
      const result = await waitResult(preparation);
      if (result.state === "failed") throw new Error(`restore fixture failed: ${JSON.stringify(result.error)}`);
      expect(result).toMatchObject({ state: "restored", restoredAppPath: value.appPath });
      expect((await identifyMacElectronLastKnownGoodTree(value.appPath)).sha256).toBe(value.capture.source.sha256);
      expect((await identifyMacElectronLastKnownGoodTree(result.forensicAppPath!)).sha256).toBe(candidate.sha256);
      await scheduleMacElectronLastKnownGoodRestore(preparation);
      await new Promise((done) => setTimeout(done, 50));
      expect(await readMacElectronLastKnownGoodRestoreResult(preparation)).toEqual(result);
    } finally { await rm(value.root, { recursive: true, force: true }); }
  });

  it("refuses to schedule a modified helper", async () => {
    const value = await fixture();
    try {
      const preparation = await prepareMacElectronLastKnownGoodRestore({ capture: value.capture, claim, trust, recoveryId: "restore-tamper", nodeExecutablePath: process.execPath, parentPid: 2_147_483_647, runtimeRoot: value.runtimeRoot, relaunchArguments: [], relaunch: false, mode: "verify-only" });
      await chmod(preparation.helperPath, 0o700);
      await writeFile(preparation.helperPath, "tampered helper");
      await expect(scheduleMacElectronLastKnownGoodRestore(preparation)).rejects.toThrow("helper preparation changed");
      expect(await readFile(preparation.inputPath, "utf8")).toContain("restore-tamper");
    } finally { await rm(value.root, { recursive: true, force: true }); }
  });

  it("rejects malformed and symlink-substituted durable results", async () => {
    const value = await fixture();
    try {
      const malformed = await prepareMacElectronLastKnownGoodRestore({ capture: value.capture, claim, trust, recoveryId: "restore-result-fields", nodeExecutablePath: process.execPath, parentPid: 2_147_483_647, runtimeRoot: value.runtimeRoot, relaunchArguments: [], relaunch: false, mode: "verify-only" });
      await writeFile(malformed.resultPath, JSON.stringify({ schemaVersion: 1, operation: "electron.macos-lkg.restore.result", recoveryId: malformed.recoveryId, claim, state: "restored", restoredAppPath: "/another/App.app" }));
      await expect(readMacElectronLastKnownGoodRestoreResult(malformed)).rejects.toThrow("result fields are invalid");

      const substituted = await prepareMacElectronLastKnownGoodRestore({ capture: value.capture, claim, trust, recoveryId: "restore-result-symlink", nodeExecutablePath: process.execPath, parentPid: 2_147_483_647, runtimeRoot: value.runtimeRoot, relaunchArguments: [], relaunch: false, mode: "verify-only" });
      await symlink(malformed.resultPath, substituted.resultPath);
      await expect(readMacElectronLastKnownGoodRestoreResult(substituted)).rejects.toThrow();
    } finally { await rm(value.root, { recursive: true, force: true }); }
  });

  it("fails before touching the candidate when the captured backup changes", async () => {
    const value = await fixture();
    try {
      await writeFile(join(value.appPath, "Contents", "Info.plist"), "candidate-plist");
      const candidate = await identifyMacElectronLastKnownGoodTree(value.appPath);
      const preparation = await prepareMacElectronLastKnownGoodRestore({ capture: value.capture, claim, trust, recoveryId: "restore-backup-tamper", nodeExecutablePath: process.execPath, parentPid: 2_147_483_647, runtimeRoot: value.runtimeRoot, relaunchArguments: [], relaunch: false, mode: "verify-only" });
      await writeFile(join(value.capture.backup.path, "Contents", "Info.plist"), "tampered-backup");
      await scheduleMacElectronLastKnownGoodRestore(preparation);
      const result = await waitResult(preparation);
      expect(result).toMatchObject({ state: "failed", error: { code: "backup-mismatch" } });
      expect((await identifyMacElectronLastKnownGoodTree(value.appPath)).sha256).toBe(candidate.sha256);
    } finally { await rm(value.root, { recursive: true, force: true }); }
  });
});
