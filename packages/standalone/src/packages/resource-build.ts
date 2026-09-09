import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { pack } from "@open-design/archive/build";
import { standaloneTreeSha256 } from "../blob.js";
import { validateNodePlatformResource } from "./resource-contract.js";
import type { OfficialNodeTarget } from "./runtime.js";

/** Snapshot an already-built platform; no compiler, downloader, release URL or
 * persistent cache policy. The caller owns the completed native build receipt. */
export async function archiveNodePlatformResource(input: Readonly<{
  root: string; target: OfficialNodeTarget; archivePath: string; executables: readonly string[];
}>) {
  if (![input.root, input.archivePath].every(isAbsolute)) throw new Error("platform archive paths must be absolute");
  const inventory: { path: string; size: number; sha256: string }[] = [];
  const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  const visit = async (directory: string, prefix = "") => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = `${prefix}${entry.name}`, path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("platform archive cannot contain symbolic links");
      if (entry.isDirectory()) { await visit(path, `${name}/`); continue; }
      if (!entry.isFile()) throw new Error("platform archive requires regular files");
      const bytes = await readFile(path);
      inventory.push({ path: name, size: bytes.length, sha256: sha(bytes) });
    }
  };
  await visit(input.root);
  if (!inventory.some(entry => entry.path === "platform.json")) throw new Error("platform archive requires its runtime manifest");
  if (input.executables.some(path => !inventory.some(entry => entry.path === path))) throw new Error("platform executable allowlist references a missing file");
  // Execute permissions are granted from the authenticated allowlist only.
  const archive = await pack(input.root, input.archivePath, { reproducible: true, permissions: "portable" });
  const resource = validateNodePlatformResource({ schemaVersion: 1, target: input.target,
    blob: { sha256: archive.sha256, size: archive.size, mediaType: "application/zip", sources: [] },
    treeSha256: standaloneTreeSha256(inventory), executables: input.executables });
  return Object.freeze({ archivePath: input.archivePath, resource });
}
