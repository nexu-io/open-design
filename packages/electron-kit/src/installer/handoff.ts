import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ElectronInstallerHandoffReceipt, ElectronInstallerHandoffRequest } from "./contracts.js";

const helperSource = String.raw`const { spawn } = require("node:child_process");
const { writeFile, unlink } = require("node:fs/promises");
const input = JSON.parse(Buffer.from(process.argv[2], "base64url").toString("utf8"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const alive = () => { try { process.kill(input.parentPid, 0); return true; } catch (error) { if (error && error.code === "ESRCH") return false; throw error; } };
(async () => {
  const deadline = Date.now() + input.timeoutMs;
  while (alive()) { if (Date.now() >= deadline) throw new Error("installer handoff timed out waiting for Electron"); await sleep(100); }
  if (input.mode === "execute") {
    const command = input.platform === "darwin" ? "/usr/bin/open" : input.artifactPath;
    const args = input.platform === "darwin" ? [input.artifactPath] : [];
    const child = spawn(command, args, { cwd: input.runtimeRoot, detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
  }
  await writeFile(input.resultPath, JSON.stringify({ schemaVersion: 1, state: input.mode === "execute" ? "launched" : "verified", installAttemptId: input.installAttemptId, artifactPath: input.artifactPath, parentPid: input.parentPid }) + "\n", "utf8");
})().catch(async (error) => {
  await writeFile(input.resultPath, JSON.stringify({ schemaVersion: 1, state: "failed", message: error instanceof Error ? error.message : String(error) }) + "\n", "utf8").catch(() => undefined);
  process.exitCode = 1;
}).finally(async () => { await unlink(__filename).catch(() => undefined); });
`;

export async function scheduleElectronInstallerHandoff(input: ElectronInstallerHandoffRequest): Promise<ElectronInstallerHandoffReceipt> {
  if (!Number.isSafeInteger(input.parentPid) || input.parentPid <= 0) throw new Error("invalid installer handoff parent pid");
  if (!/^[0-9a-f-]{36}$/iu.test(input.installAttemptId)) throw new Error("invalid installer handoff attempt id");
  const artifact = await lstat(input.handoff.artifact.path);
  if (!artifact.isFile() || artifact.isSymbolicLink() || artifact.size !== input.handoff.artifact.size) throw new Error("installer handoff artifact identity mismatch");
  const digest = createHash("sha256").update(await readFile(input.handoff.artifact.path)).digest("hex");
  if (digest !== input.handoff.artifact.sha256) throw new Error("installer handoff artifact digest mismatch");

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
    artifactPath: input.handoff.artifact.path,
    artifactSha256: digest,
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
    artifactPath: input.handoff.artifact.path,
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
