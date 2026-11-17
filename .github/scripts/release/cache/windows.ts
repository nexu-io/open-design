import { lstat, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Keep one complete generation of every build layer, including final artifacts.
// Reconstructing those artifacts was slower than transferring them in the warm
// build experiment; savings come from removing historical copies instead.
export const WINDOWS_CACHE_NODES = [
  "win.workspace-build", "win.nsis-payload-base", "win.electron-builder-dir",
  "win.packaged-app", "win.nsis-installer", "win.portable-zip",
  "win.nsis-payload-overlay", "win.launcher-payload", "win.launcher-payload-base",
  "win.resource-tree", "win.workspace-tarballs",
] as const;
export const WINDOWS_CACHE_MAX_BYTES = 6 * 1024 * 1024 * 1024;

async function bytes(path: string): Promise<number> {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) return info.size;
  let total = 0;
  for (const entry of await readdir(path)) total += await bytes(join(path, entry));
  return total;
}

export async function pruneWindowsCache(root: string, maxBytes = WINDOWS_CACHE_MAX_BYTES) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error("Invalid cache byte budget");
  const entryRoot = join(root, "entries");
  const nodes = await readdir(entryRoot, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const report: Array<{ node: string; entry: string; bytes: number; kept: boolean }> = [];
  let keptBytes = 0;
  // Priority order is explicit, independent of directory enumeration order.
  const ordered = [...nodes].sort((a, b) => {
    const priority = (name: string) => WINDOWS_CACHE_NODES.findIndex((node) => node === name);
    return (priority(a.name) < 0 ? 99 : priority(a.name)) - (priority(b.name) < 0 ? 99 : priority(b.name));
  });
  for (const node of ordered) {
    const nodeRoot = join(entryRoot, node.name);
    if (!node.isDirectory() || node.isSymbolicLink()) {
      await rm(nodeRoot, { force: true, recursive: true });
      continue;
    }
    const entries = await Promise.all((await readdir(nodeRoot)).map(async (entry) => {
      const path = join(nodeRoot, entry);
      const info = await lstat(path);
      const valid = info.isDirectory() && !info.isSymbolicLink()
        && await lstat(join(path, "manifest.json")).then((value) => value.isFile(), () => false);
      return { entry, path, valid, modified: info.mtimeMs, size: await bytes(path) };
    }));
    entries.sort((a, b) => b.modified - a.modified || a.entry.localeCompare(b.entry));
    const latest = entries.find((entry) => entry.valid);
    for (const entry of entries) {
      const kept = WINDOWS_CACHE_NODES.some((name) => name === node.name)
        && entry === latest && keptBytes + entry.size <= maxBytes;
      if (kept) keptBytes += entry.size;
      else await rm(entry.path, { force: true, recursive: true });
      report.push({ node: node.name, entry: entry.entry, bytes: entry.size, kept });
    }
  }
  await rm(join(root, "locks"), { force: true, recursive: true });
  return { maxBytes, keptBytes, removedBytes: report.filter((entry) => !entry.kept).reduce((sum, entry) => sum + entry.bytes, 0), entries: report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.argv[2];
  if (!root) throw new Error("Usage: windows.ts <cache-root>");
  console.log(JSON.stringify(await pruneWindowsCache(root), null, 2));
}
