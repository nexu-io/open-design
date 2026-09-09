import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, mkdtemp, readdir, readlink, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { execute, resolveArchiveBackend } from "./backend.js";
import { absent } from "./runtime.js";
import { inspect, safeLink, safePath } from "./zip-index.js";
import type { ArchiveOptions } from "./contracts.js";
export { extract, inspect, resolveArchiveBackend } from "./runtime.js";
export type { ArchiveOptions, ArchiveBackend, ArchiveEntry } from "./contracts.js";
/** ZIP is the initial interchange format. Backend choice is explicit in receipts. */
export async function pack(source: string, destination: string, options: ArchiveOptions = {}) {
  const backend = await resolveArchiveBackend("pack", options), root = resolve(source), output = resolve(destination), rel = relative(root, output);
  if (!isAbsolute(rel) && rel !== ".." && !rel.startsWith("../")) throw new Error("archive output overlaps source");
  if (!(await lstat(root)).isDirectory()) throw new Error("archive source must be a directory");
  let count = 0, bytes = 0, hasLinks = false;
  async function walk(directory: string) {
    for (const name of await readdir(directory)) {
      const path = join(directory, name), key = relative(root, path).replaceAll("\\", "/"); safePath(key);
      const info = await lstat(path);
      if (++count > (options.maxEntries ?? 100_000) || (info.mode & 0o7000)) throw new Error("archive inventory violates policy");
      if (info.isDirectory()) await walk(path);
      else if (info.isFile()) { bytes += info.size; if (bytes > (options.maxExpandedBytes ?? 4 * 1024 ** 3)) throw new Error("archive expanded size exceeds bound"); }
      else if (info.isSymbolicLink()) { if (!options.allowInternalLinks) throw new Error("archive links are disabled"); hasLinks = true; safeLink(key, await readlink(path)); }
      else throw new Error("archive special files are forbidden");
    }
  }
  await walk(root);
  // ZIP link semantics vary between 7z versions. Fail rather than dereference
  // framework links or silently change an explicitly selected backend.
  if (hasLinks && backend.kind === "7z") throw new Error("7z ZIP link preservation is not enabled; select zip for this input");
  await absent(output); await mkdir(dirname(output), { recursive: true });
  const scratch = await mkdtemp(join(dirname(output), ".archive-build-"));
  try {
    const file = join(scratch, "content.zip");
    const args = backend.kind === "7z" ? ["a", "-tzip", "-mx=5", "-y", file, "."] : ["-q", "-r", "-y", "-X", file, "."];
    await execute(backend.executable, args, { cwd: root, env: options.env ?? process.env, timeout: options.timeoutMs ?? 120_000, signal: options.signal, maxBuffer: 1024 * 1024 });
    await inspect(file, options);
    const hash = createHash("sha256"); let size = 0;
    for await (const chunk of createReadStream(file)) { hash.update(chunk); size += chunk.length; }
    await absent(output); await rename(file, output);
    return { file: output, sha256: hash.digest("hex"), size, backend };
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
