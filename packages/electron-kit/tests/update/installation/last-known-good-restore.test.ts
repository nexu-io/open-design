import { execFile, fork } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

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
  const helpers: number[] = [];
  const appPath = join(root, "Open Design Betahyx.app");
  await mkdir(join(appPath, "Contents", "MacOS"), { recursive: true });
  await writeFile(join(appPath, "Contents", "Info.plist"), "lkg-plist");
  await writeFile(join(appPath, "Contents", "MacOS", "open-design-betahyx"), "lkg-executable");
  const authorityRoot = join(root, "authority"), runtimeRoot = join(root, "runtime");
  const capture = await captureMacElectronLastKnownGood({ appPath, authorityRoot, shell, installIdentity });
  return { root, appPath, capture, runtimeRoot,
    async schedule(preparation: Awaited<ReturnType<typeof prepareMacElectronLastKnownGoodRestore>>) {
      const armed = await scheduleMacElectronLastKnownGoodRestore(preparation);
      helpers.push(armed.helperPid);
      return armed;
    },
    async dispose() {
      // A durable result precedes helper exit. Reap every scheduled helper before
      // deleting its working directory, including duplicate no-op invocations.
      await Promise.all(helpers.map(waitHelperExit));
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function waitHelperExit(pid: number) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try { process.kill(pid, 0); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return; throw error; }
    await new Promise(done => setTimeout(done, 25));
  }
  throw new Error(`LKG fixture helper ${pid} did not exit`);
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
  it("publishes only a complete durable result while a reader observes the write", async () => {
    const value = await fixture();
    try {
      const preparation = await prepareMacElectronLastKnownGoodRestore({ capture: value.capture, claim, trust, recoveryId: "restore-publication", nodeExecutablePath: process.execPath, parentPid: 2_147_483_647, runtimeRoot: value.runtimeRoot, relaunchArguments: [], relaunch: false, mode: "verify-only" });
      const hookPath = join(value.root, "pause-result-write.cjs");
      // Pause the actual detached helper after creating its output, before writing
      // bytes. This exposes the reader/writer interleaving without timing retries.
      await writeFile(hookPath, `const fs = require("node:fs/promises");
const original = fs.writeFile;
fs.writeFile = async (path, data, options) => {
  const resultPath = ${JSON.stringify(preparation.resultPath)};
  if (path !== resultPath && !String(path).startsWith(resultPath + ".")) return original(path, data, options);
  const handle = await fs.open(path, options.flag, options.mode);
  try {
    const released = new Promise(resolve => process.once("message", resolve));
    process.send({ event: "result-opened" });
    await released;
    await handle.writeFile(data, options);
  } finally { await handle.close(); process.disconnect(); }
};
`);
      const child = fork(preparation.helperPath, [preparation.inputPath], { execArgv: ["--require", hookPath], silent: true });
      const exited = once(child, "exit");
      try {
        const [message] = await once(child, "message", { signal: AbortSignal.timeout(5_000) });
        expect(message).toEqual({ event: "result-opened" });
        await expect(readMacElectronLastKnownGoodRestoreResult(preparation)).resolves.toBeNull();
        child.send("release");
        expect(await exited).toEqual([0, null]);
        expect(await readMacElectronLastKnownGoodRestoreResult(preparation)).toMatchObject({ state: "restored", restoredAppPath: value.appPath });
      } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill();
        await exited;
      }
    } finally { await value.dispose(); }
  });

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
      const armed = await value.schedule(preparation);
      expect(armed).toMatchObject({ state: "armed", recoveryId: "restore-1", claim });
      const result = await waitResult(preparation);
      if (result.state === "failed") throw new Error(`restore fixture failed: ${JSON.stringify(result.error)}`);
      expect(result).toMatchObject({ state: "restored", restoredAppPath: value.appPath });
      expect((await identifyMacElectronLastKnownGoodTree(value.appPath)).sha256).toBe(value.capture.source.sha256);
      expect((await identifyMacElectronLastKnownGoodTree(result.forensicAppPath!)).sha256).toBe(candidate.sha256);
      const duplicate = await value.schedule(preparation);
      await waitHelperExit(duplicate.helperPid);
      expect(await readMacElectronLastKnownGoodRestoreResult(preparation)).toEqual(result);
    } finally { await value.dispose(); }
  });

  it("never overwrites a previously published result", async () => {
    const value = await fixture();
    try {
      const preparation = await prepareMacElectronLastKnownGoodRestore({ capture: value.capture, claim, trust, recoveryId: "restore-existing-result", nodeExecutablePath: process.execPath, parentPid: 2_147_483_647, runtimeRoot: value.runtimeRoot, relaunchArguments: [], relaunch: false, mode: "verify-only" });
      const existing = { schemaVersion: 1, operation: "electron.macos-lkg.restore.result", recoveryId: preparation.recoveryId, claim, state: "failed", error: { code: "prior-failure", message: "Preserve first published result" } };
      await writeFile(preparation.resultPath, JSON.stringify(existing), { flag: "wx" });
      await expect(promisify(execFile)(process.execPath, [preparation.helperPath, preparation.inputPath])).rejects.toMatchObject({ code: 1 });
      expect(await readMacElectronLastKnownGoodRestoreResult(preparation)).toEqual(existing);
    } finally { await value.dispose(); }
  });

  it("refuses to schedule a modified helper", async () => {
    const value = await fixture();
    try {
      const preparation = await prepareMacElectronLastKnownGoodRestore({ capture: value.capture, claim, trust, recoveryId: "restore-tamper", nodeExecutablePath: process.execPath, parentPid: 2_147_483_647, runtimeRoot: value.runtimeRoot, relaunchArguments: [], relaunch: false, mode: "verify-only" });
      await chmod(preparation.helperPath, 0o700);
      await writeFile(preparation.helperPath, "tampered helper");
      await expect(scheduleMacElectronLastKnownGoodRestore(preparation)).rejects.toThrow("helper preparation changed");
      expect(await readFile(preparation.inputPath, "utf8")).toContain("restore-tamper");
    } finally { await value.dispose(); }
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
    } finally { await value.dispose(); }
  });

  it("fails before touching the candidate when the captured backup changes", async () => {
    const value = await fixture();
    try {
      await writeFile(join(value.appPath, "Contents", "Info.plist"), "candidate-plist");
      const candidate = await identifyMacElectronLastKnownGoodTree(value.appPath);
      const preparation = await prepareMacElectronLastKnownGoodRestore({ capture: value.capture, claim, trust, recoveryId: "restore-backup-tamper", nodeExecutablePath: process.execPath, parentPid: 2_147_483_647, runtimeRoot: value.runtimeRoot, relaunchArguments: [], relaunch: false, mode: "verify-only" });
      await writeFile(join(value.capture.backup.path, "Contents", "Info.plist"), "tampered-backup");
      await value.schedule(preparation);
      const result = await waitResult(preparation);
      expect(result).toMatchObject({ state: "failed", error: { code: "backup-mismatch" } });
      expect((await identifyMacElectronLastKnownGoodTree(value.appPath)).sha256).toBe(candidate.sha256);
    } finally { await value.dispose(); }
  });
});
