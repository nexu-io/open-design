import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export type NativeTreeEntry = Readonly<{
  path: string; mode: number; sha256?: string; link?: string; directory?: true;
}>;

/** Physical native bytes, permissions and relative links. Never dereference
 * framework aliases or accept a link leaving the reusable object. */
export async function inventoryNativeTree(root: string): Promise<NativeTreeEntry[]> {
  const entries: NativeTreeEntry[] = [];
  async function walk(directory: string) {
    for (const name of (await readdir(directory)).sort()) {
      if (name.includes("\\")) throw new Error("native tree path is not portable");
      const path = join(directory, name), info = await lstat(path);
      const entry = { path: relative(root, path).replaceAll("\\", "/"), mode: info.mode & 0o777 };
      if (info.isDirectory()) { entries.push({ ...entry, directory: true }); await walk(path); }
      else if (info.isFile()) {
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(path)) hash.update(chunk);
        entries.push({ ...entry, sha256: hash.digest("hex") });
      } else if (info.isSymbolicLink()) {
        const link = await readlink(path), distance = relative(root, resolve(dirname(path), link));
        if (isAbsolute(link) || isAbsolute(distance) || distance === ".." || distance.startsWith("../")) {
          throw new Error("Electron base runtime link escapes its root");
        }
        entries.push({ ...entry, link });
      } else throw new Error("Electron base contains a special file");
    }
  }
  const status = await lstat(root);
  if (!status.isDirectory() || status.isSymbolicLink()) throw new Error("Electron base runtime must be a physical directory");
  await walk(root);
  if (entries.length === 0) throw new Error("Electron base runtime is empty");
  return entries;
}
