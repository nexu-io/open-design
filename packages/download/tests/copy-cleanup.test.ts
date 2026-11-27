import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { getEventListeners } from "node:events";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterEach, beforeEach, it } from "vitest";

import { downloadCopyAndClear } from "../src/copy.js";
import { MANAGED_DOWNLOAD_ERROR_CODES } from "../src/errors.js";
import { targetFromOptions } from "../src/target.js";
import type { ManagedDownloadOptions } from "../src/types.js";

const originalRm = fs.rm;
const originalCopyFile = fs.copyFile;
const originalMkdir = fs.mkdir;
const payload = Buffer.from("verified shared download bytes");
let directory: string;
let options: ManagedDownloadOptions;
let target: ReturnType<typeof targetFromOptions>;
let pending: Promise<unknown>[];
let releases: Array<() => void>;
let fetchCount: number;
let removals: number;
let beforeCopy: ((destination: string) => Promise<void>) | undefined;
let beforeRemove: ((filename: string) => Promise<void>) | undefined;
let beforeMkdir: ((filename: string) => Promise<void>) | undefined;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  releases.push(resolve);
  return { promise, resolve };
}

function startCopy(name: string, extra: Partial<ManagedDownloadOptions> = {}) {
  const promise = downloadCopyAndClear({ ...options, ...extra, outputPath: join(directory, name) });
  pending.push(promise);
  void promise.catch(() => undefined);
  return promise;
}

function holdCleanup() {
  const started = deferred();
  const release = deferred();
  let clearing = false;
  beforeRemove = async (filename) => {
    if (filename === target.finalPath && !clearing) {
      clearing = true;
      started.resolve();
    }
    if (clearing && [target.finalPath, target.partialPath, target.manifestPath].includes(filename)) {
      await release.promise;
    }
  };
  return { started: started.promise, release: release.resolve };
}

async function allowOverlappingCopy(started: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // An unfenced caller reaches copyFile while cleanup is held. A fenced
    // caller cannot reach it until we release cleanup, so bound this rendezvous.
    await Promise.race([started, new Promise<void>((resolve) => { timer = setTimeout(resolve, 500); })]);
  } finally {
    clearTimeout(timer);
  }
}

beforeEach(async () => {
  directory = await fs.mkdtemp(join(tmpdir(), "download-copy-cleanup-"));
  pending = [];
  releases = [];
  fetchCount = 0;
  removals = 0;
  beforeCopy = undefined;
  beforeRemove = undefined;
  beforeMkdir = undefined;
  options = {
    basePath: join(directory, "managed"), bucket: "release", fileName: "payload.bin", maxAttempts: 1,
    payload: {
      url: "https://example.invalid/release.bin",
      checksum: { algorithm: "sha256", value: createHash("sha256").update(payload).digest("hex") },
    },
    fetch: async () => { fetchCount += 1; return new Response(payload); },
  };
  target = targetFromOptions(options);
  fs.rm = async (...args) => {
    if (args[0] === target.finalPath) removals += 1;
    await beforeRemove?.(String(args[0]));
    return originalRm(...args);
  };
  fs.copyFile = async (...args) => {
    await beforeCopy?.(String(args[1]));
    return originalCopyFile(...args);
  };
  fs.mkdir = (async (...args: Parameters<typeof fs.mkdir>) => {
    await beforeMkdir?.(String(args[0]));
    return originalMkdir(...args);
  }) as typeof fs.mkdir;
  syncBuiltinESMExports();
});

afterEach(async () => {
  fs.rm = originalRm;
  fs.copyFile = originalCopyFile;
  fs.mkdir = originalMkdir;
  syncBuiltinESMExports();
  for (const release of releases) release();
  await Promise.allSettled(pending);
  await originalRm(directory, { recursive: true, force: true });
});

it("admits a later copy only after the previous caller's cleanup finishes", async () => {
  const cleanup = holdCleanup();
  const copying = deferred();
  const releaseCopy = deferred();
  beforeCopy = async (destination) => {
    if (basename(destination).startsWith(".second.bin.")) {
      copying.resolve();
      await releaseCopy.promise;
    }
  };
  const first = startCopy("first.bin");
  await cleanup.started;
  const second = startCopy("second.bin");
  await allowOverlappingCopy(copying.promise);
  cleanup.release();
  assert.equal((await first).cleanup, "removed");
  releaseCopy.resolve();

  await second;
  assert.deepEqual(await fs.readFile(join(directory, "first.bin")), payload);
  assert.deepEqual(await fs.readFile(join(directory, "second.bin")), payload);
  assert.equal(fetchCount, 2, "the second caller starts a new download after the first was cleared");
});

it("fences a deferred cleanup when the last earlier copy fails", async () => {
  const cleanup = holdCleanup();
  const failingCopy = deferred();
  const releaseFailure = deferred();
  const laterCopy = deferred();
  const releaseLaterCopy = deferred();
  beforeCopy = async (destination) => {
    if (basename(destination).startsWith(".failed.bin.")) {
      failingCopy.resolve();
      await releaseFailure.promise;
      throw new Error("synthetic copy failure");
    }
    if (basename(destination).startsWith(".later.bin.")) {
      laterCopy.resolve();
      await releaseLaterCopy.promise;
    }
  };
  const first = startCopy("first.bin");
  const failed = startCopy("failed.bin");
  await failingCopy.promise;
  assert.equal((await first).cleanup, "deferred");
  releaseFailure.resolve();
  await cleanup.started;
  const later = startCopy("later.bin");
  await allowOverlappingCopy(laterCopy.promise);
  cleanup.release();
  await assert.rejects(failed, /synthetic copy failure/);
  releaseLaterCopy.resolve();

  await later;
  assert.deepEqual(await fs.readFile(join(directory, "first.bin")), payload);
  assert.deepEqual(await fs.readFile(join(directory, "later.bin")), payload);
});

it("fulfills an earlier deferred clear exactly once when the last copy succeeds", async () => {
  const copying = deferred();
  const releaseCopy = deferred();
  beforeCopy = async (destination) => {
    if (basename(destination).startsWith(".second.bin.")) {
      copying.resolve();
      await releaseCopy.promise;
    }
  };
  const first = startCopy("first.bin");
  const second = startCopy("second.bin");
  await copying.promise;
  assert.equal((await first).cleanup, "deferred");
  releaseCopy.resolve();

  assert.equal((await second).cleanup, "removed");
  assert.equal(removals, 1);
  assert.equal(fetchCount, 1);
});

it("lets a caller abort its cleanup wait without interrupting the cleanup owner", async () => {
  const cleanup = holdCleanup();
  const first = startCopy("first.bin");
  await cleanup.started;
  const controller = new AbortController();
  const aborted = startCopy("aborted.bin", { signal: controller.signal });
  controller.abort();

  await assert.rejects(aborted, { code: MANAGED_DOWNLOAD_ERROR_CODES.ABORTED });
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  cleanup.release();
  await first;
  await startCopy("later.bin");
  assert.deepEqual(await fs.readFile(join(directory, "later.bin")), payload);
});

it("allows a later caller to recover after the previous cleanup rejects", async () => {
  const started = deferred();
  const release = deferred();
  let copied = false;
  let failed = false;
  beforeCopy = async () => { copied = true; };
  beforeMkdir = async (filename) => {
    if (filename === target.basePath && copied && !failed) {
      failed = true;
      started.resolve();
      await release.promise;
      throw new Error("synthetic cleanup failure");
    }
  };
  const first = startCopy("first.bin");
  await started.promise;
  const second = startCopy("second.bin");
  release.resolve();

  assert.match((await first).cleanupWarning!, /synthetic cleanup failure/);
  await second;
  assert.deepEqual(await fs.readFile(join(directory, "second.bin")), payload);
  assert.equal(fetchCount, 1, "the retained verified file is reusable after cleanup failure");
});
