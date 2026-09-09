import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, rename, rm, symlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { resolveArchiveBackend } from "./backend.js";
import { inspect, safeLink } from "./zip-index.js";
import type { ArchiveEntry, ArchiveOptions, ArchiveBackend } from "./contracts.js";
export { inspect, resolveArchiveBackend };
export type { ArchiveOptions, ArchiveBackend, ArchiveEntry } from "./contracts.js";
export async function absent(path: string) {
  try { await lstat(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  throw new Error("archive destination already exists");
}
async function entryBytes(file: string, entry: ArchiveEntry, backend: ArchiveBackend, output: Writable, options: ArchiveOptions) {
  // Info-ZIP interprets entry arguments as patterns even without a shell.
  const literal = entry.path.replace(/[\[\]]/gu, "\\$&");
  const args = backend.kind === "7z" ? ["e", "-so", "-spd", "-y", file, "--", entry.path] : ["-p", file, literal];
  const child = spawn(backend.executable, args, { env: options.env ?? process.env, stdio: ["ignore", "pipe", "pipe"], signal: options.signal });
  const timer = setTimeout(() => child.kill(), options.timeoutMs ?? 120_000);
  let diagnostic = "";
  child.stderr.on("data", chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-4096); });
  const finished = new Promise<void>((resolve, reject) => {
    child.on("error", reject); child.on("close", code => code === 0 ? resolve() : reject(new Error("archive extraction failed: " + diagnostic)));
  });
  finished.catch(() => {}); let bytes = 0;
  try {
    await pipeline(child.stdout, new Transform({ transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length; callback(bytes > entry.size ? new Error("archive entry exceeds declared size") : null, chunk);
    } }), output);
    await finished;
    if (bytes !== entry.size) throw new Error("archive entry size mismatch");
  } finally { clearTimeout(timer); child.kill(); await finished.catch(() => {}); }
}
/** Native tools emit bytes only. This layer owns paths, links and atomic commit. */
export async function extract(file: string, destination: string, options: ArchiveOptions = {}) {
  const backend = await resolveArchiveBackend("extract", options), output = resolve(destination);
  await absent(output); await mkdir(dirname(output), { recursive: true });
  const scratch = await mkdtemp(join(dirname(output), ".archive-"));
  try {
    const snapshot = join(scratch, "input.zip"), stage = join(scratch, "content"); let copied = 0;
    await pipeline(createReadStream(file), new Transform({ transform(chunk: Buffer, _encoding, callback) {
      copied += chunk.length; callback(copied > 2 * 1024 ** 3 ? new Error("archive exceeds size bound") : null, chunk);
    } }), createWriteStream(snapshot, { flags: "wx" }));
    const entries = await inspect(snapshot, options); await mkdir(stage);
    for (const entry of entries.filter(entry => entry.kind === "directory")) await mkdir(join(stage, entry.path), { recursive: true });
    const links: { path: string; target: string }[] = [];
    for (const entry of entries.filter(entry => entry.kind !== "directory")) {
      await mkdir(dirname(join(stage, entry.path)), { recursive: true });
      if (entry.kind === "link") {
        const chunks: Buffer[] = [];
        await entryBytes(snapshot, entry, backend, new Writable({ write(chunk: Buffer, _encoding, callback) { chunks.push(chunk); callback(); } }), options);
        const target = Buffer.concat(chunks).toString("utf8"); safeLink(entry.path, target); links.push({ path: entry.path, target });
      } else {
        await entryBytes(snapshot, entry, backend, createWriteStream(join(stage, entry.path), { flags: "wx" }), options);
        await chmod(join(stage, entry.path), options.permissions === "portable" ? 0o644 : entry.mode);
      }
    }
    for (const link of links) await symlink(link.target, join(stage, link.path));
    for (const entry of entries.filter(entry => entry.kind === "directory").sort((a, b) => b.path.length - a.path.length)) await chmod(join(stage, entry.path), options.permissions === "portable" ? 0o755 : entry.mode);
    await absent(output); await rename(stage, output);
    return { directory: output, backend };
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
