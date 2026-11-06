import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, stat, unlink, type FileHandle } from "node:fs/promises";
import { join } from "node:path";

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

export type StandaloneMaintenanceLeaseOptions = Readonly<{
  heartbeatIntervalMs?: number;
  leaseDurationMs?: number;
}>;

export async function withStandaloneMaintenanceLock<T>(
  root: string,
  operation: () => Promise<T>,
  options: StandaloneMaintenanceLeaseOptions = {},
): Promise<T> {
  const lockRoot = join(root, "locks");
  const lockPath = join(lockRoot, "maintenance.lock");
  const leaseDurationMs = options.leaseDurationMs ?? 120_000;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? Math.max(1_000, Math.floor(leaseDurationMs / 4));
  if (!Number.isInteger(leaseDurationMs) || leaseDurationMs < 100 || !Number.isInteger(heartbeatIntervalMs) || heartbeatIntervalMs < 20 || heartbeatIntervalMs * 2 >= leaseDurationMs) {
    throw new Error("invalid Standalone maintenance lease timing");
  }
  await mkdir(lockRoot, { recursive: true });
  const owner = `${JSON.stringify({ pid: process.pid, token: randomUUID() })}\n`;
  let handle: FileHandle | undefined;
  for (let attempt = 0; attempt < 500; attempt += 1) {
    try {
      handle = await open(lockPath, "wx");
      await handle.writeFile(owner);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const info = await stat(lockPath).catch(() => null);
      if (info != null && Date.now() - info.mtimeMs > leaseDurationMs) {
        const observedOwner = await readFile(lockPath, "utf8").catch(() => null);
        await delay(Math.min(heartbeatIntervalMs, 50));
        const refreshed = await stat(lockPath).catch(() => null);
        const currentOwner = await readFile(lockPath, "utf8").catch(() => null);
        if (refreshed != null && Date.now() - refreshed.mtimeMs > leaseDurationMs && currentOwner === observedOwner) {
          await unlink(lockPath).catch(() => undefined);
        }
        continue;
      }
      await delay(20);
    }
  }
  if (handle == null) throw new Error("Standalone maintenance transaction timed out");
  const heartbeat = setInterval(() => {
    const now = new Date();
    void handle?.utimes(now, now).catch(() => undefined);
  }, heartbeatIntervalMs);
  heartbeat.unref();
  try {
    return await operation();
  } finally {
    clearInterval(heartbeat);
    await handle.close();
    const current = await readFile(lockPath, "utf8").catch(() => null);
    if (current === owner) await unlink(lockPath).catch(() => undefined);
  }
}
