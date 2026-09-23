import { access, lstat, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function toPosixPath(value: string): string {
  return value.replaceAll("\\", "/");
}

export async function sizePathBytes(
  path: string,
  options: { includeFile?: (path: string) => boolean } = {},
): Promise<number> {
  const metadata = await lstat(path).catch(() => null);
  if (metadata == null) return 0;
  if (!metadata.isDirectory()) {
    return options.includeFile == null || options.includeFile(toPosixPath(path)) ? metadata.size : 0;
  }

  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
  let total = 0;
  for (const entry of entries) {
    total += await sizePathBytes(join(path, entry.name), options);
  }
  return total;
}

export async function sizeExistingFileBytes(path: string): Promise<number | null> {
  const metadata = await stat(path).catch(() => null);
  return metadata == null ? null : metadata.size;
}

export async function sumChildDirectorySizes(path: string, includeChild: (name: string) => boolean): Promise<number> {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
  let total = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !includeChild(entry.name)) continue;
    total += await sizePathBytes(join(path, entry.name));
  }
  return total;
}

export async function removeTree(filePath: string): Promise<void> {
  await rm(filePath, { force: true, maxRetries: 20, recursive: true, retryDelay: 250 });
}

export async function listDirectories(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}
