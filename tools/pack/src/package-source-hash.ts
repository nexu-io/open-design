import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

function normalizeRelativePath(path: string): string {
  return path.split("\\").join("/");
}

async function readNormalizedFile(filePath: string): Promise<Buffer | string> {
  return await readFile(filePath);
}

export async function hashPackageSourcePath(path: string): Promise<string> {
  const hash = createHash("sha256");
  const ignoredDirectoryNames = new Set([".next", ".od", "dist", "node_modules", "out"]);

  async function visit(current: string, root: string): Promise<void> {
    const metadata = await lstat(current);
    const relativePath = normalizeRelativePath(relative(root, current));
    hash.update(relativePath);
    if (metadata.isSymbolicLink()) {
      hash.update("symlink");
      hash.update(await readlink(current));
      return;
    }
    if (!metadata.isDirectory()) {
      hash.update("file");
      hash.update(await readNormalizedFile(current));
      return;
    }
    hash.update("dir");
    const entries = (await readdir(current)).sort();
    for (const entry of entries) {
      if (ignoredDirectoryNames.has(entry)) continue;
      await visit(join(current, entry), root);
    }
  }

  await visit(path, dirname(path));
  return hash.digest("hex");
}
