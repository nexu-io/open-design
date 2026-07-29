/**
 * @module store
 *
 * Managed-download root ownership and directory lifecycle. Reads/writes the
 * ownership sentinel that marks a base directory as Open Design-owned, refuses to
 * take over foreign/non-empty directories, ensures the `.state`/`.partial`/`.locks`
 * scratch layout exists, and resets an owned base by clearing its contents.
 * Depends on constants, errors, and the fs-io primitives.
 */

import { lstat, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { LOCK_DIR, PARTIAL_DIR, STATE_DIR, STORE_KIND, STORE_SCHEMA_VERSION, STORE_SENTINEL } from "./constants.js";
import { MANAGED_DOWNLOAD_ERROR_CODES, ManagedDownloadError } from "./errors.js";
import { directoryIsEmpty, readJson, writeJson } from "./fs-io.js";

/**
 * @internal On-disk ownership marker written at the root of a managed base.
 */
type StoreSentinel = {
  createdAt: string;
  kind: typeof STORE_KIND;
  schemaVersion: typeof STORE_SCHEMA_VERSION;
};

/**
 * @internal Type guard for a well-formed ownership sentinel.
 */
function isStoreSentinel(value: unknown): value is StoreSentinel {
  if (typeof value !== "object" || value == null || Array.isArray(value)) return false;
  const record = value as Partial<StoreSentinel>;
  return record.kind === STORE_KIND && record.schemaVersion === STORE_SCHEMA_VERSION && typeof record.createdAt === "string";
}

/**
 * @internal Write a fresh ownership sentinel at the base root.
 */
async function writeSentinel(basePath: string): Promise<void> {
  await writeJson(join(basePath, STORE_SENTINEL), {
    createdAt: new Date().toISOString(),
    kind: STORE_KIND,
    schemaVersion: STORE_SCHEMA_VERSION,
  } satisfies StoreSentinel);
}

/**
 * Clear all contents of an owned base and re-establish the sentinel and scratch
 * directories. Refuses to touch a base that is not owned.
 */
export async function resetOwnedBase(basePath: string): Promise<void> {
  const sentinel = await readJson<unknown>(join(basePath, STORE_SENTINEL));
  if (!isStoreSentinel(sentinel)) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.STORE_NOT_OWNED, `download base is not owned: ${basePath}`);
  }
  const entries = await readdir(basePath).catch(() => []);
  for (const entry of entries) {
    await rm(join(basePath, entry), { force: true, recursive: true }).catch(() => undefined);
  }
  await writeSentinel(basePath);
  await ensureStoreDirs(basePath);
}

/**
 * @internal Ensure the `.state`/`.partial`/`.locks` scratch directories exist.
 */
async function ensureStoreDirs(basePath: string): Promise<void> {
  await mkdir(join(basePath, STATE_DIR), { recursive: true });
  await mkdir(join(basePath, PARTIAL_DIR), { recursive: true });
  await mkdir(join(basePath, LOCK_DIR), { recursive: true });
}

/**
 * Ensure `basePath` is an Open Design-owned managed base: create it if missing,
 * claim an empty unmarked directory, reject foreign/non-empty or invalid-marker
 * directories, and guarantee the scratch layout exists.
 */
export async function ensureManagedBase(basePath: string): Promise<void> {
  await mkdir(basePath, { recursive: true });
  const entry = await lstat(basePath);
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.STORE_NOT_OWNED, `download base is not an owned directory: ${basePath}`);
  }
  const sentinelPath = join(basePath, STORE_SENTINEL);
  const sentinel = await readJson<unknown>(sentinelPath);
  if (sentinel == null) {
    if (!(await directoryIsEmpty(basePath))) {
      throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.STORE_NOT_OWNED, `download base is not empty and has no ownership marker: ${basePath}`);
    }
    await writeSentinel(basePath);
  } else if (!isStoreSentinel(sentinel)) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.STORE_NOT_OWNED, `download base has an invalid ownership marker: ${basePath}`);
  }
  await ensureStoreDirs(basePath);
}
