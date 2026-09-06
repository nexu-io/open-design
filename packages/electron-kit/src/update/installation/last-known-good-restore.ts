import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { mkdir, open, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { canonicalJson } from "@open-design/standalone";

import type {
  ElectronMacLastKnownGoodRestoreArmedReceipt,
  ElectronMacLastKnownGoodRestorePreparationReceipt,
  ElectronMacLastKnownGoodRestorePreparationRequest,
  ElectronMacLastKnownGoodRestoreResult,
} from "./contracts.js";
import { verifyMacElectronLastKnownGoodCapture } from "./last-known-good.js";

const TOKEN = /^[A-Za-z0-9._-]{1,128}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

const helperSource = String.raw`const { constants } = require("node:fs");
const { createHash } = require("node:crypto");
const { spawn, execFile } = require("node:child_process");
const { cp, lstat, mkdir, open, readFile, readdir, readlink, rename, writeFile } = require("node:fs/promises");
const { basename, dirname, isAbsolute, join, relative, resolve, sep } = require("node:path");
const { promisify } = require("node:util");
const run = promisify(execFile);
const input = JSON.parse(require("node:fs").readFileSync(process.argv[2], "utf8"));
const stable = (value) => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? "[" + value.map(stable).join(",") + "]" : "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stable(value[key])).join(",") + "}";
const alive = () => { try { process.kill(input.parentPid, 0); return true; } catch (error) { if (error && error.code === "ESRCH") return false; throw error; } };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const fileHash = async (path) => { const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); try { const before = await handle.stat({ bigint: true }); if (!before.isFile()) throw new Error("restore tree contains non-file"); const hash = createHash("sha256"), buffer = Buffer.allocUnsafe(1024 * 1024); let size = 0; for (;;) { const { bytesRead } = await handle.read(buffer, 0, buffer.length, null); if (!bytesRead) break; hash.update(buffer.subarray(0, bytesRead)); size += bytesRead; } const after = await handle.stat({ bigint: true }); if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs) throw new Error("restore file changed while read"); return { sha256: hash.digest("hex"), size }; } finally { await handle.close(); } };
const tree = async (root) => { const top = await lstat(root); if (!top.isDirectory() || top.isSymbolicLink() || !basename(root).endsWith(".app")) throw new Error("restore source is not app"); const entries = []; let size = 0; const visit = async (directory) => { for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) { const path = join(directory, entry.name), name = relative(root, path).split(sep).join("/"), status = await lstat(path), mode = status.mode & 4095; if (status.isDirectory() && !status.isSymbolicLink()) { entries.push({ path:name, kind:"directory", mode }); await visit(path); } else if (status.isFile() && !status.isSymbolicLink()) { const file = await fileHash(path); size += file.size; entries.push({ path:name, kind:"file", mode, ...file }); } else if (status.isSymbolicLink()) { const target = await readlink(path), escaped = relative(root, resolve(dirname(path), target)); if (escaped === ".." || escaped.startsWith(".." + sep) || isAbsolute(escaped)) throw new Error("restore tree contains escaping symlink"); entries.push({ path:name, kind:"symlink", mode, target }); } else throw new Error("restore tree contains unsupported entry"); } }; await visit(root); return { path:root, sha256:createHash("sha256").update(stable(entries) + "\n").digest("hex"), entries:entries.length, size }; };
const same = (a,b) => a.sha256 === b.sha256 && a.entries === b.entries && a.size === b.size;
const nativeTrust = async (app) => { await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]); const displayed = await run("/usr/bin/codesign", ["--display", "--requirements", "-", "--verbose=4", app]); const output = String(displayed.stdout || "") + "\n" + String(displayed.stderr || ""); const field = (name) => { const match = output.match(new RegExp("(?:^|\\n)" + name + "=(.*)(?:\\n|$)")); if (!match) throw new Error("restored app lacks codesign " + name); return match[1].trim(); }; const requirementMatch = output.match(/(?:^|\n)(?:# )?designated => (.*)(?:\n|$)/); if (!requirementMatch) throw new Error("restored app lacks designated requirement"); const plist = async (key) => String((await run("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", join(app, "Contents", "Info.plist")])).stdout).trim(); return { bundleId:await plist("CFBundleIdentifier"), executableName:await plist("CFBundleExecutable"), productName:await plist("CFBundleName"), designatedRequirement:requirementMatch[1].trim(), identifier:field("Identifier"), teamIdentifier:field("TeamIdentifier") }; };
const verifyTrust = async (app) => { if (input.mode !== "formal") return; const observed = await nativeTrust(app), expected = input.trust.release; if (observed.bundleId !== expected.installIdentity.appId || observed.identifier !== expected.installIdentity.appId || observed.executableName !== expected.installIdentity.executableName || observed.productName !== expected.installIdentity.productName || observed.designatedRequirement !== expected.designatedRequirement || observed.teamIdentifier !== expected.teamIdentifier) throw Object.assign(new Error("restored app native trust identity mismatch"), { code:"native-trust-mismatch" }); };
const result = async (value) => await writeFile(input.resultPath, stable({ schemaVersion:1, operation:"electron.macos-lkg.restore.result", recoveryId:input.recoveryId, claim:input.claim, ...value }) + "\n", { encoding:"utf8", flag:"wx" });
(async () => {
  await mkdir(dirname(input.lockPath), { recursive:true, mode:448 });
  try { const lock = await open(input.lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 384); await lock.writeFile(String(process.pid)); await lock.close(); }
  catch (error) { if (error && error.code === "EEXIST") return; throw error; }
  const deadline = Date.now() + input.timeoutMs;
  while (alive()) { if (Date.now() >= deadline) throw Object.assign(new Error("restore timed out waiting for Electron"), { code:"parent-timeout" }); await sleep(100); }
  const backup = await tree(input.capture.backup.path);
  if (!same(backup, input.capture.backup) || !same(backup, input.capture.source)) throw Object.assign(new Error("LKG backup identity mismatch: " + stable({ actual:backup, backup:input.capture.backup, source:input.capture.source })), { code:"backup-mismatch" });
  const target = input.capture.source.path, stem = target.slice(0, -4), suffix = ".od-restore-" + input.recoveryId;
  const staging = stem + suffix + ".staging.app", forensic = stem + suffix + ".candidate.app";
  try { await lstat(staging); throw Object.assign(new Error("restore staging path already exists"), { code:"staging-exists" }); } catch (error) { if (!error || error.code !== "ENOENT") throw error; }
  await cp(input.capture.backup.path, staging, { recursive:true, force:false, errorOnExist:true, preserveTimestamps:true, verbatimSymlinks:true, mode:constants.COPYFILE_FICLONE });
  if (!same(await tree(staging), input.capture.backup)) throw Object.assign(new Error("restore staging identity mismatch"), { code:"staging-mismatch" });
  await verifyTrust(staging);
  let retained = false;
  try { await rename(target, forensic); retained = true; } catch (error) { if (!error || error.code !== "ENOENT") throw error; }
  try { await rename(staging, target); } catch (error) { if (retained) await rename(forensic, target).catch(() => undefined); throw error; }
  if (!same(await tree(target), input.capture.source)) throw Object.assign(new Error("restored app identity mismatch"), { code:"restored-mismatch" });
  await verifyTrust(target);
  await result({ state:"restored", restoredAppPath:target, ...(retained ? { forensicAppPath:forensic } : {}) });
  if (input.relaunch) { const child = spawn("/usr/bin/open", ["-n", target, "--args", ...input.relaunchArguments], { detached:true, stdio:"ignore" }); child.unref(); }
})().catch(async (error) => { await result({ state:"failed", error:{ code:typeof error.code === "string" ? error.code : "restore-failed", message:error instanceof Error ? error.message : String(error) } }).catch(() => undefined); process.exitCode = 1; });
`;

function exactPath(value: string, label: string): string {
  if (!isAbsolute(value) || resolve(value) !== value) throw new Error(`${label} must be absolute and normalized`);
  return value;
}

async function writeExact(path: string, body: string, mode: number): Promise<void> {
  try { await writeFile(path, body, { encoding: "utf8", flag: "wx", mode }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST" || (await readExactFile(path)).toString("utf8") !== body) throw error;
  }
}

async function readExactFile(path: string): Promise<Buffer> {
  const handle = await open(exactPath(path, "macOS LKG restore file"), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) throw new Error("macOS LKG restore path is not a regular file");
    const body = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs) {
      throw new Error("macOS LKG restore file changed while read");
    }
    return body;
  } finally { await handle.close(); }
}

export async function prepareMacElectronLastKnownGoodRestore(request: ElectronMacLastKnownGoodRestorePreparationRequest): Promise<ElectronMacLastKnownGoodRestorePreparationReceipt> {
  if (!TOKEN.test(request.recoveryId) || !Number.isSafeInteger(request.parentPid) || request.parentPid <= 0) throw new Error("macOS LKG restore identity is invalid");
  const runtimeRoot = exactPath(request.runtimeRoot, "macOS LKG restore runtime root");
  const nodeExecutablePath = exactPath(request.nodeExecutablePath, "macOS LKG restore Node executable");
  if (request.relaunchArguments.some((value) => typeof value !== "string" || value.includes("\0"))) throw new Error("macOS LKG restore relaunch arguments are invalid");
  const capture = await verifyMacElectronLastKnownGoodCapture(request.capture);
  if (request.trust.schemaVersion !== 1 || request.trust.operation !== "electron.macos-installer.trust"
    || canonicalJson(request.trust.release.shell) !== canonicalJson(capture.shell)
    || canonicalJson(request.trust.release.installIdentity) !== canonicalJson(capture.installIdentity)
    || request.trust.mode !== request.mode || request.trust.release.designatedRequirement.length === 0
    || request.trust.release.designatedRequirement.includes("\n")
    || (!/^[A-Z0-9]{10}$/u.test(request.trust.release.teamIdentifier)
      && !(request.mode === "verify-only" && request.trust.release.teamIdentifier === "adhoc"))
    || request.trust.app.bundleId !== capture.installIdentity.appId
    || request.trust.app.executableName !== capture.installIdentity.executableName
    || request.trust.app.productName !== capture.installIdentity.productName
    || request.trust.app.designatedRequirement !== request.trust.release.designatedRequirement
    || request.trust.app.teamIdentifier !== request.trust.release.teamIdentifier
    || request.trust.app.codesignVerified !== true
    || (request.mode === "formal" && (request.trust.app.provider !== "macos-system" || request.trust.app.gatekeeperAssessed !== true))) {
    throw new Error("macOS LKG restore trust identity is invalid");
  }
  const root = join(runtimeRoot, "installer", "restore", request.recoveryId);
  const preparationRoot = join(root, String(request.parentPid));
  await mkdir(preparationRoot, { recursive: true, mode: 0o700 });
  const helperPath = join(preparationRoot, "restore-after-quit.cjs"), inputPath = join(preparationRoot, "restore-input.json");
  const resultPath = join(root, "restore-result.json"), lockPath = join(root, "restore.lock");
  const helperSha256 = digest(helperSource);
  const inputBody = canonicalJson({ capture, claim: request.claim, trust: request.trust, lockPath, mode: request.mode, parentPid: request.parentPid, recoveryId: request.recoveryId, relaunch: request.relaunch ?? true, relaunchArguments: request.relaunchArguments, resultPath, timeoutMs: 10 * 60_000 });
  await writeExact(helperPath, helperSource, 0o500);
  await writeExact(inputPath, inputBody, 0o400);
  return Object.freeze({ schemaVersion: 1, operation: "electron.macos-lkg.restore.prepare", state: "prepared", recoveryId: request.recoveryId, claim: structuredClone(request.claim), capture, trust: structuredClone(request.trust), helperPath, helperSha256, inputPath, inputSha256: digest(inputBody), resultPath, lockPath, nodeExecutablePath, parentPid: request.parentPid, mode: request.mode });
}

export async function scheduleMacElectronLastKnownGoodRestore(preparation: ElectronMacLastKnownGoodRestorePreparationReceipt): Promise<ElectronMacLastKnownGoodRestoreArmedReceipt> {
  if (preparation.operation !== "electron.macos-lkg.restore.prepare" || preparation.state !== "prepared" || !SHA256.test(preparation.helperSha256) || !SHA256.test(preparation.inputSha256)) throw new Error("macOS LKG restore preparation is invalid");
  if (digest(await readExactFile(preparation.helperPath)) !== preparation.helperSha256 || digest(await readExactFile(preparation.inputPath)) !== preparation.inputSha256) throw new Error("macOS LKG restore helper preparation changed");
  const child = spawn(preparation.nodeExecutablePath, [preparation.helperPath, preparation.inputPath], { cwd: resolve(preparation.capture.backup.path, ".."), detached: true, stdio: "ignore" });
  child.unref();
  return Object.freeze({ schemaVersion: 1, operation: "electron.macos-lkg.restore.schedule", state: "armed", recoveryId: preparation.recoveryId, claim: structuredClone(preparation.claim), preparation: structuredClone(preparation), helperPid: child.pid! });
}

export async function readMacElectronLastKnownGoodRestoreResult(preparation: ElectronMacLastKnownGoodRestorePreparationReceipt): Promise<ElectronMacLastKnownGoodRestoreResult | null> {
  let value: ElectronMacLastKnownGoodRestoreResult;
  try { value = JSON.parse((await readExactFile(preparation.resultPath)).toString("utf8")) as ElectronMacLastKnownGoodRestoreResult; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  if (value.schemaVersion !== 1 || value.operation !== "electron.macos-lkg.restore.result" || value.recoveryId !== preparation.recoveryId
    || canonicalJson(value.claim) !== canonicalJson(preparation.claim) || (value.state !== "restored" && value.state !== "failed")) throw new Error("macOS LKG restore result is invalid");
  const expectedKeys = value.state === "restored"
    ? ["claim", ...(value.forensicAppPath == null ? [] : ["forensicAppPath"]), "operation", "recoveryId", "restoredAppPath", "schemaVersion", "state"].sort()
    : ["claim", "error", "operation", "recoveryId", "schemaVersion", "state"].sort();
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expectedKeys)
    || (value.state === "restored" && (value.restoredAppPath !== preparation.capture.source.path
      || (value.forensicAppPath != null && (resolve(value.forensicAppPath) !== value.forensicAppPath
        || dirname(value.forensicAppPath) !== dirname(preparation.capture.source.path)))))
    || (value.state === "failed" && (value.error == null || Object.keys(value.error).sort().join(",") !== "code,message"
      || typeof value.error.code !== "string" || value.error.code.length === 0 || typeof value.error.message !== "string"))) {
    throw new Error("macOS LKG restore result fields are invalid");
  }
  if (value.state === "restored") await verifyMacElectronLastKnownGoodCapture(preparation.capture);
  return structuredClone(value);
}
