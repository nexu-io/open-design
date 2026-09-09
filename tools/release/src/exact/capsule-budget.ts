import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import JSZip from "jszip";
import { standaloneTreeSha256 } from "@open-design/standalone";

// Initial measured product: 1 file, 467,112 archive / 1,545,796 expanded bytes.
// Release policy, not a runtime protocol limit or a caller-controlled override.
export const CAPSULE_RELEASE_BUDGET = Object.freeze({
  revision: 1, files: 8, archiveBytes: 1024 ** 2, expandedBytes: 4 * 1024 ** 2,
});

/** Inspect actual bound bytes before signing, including restored products.
 * Count expanded payloads, not just the ZIP container; never extract to disk. */
export async function verifyCapsuleReleaseBudget(path: string, expected: Readonly<{
  sha256: string; size: number; treeSha256: string;
}>) {
  const budget = CAPSULE_RELEASE_BUDGET;
  const handle = await open(path, "r");
  let bytes: Buffer;
  try {
    const size = (await handle.stat()).size;
    if (size > budget.archiveBytes) throw new Error("Capsule release budget exceeded: archive bytes");
    // Bound allocation even if the source grows after stat.
    const buffer = Buffer.alloc(budget.archiveBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > budget.archiveBytes) throw new Error("Capsule release budget exceeded: archive bytes");
    bytes = buffer.subarray(0, length);
  } finally { await handle.close(); }
  if (bytes.length !== expected.size || createHash("sha256").update(bytes).digest("hex") !== expected.sha256) {
    throw new Error("Capsule budget archive binding mismatch");
  }
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files);
  if (entries.length === 0 || entries.length > budget.files) throw new Error("Capsule release budget exceeded: file count");
  let expandedBytes = 0;
  const inventory: { path: string; size: number; sha256: string }[] = [];
  for (const entry of entries) {
    if (entry.dir || entry.unsafeOriginalName !== entry.name || entry.name.startsWith("/")
      || entry.name.includes("\\") || entry.name.split("/").some(part => !part || part === "." || part === "..")
      || (Number(entry.unixPermissions ?? 0) & 0o170000) === 0o120000) throw new Error("invalid Capsule release payload entry");
    const hash = createHash("sha256"); let size = 0;
    await pipeline(entry.nodeStream(), new Writable({ write(chunk: Buffer, _encoding, callback) {
      size += chunk.length; expandedBytes += chunk.length;
      if (expandedBytes > budget.expandedBytes) { callback(new Error("Capsule release budget exceeded: expanded bytes")); return; }
      hash.update(chunk); callback();
    } }));
    inventory.push({ path: entry.name, size, sha256: hash.digest("hex") });
  }
  if (standaloneTreeSha256(inventory) !== expected.treeSha256) throw new Error("Capsule budget tree binding mismatch");
  return Object.freeze({ budget, files: entries.length, archiveBytes: bytes.length, expandedBytes,
    sha256: expected.sha256, treeSha256: expected.treeSha256 });
}
