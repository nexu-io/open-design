/**
 * @module json-file
 *
 * Small JSON file helpers for sidecar runtime state: a forgiving reader (null on
 * any failure), an atomic pretty-printed writer via temp-file rename, a
 * best-effort remove, and a guarded pointer removal that only deletes when the
 * pointer still names the given run. Depends on `node:fs/promises` and
 * `node:path`.
 */

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Read and parse a JSON file, swallowing any read/parse error.
 * @returns The parsed value, or `null` if missing or unreadable.
 */
export async function readJsonFile<T = any>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Atomically write `payload` as pretty-printed JSON via a temp-file rename,
 * creating the parent directory if needed.
 */
export async function writeJsonFile(filePath: string, payload: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tmpPath, filePath);
}

/**
 * Remove a file, forcing (no error if absent).
 */
export async function removeFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

/**
 * Remove a pointer file only if it still points at `runId`.
 */
export async function removePointerIfCurrent(pointerPath: string, runId: string): Promise<void> {
  const pointer = await readJsonFile<{ runId?: string }>(pointerPath);
  if (pointer?.runId === runId) await removeFile(pointerPath);
}
