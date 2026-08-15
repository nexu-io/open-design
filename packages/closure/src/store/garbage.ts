import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

import { isProcessAlive } from "@open-design/platform";

import {
  CLOSURE_STORE_EPOCH,
  ClosureStoreError,
  assertUnderRoot,
  sameRuntimeBinding,
  type ClosureStorePaths,
} from "./binding.js";
import { readClosureBindingDescriptor } from "./legacy-candidate.js";

export const CLOSURE_GARBAGE_CLEANUP_MAX_ENTRIES = 16 as const;
export const CLOSURE_GARBAGE_CLEANUP_MAX_DURATION_MS = 250 as const;

export type ClosureGarbageCleanupResult = Readonly<{
  attempted: number;
  busy: boolean;
  durationMs: number;
  remaining: number;
  removed: number;
}>;

export type ClosureObsoleteEpochDiscardResult = Readonly<{
  discarded: number;
  state: "deferred" | "discarded";
}>;

type CleanupLockRecord = Readonly<{
  createdAt: string;
  pid: number;
  token: string;
}>;

function errorCode(error: unknown): string | null {
  if (error == null || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return code == null ? null : String(code);
}

function strictChannelChild(paths: ClosureStorePaths, input: string): string {
  const source = assertUnderRoot(paths.channelRoot, input);
  const child = relative(paths.channelRoot, source);
  if (child.length === 0 || child.startsWith("..")) {
    throw new ClosureStoreError("Closure garbage source must be a channel child");
  }
  const garbageRelative = relative(paths.garbageRoot, source);
  if (
    garbageRelative === ""
    || (
      garbageRelative !== ".."
      && !garbageRelative.startsWith(`..${sep}`)
      && !isAbsolute(garbageRelative)
    )
  ) {
    throw new ClosureStoreError("Closure garbage source is already inside the channel garbage root");
  }
  return source;
}

/** Transfer one caller-owned Store entry into the opaque channel black hole. */
export async function discardClosureStoreEntry(input: Readonly<{
  paths: ClosureStorePaths;
  sourcePath: string;
}>): Promise<Readonly<{ garbagePath: string; state: "discarded" | "missing" }>> {
  const sourcePath = strictChannelChild(input.paths, input.sourcePath);
  await mkdir(input.paths.garbageRoot, { recursive: true });
  const garbagePath = assertUnderRoot(
    input.paths.garbageRoot,
    join(input.paths.garbageRoot, `${Date.now()}-${process.pid}-${randomUUID()}`),
  );
  try {
    await rename(sourcePath, garbagePath);
    return Object.freeze({ garbagePath, state: "discarded" });
  } catch (error) {
    if (errorCode(error) === "ENOENT") return Object.freeze({ garbagePath, state: "missing" });
    throw error;
  }
}

/** Discard this namespace's obsolete epochs only after its current binding is confirmed. */
export async function discardObsoleteClosureNamespaceEpochs(
  paths: ClosureStorePaths,
): Promise<ClosureObsoleteEpochDiscardResult> {
  const descriptor = await readClosureBindingDescriptor(paths);
  if (
    descriptor.active == null
    || descriptor.lastSuccessful == null
    || !sameRuntimeBinding(descriptor.active, descriptor.lastSuccessful)
    || descriptor.attempt != null
    || descriptor.prepared != null
    || descriptor.activationIntent != null
  ) {
    return Object.freeze({ discarded: 0, state: "deferred" });
  }

  const epochsRoot = assertUnderRoot(paths.channelRoot, join(paths.channelRoot, "epochs"));
  const entries = await readdir(epochsRoot, { withFileTypes: true }).catch(() => []);
  let discarded = 0;
  for (const entry of entries) {
    if (
      !entry.isDirectory()
      || entry.isSymbolicLink()
      || entry.name === String(CLOSURE_STORE_EPOCH)
    ) continue;
    const sourcePath = assertUnderRoot(
      paths.channelRoot,
      join(epochsRoot, entry.name, "namespaces", paths.namespace),
    );
    const result = await discardClosureStoreEntry({ paths, sourcePath });
    if (result.state === "discarded") discarded += 1;
  }
  return Object.freeze({ discarded, state: "discarded" });
}

function cleanupLockPath(paths: ClosureStorePaths): string {
  return assertUnderRoot(paths.channelRoot, join(paths.channelRoot, "garbage-cleanup.lock"));
}

function isCleanupLockRecord(value: unknown): value is CleanupLockRecord {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<CleanupLockRecord>;
  return typeof record.createdAt === "string"
    && !Number.isNaN(Date.parse(record.createdAt))
    && typeof record.pid === "number"
    && Number.isSafeInteger(record.pid)
    && record.pid > 0
    && typeof record.token === "string"
    && record.token.length > 0;
}

async function readCleanupLock(path: string): Promise<CleanupLockRecord | null> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    return isCleanupLockRecord(value) ? value : null;
  } catch {
    return null;
  }
}

async function acquireCleanupLock(paths: ClosureStorePaths): Promise<CleanupLockRecord | null> {
  const path = cleanupLockPath(paths);
  await mkdir(paths.channelRoot, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const record = Object.freeze({
      createdAt: new Date().toISOString(),
      pid: process.pid,
      token: randomUUID(),
    });
    try {
      await writeFile(path, `${JSON.stringify(record)}\n`, { flag: "wx" });
      return record;
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      const existing = await readCleanupLock(path);
      if (attempt === 0 && (existing == null || !isProcessAlive(existing.pid))) {
        await rm(path, { force: true }).catch(() => undefined);
        continue;
      }
      return null;
    }
  }
  return null;
}

async function releaseCleanupLock(paths: ClosureStorePaths, lock: CleanupLockRecord): Promise<void> {
  const path = cleanupLockPath(paths);
  const current = await readCleanupLock(path);
  if (current?.token === lock.token) await rm(path, { force: true }).catch(() => undefined);
}

/** Best-effort, structure-agnostic draining of opaque channel garbage entries. */
export async function cleanupClosureChannelGarbage(input: Readonly<{
  maxDurationMs?: number;
  maxEntries?: number;
  paths: ClosureStorePaths;
}>): Promise<ClosureGarbageCleanupResult> {
  const startedAt = Date.now();
  const maxDurationMs = input.maxDurationMs ?? CLOSURE_GARBAGE_CLEANUP_MAX_DURATION_MS;
  const maxEntries = input.maxEntries ?? CLOSURE_GARBAGE_CLEANUP_MAX_ENTRIES;
  if (!Number.isSafeInteger(maxDurationMs) || maxDurationMs < 0) {
    throw new ClosureStoreError("Closure garbage cleanup maxDurationMs must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 0) {
    throw new ClosureStoreError("Closure garbage cleanup maxEntries must be a non-negative safe integer");
  }
  const lock = await acquireCleanupLock(input.paths);
  if (lock == null) {
    return Object.freeze({ attempted: 0, busy: true, durationMs: Date.now() - startedAt, remaining: 0, removed: 0 });
  }
  let attempted = 0;
  let removed = 0;
  try {
    const entries = await readdir(input.paths.garbageRoot).catch(() => []);
    for (const name of entries) {
      if (attempted >= maxEntries || Date.now() - startedAt >= maxDurationMs) break;
      attempted += 1;
      const path = assertUnderRoot(input.paths.garbageRoot, join(input.paths.garbageRoot, name));
      try {
        await rm(path, { force: true, recursive: true });
        removed += 1;
      } catch {
        // The black hole keeps failed entries for a future best-effort pass.
      }
    }
    const remaining = await readdir(input.paths.garbageRoot).then((value) => value.length, () => 0);
    return Object.freeze({
      attempted,
      busy: false,
      durationMs: Date.now() - startedAt,
      remaining,
      removed,
    });
  } finally {
    await releaseCleanupLock(input.paths, lock);
  }
}
