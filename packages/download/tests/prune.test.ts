import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setImmediate as nextTurn } from "node:timers/promises";

import { afterEach, describe, it } from "vitest";

import { writeJson } from "../src/fs-io.js";
import { managedDownload, pruneManagedDownloads, type ManagedDownloadOptions } from "../src/index.js";
import { acquireLock, releaseLock } from "../src/lock.js";
import { createManifest } from "../src/manifest.js";
import { ensureManagedBase } from "../src/store.js";
import { targetFromOptions } from "../src/target.js";

const roots: string[] = [];
const body = "a live transfer must retain its lock and resumable state";
const day = 24 * 60 * 60 * 1000;

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "od-prune-lease-"));
  roots.push(root);
  const options: ManagedDownloadOptions = {
    basePath: join(root, "downloads"),
    bucket: "artifacts",
    fileName: "payload.bin",
    payload: {
      checksum: { algorithm: "sha256", value: createHash("sha256").update(body).digest("hex") },
      url: "https://example.invalid/payload.bin",
    },
    fetch: async () => new Response(body),
    maxAttempts: 1,
  };
  return { options, target: targetFromOptions(options) };
}

async function expire(...paths: string[]): Promise<void> {
  const old = new Date(Date.now() - 2 * day);
  await Promise.all(paths.map((path) => utimes(path, old, old)));
}

/** Hold the real transfer open after its bytes have reached the partial file. */
async function suspendedDownload(options: ManagedDownloadOptions) {
  const target = targetFromOptions(options);
  let markProgress!: () => void;
  const progressed = new Promise<void>((resolve) => { markProgress = resolve; });
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const result = managedDownload({
    ...options,
    fetch: async () => new Response(new ReadableStream<Uint8Array>({
      start(next) {
        controller = next;
        next.enqueue(new TextEncoder().encode(body));
      },
    })),
    onProgress: () => markProgress(),
  }).then((value) => ({ value }), (error: unknown) => ({ error }));
  await progressed;
  const deadline = Date.now() + 2_000;
  while ((await stat(target.partialPath).catch(() => null))?.size !== Buffer.byteLength(body)) {
    assert.ok(Date.now() < deadline, "the response bytes should reach the real partial file");
    await nextTurn();
  }
  return { result, release: () => controller.close() };
}

describe("target-level download pruning", () => {
  it("keeps an aged active transfer intact when another download runs default pruning", async () => {
    const { options, target } = await fixture();
    const active = await suspendedDownload(options);
    let ownerResult: Awaited<typeof active.result> | undefined;
    let lockAfter: string | null = null;
    let manifestAfter: string | null = null;
    const lockBefore = await readFile(target.lockPath, "utf8");
    const manifestBefore = await readFile(target.manifestPath, "utf8");
    try {
      await expire(target.lockPath, target.manifestPath, target.partialPath);
      const other = await managedDownload({ ...options, fileName: "other.bin" });
      assert.equal(await readFile(other.path, "utf8"), body);
      lockAfter = await readFile(target.lockPath, "utf8").catch(() => null);
      manifestAfter = await readFile(target.manifestPath, "utf8").catch(() => null);
    } finally {
      active.release();
      ownerResult = await active.result;
    }

    assert.equal(lockAfter, lockBefore, "automatic pruning must preserve the active owner's lease");
    assert.equal(manifestAfter, manifestBefore);
    assert.ok(ownerResult != null && "value" in ownerResult, "the original transfer must still complete");
    assert.equal(await readFile(ownerResult.value.path, "utf8"), body);
  });

  it("skips a live filesystem lease without waiting and prunes after its release", async () => {
    const { options, target } = await fixture();
    await managedDownload(options);
    const lease = await acquireLock(target);
    const owner = await readFile(target.lockPath, "utf8");
    try {
      await expire(target.finalPath, target.manifestPath, target.lockPath);
      const result = await pruneManagedDownloads({ basePath: options.basePath });
      assert.equal(result.removed, 0);
      assert.equal(await readFile(target.lockPath, "utf8"), owner);
      assert.equal(await readFile(target.finalPath, "utf8"), body);
      assert.ok((await stat(target.manifestPath)).isFile());
    } finally {
      await releaseLock(lease);
    }

    assert.equal((await pruneManagedDownloads({ basePath: options.basePath })).removed, 2);
    await assert.rejects(stat(target.finalPath), { code: "ENOENT" });
    await assert.rejects(stat(target.manifestPath), { code: "ENOENT" });
    assert.deepEqual(await readdir(join(options.basePath, ".locks")), []);
  });

  it("retains an older manifest with recent partial bytes so the target can resume", async () => {
    const { options, target } = await fixture();
    await ensureManagedBase(options.basePath);
    const prefix = body.slice(0, 10);
    await writeFile(target.partialPath, prefix);
    await writeJson(target.manifestPath, createManifest(target, "partial", { totalBytes: Buffer.byteLength(body) }));
    await expire(target.manifestPath);

    assert.equal((await pruneManagedDownloads({ basePath: options.basePath })).removed, 0);
    assert.ok((await stat(target.manifestPath)).isFile());
    const result = await managedDownload({
      ...options,
      fetch: async (_url, init) => {
        assert.equal(new Headers(init?.headers).get("range"), `bytes=${prefix.length}-`);
        return new Response(body.slice(prefix.length), {
          status: 206,
          headers: { "content-range": `bytes ${prefix.length}-${body.length - 1}/${body.length}` },
        });
      },
    });
    assert.equal(result.resumed, true);
    assert.equal(await readFile(result.path, "utf8"), body);
  });

  it("reclaims an aged dead-owner lock together with orphaned scratch files", async () => {
    const { options, target } = await fixture();
    await ensureManagedBase(options.basePath);
    const child = spawnSync(process.execPath, ["-e", ""], { stdio: "ignore" });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0);
    assert.ok(typeof child.pid === "number" && child.pid > 0);
    await writeFile(target.lockPath, JSON.stringify({ pid: child.pid, createdAt: new Date().toISOString() }));
    await writeFile(target.partialPath, "interrupted bytes");
    await writeFile(target.manifestPath, "broken manifest");
    await expire(target.lockPath, target.partialPath, target.manifestPath);

    assert.equal((await pruneManagedDownloads({ basePath: options.basePath })).removed, 3);
    for (const path of [target.lockPath, target.partialPath, target.manifestPath]) {
      await assert.rejects(stat(path), { code: "ENOENT" });
    }
  });

  it("preserves an unverifiable owner instead of removing its lock and target by age", async () => {
    const { options, target } = await fixture();
    await managedDownload(options);
    await writeFile(target.lockPath, "legacy or incomplete owner");
    await expire(target.finalPath, target.manifestPath, target.lockPath);

    assert.equal((await pruneManagedDownloads({ basePath: options.basePath })).removed, 0);
    assert.equal(await readFile(target.lockPath, "utf8"), "legacy or incomplete owner");
    assert.equal(await readFile(target.finalPath, "utf8"), body);
    assert.ok((await stat(target.manifestPath)).isFile());
  });

  it("removes an expired complete target while retaining a fresh sibling", async () => {
    const { options, target } = await fixture();
    await managedDownload(options);
    const sibling = await managedDownload({ ...options, fileName: "fresh.bin" });
    await expire(target.finalPath, target.manifestPath);

    assert.equal((await pruneManagedDownloads({ basePath: options.basePath })).removed, 2);
    await assert.rejects(stat(target.finalPath), { code: "ENOENT" });
    await assert.rejects(stat(target.manifestPath), { code: "ENOENT" });
    assert.equal(await readFile(sibling.path, "utf8"), body);
  });

  it("still removes aged scratch debris that cannot belong to a valid target", async () => {
    const { options } = await fixture();
    await ensureManagedBase(options.basePath);
    const debris = join(options.basePath, ".partial", "abandoned.tmp");
    await writeFile(debris, "old scratch");
    await expire(debris);

    assert.equal((await pruneManagedDownloads({ basePath: options.basePath })).removed, 1);
    await assert.rejects(stat(debris), { code: "ENOENT" });
  });

  it("allows concurrent pruners to finish without leaving a cleanup lock", async () => {
    const { options, target } = await fixture();
    await managedDownload(options);
    await expire(target.finalPath, target.manifestPath);

    const results = await Promise.all([
      pruneManagedDownloads({ basePath: options.basePath }),
      pruneManagedDownloads({ basePath: options.basePath }),
    ]);

    assert.ok(results.some((result) => result.removed > 0));
    assert.ok(results.every((result) => result.warnings.length === 0));
    await assert.rejects(stat(target.finalPath), { code: "ENOENT" });
    assert.deepEqual(await readdir(join(options.basePath, ".locks")), []);
  });

  it("does not follow a manifest's bucket alias to an external file", async () => {
    const { options, target } = await fixture();
    await ensureManagedBase(options.basePath);
    const external = join(dirname(options.basePath), "external");
    await mkdir(external);
    const externalFile = join(external, options.fileName);
    await writeFile(externalFile, "caller-owned file");
    await symlink(external, dirname(target.finalPath), process.platform === "win32" ? "junction" : "dir");
    await writeJson(target.manifestPath, createManifest(target, "complete"));
    await expire(target.manifestPath, externalFile);

    await pruneManagedDownloads({ basePath: options.basePath });

    assert.equal(await readFile(externalFile, "utf8"), "caller-owned file");
  });

  it("does not use mismatched manifest names to delete another leased target", async () => {
    const { options, target } = await fixture();
    await managedDownload(options);
    const otherOptions = { ...options, fileName: "other.bin" };
    await managedDownload(otherOptions);
    const other = targetFromOptions(otherOptions);
    const lease = await acquireLock(other);
    try {
      await writeJson(target.manifestPath, createManifest(other, "complete"));
      await expire(target.finalPath, target.manifestPath, other.finalPath, other.manifestPath, other.lockPath);
      const owner = await readFile(other.lockPath, "utf8");

      await pruneManagedDownloads({ basePath: options.basePath });

      await assert.rejects(stat(target.finalPath), { code: "ENOENT" });
      assert.equal(await readFile(other.finalPath, "utf8"), body);
      assert.ok((await stat(other.manifestPath)).isFile());
      assert.equal(await readFile(other.lockPath, "utf8"), owner);
    } finally {
      await releaseLock(lease);
    }
  });
});
