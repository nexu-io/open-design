import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extract, inspect } from "@open-design/archive";
import { standaloneTreeSha256 } from "@open-design/standalone";

// Initial measured product: 1 file, 467,112 archive / 1,545,796 expanded bytes.
// Release policy, not a runtime protocol limit or a caller-controlled override.
export const CAPSULE_RELEASE_BUDGET = Object.freeze({
  revision: 1, files: 8, archiveBytes: 1024 ** 2, expandedBytes: 4 * 1024 ** 2,
});

/** Inspect actual bound bytes before signing, including restored products.
 * Count expanded payloads, not just the ZIP container. Native extraction uses
 * an owned temporary tree bounded by this product policy. */
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
  const scratch = await mkdtemp(join(tmpdir(), "capsule-budget-"));
  try {
    const snapshot = join(scratch, "capsule.zip"), content = join(scratch, "content");
    await writeFile(snapshot, bytes, { flag: "wx" });
    const entries = await inspect(snapshot).catch(error => { throw new Error("invalid Capsule release payload entry", { cause: error }); });
    if (entries.length === 0 || entries.length > budget.files) throw new Error("Capsule release budget exceeded: file count");
    if (entries.some(entry => entry.kind !== "file")) throw new Error("invalid Capsule release payload entry");
    if (entries.reduce((sum, entry) => sum + entry.size, 0) > budget.expandedBytes) throw new Error("Capsule release budget exceeded: expanded bytes");
    await extract(snapshot, content, { maxEntries: budget.files, maxExpandedBytes: budget.expandedBytes, permissions: "portable" });
    let expandedBytes = 0;
    const inventory: { path: string; size: number; sha256: string }[] = [];
    for (const entry of entries) {
      const hash = createHash("sha256"); let size = 0;
      for await (const chunk of createReadStream(join(content, entry.path))) {
        size += chunk.length; expandedBytes += chunk.length;
        if (expandedBytes > budget.expandedBytes) throw new Error("Capsule release budget exceeded: expanded bytes");
        hash.update(chunk);
      }
      inventory.push({ path: entry.path, size, sha256: hash.digest("hex") });
    }
    if (standaloneTreeSha256(inventory) !== expected.treeSha256) throw new Error("Capsule budget tree binding mismatch");
    return Object.freeze({ budget, files: entries.length, archiveBytes: bytes.length, expandedBytes,
      sha256: expected.sha256, treeSha256: expected.treeSha256 });
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
