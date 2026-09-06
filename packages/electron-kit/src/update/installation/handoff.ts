import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ElectronInstallerHandoffReceipt, ElectronInstallerHandoffRequest } from "./contracts.js";
import { verifyElectronInstallerArtifact } from "./artifact.js";
import { verifyElectronInstallerArtifactForExecution } from "./platform-trust.js";

const helperSource = String.raw`const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const { constants } = require("node:fs");
const { open, writeFile, unlink } = require("node:fs/promises");
const input = JSON.parse(Buffer.from(process.argv[2], "base64url").toString("utf8"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const alive = () => { try { process.kill(input.parentPid, 0); return true; } catch (error) { if (error && error.code === "ESRCH") return false; throw error; } };
const verifyArtifact = async () => {
  const handle = await open(input.artifact.path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || (before.mode & 0o222n) !== 0n) throw new Error("staged installer artifact is not immutable");
    const digest = createHash("sha256");
    let size = 0;
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, null);
      if (bytesRead === 0) break;
      digest.update(buffer.subarray(0, bytesRead));
      size += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs
      || after.dev.toString() !== input.artifact.device || after.ino.toString() !== input.artifact.inode
      || size !== input.artifact.size || digest.digest("hex") !== input.artifact.sha256) throw new Error("staged installer artifact identity mismatch");
  } finally { await handle.close(); }
};
(async () => {
  const deadline = Date.now() + input.timeoutMs;
  while (alive()) { if (Date.now() >= deadline) throw new Error("installer handoff timed out waiting for Electron"); await sleep(100); }
  await verifyArtifact();
  if (input.mode === "execute") {
    const command = input.platform === "darwin" ? "/usr/bin/open" : input.artifact.path;
    const args = input.platform === "darwin" ? [input.artifact.path] : [];
    const child = spawn(command, args, { cwd: input.runtimeRoot, detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
  }
  await writeFile(input.resultPath, JSON.stringify({ schemaVersion: 1, state: input.mode === "execute" ? "launched" : "verified", installAttemptId: input.installAttemptId, artifactPath: input.artifact.path, artifactDevice: input.artifact.device, artifactInode: input.artifact.inode, parentPid: input.parentPid }) + "\n", "utf8");
})().catch(async (error) => {
  await writeFile(input.resultPath, JSON.stringify({ schemaVersion: 1, state: "failed", message: error instanceof Error ? error.message : String(error) }) + "\n", "utf8").catch(() => undefined);
  process.exitCode = 1;
}).finally(async () => { await unlink(__filename).catch(() => undefined); });
`;

export async function scheduleElectronInstallerHandoff(input: ElectronInstallerHandoffRequest): Promise<ElectronInstallerHandoffReceipt> {
  if (!Number.isSafeInteger(input.parentPid) || input.parentPid <= 0) throw new Error("invalid installer handoff parent pid");
  if (!/^[0-9a-f-]{36}$/iu.test(input.installAttemptId)) throw new Error("invalid installer handoff attempt id");
  if (input.artifactIdentity == null) throw new Error("installer handoff requires a staged artifact identity");
  const artifact = await verifyElectronInstallerArtifact(input.artifactIdentity);
  if (artifact.path !== input.handoff.artifact.path || artifact.sha256 !== input.handoff.artifact.sha256 || artifact.size !== input.handoff.artifact.size) {
    throw new Error("installer handoff artifact differs from its staged identity");
  }
  if (input.handoff.target.startsWith("darwin-")) {
    if (input.platformTrust == null) throw new Error("macOS installer handoff requires a platform trust receipt");
    await verifyElectronInstallerArtifactForExecution(artifact, input.platformTrust);
  }

  const installAttemptId = input.installAttemptId;
  const helpersRoot = join(input.runtimeRoot, "installer", "helpers");
  await mkdir(helpersRoot, { recursive: true });
  const helperPath = join(helpersRoot, `installer-after-quit-${installAttemptId}.cjs`);
  const resultPath = join(input.runtimeRoot, "installer", "installer-result.json");
  const mode = input.mode ?? "execute";
  const receipt: ElectronInstallerHandoffReceipt = {
    schemaVersion: 1,
    state: "armed",
    installAttemptId,
    artifactPath: artifact.path,
    artifactSha256: artifact.sha256,
    helperPath,
    resultPath,
    mode,
    parentPid: input.parentPid,
  };
  await writeFile(helperPath, helperSource, { encoding: "utf8", flag: "wx", mode: 0o700 });
  await writeFile(join(input.runtimeRoot, "installer", "installer-handoff.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  const helperInput = Buffer.from(JSON.stringify({
    parentPid: input.parentPid,
    installAttemptId,
    timeoutMs: input.timeoutMs ?? 10 * 60_000,
    artifact,
    resultPath,
    runtimeRoot: input.runtimeRoot,
    mode,
    platform: process.platform,
  }), "utf8").toString("base64url");
  const child = spawn(input.nodeExecutablePath, [helperPath, helperInput], {
    cwd: input.runtimeRoot,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  return receipt;
}
