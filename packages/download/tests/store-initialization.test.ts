import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, it } from "vitest";

import { STORE_SENTINEL } from "../src/constants.js";
import { MANAGED_DOWNLOAD_ERROR_CODES } from "../src/errors.js";
import { managedDownload } from "../src/managed-download.js";
import { ensureManagedBase } from "../src/store.js";

const originalRename = fs.rename;
const originalLstat = fs.lstat;
const bytes = Buffer.from("parallel first downloads");
const checksum = { algorithm: "sha256" as const, value: createHash("sha256").update(bytes).digest("hex") };
let directory: string;
let pending: Promise<unknown>[];
let releases: (() => void)[];
let beforeRename: ((destination: string) => Promise<void>) | undefined;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  releases.push(resolve);
  return { promise, resolve };
}

function download(basePath: string, name: string) {
  const promise = managedDownload({
    basePath, bucket: "updates", fileName: name, maxAttempts: 1,
    payload: { url: `https://fixture.invalid/${name}`, checksum },
    fetch: async () => new Response(bytes),
  });
  pending.push(promise);
  void promise.catch(() => undefined);
  return promise;
}

function holdSentinel(basePath: string) {
  const started = deferred();
  const release = deferred();
  let held = false;
  beforeRename = async (destination) => {
    if (destination === join(basePath, STORE_SENTINEL) && !held) {
      held = true;
      started.resolve();
      await release.promise;
    }
  };
  return { started: started.promise, release: release.resolve };
}

beforeEach(async () => {
  directory = await fs.mkdtemp(join(tmpdir(), "download-store-init-"));
  pending = [];
  releases = [];
  beforeRename = undefined;
  fs.rename = async (...args) => {
    await beforeRename?.(String(args[1]));
    return originalRename(...args);
  };
  syncBuiltinESMExports();
});

afterEach(async () => {
  fs.rename = originalRename;
  fs.lstat = originalLstat;
  syncBuiltinESMExports();
  for (const release of releases) release();
  await Promise.allSettled(pending);
  await fs.rm(directory, { recursive: true, force: true });
});

it("initializes one fresh base for concurrent downloads of different targets", async () => {
  const basePath = join(directory, "managed");
  const results = await Promise.allSettled(Array.from({ length: 20 }, (_, index) => download(basePath, `asset-${index}.bin`)));

  for (const result of results) {
    assert.equal(result.status, "fulfilled", result.status === "rejected" ? String(result.reason) : undefined);
    if (result.status === "fulfilled") assert.deepEqual(await fs.readFile(result.value.path), bytes);
  }
  assert.equal((await fs.readdir(basePath)).some(name => name.endsWith(".tmp")), false);
});

it("waits for an in-progress sentinel publication instead of treating its temporary file as foreign content", async () => {
  const basePath = join(directory, "managed");
  const sentinel = holdSentinel(basePath);
  const first = download(basePath, "first.bin");
  await sentinel.started;
  const second = download(basePath, "second.bin");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // The old caller rejects as soon as it sees the real unpublished sentinel.
    // A shared initialization waits, so bound this rendezvous before publishing.
    await Promise.race([
      second.then(() => undefined, () => undefined),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, 500); }),
    ]);
  } finally {
    clearTimeout(timer);
    sentinel.release();
  }

  const results = await Promise.all([first, second]);
  for (const result of results) assert.deepEqual(await fs.readFile(result.path), bytes);
});

it("does not block a different base while initialization is pending", async () => {
  const basePath = join(directory, "held");
  const sentinel = holdSentinel(basePath);
  const first = download(basePath, "first.bin");
  await sentinel.started;
  try {
    const independent = await download(join(directory, "independent"), "other.bin");
    assert.deepEqual(await fs.readFile(independent.path), bytes);
  } finally {
    sentinel.release();
  }
  await first;
});

it("allows initialization to be retried after a filesystem failure", async () => {
  const basePath = join(directory, "retry");
  const error = Object.assign(new Error("temporary stat failure"), { code: "EACCES" });
  let fail = true;
  fs.lstat = ((...args: Parameters<typeof fs.lstat>) => {
    if (String(args[0]) === basePath && fail) {
      fail = false;
      return Promise.reject(error);
    }
    return originalLstat(...args);
  }) as typeof fs.lstat;
  syncBuiltinESMExports();
  await assert.rejects(ensureManagedBase(basePath), candidate => candidate === error);

  const result = await download(basePath, "retry.bin");
  assert.deepEqual(await fs.readFile(result.path), bytes);
});

it("revalidates ownership after a successful initialization instead of caching it permanently", async () => {
  const basePath = join(directory, "managed");
  await ensureManagedBase(basePath);
  await fs.writeFile(join(basePath, STORE_SENTINEL), JSON.stringify({ kind: "another-owner" }));
  await fs.writeFile(join(basePath, "foreign.txt"), "keep me");

  await assert.rejects(ensureManagedBase(basePath), { code: MANAGED_DOWNLOAD_ERROR_CODES.STORE_NOT_OWNED });
  assert.equal(await fs.readFile(join(basePath, "foreign.txt"), "utf8"), "keep me");
});
