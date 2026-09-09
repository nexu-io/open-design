import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import JSZip from "jszip";
import { standaloneTreeSha256 } from "../blob.js";
import { validateNodePlatformResource } from "./resource-contract.js";
import type { OfficialNodeTarget } from "./runtime.js";

/** Snapshot an already-built platform; no compiler, downloader, release URL or
 * persistent cache policy. The caller owns the completed native build receipt. */
export async function archiveNodePlatformResource(input: Readonly<{
  root: string; target: OfficialNodeTarget; archivePath: string; executables: readonly string[];
}>) {
  if (![input.root, input.archivePath].every(isAbsolute)) throw new Error("platform archive paths must be absolute");
  const zip = new JSZip(), inventory: { path: string; size: number; sha256: string }[] = [];
  const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  const visit = async (directory: string, prefix = "") => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = `${prefix}${entry.name}`, path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("platform archive cannot contain symbolic links");
      if (entry.isDirectory()) { await visit(path, `${name}/`); continue; }
      if (!entry.isFile()) throw new Error("platform archive requires regular files");
      const bytes = await readFile(path);
      inventory.push({ path: name, size: bytes.length, sha256: sha(bytes) });
      // Execute permissions are granted from the authenticated allowlist only.
      zip.file(name, bytes, { createFolders: false, date: new Date("1980-01-01T00:00:00Z"), unixPermissions: 0o100644 });
    }
  };
  await visit(input.root);
  if (!inventory.some(entry => entry.path === "platform.json")) throw new Error("platform archive requires its runtime manifest");
  if (input.executables.some(path => !inventory.some(entry => entry.path === path))) throw new Error("platform executable allowlist references a missing file");
  const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 }, platform: "UNIX" });
  const resource = validateNodePlatformResource({ schemaVersion: 1, target: input.target,
    blob: { sha256: sha(bytes), size: bytes.length, mediaType: "application/zip", sources: [] },
    treeSha256: standaloneTreeSha256(inventory), executables: input.executables });
  await writeFile(input.archivePath, bytes, { flag: "wx" });
  return Object.freeze({ archivePath: input.archivePath, resource });
}
