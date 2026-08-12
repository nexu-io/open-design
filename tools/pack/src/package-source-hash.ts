import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

export type HashPackageSourcePathOptions = Readonly<{
  /** Repo/package-relative subtrees excluded from this source identity. */
  ignoredRelativePaths?: readonly string[];
}>;

function normalizeRelativePath(path: string): string {
  return path.split("\\").join("/");
}

async function readNormalizedFile(filePath: string): Promise<Buffer | string> {
  const body = await readFile(filePath);
  if (filePath.endsWith("/package.json") || filePath.endsWith("\\package.json")) {
    try {
      const manifest = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
      // Workspace release versions move in lockstep, but they are not Shell
      // source. A reused Shell keeps the compatibility version assigned when
      // this source digest first appeared, so version-only bumps must not force
      // a rebuild/sign/notarize cycle.
      delete manifest.version;
      return `${JSON.stringify(manifest)}\n`;
    } catch {
      // Test fixtures and malformed manifests still participate byte-for-byte;
      // packaging itself will reject them at the normal manifest boundary.
    }
  }
  return body;
}

export async function hashPackageSourcePath(
  path: string,
  options: HashPackageSourcePathOptions = {},
): Promise<string> {
  const hash = createHash("sha256");
  const sourceRootPrefix = normalizeRelativePath(relative(dirname(path), path));
  const ignoredRelativePaths = (options.ignoredRelativePaths ?? [])
    .map((entry) => normalizeRelativePath(entry).replace(/^\.\//u, "").replace(/\/$/u, ""))
    .filter((entry) => entry.length > 0)
    .map((entry) => `${sourceRootPrefix}/${entry}`);
  const ignoredDirectoryNames = new Set([
    ".next",
    ".od",
    ".tmp",
    "__tests__",
    "coverage",
    "dist",
    "node_modules",
    "out",
    "test",
    "tests",
  ]);

  async function visit(current: string, root: string): Promise<void> {
    const relativePath = normalizeRelativePath(relative(root, current));
    if (ignoredRelativePaths.some((entry) => relativePath === entry || relativePath.startsWith(`${entry}/`))) {
      return;
    }
    const metadata = await lstat(current);
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
