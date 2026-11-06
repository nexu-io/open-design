/**
 * @module fs-io
 *
 * Low-level filesystem primitives shared across the module: existence/emptiness
 * probes, atomic JSON read/write, file-size stat, and streaming file hashing.
 * These are the module's foundation helpers — they depend only on Node built-ins
 * and are imported by the store, manifest, lock, transfer, and run concerns.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";

/**
 * Resolve whether `path` is accessible.
 * @returns `true` if the path exists and is accessible, `false` otherwise.
 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read and parse a JSON file, swallowing any read/parse error.
 * @returns The parsed value, or `null` if the file is missing or unreadable.
 */
export async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Atomically write `payload` as pretty-printed JSON via a temp-file rename,
 * creating the parent directory if needed.
 */
export async function writeJson(path: string, payload: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now().toString(36)}.tmp`;
  await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

/**
 * Determine whether a directory has no entries.
 * @returns `true` if the directory is empty.
 */
export async function directoryIsEmpty(path: string): Promise<boolean> {
  const entries = await readdir(path);
  return entries.length === 0;
}

/**
 * Stream-hash a file with the given algorithm.
 * @returns The lowercase hex digest of the file contents.
 */
export async function hashFile(path: string, algorithm: "sha256" | "sha512"): Promise<string> {
  const hash = createHash(algorithm);
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

/**
 * Stat a path and return its byte size if it is a regular file.
 * @returns The file size in bytes, or `null` if missing or not a regular file.
 */
export async function statFileSize(path: string): Promise<number | null> {
  try {
    const entry = await stat(path);
    return entry.isFile() ? entry.size : null;
  } catch {
    return null;
  }
}
