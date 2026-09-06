import { constants } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { cp, lstat, mkdir, open, readdir, readlink, rename, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { canonicalJson, validateShellIdentity } from "@open-design/standalone";

import type {
  ElectronMacLastKnownGoodCaptureReceipt,
  ElectronMacLastKnownGoodCaptureRequest,
  ElectronMacLastKnownGoodTreeIdentity,
} from "./contracts.js";

const SHA256 = /^[a-f0-9]{64}$/u;

function exactRoot(value: string, label: string): string {
  if (!isAbsolute(value) || resolve(value) !== value) throw new Error(`${label} must be absolute and normalized`);
  return value;
}

async function ensureOwnedDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const status = await lstat(path);
  if (!status.isDirectory() || status.isSymbolicLink()) throw new Error("macOS LKG authority directory is invalid");
  if (typeof process.getuid === "function" && status.uid !== process.getuid()) throw new Error("macOS LKG authority directory has another owner");
  if ((status.mode & 0o022) !== 0) throw new Error("macOS LKG authority directory is writable by another principal");
}

async function hashFile(path: string): Promise<Readonly<{ sha256: string; size: number }>> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) throw new Error("macOS LKG tree contains a non-regular file");
    const digest = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let size = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, null);
      if (bytesRead === 0) break;
      digest.update(buffer.subarray(0, bytesRead));
      size += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs) {
      throw new Error("macOS LKG file changed while it was read");
    }
    return Object.freeze({ sha256: digest.digest("hex"), size });
  } finally { await handle.close(); }
}

export async function identifyMacElectronLastKnownGoodTree(appPath: string): Promise<ElectronMacLastKnownGoodTreeIdentity> {
  const root = exactRoot(appPath, "macOS LKG app path");
  const rootStatus = await lstat(root);
  if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink() || !basename(root).endsWith(".app")) {
    throw new Error("macOS LKG source is not an app bundle");
  }
  const entries: Array<Readonly<{ path: string; kind: "directory" | "file" | "symlink"; mode: number; sha256?: string; size?: number; target?: string }>> = [];
  let totalSize = 0;
  const visit = async (directory: string): Promise<void> => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      const name = relative(root, path).split(sep).join("/");
      const status = await lstat(path);
      const mode = status.mode & 0o7777;
      if (status.isDirectory() && !status.isSymbolicLink()) {
        entries.push(Object.freeze({ path: name, kind: "directory", mode }));
        await visit(path);
      } else if (status.isFile() && !status.isSymbolicLink()) {
        const file = await hashFile(path);
        totalSize += file.size;
        entries.push(Object.freeze({ path: name, kind: "file", mode, ...file }));
      } else if (status.isSymbolicLink()) {
        const target = await readlink(path);
        const resolvedTarget = resolve(dirname(path), target);
        const escape = relative(root, resolvedTarget);
        if (escape === ".." || escape.startsWith(`..${sep}`) || isAbsolute(escape)) throw new Error("macOS LKG tree contains an escaping symbolic link");
        entries.push(Object.freeze({ path: name, kind: "symlink", mode, target }));
      } else throw new Error("macOS LKG tree contains an unsupported filesystem entry");
    }
  };
  await visit(root);
  return Object.freeze({ path: root, sha256: createHash("sha256").update(canonicalJson(entries)).digest("hex"), entries: entries.length, size: totalSize });
}

function sameTree(left: ElectronMacLastKnownGoodTreeIdentity, right: ElectronMacLastKnownGoodTreeIdentity): boolean {
  return left.sha256 === right.sha256 && left.entries === right.entries && left.size === right.size;
}

export async function verifyMacElectronLastKnownGoodCapture(receipt: ElectronMacLastKnownGoodCaptureReceipt): Promise<ElectronMacLastKnownGoodCaptureReceipt> {
  if (receipt.schemaVersion !== 1 || receipt.operation !== "electron.macos-lkg.capture" || !SHA256.test(receipt.source.sha256) || !SHA256.test(receipt.backup.sha256)) {
    throw new Error("macOS LKG capture receipt is invalid");
  }
  const installIdentity = receipt.installIdentity;
  if (resolve(receipt.source.path) !== receipt.source.path || resolve(receipt.backup.path) !== receipt.backup.path
    || !basename(receipt.source.path).endsWith(".app") || basename(receipt.backup.path) !== `${receipt.source.sha256}.app`
    || receipt.source.path === receipt.backup.path
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(installIdentity.appId)
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(installIdentity.executableName)
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(installIdentity.namespace)
    || installIdentity.productName.length === 0 || installIdentity.productName.includes("\n")) {
    throw new Error("macOS LKG capture identity is invalid");
  }
  validateShellIdentity(receipt.shell);
  const backup = await identifyMacElectronLastKnownGoodTree(receipt.backup.path);
  if (!sameTree(receipt.backup, backup) || !sameTree(receipt.source, backup)) throw new Error("macOS LKG backup differs from its captured source");
  return structuredClone(receipt);
}

export async function captureMacElectronLastKnownGood(request: ElectronMacLastKnownGoodCaptureRequest): Promise<ElectronMacLastKnownGoodCaptureReceipt> {
  const appPath = exactRoot(request.appPath, "macOS LKG app path");
  const authorityRoot = exactRoot(request.authorityRoot, "macOS LKG authority root");
  validateShellIdentity(request.shell);
  const before = await identifyMacElectronLastKnownGoodTree(appPath);
  const lkgRoot = join(authorityRoot, "installer", "lkg");
  await ensureOwnedDirectory(lkgRoot);
  const backupPath = join(lkgRoot, `${before.sha256}.app`);
  const temporaryPath = join(lkgRoot, `.${before.sha256}.${process.pid}.${randomBytes(8).toString("hex")}.tmp.app`);
  try {
    await cp(appPath, temporaryPath, { recursive: true, force: false, errorOnExist: true, preserveTimestamps: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE });
    const copied = await identifyMacElectronLastKnownGoodTree(temporaryPath);
    const after = await identifyMacElectronLastKnownGoodTree(appPath);
    if (!sameTree(before, after) || !sameTree(before, copied)) throw new Error("macOS LKG source changed while it was captured");
    try { await rename(temporaryPath, backupPath); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST" && (error as NodeJS.ErrnoException).code !== "ENOTEMPTY") throw error; }
    const backup = await identifyMacElectronLastKnownGoodTree(backupPath);
    if (!sameTree(before, backup)) throw new Error("macOS LKG content-addressed backup collision");
    return await verifyMacElectronLastKnownGoodCapture(Object.freeze({
      schemaVersion: 1,
      operation: "electron.macos-lkg.capture",
      source: before,
      backup,
      shell: structuredClone(request.shell),
      installIdentity: structuredClone(request.installIdentity),
    }));
  } finally { await rm(temporaryPath, { recursive: true, force: true }); }
}
