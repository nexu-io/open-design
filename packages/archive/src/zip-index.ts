import { open, type FileHandle } from "node:fs/promises";
import { posix } from "node:path";
import type { ArchiveEntry, ArchiveOptions } from "./contracts.js";
export function safePath(path: string) {
  if (!path || /[\\\\:\x00-\x1f\x7f*?\[\]]/u.test(path) || path.startsWith("/")
    || path.split("/").some(part => !part || part === "." || part === ".."
      || /[. ]$/u.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))) throw new Error("unsafe or unsupported archive path");
}
async function readExactly(handle: FileHandle, length: number, position: number) {
  const bytes = Buffer.alloc(length); let cursor = 0;
  while (cursor < length) {
    const result = await handle.read(bytes, cursor, length - cursor, position + cursor);
    if (!result.bytesRead) throw new Error("truncated ZIP metadata");
    cursor += result.bytesRead;
  }
  return bytes;
}
export function safeLink(path: string, target: string) {
  if (!target || /[\\\\:\x00-\x1f\x7f]/u.test(target) || target.startsWith("/")) throw new Error("unsafe archive link");
  const normalized = posix.normalize(posix.join(posix.dirname(path), target));
  if (normalized === ".." || normalized.startsWith("../") || normalized === ".") throw new Error("archive link escapes root");
}
/** ZIP directory metadata only: no compression/decompression implementation.
 * Unsupported ZIP64/multi-volume/encrypted inputs fail before native work. */
export async function inspect(file: string, options: ArchiveOptions = {}): Promise<readonly ArchiveEntry[]> {
  const handle = await open(file, "r");
  try {
    const size = (await handle.stat()).size;
    if (size < 22 || size > 2 * 1024 ** 3) throw new Error("archive size exceeds supported bounds");
    const tailLength = Math.min(size, 65_557), tail = await readExactly(handle, tailLength, size - tailLength);
    let end = tail.length - 22;
    while (end >= 0 && (tail.readUInt32LE(end) !== 0x06054b50 || end + 22 + tail.readUInt16LE(end + 20) !== tail.length)) end--;
    if (end < 0) throw new Error("invalid ZIP end record");
    const count = tail.readUInt16LE(end + 10), length = tail.readUInt32LE(end + 12), offset = tail.readUInt32LE(end + 16);
    if (tail.readUInt16LE(end + 4) || tail.readUInt16LE(end + 6) || count !== tail.readUInt16LE(end + 8)
      || count === 0xffff || offset === 0xffffffff || length > 64 * 1024 ** 2
      || offset + length !== size - tail.length + end || count > (options.maxEntries ?? 100_000)) throw new Error("unsupported ZIP directory");
    const directory = await readExactly(handle, length, offset);
    const entries: ArchiveEntry[] = [], names = new Map<string, ArchiveEntry>(); let cursor = 0, expanded = 0;
    for (let index = 0; index < count; index++) {
      if (cursor + 46 > length || directory.readUInt32LE(cursor) !== 0x02014b50) throw new Error("invalid ZIP directory entry");
      const flags = directory.readUInt16LE(cursor + 8), method = directory.readUInt16LE(cursor + 10);
      const bytes = directory.readUInt32LE(cursor + 24), nameLength = directory.readUInt16LE(cursor + 28);
      const next = cursor + 46 + nameLength + directory.readUInt16LE(cursor + 30) + directory.readUInt16LE(cursor + 32);
      if (next > length || (flags & 1) || ![0, 8].includes(method) || bytes === 0xffffffff
        || directory.readUInt16LE(cursor + 34) || directory.readUInt32LE(cursor + 42) >= offset) throw new Error("unsupported ZIP entry encoding");
      const raw = directory.subarray(cursor + 46, cursor + 46 + nameLength), original = raw.toString("utf8");
      if (!Buffer.from(original).equals(raw)) throw new Error("unsupported ZIP filename encoding");
      const path = original.replace(/\/$/u, ""); safePath(path);
      const unix = (directory.readUInt16LE(cursor + 4) >> 8) === 3;
      const mode = unix ? directory.readUInt32LE(cursor + 38) >>> 16 : original.endsWith("/") ? 0o40755 : 0o100644;
      const type = mode & 0o170000, kind = original.endsWith("/") ? "directory" : type === 0o120000 ? "link" : "file";
      if ((mode & 0o7000) || ![0, 0o040000, 0o100000, 0o120000].includes(type)
        || (type === 0o040000 && kind !== "directory") || (kind === "directory" && ![0, 0o040000].includes(type))
        || (kind === "link" && (!options.allowInternalLinks || bytes > 4096))) throw new Error("archive entry violates file or link policy");
      expanded += bytes;
      if (expanded > (options.maxExpandedBytes ?? 4 * 1024 ** 3)) throw new Error("archive expanded size exceeds bound");
      const entry: ArchiveEntry = { path, size: bytes, mode: mode & 0o777, kind }, key = path.normalize("NFC").toLowerCase();
      if (names.has(key)) throw new Error("duplicate archive path");
      names.set(key, entry); entries.push(entry); cursor = next;
    }
    if (cursor !== length) throw new Error("unexpected ZIP directory data");
    for (const key of names.keys()) {
      let parent = posix.dirname(key);
      while (parent !== ".") {
        const entry = names.get(parent);
        if (entry && entry.kind !== "directory") throw new Error("archive path traverses a non-directory");
        parent = posix.dirname(parent);
      }
    }
    return entries;
  } finally { await handle.close(); }
}
