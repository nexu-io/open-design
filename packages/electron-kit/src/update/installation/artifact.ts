import { constants } from "node:fs";
import { chmod, link, lstat, mkdir, open, unlink } from "node:fs/promises";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";

import type {
  ElectronInstallerArtifactIdentity,
  ElectronInstallerArtifactStageReceipt,
  ElectronInstallerArtifactStageRequest,
} from "./contracts.js";

const SHA256 = /^[a-f0-9]{64}$/u;
const BUFFER_SIZE = 1024 * 1024;

function exactAuthorityRoot(value: string): string {
  if (!isAbsolute(value) || resolve(value) !== value) throw new Error("installer artifact authority root must be absolute and normalized");
  return value;
}

function artifactExtension(mediaType: string): string {
  if (mediaType === "application/x-apple-diskimage") return ".dmg";
  if (mediaType === "application/vnd.microsoft.portable-executable") return ".exe";
  return ".artifact";
}

function sameStat(left: Readonly<{ dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint }>, right: Readonly<{ dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint }>): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeNs === right.mtimeNs;
}

async function openRegularNoFollow(path: string) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const status = await handle.stat({ bigint: true });
    if (!status.isFile()) throw new Error("installer artifact is not a regular file");
    return { handle, status };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function ensureAuthorityDirectory(path: string): Promise<void> {
  await mkdir(path, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  const status = await lstat(path);
  if (!status.isDirectory() || status.isSymbolicLink()) throw new Error("installer artifact authority directory is invalid");
  if (typeof process.getuid === "function" && status.uid !== process.getuid()) throw new Error("installer artifact authority directory has another owner");
  if ((status.mode & 0o022) !== 0) throw new Error("installer artifact authority directory is writable by another principal");
}

async function hashHandle(handle: Awaited<ReturnType<typeof open>>, destination?: Awaited<ReturnType<typeof open>>): Promise<Readonly<{ sha256: string; size: number }>> {
  const digest = createHash("sha256");
  const buffer = Buffer.allocUnsafe(BUFFER_SIZE);
  let size = 0;
  for (;;) {
    const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, null);
    if (bytesRead === 0) break;
    const bytes = buffer.subarray(0, bytesRead);
    digest.update(bytes);
    if (destination != null) {
      let offset = 0;
      while (offset < bytes.byteLength) {
        const { bytesWritten } = await destination.write(bytes, offset, bytes.byteLength - offset);
        if (bytesWritten === 0) throw new Error("installer artifact staging made no write progress");
        offset += bytesWritten;
      }
    }
    size += bytesRead;
  }
  return Object.freeze({ sha256: digest.digest("hex"), size });
}

function identity(path: string, sha256: string, size: number, status: Readonly<{ dev: bigint; ino: bigint }>): ElectronInstallerArtifactIdentity {
  return Object.freeze({ path, sha256, size, device: status.dev.toString(), inode: status.ino.toString() });
}

async function identityForPath(path: string, sha256: string, size: number): Promise<ElectronInstallerArtifactIdentity> {
  const { handle, status } = await openRegularNoFollow(path);
  try { return identity(path, sha256, size, status); }
  finally { await handle.close(); }
}

export async function verifyElectronInstallerArtifact(
  expected: ElectronInstallerArtifactIdentity,
): Promise<ElectronInstallerArtifactIdentity> {
  if (!isAbsolute(expected.path) || resolve(expected.path) !== expected.path || !SHA256.test(expected.sha256)
    || !Number.isSafeInteger(expected.size) || expected.size < 0 || !/^\d+$/u.test(expected.device) || !/^\d+$/u.test(expected.inode)) {
    throw new Error("staged installer artifact identity is invalid");
  }
  const { handle, status: before } = await openRegularNoFollow(expected.path);
  try {
    if ((before.mode & 0o222n) !== 0n) throw new Error("staged installer artifact is writable");
    const actual = await hashHandle(handle);
    const after = await handle.stat({ bigint: true });
    if (!sameStat(before, after)) throw new Error("staged installer artifact changed while it was verified");
    const observed = identity(expected.path, actual.sha256, actual.size, after);
    if (observed.path !== expected.path || observed.sha256 !== expected.sha256 || observed.size !== expected.size
      || observed.device !== expected.device || observed.inode !== expected.inode) {
      throw new Error("staged installer artifact identity mismatch");
    }
    return observed;
  } finally {
    await handle.close();
  }
}

export async function stageElectronInstallerArtifact(
  request: ElectronInstallerArtifactStageRequest,
): Promise<ElectronInstallerArtifactStageReceipt> {
  const authorityRoot = exactAuthorityRoot(request.authorityRoot);
  const sourcePath = request.artifact.path;
  if (!isAbsolute(sourcePath) || resolve(sourcePath) !== sourcePath || !SHA256.test(request.artifact.sha256)
    || !Number.isSafeInteger(request.artifact.size) || request.artifact.size < 0) throw new Error("installer source artifact identity is invalid");
  const sourceEntry = await lstat(sourcePath);
  if (sourceEntry.isSymbolicLink()) throw new Error("installer source artifact must not be a symbolic link");

  await mkdir(authorityRoot, { recursive: true, mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  await ensureAuthorityDirectory(authorityRoot);
  const directories = [
    join(authorityRoot, "installer"),
    join(authorityRoot, "installer", "artifacts"),
    join(authorityRoot, "installer", "artifacts", "sha256"),
    join(authorityRoot, "installer", "artifacts", "sha256", request.artifact.sha256.slice(0, 2)),
  ];
  for (const candidate of directories) await ensureAuthorityDirectory(candidate);
  const directory = directories.at(-1)!;
  const artifactPath = join(directory, `${request.artifact.sha256}${artifactExtension(request.artifact.mediaType)}`);
  const temporaryPath = join(directory, `.${basename(artifactPath)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  const { handle: source, status: before } = await openRegularNoFollow(sourcePath);
  let temporary: Awaited<ReturnType<typeof open>> | null = null;
  try {
    temporary = await open(temporaryPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o400);
    const actual = await hashHandle(source, temporary);
    await temporary.sync();
    const after = await source.stat({ bigint: true });
    if (!sameStat(before, after)) throw new Error("installer source artifact changed while it was staged");
    if (actual.sha256 !== request.artifact.sha256 || actual.size !== request.artifact.size) throw new Error("installer source artifact digest or size mismatch");
    await temporary.close();
    temporary = null;
    await chmod(temporaryPath, 0o400);
    try { await link(temporaryPath, artifactPath); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    const staged = await verifyElectronInstallerArtifact(await identityForPath(artifactPath, actual.sha256, actual.size));
    return Object.freeze({ schemaVersion: 1, operation: "electron.installer-artifact.stage", sourcePath, artifact: staged });
  } finally {
    await source.close();
    if (temporary != null) await temporary.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
  }
}
