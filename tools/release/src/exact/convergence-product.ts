import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { extract, inspect, type ArchiveEntry } from "@open-design/archive";
import { readObject, type JsonObject } from "./control-common.ts";

const MAX_BYTES = 2 * 1024 ** 3; // Existing convergence transport bound.
type ProductTree = Readonly<{ root: string; entries: readonly ArchiveEntry[] }>;

export async function assertConvergedProductAbsent(path: string) {
  try { await lstat(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  throw new Error("convergence product destination already exists");
}

/** Publish a complete local projection only after every byte has been verified. */
export async function stageConvergedProduct(output: string, prepare: (stage: string) => Promise<void>) {
  const destination = resolve(output);
  await assertConvergedProductAbsent(destination);
  await mkdir(dirname(destination), { recursive: true });
  const scratch = await mkdtemp(join(dirname(destination), ".product-transport-"));
  try {
    const stage = join(scratch, "output"); await mkdir(stage);
    await prepare(stage);
    await assertConvergedProductAbsent(destination);
    await rename(stage, destination);
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

/** Open a planner-authorized immutable product with `await using`. Its private
 * tree lives through consumer validation and is always disposed afterward.
 * No cache publication or fallback hit inference lives here. */
export async function openConvergedProduct(input: Readonly<{ pending: string; workload: string; product: string }>) {
  const workload = (await readObject(input.pending)).workloads?.[input.workload];
  const product = workload?.result?.products?.[input.product];
  if (workload?.resultHit !== true || workload.run !== false || product?.type !== "url"
    || typeof product.source !== "string" || !/^[a-f0-9]{64}$/u.test(product.data?.sha256)) {
    throw new Error(`${input.product} restore requires a complete planner cache hit`);
  }
  const url = new URL(product.source);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error(`${input.product} cache must use credential-free HTTPS`);
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(120_000) });
  if (!response.ok || response.body == null) throw new Error(`${input.product} cache acquisition failed (${response.status})`);
  const scratch = await mkdtemp(join(tmpdir(), "release-convergence-product-"));
  try {
    const downloaded = join(scratch, "product.zip"), hash = createHash("sha256");
    const reader = response.body.getReader(); let size = 0;
    async function* chunks() {
      try {
        for (;;) {
          const result = await reader.read(); if (result.done) break;
          size += result.value.length;
          if (size > MAX_BYTES) throw new Error("convergence product exceeds transport bound");
          hash.update(result.value);
          yield result.value;
        }
      } finally { await reader.cancel(); reader.releaseLock(); }
    }
    await pipeline(Readable.from(chunks()), createWriteStream(downloaded, { flags: "wx" }));
    if (hash.digest("hex") !== product.data.sha256) throw new Error(`${input.product} cache digest mismatch`);
    const options = { maxEntries: 10_000, maxExpandedBytes: MAX_BYTES, permissions: "portable" as const };
    const entries = await inspect(downloaded, options), root = join(scratch, "content");
    await extract(downloaded, root, options);
    await rm(downloaded);
    return { archive: { root, entries } satisfies ProductTree, cache: { url: url.href, sha256: product.data.sha256, size },
      [Symbol.asyncDispose]: async () => { await rm(scratch, { recursive: true, force: true }); } };
  } catch (error) { await rm(scratch, { recursive: true, force: true }); throw error; }
}

/** Write an explicitly selected opaque entry, never extract archive paths. */
export async function writeConvergedEntry(archive: ProductTree, name: string, destination: string, maxBytes = MAX_BYTES) {
  const entry = archive.entries.find(entry => entry.path === name);
  if (entry == null || entry.kind !== "file") throw new Error(`invalid convergence payload: ${name}`);
  let expanded = 0;
  const limit = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    expanded += chunk.length;
    callback(expanded > Math.min(maxBytes, MAX_BYTES) ? new Error("convergence payload expands beyond transport bound") : null, chunk);
  } });
  await pipeline(createReadStream(join(archive.root, name)), limit, createWriteStream(destination, { flags: "wx" }));
}

/** Build an untrusted candidate using the existing planner identity. The caller
 * verifies/stages product bytes before writing this manifest for handoff. */
export async function convergenceProductCandidate(input: Readonly<{
  pending: string; workload: string; artifact: string; product: string; data: JsonObject;
}>) {
  if (!/^[a-z][a-z0-9_]*$/u.test(input.workload)) throw new Error(`invalid ${input.product} workload`);
  if (!input.artifact.trim() || /[\r\n]/u.test(input.artifact)) throw new Error(`invalid ${input.product} artifact name`);
  const pending = (await readObject(input.pending)).workloads?.[input.workload];
  if (pending == null || typeof pending.run !== "boolean") throw new Error(`${input.product} workload has no execution decision`);
  if (!pending.run) {
    if (pending.resultHit !== true) throw new Error(`skipped ${input.product} workload has no cache hit`);
    return undefined;
  }
  const executionClass = pending.executionClass;
  if (typeof pending.digest !== "string" || !/^[a-f0-9]{64}$/u.test(pending.digest)
    || executionClass == null || typeof executionClass !== "object" || Array.isArray(executionClass)
    || Object.keys(executionClass).sort().join(",") !== "labels,runnerClass"
    || typeof executionClass.runnerClass !== "string" || !/^[a-z0-9][a-z0-9_-]{0,79}$/u.test(executionClass.runnerClass)
    || !Array.isArray(executionClass.labels) || executionClass.labels.length === 0
    || executionClass.labels.some((label: unknown) => typeof label !== "string" || !label)) {
    throw new Error(`${input.product} workload has no convergence identity`);
  }
  return { workload: input.workload, digest: pending.digest, executionClass,
    products: { [input.product]: { type: "job", source: input.artifact, data: input.data } } };
}
