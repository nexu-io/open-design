import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import JSZip from "jszip";
import { readObject } from "./control-common.ts";
import { unpackSceneArtifact } from "./scene-artifact.ts";

const MAX_BYTES = 2 * 1024 ** 3; // Matches the existing convergence product bound.

/** Consume a planner-authorized cache hit, without changing convergence authority. */
export async function restoreSceneCache(input: Readonly<{
  pending: string; workload: string; transport: string; output: string;
}>) {
  const pending = await readObject(input.pending), workload = pending.workloads?.[input.workload];
  const product = workload?.result?.products?.scene;
  if (workload?.resultHit !== true || workload.run !== false || product?.type !== "url"
    || typeof product.source !== "string" || !/^[a-f0-9]{64}$/u.test(product.data?.sha256)) {
    throw new Error("scene restore requires a complete planner cache hit");
  }
  const url = new URL(product.source);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("scene cache must use credential-free HTTPS");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(120_000) });
  if (!response.ok || response.body == null) throw new Error(`scene cache acquisition failed (${response.status})`);
  const scratch = await mkdtemp(join(tmpdir(), "release-scene-cache-"));
  try {
    const downloaded = join(scratch, "scene.zip"), hash = createHash("sha256");
    const reader = response.body.getReader(); let size = 0;
    async function* chunks() {
      try {
        for (;;) {
          const result = await reader.read(); if (result.done) break;
          size += result.value.length;
          if (size > MAX_BYTES) throw new Error("scene cache exceeds transport bound");
          hash.update(result.value);
          yield result.value;
        }
      } finally { await reader.cancel(); reader.releaseLock(); }
    }
    await pipeline(Readable.from(chunks()), createWriteStream(downloaded, { flags: "wx" }));
    if (hash.digest("hex") !== product.data.sha256) throw new Error("scene cache digest mismatch");
    const archive = await JSZip.loadAsync(await readFile(downloaded));
    const names = Object.keys(archive.files), entry = archive.files["scene.tar"];
    // Never extract arbitrary ZIP paths; the only payload is an opaque TAR.
    if (names.length !== 1 || entry == null || entry.dir || entry.unsafeOriginalName !== "scene.tar") throw new Error("scene cache must contain only scene.tar");
    let expanded = 0;
    const limit = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      expanded += chunk.length;
      callback(expanded > MAX_BYTES ? new Error("scene cache expands beyond transport bound") : null, chunk);
    } });
    const transport = resolve(input.transport);
    await mkdir(dirname(transport), { recursive: true });
    await pipeline(entry.nodeStream(), limit, createWriteStream(transport, { flags: "wx" }));
    const result = await unpackSceneArtifact(transport, input.output);
    return { ...result, cache: { url: url.href, sha256: product.data.sha256, size } };
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
