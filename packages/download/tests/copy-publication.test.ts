import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterEach, beforeEach, it } from "vitest";

import { downloadCopyAndClear } from "../src/copy.js";
import { MANAGED_DOWNLOAD_ERROR_CODES } from "../src/errors.js";
import { inspectManagedDownload } from "../src/remove.js";
import type { DownloadCopyAndClearOptions } from "../src/types.js";

const originalCopyFile = fs.copyFile;
const originalLink = fs.link;
const originalStat = fs.stat;
const originalCreateReadStream = fsSync.createReadStream;
let directory: string;
let pending: Promise<unknown>[];
let releases: Array<() => void>;
let fetches: number;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  releases.push(resolve);
  return { promise, resolve };
}

function optionsFor(content: string, name = "managed"): DownloadCopyAndClearOptions {
  return {
    basePath: join(directory, name), bucket: "release", fileName: "payload.bin",
    outputPath: join(directory, "output.bin"), maxAttempts: 1,
    payload: {
      url: "https://example.invalid/release.bin",
      checksum: { algorithm: "sha256", value: createHash("sha256").update(content).digest("hex") },
    },
    fetch: async () => { fetches += 1; return new Response(content); },
  };
}

function start(options: DownloadCopyAndClearOptions) {
  const promise = downloadCopyAndClear(options);
  pending.push(promise);
  void promise.catch(() => undefined);
  return promise;
}

beforeEach(async () => {
  directory = await fs.mkdtemp(join(tmpdir(), "download-copy-publication-"));
  pending = [];
  releases = [];
  fetches = 0;
});

afterEach(async () => {
  fs.copyFile = originalCopyFile;
  fs.link = originalLink;
  fs.stat = originalStat;
  fsSync.createReadStream = originalCreateReadStream;
  syncBuiltinESMExports();
  for (const release of releases) release();
  await Promise.allSettled(pending);
  await fs.rm(directory, { recursive: true, force: true });
});

it("accepts two concurrent publications of the same verified output", async () => {
  const options = optionsFor("identical downloaded bytes");
  const bothCopying = deferred();
  let copies = 0;
  fs.copyFile = async (...args) => {
    if (basename(String(args[1])).startsWith(".output.bin.")) {
      copies += 1;
      if (copies === 2) bothCopying.resolve();
      await bothCopying.promise;
    }
    return originalCopyFile(...args);
  };
  syncBuiltinESMExports();

  const results = await Promise.all([start(options), start(options)]);

  assert.equal(fetches, 1);
  assert.equal(copies, 2, "both copies start before either can publish");
  assert.equal(await fs.readFile(options.outputPath, "utf8"), "identical downloaded bytes");
  assert.ok(results.every((result) => result.cleanupWarning === undefined));
  assert.ok(results.some((result) => result.cleanup === "deferred"));
  const managed = await inspectManagedDownload(options);
  assert.equal(managed.complete, false);
  assert.equal(managed.manifest, "missing");
  assert.deepEqual((await fs.readdir(directory)).filter((name) => name.endsWith(".tmp")), []);
});

it("reports a differing concurrent winner as OUTPUT_CONFLICT without overwriting it", async () => {
  const winnerOptions = optionsFor("winner bytes", "winner");
  const loserOptions = optionsFor("different loser bytes", "loser");
  const bothCopying = deferred();
  const releaseLoser = deferred();
  let copies = 0;
  fs.copyFile = async (...args) => {
    if (basename(String(args[1])).startsWith(".output.bin.")) {
      copies += 1;
      if (copies === 2) bothCopying.resolve();
      await bothCopying.promise;
      if (String(args[0]).startsWith(loserOptions.basePath)) await releaseLoser.promise;
    }
    return originalCopyFile(...args);
  };
  syncBuiltinESMExports();
  const winner = start(winnerOptions);
  const loser = start(loserOptions);
  await winner;
  releaseLoser.resolve();

  await assert.rejects(loser, { code: MANAGED_DOWNLOAD_ERROR_CODES.OUTPUT_CONFLICT });
  assert.equal(await fs.readFile(winnerOptions.outputPath, "utf8"), "winner bytes");
  assert.equal((await inspectManagedDownload(winnerOptions)).complete, false);
  assert.equal((await inspectManagedDownload(loserOptions)).complete, true);
  assert.deepEqual((await fs.readdir(directory)).filter((name) => name.endsWith(".tmp")), []);
});

it("rejects a non-file destination without removing its contents", async () => {
  const options = optionsFor("download bytes");
  await fs.mkdir(options.outputPath);
  await fs.writeFile(join(options.outputPath, "keep"), "existing directory contents");

  await assert.rejects(start(options), { code: MANAGED_DOWNLOAD_ERROR_CODES.OUTPUT_CONFLICT });
  assert.equal(await fs.readFile(join(options.outputPath, "keep"), "utf8"), "existing directory contents");
});

it("does not accept a winner that disappears before verification", async () => {
  const options = optionsFor("same bytes");
  fs.link = async (...args) => {
    if (args[1] !== options.outputPath) return originalLink(...args);
    await fs.writeFile(options.outputPath, "same bytes");
    try {
      return await originalLink(...args);
    } catch (error) {
      await fs.rm(options.outputPath);
      throw error;
    }
  };
  syncBuiltinESMExports();

  await assert.rejects(start(options), { code: "ENOENT" });
  assert.equal((await inspectManagedDownload(options)).complete, true);
});

it("preserves publication errors other than EEXIST", async () => {
  const options = optionsFor("download bytes");
  const failure = Object.assign(new Error("publication denied"), { code: "EACCES" });
  fs.link = async () => { throw failure; };
  syncBuiltinESMExports();

  await assert.rejects(start(options), (error) => error === failure);
});

for (const phase of ["stat", "hash"] as const) {
  it(`preserves ${phase} I/O errors while verifying an EEXIST winner`, async () => {
    const options = optionsFor("same bytes");
    const failure = Object.assign(new Error(`${phase} denied`), { code: "EACCES" });
    let collided = false;
    fs.link = async (...args) => {
      if (args[1] !== options.outputPath) return originalLink(...args);
      await fs.writeFile(options.outputPath, "same bytes");
      try {
        return await originalLink(...args);
      } catch (error) {
        collided = true;
        throw error;
      }
    };
    fs.stat = (async (...args: Parameters<typeof fs.stat>) => {
      if (phase === "stat" && collided && args[0] === options.outputPath) throw failure;
      return originalStat(...args);
    }) as typeof fs.stat;
    fsSync.createReadStream = (...args) => {
      if (phase === "hash" && collided && args[0] === options.outputPath) throw failure;
      return originalCreateReadStream(...args);
    };
    syncBuiltinESMExports();

    await assert.rejects(start(options), (error) => error === failure);
    assert.equal(await fs.readFile(options.outputPath, "utf8"), "same bytes");
  });
}
