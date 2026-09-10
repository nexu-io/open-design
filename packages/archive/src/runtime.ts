import { createReadStream, createWriteStream } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, rename, rm, symlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { resolveArchiveBackend } from "./backend.js";
import { inspect, inspectIndex } from "./zip-index.js";
import { extractEntries } from "./extraction.js";
import type { ArchiveOptions } from "./contracts.js";
export { inspect, resolveArchiveBackend };
export type { ArchiveOptions, ArchiveBackend, ArchiveEntry } from "./contracts.js";
export async function absent(path: string) {
  try { await lstat(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  throw new Error("archive destination already exists");
}
/** Native tools emit bytes only. This layer owns paths, links and atomic commit. */
export async function extract(file: string, destination: string, options: ArchiveOptions = {}) {
  options.signal?.throwIfAborted();
  const backend = await resolveArchiveBackend("extract", options), output = resolve(destination);
  await absent(output); await mkdir(dirname(output), { recursive: true });
  const scratch = await mkdtemp(join(dirname(output), ".archive-"));
  try {
    const snapshot = join(scratch, "input.zip"), stage = join(scratch, "content"); let copied = 0;
    await pipeline(createReadStream(file), new Transform({ transform(chunk: Buffer, _encoding, callback) {
      copied += chunk.length; callback(copied > 2 * 1024 ** 3 ? new Error("archive exceeds size bound") : null, chunk);
    } }), createWriteStream(snapshot, { flags: "wx" }), { signal: options.signal });
    const entries = await inspectIndex(snapshot, options); await mkdir(stage);
    for (const entry of entries.filter(entry => entry.kind === "directory")) await mkdir(join(stage, entry.path), { recursive: true });
    const links = await extractEntries(snapshot, stage, entries, backend, options);
    options.signal?.throwIfAborted();
    for (const link of links) await symlink(link.target, join(stage, link.path));
    for (const entry of entries.filter(entry => entry.kind === "directory").sort((a, b) => b.path.length - a.path.length)) await chmod(join(stage, entry.path), options.permissions === "portable" ? 0o755 : entry.mode);
    await absent(output); options.signal?.throwIfAborted(); await rename(stage, output);
    return { directory: output, backend };
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
