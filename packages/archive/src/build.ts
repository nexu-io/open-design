import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, copyFile, lstat, mkdir, mkdtemp, readdir, readlink, rename, rm, symlink, utimes } from "node:fs/promises";
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
    let input = root;
    if (options.reproducible) {
      input = join(scratch, "source");
      const epoch = new Date("1980-01-01T00:00:00Z");
      async function snapshot(source: string, target: string) {
        await mkdir(target, { mode: 0o755 });
        for (const name of (await readdir(source)).sort()) {
          const from = join(source, name), to = join(target, name), info = await lstat(from);
          if (info.isDirectory()) await snapshot(from, to);
          else if (info.isFile()) {
            await copyFile(from, to);
            await chmod(to, options.permissions === "portable" ? 0o644 : info.mode & 0o777);
            await utimes(to, epoch, epoch);
          } else if (info.isSymbolicLink() && options.allowInternalLinks) {
            await symlink(await readlink(from), to);
          } else throw new Error("archive source changed during snapshot");
        }
        await utimes(target, epoch, epoch);
      }
      await snapshot(root, input);
    }
    const file = join(scratch, "content.zip");
    // Suppress older p7zip's timestamp extensions: normalizing mtime alone does
    // not remove snapshot-local metadata from its directory entries.
    const args = backend.kind === "7z"
      ? ["a", "-tzip", "-mx=5", "-y", ...(options.reproducible ? ["-mtc=off"] : []), file, "."]
      : ["-q", "-r", "-y", "-X", file, "."];
    await execute(backend.executable, args, { cwd: input, env: { ...(options.env ?? process.env), ...(options.reproducible ? { TZ: "UTC" } : {}) }, timeout: options.timeoutMs ?? 120_000, signal: options.signal, maxBuffer: 1024 * 1024 });
    await inspect(file, options);
    const hash = createHash("sha256"); let size = 0;
    for await (const chunk of createReadStream(file)) { hash.update(chunk); size += chunk.length; }
    await absent(output); await rename(file, output);
    return { file: output, sha256: hash.digest("hex"), size, backend };
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
