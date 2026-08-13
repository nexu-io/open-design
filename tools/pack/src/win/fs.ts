import { lstat, readdir, rm } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

import { toPosixPath } from "../lib/fs.js";

export {
  pathExists,
  sizeExistingFileBytes,
  sizePathBytes,
  sumChildDirectorySizes,
  toPosixPath,
} from "../lib/fs.js";

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
