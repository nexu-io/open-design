import { execFile } from "node:child_process";
import { access, lstat, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function toPosixPath(value: string): string {
  return value.replaceAll("\\", "/");
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function sizePathBytes(
  path: string,
  options: { includeFile?: (path: string) => boolean } = {},
): Promise<number> {
  let metadata: Awaited<ReturnType<typeof lstat>>;
  try {
    metadata = await lstat(path);
  } catch {
    return 0;
  }

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
  try {
    const metadata = await stat(path);
    return metadata.size;
  } catch {
    return null;
  }
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


export async function clearQuarantine(path: string): Promise<void> {
  try {
    await execFileAsync("xattr", ["-dr", "com.apple.quarantine", path]);
  } catch {
    // Ignore when the attribute is absent or unsupported for local unsigned artifacts.
  }
}
