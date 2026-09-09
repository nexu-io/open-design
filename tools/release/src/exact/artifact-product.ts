import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { extract, inspect, type ArchiveEntry } from "@open-design/archive";

const MAX_BYTES = 2 * 1024 ** 3;
type ProductTree = Readonly<{ root: string; entries: readonly ArchiveEntry[] }>;

export async function assertArtifactDestinationAbsent(path: string) {
  try { await lstat(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  throw new Error("artifact product destination already exists");
}

/** Publish a complete local projection only after every byte has been verified. */
export async function stageArtifactProduct(output: string, prepare: (stage: string) => Promise<void>) {
  const destination = resolve(output);
  await assertArtifactDestinationAbsent(destination);
  await mkdir(dirname(destination), { recursive: true });
  const scratch = await mkdtemp(join(dirname(destination), ".product-transport-"));
  try {
    const stage = join(scratch, "output"); await mkdir(stage);
    await prepare(stage);
    await assertArtifactDestinationAbsent(destination);
    await rename(stage, destination);
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

/** Open a checksum-bound artifact. Selection and cache decisions belong to the
 * caller; this transport accepts only an ordinary immutable blob descriptor. */
export async function openArtifactProduct(product: Readonly<{ url: string; sha256: string }>) {
  if (Object.keys(product).sort().join(",") !== "sha256,url"
    || typeof product.url !== "string" || !/^[a-f0-9]{64}$/u.test(product.sha256)) {
    throw new Error("artifact requires an exact URL and SHA-256 binding");
  }
  const url = new URL(product.url);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("artifact must use credential-free HTTPS");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(120_000) });
  if (!response.ok || response.body == null) throw new Error(`artifact acquisition failed (${response.status})`);
  const scratch = await mkdtemp(join(tmpdir(), "release-artifact-product-"));
  try {
    const downloaded = join(scratch, "product.zip"), hash = createHash("sha256");
    const reader = response.body.getReader(); let size = 0;
    async function* chunks() {
      try {
        for (;;) {
          const result = await reader.read(); if (result.done) break;
          size += result.value.length;
          if (size > MAX_BYTES) throw new Error("artifact product exceeds transport bound");
          hash.update(result.value);
          yield result.value;
        }
      } finally { await reader.cancel(); reader.releaseLock(); }
    }
    await pipeline(Readable.from(chunks()), createWriteStream(downloaded, { flags: "wx" }));
    if (hash.digest("hex") !== product.sha256) throw new Error("artifact digest mismatch");
    const options = { maxEntries: 10_000, maxExpandedBytes: MAX_BYTES, permissions: "portable" as const };
    const entries = await inspect(downloaded, options), root = join(scratch, "content");
    await extract(downloaded, root, options);
    await rm(downloaded);
    return { archive: { root, entries } satisfies ProductTree, acquisition: { url: url.href, sha256: product.sha256, size },
      [Symbol.asyncDispose]: async () => { await rm(scratch, { recursive: true, force: true }); } };
  } catch (error) { await rm(scratch, { recursive: true, force: true }); throw error; }
}

/** Write an explicitly selected opaque entry, never extract archive paths. */
export async function writeArtifactEntry(archive: ProductTree, name: string, destination: string, maxBytes = MAX_BYTES) {
  const entry = archive.entries.find(entry => entry.path === name);
  if (entry == null || entry.kind !== "file") throw new Error(`invalid artifact payload: ${name}`);
  let expanded = 0;
  const limit = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    expanded += chunk.length;
    callback(expanded > Math.min(maxBytes, MAX_BYTES) ? new Error("artifact payload expands beyond transport bound") : null, chunk);
  } });
  await pipeline(createReadStream(join(archive.root, name)), limit, createWriteStream(destination, { flags: "wx" }));
}
