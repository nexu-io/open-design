import { spawn } from "node:child_process";
import { mkdir, open, type FileHandle } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { crc32 } from "node:zlib";
import type { ArchiveBackend, ArchiveOptions } from "./contracts.js";
import { safeLink, type IndexedEntry } from "./zip-index.js";

/** A single native byte producer. Paths, per-entry bounds, checksums and links
 * remain under our authority; the backend never receives a destination path. */
export async function extractEntries(file: string, stage: string, index: readonly IndexedEntry[], backend: ArchiveBackend, options: ArchiveOptions) {
  const entries = index.filter(entry => entry.kind !== "directory");
  const links: { path: string; target: string }[] = [];
  if (!entries.length) return links;
  const args = backend.kind === "7z" ? ["x", "-so", "-y", "-bd", file] : ["-p", file];
  const child = spawn(backend.executable, args, { env: options.env ?? process.env, stdio: ["ignore", "pipe", "pipe"], signal: options.signal });
  const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 120_000);
  let diagnostic = "";
  child.stderr.on("data", chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-4096); });
  const finished = new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error("archive extraction failed: " + diagnostic)));
  });
  finished.catch(() => {});
  let cursor = 0, received = 0, checksum = 0;
  let handle: FileHandle | undefined;
  let linkChunks: Buffer[] = [];
  let writing = Promise.resolve();
  async function start() {
    const entry = entries[cursor]!;
    await mkdir(dirname(join(stage, entry.path)), { recursive: true });
    if (entry.kind === "file") handle = await open(join(stage, entry.path), "wx", 0o600);
  }
  async function complete() {
    const entry = entries[cursor]!;
    if (checksum !== entry.crc32) throw new Error("archive extraction failed: entry checksum or output order mismatch");
    if (handle) {
      await handle.chmod(options.permissions === "portable" ? 0o644 : entry.mode);
      await handle.close(); handle = undefined;
    } else {
      const target = Buffer.concat(linkChunks).toString("utf8");
      safeLink(entry.path, target); links.push({ path: entry.path, target });
    }
    cursor++; received = 0; checksum = 0; linkChunks = [];
  }
  async function consume(chunk: Buffer) {
    let offset = 0;
    while (cursor < entries.length) {
      const entry = entries[cursor]!;
      if (received === 0 && !handle && linkChunks.length === 0) await start();
      if (received === entry.size) { await complete(); continue; }
      if (offset === chunk.length) return;
      const bytes = chunk.subarray(offset, offset + Math.min(entry.size - received, chunk.length - offset));
      checksum = crc32(bytes, checksum);
      if (handle) {
        let written = 0;
        while (written < bytes.length) {
          const result = await handle.write(bytes, written, bytes.length - written);
          if (!result.bytesWritten) throw new Error("archive file write made no progress");
          written += result.bytesWritten;
        }
      } else linkChunks.push(Buffer.from(bytes));
      received += bytes.length; offset += bytes.length;
    }
    if (offset !== chunk.length) throw new Error("archive extraction failed: excess emitted bytes");
  }
  try {
    await pipeline(child.stdout, new Writable({
      write(chunk: Buffer, _encoding, callback) { writing = consume(chunk); writing.then(() => callback(), callback); },
      final(callback) { writing = consume(Buffer.alloc(0)); writing.then(() => callback(cursor === entries.length ? undefined : new Error("archive extraction failed: truncated emitted bytes")), callback); },
    }));
    await finished;
    return links;
  } finally {
    clearTimeout(timer); child.kill("SIGKILL");
    await finished.catch(() => {});
    await writing.catch(() => {});
    await handle?.close();
  }
}
