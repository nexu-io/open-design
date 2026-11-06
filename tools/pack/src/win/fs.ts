import { access, lstat, readdir, rm, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

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

function normalizeAbsolutePath(path: string): string {
  return resolve(path);
}

function isWithinPath(parent: string, child: string): boolean {
  const relativePath = relative(parent, child);
  return relativePath.length === 0 || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

export class PathSizeIndex {
  readonly #childDirectoriesByPath = new Map<string, string[]>();
  readonly #fileEntries: Array<{ bytes: number; path: string; posixPath: string }> = [];
  readonly #sizeByPath = new Map<string, number>();

  private constructor(readonly root: string) {}

  static async create(root: string): Promise<PathSizeIndex> {
    const index = new PathSizeIndex(normalizeAbsolutePath(root));
    await index.#visit(index.root);
    return index;
  }

  async #visit(path: string): Promise<number> {
    const normalizedPath = normalizeAbsolutePath(path);
    const metadata = await lstat(normalizedPath).catch(() => null);
    if (metadata == null) {
      this.#sizeByPath.set(normalizedPath, 0);
      return 0;
    }

    if (!metadata.isDirectory()) {
      this.#sizeByPath.set(normalizedPath, metadata.size);
      this.#fileEntries.push({ bytes: metadata.size, path: normalizedPath, posixPath: toPosixPath(normalizedPath) });
      return metadata.size;
    }

    const entries = await readdir(normalizedPath, { withFileTypes: true }).catch(() => []);
    const childDirectories: string[] = [];
    const childSizes = await Promise.all(
      entries.map(async (entry) => {
        const childPath = join(normalizedPath, entry.name);
        if (entry.isDirectory()) childDirectories.push(normalizeAbsolutePath(childPath));
        return await this.#visit(childPath);
      }),
    );
    const total = childSizes.reduce((sum, childSize) => sum + childSize, 0);
    this.#childDirectoriesByPath.set(normalizedPath, childDirectories);
    this.#sizeByPath.set(normalizedPath, total);
    return total;
  }

  sizePathBytes(path: string, options: { includeFile?: (path: string) => boolean } = {}): number {
    const normalizedPath = normalizeAbsolutePath(path);
    if (options.includeFile == null) return this.#sizeByPath.get(normalizedPath) ?? 0;

    let total = 0;
    for (const entry of this.#fileEntries) {
      if (isWithinPath(normalizedPath, entry.path) && options.includeFile(entry.posixPath)) total += entry.bytes;
    }
    return total;
  }

  sumChildDirectorySizes(path: string, includeChild: (name: string) => boolean): number {
    const normalizedPath = normalizeAbsolutePath(path);
    const childDirectories = this.#childDirectoriesByPath.get(normalizedPath) ?? [];
    let total = 0;
    for (const childPath of childDirectories) {
      if (includeChild(basename(childPath))) total += this.#sizeByPath.get(childPath) ?? 0;
    }
    return total;
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
