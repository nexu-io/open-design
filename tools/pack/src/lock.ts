import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const LOCK_POLL_MS = 100;
const LOCK_TIMEOUT_MS = 30 * 60 * 1000;
const LOCK_OWNER_GRACE_MS = 5 * 1000;

type LockOwner = {
  pid?: unknown;
  startedAt?: unknown;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readLockOwner(lockPath: string): Promise<{ raw: string | null; parsed: LockOwner | null }> {
  const raw = await readFile(join(lockPath, "owner.json"), "utf8").catch(() => null);
  if (raw == null) return { raw: null, parsed: null };
  try {
    return { raw, parsed: JSON.parse(raw) as LockOwner };
  } catch {
    return { raw, parsed: null };
  }
}

function normalizeOwnerPid(owner: LockOwner | null): number | null {
  if (typeof owner?.pid !== "number") return null;
  if (!Number.isInteger(owner.pid) || owner.pid <= 0) return null;
  return owner.pid;
}

function defaultProcessExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true;
    return true;
  }
}

async function lockDirectoryAgeMs(lockPath: string): Promise<number | null> {
  try {
    const metadata = await stat(lockPath);
    return Math.max(0, Date.now() - metadata.mtimeMs);
  } catch {
    return null;
  }
}

async function lockIsRecoverable(
  lockPath: string,
  ownerGraceMs: number,
  processExists: (pid: number) => boolean,
): Promise<boolean> {
  const { parsed } = await readLockOwner(lockPath);
  const ownerPid = normalizeOwnerPid(parsed);
  if (ownerPid != null) return !processExists(ownerPid);
  const ageMs = await lockDirectoryAgeMs(lockPath);
  return ageMs != null && ageMs > ownerGraceMs;
}

export async function withDirectoryLock<T>(
  lockRoot: string,
  lockName: string,
  callback: () => Promise<T>,
  options: {
    ownerGraceMs?: number;
    pollMs?: number;
    processExists?: (pid: number) => boolean;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  await mkdir(lockRoot, { recursive: true });
  const lockPath = join(lockRoot, `${lockName}.lock`);
  const startedAt = Date.now();
  const ownerGraceMs = options.ownerGraceMs ?? LOCK_OWNER_GRACE_MS;
  const pollMs = options.pollMs ?? LOCK_POLL_MS;
  const processExists = options.processExists ?? defaultProcessExists;
  const timeoutMs = options.timeoutMs ?? LOCK_TIMEOUT_MS;

  while (true) {
    try {
      await mkdir(lockPath);
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
      if (await lockIsRecoverable(lockPath, ownerGraceMs, processExists)) {
        await rm(lockPath, { force: true, recursive: true }).catch(() => undefined);
        continue;
      }
      if (Date.now() - startedAt > timeoutMs) {
        const owner = await readFile(join(lockPath, "owner.json"), "utf8").catch(() => null);
        throw new Error(`timed out waiting for lock ${lockPath}${owner == null ? "" : ` owned by ${owner}`}`);
      }
      await sleep(pollMs);
    }
  }

  try {
    await writeFile(
      join(lockPath, "owner.json"),
      `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2)}\n`,
      "utf8",
    );
    return await callback();
  } finally {
    await rm(lockPath, { force: true, recursive: true });
  }
}
