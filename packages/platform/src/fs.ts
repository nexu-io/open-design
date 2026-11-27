/**
 * @module fs
 *
 * Filesystem primitives: containment checks, atomic (temp-then-rename) file
 * copies, best-effort recursive removal, and bounded log-tail reads. All pure
 * filesystem operations with no process, command, or proxy concerns.
 *
 * Keeps private `errorCode` / `errorMessage` copies so it owns no cross-module
 * runtime surface.
 */
import { copyFile, mkdir, open, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

/** @internal Extract a Node `error.code` as a string, or `null` when the value carries no code. */
function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error == null || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return code == null ? null : String(code);
}

/** @internal Extract a human-readable message from an unknown thrown value. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type AtomicCopyFileOptions = {
  overwrite?: boolean;
};

export type AtomicCopyFileResult = {
  bytesCopied: number;
  replaced: boolean;
};

export type RemovePathBestEffortOptions = {
  recursive?: boolean;
};

export type RemovePathBestEffortResult = {
  error?: string;
  removed: boolean;
};

/**
 * Test whether `target` is contained within `root` (or equal to it) after path
 * resolution, guarding against `..` escapes and absolute-path breakouts.
 *
 * @param root - The containing directory.
 * @param target - The path to test for containment.
 * @returns `true` when `target` resolves to `root` or a descendant of it.
 */
export function pathContains(root: string, target: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  const rel = relative(resolvedRoot, resolvedTarget);
  return rel === "" || (rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel));
}

/** @internal Build an `EEXIST` error for a destination that already exists when overwrite is not allowed. */
function destinationExistsError(destinationPath: string): NodeJS.ErrnoException {
  const error = new Error(`destination already exists: ${destinationPath}`) as NodeJS.ErrnoException;
  error.code = "EEXIST";
  return error;
}

/**
 * Copy a file atomically by writing to a unique temp file in the destination
 * directory and renaming it into place, creating parent directories as needed.
 * Refuses to clobber an existing destination unless `overwrite` is set; a same-
 * path copy is a no-op that reports the existing size.
 *
 * @param sourcePath - The file to copy from.
 * @param destinationPath - The path to copy to.
 * @param options - `overwrite` to replace an existing destination (default false).
 * @returns The bytes copied and whether an existing file was replaced.
 * @throws `EEXIST` when the destination exists and `overwrite` is not set.
 */
export async function atomicCopyFile(
  sourcePath: string,
  destinationPath: string,
  options: AtomicCopyFileOptions = {},
): Promise<AtomicCopyFileResult> {
  const source = resolve(sourcePath);
  const destination = resolve(destinationPath);
  if (source === destination) {
    const entry = await stat(destination);
    if (!entry.isFile()) throw new Error(`destination is not a file: ${destination}`);
    return { bytesCopied: entry.size, replaced: true };
  }

  const destinationDir = dirname(destination);
  await mkdir(destinationDir, { recursive: true });
  const existing = await stat(destination).catch((error: unknown) => {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  });
  if (existing != null && options.overwrite !== true) {
    throw destinationExistsError(destination);
  }

  const tempPath = join(
    destinationDir,
    `.${basename(destination)}.${process.pid}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}.tmp`,
  );
  try {
    await copyFile(source, tempPath);
    if (options.overwrite === true) {
      await rm(destination, { force: true });
    }
    await rename(tempPath, destination);
    const copied = await stat(destination);
    return { bytesCopied: copied.size, replaced: existing != null };
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

/**
 * Remove a path (recursively by default) without throwing, reporting success or
 * the failure message instead.
 *
 * @param path - The path to remove.
 * @param options - `recursive` to remove directory trees (default true).
 * @returns `{ removed: true }` on success, or `{ removed: false, error }` on failure.
 */
export async function removePathBestEffort(
  path: string,
  options: RemovePathBestEffortOptions = {},
): Promise<RemovePathBestEffortResult> {
  try {
    await rm(path, { force: true, recursive: options.recursive ?? true });
    return { removed: true };
  } catch (error) {
    return { error: errorMessage(error), removed: false };
  }
}

/**
 * Read the last `maxLines` non-empty lines of a text file, returning an empty
 * array when the file is missing or unreadable. Scan from the end so earlier
 * log history does not need to be loaded into memory.
 *
 * @param filePath - The file to read.
 * @param maxLines - The maximum number of trailing lines to return (default 80).
 * Non-positive or non-finite limits return no lines.
 * @returns The trailing non-empty lines (empty array on error).
 */
export async function readLogTail(filePath: string, maxLines = 80): Promise<string[]> {
  const limit = Math.trunc(maxLines);
  if (!Number.isFinite(limit) || limit <= 0) return [];
  try {
    const file = await open(filePath, "r");
    try {
      let position = (await file.stat()).size;
      const chunks: Buffer[] = [];
      let lines = 0;
      let hasContent = false;
      let skipCarriageReturn = false;
      while (position > 0 && lines < limit) {
        const length = Math.min(64 * 1024, position);
        position -= length;
        const buffer = Buffer.allocUnsafe(length);
        const { bytesRead } = await file.read(buffer, 0, length, position);
        if (bytesRead === 0) break;
        let start = 0;
        for (let index = bytesRead - 1; index >= 0; index -= 1) {
          const byte = buffer[index];
          if (byte === 0x0a) {
            if (hasContent) lines += 1;
            if (lines === limit) {
              start = index + 1;
              break;
            }
            hasContent = false;
            skipCarriageReturn = true;
          } else {
            if (!skipCarriageReturn || byte !== 0x0d) hasContent = true;
            skipCarriageReturn = false;
          }
        }
        chunks.push(buffer.subarray(start, bytesRead));
      }
      // Decode only after joining chunks so a UTF-8 character split between
      // reads is preserved. The selected tail begins at a newline or byte zero.
      const payload = Buffer.concat(chunks.reverse()).toString("utf8");
      return payload.split(/\r?\n/).filter((line) => line.length > 0).slice(-limit);
    } finally {
      await file.close();
    }
  } catch {
    return [];
  }
}
