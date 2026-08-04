import { randomUUID } from "node:crypto";
import {
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import {
  hostServerTarget,
  type ServerPlatform,
} from "./config.js";
import {
  verifyServerRelease,
  type ServerReleaseManifest,
} from "./manifest.js";

export type InstallServerPayloadOptions = {
  archiveSha256: string;
  binDir: string;
  installRoot: string;
  installLockTimeoutMs?: number;
  nodeBin: string;
  payloadRoot: string;
  smokeTimeoutMs?: number;
};

export type InstallServerPayloadHooks = {
  /**
   * Runs after the staged release is verified and before its atomic rename.
   * The installer lock remains held until this hook settles.
   */
  beforeReleaseCommit?: () => Promise<void>;
};

export type InstallServerPayloadResult = {
  archiveSha256: string;
  changed: boolean;
  installRoot: string;
  previousReleaseId: string | null;
  releaseId: string;
};

const SERVER_INSTALL_LOCK_NAME = ".server-install.lock";
const SERVER_INSTALL_LOCK_OWNER_NAME = "owner.json";
const SERVER_INSTALL_LOCK_TIMEOUT_MS = 60_000;
const SERVER_INSTALL_LOCK_POLL_MS = 50;
const SERVER_SMOKE_TIMEOUT_MS = 30_000;
const SERVER_SMOKE_STDERR_MAX_BYTES = 16 * 1_024;
const SERVER_SMOKE_TREE_KILL_TIMEOUT_MS = 5_000;

type ServerInstallLockOwner = {
  pid: number;
  startedAt: string;
  token: string;
};

function serverInstallLockOwnerPath(lockPath: string): string {
  return join(lockPath, SERVER_INSTALL_LOCK_OWNER_NAME);
}

function parseServerInstallLockOwner(
  value: string,
): ServerInstallLockOwner | null {
  try {
    const parsed = JSON.parse(value) as Partial<ServerInstallLockOwner>;
    if (
      !Number.isSafeInteger(parsed.pid) ||
      (parsed.pid ?? 0) <= 0 ||
      typeof parsed.startedAt !== "string" ||
      typeof parsed.token !== "string" ||
      parsed.token.length === 0
    ) {
      return null;
    }
    return parsed as ServerInstallLockOwner;
  } catch {
    return null;
  }
}

async function readServerInstallLockOwner(
  lockPath: string,
): Promise<ServerInstallLockOwner | null> {
  const value = await readFile(
    serverInstallLockOwnerPath(lockPath),
    "utf8",
  ).catch(() => null);
  return value == null ? null : parseServerInstallLockOwner(value);
}

function serverInstallLockOwnerIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function releaseOwnedServerInstallLockSync(
  lockPath: string,
  token: string,
): void {
  try {
    const owner = parseServerInstallLockOwner(
      readFileSync(serverInstallLockOwnerPath(lockPath), "utf8"),
    );
    if (owner?.token === token) {
      rmSync(lockPath, { force: true, recursive: true });
    }
  } catch {
    // Never delete a lock whose owner token cannot be verified.
  }
}

async function releaseOwnedServerInstallLock(
  lockPath: string,
  token: string,
): Promise<void> {
  const owner = await readServerInstallLockOwner(lockPath);
  if (owner?.token === token) {
    await rm(lockPath, { force: true, recursive: true });
  }
}

function serverInstallLockDelay(): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, SERVER_INSTALL_LOCK_POLL_MS);
  });
}

async function serverInstallLockTimeoutError(
  lockPath: string,
): Promise<Error> {
  const owner = await readServerInstallLockOwner(lockPath);
  if (owner == null) {
    return new Error(
      `server install lock has missing or invalid owner metadata: ${lockPath}; ` +
        "automatic takeover is disabled, so verify no installer is running and remove the lock manually",
    );
  }
  if (!serverInstallLockOwnerIsAlive(owner.pid)) {
    return new Error(
      `server install lock has stale owner pid ${String(owner.pid)}: ${lockPath}; ` +
        "automatic takeover is disabled, so verify no installer is running and remove the lock manually",
    );
  }
  return new Error(
    `timed out waiting for server install lock owned by live pid ${String(owner.pid)} ` +
      `since ${owner.startedAt}: ${lockPath}`,
  );
}

async function withOwnedServerInstallLock<T>(
  lockRoot: string,
  timeoutMs: number,
  callback: () => Promise<T>,
): Promise<T> {
  const lockPath = join(lockRoot, SERVER_INSTALL_LOCK_NAME);
  const startedAt = Date.now();
  while (true) {
    try {
      await mkdir(lockPath);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() - startedAt >= timeoutMs) {
        throw await serverInstallLockTimeoutError(lockPath);
      }
      await serverInstallLockDelay();
    }
  }

  const token = randomUUID();
  const owner: ServerInstallLockOwner = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    token,
  };
  try {
    await writeFile(
      serverInstallLockOwnerPath(lockPath),
      `${JSON.stringify(owner)}\n`,
      {
        encoding: "utf8",
        mode: 0o600,
      },
    );
  } catch (error) {
    await rm(lockPath, { force: true, recursive: true });
    throw error;
  }

  const removeOnExit = (): void => {
    releaseOwnedServerInstallLockSync(lockPath, token);
  };
  process.once("exit", removeOnExit);
  try {
    return await callback();
  } finally {
    process.off("exit", removeOnExit);
    await releaseOwnedServerInstallLock(lockPath, token);
  }
}

/**
 * Canonical path identity for install-time comparisons.
 *
 * Windows: realpath can return extended-length (`\\?\`) forms and NTFS is
 * case-insensitive, so identity must fold separators + case after resolving.
 * POSIX: realpath alone is enough (e.g. `/var` → `/private/var` on macOS).
 */
function canonicalizePathIdentity(path: string): string {
  let canonicalPath = realpathSync.native(path);
  if (process.platform === "win32") {
    // GetFinalPathNameByHandle may return an extended-length path.
    if (canonicalPath.startsWith("\\\\?\\UNC\\")) {
      // \\?\UNC\server\share\… → \\server\share\…
      canonicalPath = `\\\\${canonicalPath.slice("\\\\?\\UNC\\".length)}`;
    } else if (canonicalPath.startsWith("\\\\?\\")) {
      // \\?\C:\… → C:\…
      canonicalPath = canonicalPath.slice("\\\\?\\".length);
    }
    return canonicalPath.replaceAll("\\", "/").toLowerCase();
  }
  return canonicalPath;
}

function normalizedInstallLockKey(path: string): string {
  return canonicalizePathIdentity(path);
}

async function withServerInstallLocks<T>(
  installRoot: string,
  binDir: string,
  timeoutMs: number,
  callback: () => Promise<T>,
): Promise<T> {
  await Promise.all([
    mkdir(installRoot, { recursive: true }),
    mkdir(binDir, { recursive: true }),
  ]);
  const lockRootsByKey = new Map<string, string>();
  for (const root of [installRoot, binDir]) {
    const canonicalRoot = realpathSync.native(root);
    const key = normalizedInstallLockKey(canonicalRoot);
    if (!lockRootsByKey.has(key)) {
      lockRootsByKey.set(key, canonicalRoot);
    }
  }
  const lockRoots = [...lockRootsByKey.entries()]
    .sort(([left], [right]) => {
      if (left < right) return -1;
      if (left > right) return 1;
      return 0;
    })
    .map(([, root]) => root);

  const acquire = async (index: number): Promise<T> => {
    const lockRoot = lockRoots[index];
    if (lockRoot == null) return callback();
    return withOwnedServerInstallLock(
      lockRoot,
      timeoutMs,
      async () => acquire(index + 1),
    );
  };
  return acquire(0);
}

async function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    windowsVerbatimArguments?: boolean;
  } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? SERVER_SMOKE_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("server smoke timeout must be a positive integer");
  }
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      detached: true,
      env: options.env,
      stdio: ["ignore", "ignore", "pipe"],
      windowsVerbatimArguments: options.windowsVerbatimArguments,
      windowsHide: true,
    });
    let childClosed = false;
    let closeCode: number | null = null;
    let closeSignal: NodeJS.Signals | null = null;
    let settled = false;
    let stderrDiscardedBytes = 0;
    let stderrTail = Buffer.alloc(0);
    let terminationError: unknown;
    let terminationFinished = false;
    let timedOut = false;

    const appendStderr = (chunk: Buffer): void => {
      if (chunk.length >= SERVER_SMOKE_STDERR_MAX_BYTES) {
        stderrDiscardedBytes +=
          stderrTail.length + chunk.length - SERVER_SMOKE_STDERR_MAX_BYTES;
        stderrTail = Buffer.from(
          chunk.subarray(
            chunk.length - SERVER_SMOKE_STDERR_MAX_BYTES,
          ),
        );
        return;
      }
      const combinedLength = stderrTail.length + chunk.length;
      if (combinedLength > SERVER_SMOKE_STDERR_MAX_BYTES) {
        const overflow = combinedLength - SERVER_SMOKE_STDERR_MAX_BYTES;
        stderrDiscardedBytes += overflow;
        stderrTail = Buffer.concat([
          stderrTail.subarray(overflow),
          chunk,
        ]);
        return;
      }
      stderrTail = Buffer.concat([stderrTail, chunk]);
    };
    const stderrDiagnostic = (): string => {
      const tail = stderrTail.toString("utf8").trim();
      const truncation =
        stderrDiscardedBytes > 0
          ? `[${String(stderrDiscardedBytes)} stderr bytes truncated]`
          : "";
      return [truncation, tail].filter((part) => part.length > 0).join("\n");
    };
    const finish = (): void => {
      if (settled) return;
      if (timedOut) {
        if (!terminationFinished) return;
        settled = true;
        const diagnostic = stderrDiagnostic();
        const terminationDiagnostic =
          terminationError == null
            ? ""
            : `; process-tree termination failed: ${
                terminationError instanceof Error
                  ? terminationError.message
                  : String(terminationError)
              }`;
        rejectRun(
          new Error(
            `server release smoke timed out after ${String(timeoutMs)}ms` +
              terminationDiagnostic +
              (diagnostic.length > 0 ? `: ${diagnostic}` : ""),
          ),
        );
        return;
      }
      if (!childClosed) return;
      settled = true;
      if (closeCode === 0 && closeSignal == null) {
        resolveRun();
        return;
      }
      const diagnostic = stderrDiagnostic();
      rejectRun(
        new Error(
          `server release smoke failed (${
            closeSignal ?? `exit ${String(closeCode)}`
          })` + (diagnostic.length > 0 ? `: ${diagnostic}` : ""),
        ),
      );
    };

    child.stderr?.on("data", (chunk: Buffer) => {
      appendStderr(chunk);
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;
      rejectRun(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      childClosed = true;
      closeCode = code;
      closeSignal = signal;
      finish();
    });

    const timeout = setTimeout(() => {
      if (settled || childClosed) return;
      timedOut = true;
      void terminateProcessTree(child.pid, child).then(
        () => {
          terminationFinished = true;
          finish();
        },
        (error: unknown) => {
          terminationError = error;
          terminationFinished = true;
          child.kill("SIGKILL");
          finish();
        },
      );
    }, timeoutMs);
  });
}

async function terminateProcessTree(
  pid: number | undefined,
  child: ReturnType<typeof spawn>,
): Promise<void> {
  if (pid == null) {
    throw new Error("smoke process has no pid");
  }
  if (process.platform !== "win32") {
    try {
      process.kill(-pid, "SIGKILL");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
    return;
  }

  await new Promise<void>((resolveKill, rejectKill) => {
    const killer = spawn(
      "taskkill.exe",
      ["/pid", String(pid), "/t", "/f"],
      {
        stdio: "ignore",
        windowsHide: true,
      },
    );
    let finished = false;
    const finish = (error?: Error): void => {
      if (finished) return;
      finished = true;
      clearTimeout(killTimeout);
      if (error == null) {
        resolveKill();
      } else {
        rejectKill(error);
      }
    };
    killer.once("error", (error) => finish(error));
    killer.once("close", (code, signal) => {
      if (code === 0 && signal == null) {
        finish();
        return;
      }
      finish(
        new Error(
          `taskkill failed (${signal ?? `exit ${String(code)}`})`,
        ),
      );
    });
    const killTimeout = setTimeout(() => {
      killer.kill("SIGKILL");
      finish(
        new Error(
          `taskkill timed out after ${String(SERVER_SMOKE_TREE_KILL_TIMEOUT_MS)}ms`,
        ),
      );
    }, SERVER_SMOKE_TREE_KILL_TIMEOUT_MS);
  }).catch((error: unknown) => {
    child.kill("SIGKILL");
    throw error;
  });
}

async function assertNode24(
  nodeBin: string,
  timeoutMs: number,
): Promise<void> {
  await runCommand(nodeBin, [
    "-e",
    'if (process.versions.node.split(".")[0] !== "24") process.exit(24)',
  ], { timeoutMs });
}

async function findPayloadRelease(payloadRoot: string): Promise<string> {
  const releasesRoot = resolve(payloadRoot, "releases");
  const entries = await readdir(releasesRoot, { withFileTypes: true });
  const candidates = entries.filter(
    (entry) =>
      entry.isDirectory() &&
      !entry.isSymbolicLink() &&
      !entry.name.startsWith("."),
  );
  if (candidates.length !== 1 || candidates[0] == null) {
    throw new Error(
      `server payload must contain exactly one releases/<release-id> directory: ${payloadRoot}`,
    );
  }
  return resolve(releasesRoot, candidates[0].name);
}

function assertManifestRuntime(
  manifest: ServerReleaseManifest,
  sourceReleaseRoot: string,
): void {
  const host = hostServerTarget();
  if (
    manifest.target.platform !== host.platform ||
    manifest.target.arch !== host.arch
  ) {
    throw new Error(
      `server release targets ${manifest.target.platform}-${manifest.target.arch}, ` +
        `current host is ${host.platform}-${host.arch}`,
    );
  }
  if (manifest.nodeAbi !== process.versions.modules) {
    throw new Error(
      `server release Node ABI ${manifest.nodeAbi} does not match runtime ABI ${process.versions.modules}`,
    );
  }
  if (manifest.releaseId !== sourceReleaseRoot.split(/[\\/]/).at(-1)) {
    throw new Error(`server release id does not match its directory: ${sourceReleaseRoot}`);
  }
  if (!isSafeReleaseId(manifest.releaseId)) {
    throw new Error(`server release id is not one safe path segment: ${manifest.releaseId}`);
  }
}

function releaseEnvironment(
  releaseRoot: string,
  installRoot: string,
  nodeBin: string,
  manifest: ServerReleaseManifest,
): NodeJS.ProcessEnv {
  const entrypoint = resolve(releaseRoot, manifest.daemonEntrypoint);
  return {
    ...process.env,
    OD_BIN: entrypoint,
    OD_DAEMON_CLI_PATH: entrypoint,
    OD_DATA_DIR: process.env.OD_DATA_DIR ?? join(installRoot, "data"),
    OD_INSTALLATION_DIR: installRoot,
    OD_NODE_BIN: nodeBin,
    OD_RESOURCE_ROOT: resolve(releaseRoot, manifest.resourceRoot),
  };
}

async function smokeRelease(
  releaseRoot: string,
  installRoot: string,
  nodeBin: string,
  manifest: ServerReleaseManifest,
  timeoutMs: number,
): Promise<void> {
  const entrypoint = resolve(releaseRoot, manifest.daemonEntrypoint);
  await runCommand(nodeBin, [entrypoint, "daemon", "--help"], {
    cwd: releaseRoot,
    env: releaseEnvironment(releaseRoot, installRoot, nodeBin, manifest),
    timeoutMs,
  });
}

async function smokeStableLauncher(
  releaseRoot: string,
  installRoot: string,
  binDir: string,
  nodeBin: string,
  manifest: ServerReleaseManifest,
  timeoutMs: number,
): Promise<void> {
  const env = releaseEnvironment(releaseRoot, installRoot, nodeBin, manifest);
  if (manifest.target.platform === "win32") {
    await runCommand(
      env.ComSpec ?? env.COMSPEC ?? "cmd.exe",
      ["/d", "/s", "/c", '"open-design.cmd daemon --help"'],
      {
        cwd: binDir,
        env,
        timeoutMs,
        windowsVerbatimArguments: true,
      },
    );
    return;
  }
  await runCommand(resolve(binDir, "open-design"), ["daemon", "--help"], {
    cwd: binDir,
    env,
    timeoutMs,
  });
}

async function existingReleaseMatches(
  sourceManifest: ServerReleaseManifest,
  destination: string,
): Promise<boolean> {
  const metadata = await lstat(destination).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    },
  );
  if (metadata == null) return false;
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(
      `release destination is not a real directory: ${destination}`,
    );
  }
  try {
    const installedManifest = await verifyServerRelease(destination);
    return isDeepStrictEqual(installedManifest, sourceManifest);
  } catch (error) {
    throw new Error(
      `installed release ${sourceManifest.releaseId} is invalid or has different content: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function publishRelease(
  source: string,
  destination: string,
  manifest: ServerReleaseManifest,
  hooks: InstallServerPayloadHooks,
): Promise<boolean> {
  const existing = await lstat(destination).catch(() => null);
  if (existing != null) {
    if (!existing.isDirectory() || existing.isSymbolicLink()) {
      throw new Error(`release destination is not a directory: ${destination}`);
    }
    if (await existingReleaseMatches(manifest, destination)) return false;
    throw new Error(`release id already exists with different content: ${manifest.releaseId}`);
  }

  const releasesRoot = dirname(destination);
  const stage = join(
    releasesRoot,
    `.staging-${manifest.releaseId}-${process.pid}-${randomUUID()}`,
  );
  await cp(source, stage, { dereference: true, recursive: true });
  try {
    await verifyServerRelease(stage);
    await hooks.beforeReleaseCommit?.();
    try {
      await rename(stage, destination);
      return true;
    } catch (error) {
      if (await existingReleaseMatches(manifest, destination)) return false;
      throw error;
    }
  } finally {
    await rm(stage, { force: true, recursive: true });
  }
}

async function currentReleaseId(
  installRoot: string,
  platform: ServerPlatform,
): Promise<string | null> {
  const currentPath = join(installRoot, "current");
  if (platform === "win32") {
    const value = await readFile(currentPath, "utf8").catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      },
    );
    return value == null
      ? null
      : parseServerCurrentReleaseId(value, platform);
  }
  const target = await readlink(currentPath).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      if (error.code === "EINVAL") {
        throw new Error(`invalid server current pointer: ${currentPath}`);
      }
      throw error;
    },
  );
  if (target == null) return null;
  return parseServerCurrentReleaseId(target, platform);
}

function isSafeReleaseId(value: string): boolean {
  return (
    /^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(value) &&
    !value.includes("..")
  );
}

export function parseServerCurrentReleaseId(
  value: string,
  platform: ServerPlatform,
): string {
  let releaseId: string;
  if (platform === "win32") {
    const withoutTerminator = value.endsWith("\r\n")
      ? value.slice(0, -2)
      : value.endsWith("\n")
        ? value.slice(0, -1)
        : value;
    if (
      withoutTerminator.includes("\r") ||
      withoutTerminator.includes("\n")
    ) {
      throw new Error(`invalid server current pointer: ${JSON.stringify(value)}`);
    }
    releaseId = withoutTerminator;
  } else {
    const prefix = "releases/";
    if (!value.startsWith(prefix)) {
      throw new Error(`invalid server current pointer: ${JSON.stringify(value)}`);
    }
    releaseId = value.slice(prefix.length);
  }
  if (!isSafeReleaseId(releaseId)) {
    throw new Error(`invalid server current pointer: ${JSON.stringify(value)}`);
  }
  return releaseId;
}

async function replaceCurrentPointer(
  installRoot: string,
  releaseId: string | null,
  platform: ServerPlatform,
): Promise<void> {
  const currentPath = join(installRoot, "current");
  const temporaryPath = join(
    installRoot,
    `.current-${process.pid}-${randomUUID()}`,
  );
  await rm(temporaryPath, { force: true, recursive: true });
  if (releaseId == null) {
    await rm(currentPath, { force: true, recursive: true });
    return;
  }
  if (platform === "win32") {
    await writeFile(temporaryPath, `${releaseId}\n`, "utf8");
  } else {
    await symlink(`releases/${releaseId}`, temporaryPath);
  }
  try {
    await rename(temporaryPath, currentPath);
  } finally {
    await rm(temporaryPath, { force: true, recursive: true });
  }
}

async function compareAndSwapCurrentPointer(
  installRoot: string,
  expectedReleaseId: string,
  replacementReleaseId: string | null,
  platform: ServerPlatform,
): Promise<boolean> {
  if (await currentReleaseId(installRoot, platform) !== expectedReleaseId) {
    return false;
  }
  await replaceCurrentPointer(installRoot, replacementReleaseId, platform);
  return true;
}

async function assertReplaceableFile(path: string): Promise<void> {
  const metadata = await lstat(path).catch(() => null);
  if (metadata?.isDirectory() && !metadata.isSymbolicLink()) {
    throw new Error(`refusing to replace directory with launcher: ${path}`);
  }
}

type LauncherSnapshot =
  | {
      kind: "absent";
      path: string;
    }
  | {
      kind: "file";
      mode: number;
      path: string;
      value: Buffer;
    }
  | {
      kind: "symlink";
      path: string;
      target: string;
    };

function stableLauncherPaths(
  binDir: string,
  platform: ServerPlatform,
): string[] {
  return ["open-design", "od"].map((name) =>
    join(binDir, platform === "win32" ? `${name}.cmd` : name),
  );
}

async function captureStableLaunchers(
  binDir: string,
  platform: ServerPlatform,
): Promise<LauncherSnapshot[]> {
  const snapshots: LauncherSnapshot[] = [];
  for (const path of stableLauncherPaths(binDir, platform)) {
    const metadata = await lstat(path).catch(() => null);
    if (metadata == null) {
      snapshots.push({ kind: "absent", path });
      continue;
    }
    if (metadata.isDirectory() && !metadata.isSymbolicLink()) {
      throw new Error(`refusing to replace directory with launcher: ${path}`);
    }
    if (metadata.isSymbolicLink()) {
      snapshots.push({
        kind: "symlink",
        path,
        target: await readlink(path),
      });
      continue;
    }
    if (!metadata.isFile()) {
      throw new Error(`refusing to replace unsupported launcher: ${path}`);
    }
    snapshots.push({
      kind: "file",
      mode: metadata.mode,
      path,
      value: await readFile(path),
    });
  }
  return snapshots;
}

async function replaceLauncherAtomically(
  path: string,
  createTemporary: (temporaryPath: string) => Promise<void>,
): Promise<void> {
  await assertReplaceableFile(path);
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}-${process.pid}-${randomUUID()}.tmp`,
  );
  await rm(temporaryPath, { force: true, recursive: true });
  try {
    await createTemporary(temporaryPath);
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true, recursive: true });
  }
}

async function restoreStableLaunchers(
  snapshots: LauncherSnapshot[],
): Promise<void> {
  const errors: unknown[] = [];
  for (const snapshot of snapshots) {
    try {
      if (snapshot.kind === "absent") {
        await rm(snapshot.path, { force: true });
      } else if (snapshot.kind === "symlink") {
        await replaceLauncherAtomically(snapshot.path, async (temporaryPath) => {
          await symlink(snapshot.target, temporaryPath);
        });
      } else {
        await replaceLauncherAtomically(snapshot.path, async (temporaryPath) => {
          await writeFile(temporaryPath, snapshot.value, {
            mode: snapshot.mode & 0o777,
          });
        });
      }
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, "failed to restore stable launchers");
  }
}

function escapeCmdValue(value: string): string {
  if (/[\r\n"]/.test(value)) {
    throw new Error(`Windows launcher path contains unsupported characters: ${value}`);
  }
  return value.replaceAll("%", "%%");
}

export function renderWindowsStableServerLauncher(
  installRoot: string,
  name: "open-design" | "od",
): string {
  const root = escapeCmdValue(installRoot);
  return [
    "@echo off",
    "setlocal EnableExtensions DisableDelayedExpansion",
    `set "OD_INSTALL_ROOT=${root}"`,
    'set /p "OD_RELEASE_ID="<"%OD_INSTALL_ROOT%\\current"',
    `"%OD_INSTALL_ROOT%\\releases\\%OD_RELEASE_ID%\\bin\\${name}.cmd" %*`,
    "",
  ].join("\r\n");
}

async function installStableLaunchers(
  installRoot: string,
  binDir: string,
  platform: ServerPlatform,
): Promise<void> {
  await mkdir(binDir, { recursive: true });
  if (platform === "win32") {
    for (const name of ["open-design", "od"] as const) {
      const launcherPath = join(binDir, `${name}.cmd`);
      await replaceLauncherAtomically(launcherPath, async (temporaryPath) => {
        await writeFile(
          temporaryPath,
          renderWindowsStableServerLauncher(installRoot, name),
          "utf8",
        );
      });
    }
    return;
  }

  for (const name of ["open-design", "od"]) {
    const launcherPath = join(binDir, name);
    await replaceLauncherAtomically(launcherPath, async (temporaryPath) => {
      await symlink(
        join(installRoot, "current", "bin", name),
        temporaryPath,
      );
    });
  }
}

export async function installServerPayload(
  options: InstallServerPayloadOptions,
  hooks: InstallServerPayloadHooks = {},
): Promise<InstallServerPayloadResult> {
  if (!/^[0-9a-f]{64}$/i.test(options.archiveSha256)) {
    throw new Error("archive sha256 must be exactly 64 hexadecimal characters");
  }
  const installRoot = resolve(options.installRoot);
  const binDir = resolve(options.binDir);
  const payloadRoot = resolve(options.payloadRoot);
  const nodeBin = resolve(options.nodeBin);
  const installLockTimeoutMs =
    options.installLockTimeoutMs ?? SERVER_INSTALL_LOCK_TIMEOUT_MS;
  const smokeTimeoutMs =
    options.smokeTimeoutMs ?? SERVER_SMOKE_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(installLockTimeoutMs) ||
    installLockTimeoutMs <= 0
  ) {
    throw new Error("install lock timeout must be a positive integer");
  }
  if (!Number.isSafeInteger(smokeTimeoutMs) || smokeTimeoutMs <= 0) {
    throw new Error("server smoke timeout must be a positive integer");
  }
  await assertNode24(nodeBin, smokeTimeoutMs);

  const sourceReleaseRoot = await findPayloadRelease(payloadRoot);
  const manifest = await verifyServerRelease(sourceReleaseRoot);
  assertManifestRuntime(manifest, sourceReleaseRoot);
  await smokeRelease(
    sourceReleaseRoot,
    installRoot,
    nodeBin,
    manifest,
    smokeTimeoutMs,
  );

  return withServerInstallLocks(
    installRoot,
    binDir,
    installLockTimeoutMs,
    async () => {
      await mkdir(join(installRoot, "releases"), { recursive: true });
      const previousReleaseId = await currentReleaseId(
        installRoot,
        manifest.target.platform,
      );
      const destination = join(installRoot, "releases", manifest.releaseId);
      const published = await publishRelease(
        sourceReleaseRoot,
        destination,
        manifest,
        hooks,
      );
      const pointerChanged = previousReleaseId !== manifest.releaseId;
      const launcherSnapshots = await captureStableLaunchers(
        binDir,
        manifest.target.platform,
      );

      let currentCommitted = false;
      try {
        await installStableLaunchers(
          installRoot,
          binDir,
          manifest.target.platform,
        );
        if (pointerChanged) {
          await replaceCurrentPointer(
            installRoot,
            manifest.releaseId,
            manifest.target.platform,
          );
          currentCommitted = true;
        }
        await smokeStableLauncher(
          destination,
          installRoot,
          binDir,
          nodeBin,
          manifest,
          smokeTimeoutMs,
        );
      } catch (error) {
        const rollbackErrors: unknown[] = [];
        if (currentCommitted) {
          try {
            await compareAndSwapCurrentPointer(
              installRoot,
              manifest.releaseId,
              previousReleaseId,
              manifest.target.platform,
            );
          } catch (rollbackError) {
            rollbackErrors.push(rollbackError);
          }
        }
        try {
          await restoreStableLaunchers(launcherSnapshots);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
        if (rollbackErrors.length > 0) {
          throw new AggregateError(
            [error, ...rollbackErrors],
            "server install failed and rollback was incomplete",
          );
        }
        throw error;
      }

      return {
        archiveSha256: options.archiveSha256.toLowerCase(),
        changed: published || pointerChanged,
        installRoot,
        previousReleaseId,
        releaseId: manifest.releaseId,
      };
    },
  );
}

function parseCliArgs(argv: string[]): InstallServerPayloadOptions {
  if (argv[0] !== "install") {
    throw new Error("usage: install-core.mjs install --payload-root <path> --install-root <path> --bin-dir <path> --archive-sha256 <sha256> --node-bin <path> [--smoke-timeout-ms <milliseconds>]");
  }
  const values = new Map<string, string>();
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag?.startsWith("--")) throw new Error(`unexpected installer argument: ${String(flag)}`);
    const value = argv[index + 1];
    if (value == null || value.startsWith("--")) {
      throw new Error(`installer argument requires a value: ${flag}`);
    }
    values.set(flag, value);
    index += 1;
  }
  const read = (flag: string): string => {
    const value = values.get(flag);
    if (value == null || value.length === 0) {
      throw new Error(`missing installer argument: ${flag}`);
    }
    return value;
  };
  const smokeTimeout = values.get("--smoke-timeout-ms");
  return {
    archiveSha256: read("--archive-sha256"),
    binDir: read("--bin-dir"),
    installRoot: read("--install-root"),
    nodeBin: read("--node-bin"),
    payloadRoot: read("--payload-root"),
    ...(smokeTimeout == null
      ? {}
      : { smokeTimeoutMs: Number(smokeTimeout) }),
  };
}

async function runCli(): Promise<void> {
  const result = await installServerPayload(parseCliArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export function isInstallServerCliEntrypoint(
  moduleUrl: string,
  argvPath: string | undefined,
): boolean {
  if (argvPath == null) return false;
  try {
    return (
      canonicalizePathIdentity(fileURLToPath(moduleUrl)) ===
      canonicalizePathIdentity(resolve(argvPath))
    );
  } catch {
    // Paths may not exist yet (or are not resolvable). Fall back to a
    // platform-aware string compare so Windows drive-letter / separator
    // aliases still match import.meta.url against process.argv[1].
    try {
      const left = resolve(fileURLToPath(moduleUrl));
      const right = resolve(argvPath);
      return process.platform === "win32"
        ? left.replaceAll("\\", "/").toLowerCase() ===
            right.replaceAll("\\", "/").toLowerCase()
        : left === right;
    } catch {
      return false;
    }
  }
}

if (isInstallServerCliEntrypoint(import.meta.url, process.argv[1])) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
