import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { isProcessAlive } from "@open-design/platform";

import { assertUnderRoot, type ClosureStorePaths } from "./binding.js";

export const INCOMPLETE_CLOSURE_CHANNEL_LOCK_GRACE_MS = 30_000;

export type ClosureChannelLock = Readonly<{
  path: string;
  token: string;
}>;

type ClosureChannelLockRecord = Readonly<{
  createdAt: string;
  pid: number;
  token: string;
}>;

function errorCode(error: unknown): string | null {
  if (error == null || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return code == null ? null : String(code);
}

function lockPath(paths: ClosureStorePaths): string {
  return assertUnderRoot(paths.channelRoot, join(paths.channelRoot, "maintenance.lock"));
}

function isLockRecord(value: unknown): value is ClosureChannelLockRecord {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<ClosureChannelLockRecord>;
  return typeof record.createdAt === "string"
    && !Number.isNaN(Date.parse(record.createdAt))
    && typeof record.pid === "number"
    && Number.isSafeInteger(record.pid)
    && record.pid > 0
    && typeof record.token === "string"
    && record.token.length > 0;
}

async function readLock(path: string): Promise<ClosureChannelLockRecord | null> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    return isLockRecord(value) ? value : null;
  } catch {
    return null;
  }
}

/** Serialize all mutations of channel-shared blobs and resource indices. */
export async function acquireClosureChannelLock(
  paths: ClosureStorePaths,
  options: Readonly<{ waitMs?: number }> = {},
): Promise<ClosureChannelLock | null> {
  const path = lockPath(paths);
  const waitMs = options.waitMs ?? 0;
  const deadline = Date.now() + waitMs;
  if (!Number.isSafeInteger(waitMs) || waitMs < 0) {
    throw new TypeError("Closure channel lock waitMs must be a non-negative safe integer");
  }
  await mkdir(paths.channelRoot, { recursive: true });
  let recovered = false;
  while (true) {
    const record: ClosureChannelLockRecord = Object.freeze({
      createdAt: new Date().toISOString(),
      pid: process.pid,
      token: randomUUID(),
    });
    try {
      await writeFile(path, `${JSON.stringify(record)}\n`, { flag: "wx" });
      return Object.freeze({ path, token: record.token });
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      const existing = await readLock(path);
      const metadata = existing == null ? await stat(path).catch(() => null) : null;
      const incompleteIsStale = metadata != null
        && Date.now() - metadata.mtimeMs >= INCOMPLETE_CLOSURE_CHANNEL_LOCK_GRACE_MS;
      if (!recovered && ((existing == null && incompleteIsStale) || (existing != null && !isProcessAlive(existing.pid)))) {
        recovered = true;
        await rm(path, { force: true }).catch(() => undefined);
        continue;
      }
      if (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(25, deadline - Date.now())));
        continue;
      }
      return null;
    }
  }
}

export async function releaseClosureChannelLock(lock: ClosureChannelLock): Promise<void> {
  const current = await readLock(lock.path);
  if (current?.token === lock.token) await rm(lock.path, { force: true }).catch(() => undefined);
}

