import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, it } from "vitest";

import { MANAGED_DOWNLOAD_ERROR_CODES } from "../src/errors.js";
import { managedDownload } from "../src/managed-download.js";
import { createManifest, readManifest } from "../src/manifest.js";
import { ensureManagedBase } from "../src/store.js";
import { targetFromOptions } from "../src/target.js";
import type { ManagedDownloadOptions, ManagedDownloadProgress } from "../src/types.js";

const cleanup: (() => Promise<void>)[] = [];
const payload = Buffer.from("abcdefghijklmnopqrstuvwxyz");
const initialBytes = 4;
const etag = '"range-fixture"';

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function fixture(handler: (request: IncomingMessage, response: ServerResponse) => void, knownTotal = true) {
  const basePath = await mkdtemp(join(tmpdir(), "od-download-ranges-"));
  cleanup.push(() => rm(basePath, { recursive: true, force: true }));
  const server = createServer(handler);
  cleanup.push(() => new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  }));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const options: ManagedDownloadOptions = {
    basePath, bucket: "updates", fileName: "payload.bin", maxAttempts: 1,
    payload: {
      url: `http://127.0.0.1:${address.port}/payload`,
      checksum: { algorithm: "sha256", value: createHash("sha256").update(payload).digest("hex") },
      headers: { authorization: "Bearer fixture" },
    },
  };
  const target = targetFromOptions(options);
  await ensureManagedBase(basePath);
  await mkdir(dirname(target.partialPath), { recursive: true });
  await mkdir(dirname(target.manifestPath), { recursive: true });
  await writeFile(target.partialPath, payload.subarray(0, initialBytes));
  await writeFile(target.manifestPath, JSON.stringify(createManifest(target, "partial", {
    validators: { etag }, ...(knownTotal ? { totalBytes: payload.length } : {}),
  })));
  return { options, target };
}

function sendRange(response: ServerResponse, start: number, end: number, total: number | "*" = payload.length) {
  response.writeHead(206, {
    "content-range": `bytes ${start}-${end}/${total}`,
    "content-length": end - start + 1,
    etag,
  });
  response.end(payload.subarray(start, end + 1));
}

for (const totalSource of ["response", "manifest"] as const) {
  it(`continues successful partial ranges using the ${totalSource} total without spending retries`, async () => {
    const ranges: string[] = [];
    const progress: ManagedDownloadProgress[] = [];
    const { options, target } = await fixture((request, response) => {
      ranges.push(String(request.headers.range));
      assert.equal(request.headers.authorization, "Bearer fixture");
      assert.equal(request.headers["if-range"], etag);
      const start = Number(/^bytes=(\d+)-$/.exec(String(request.headers.range))?.[1]);
      sendRange(response, start, Math.min(start + 3, payload.length - 1), totalSource === "response" ? payload.length : "*");
    }, totalSource === "manifest");

    const result = await managedDownload({ ...options, onProgress: (event) => { progress.push(event); } });

    assert.equal(result.resumed, true);
    assert.equal(result.bytes, payload.length);
    assert.deepEqual(await readFile(result.path), payload);
    assert.deepEqual(ranges, ["bytes=4-", "bytes=8-", "bytes=12-", "bytes=16-", "bytes=20-", "bytes=24-"]);
    assert.equal(progress.at(-1)?.receivedBytes, payload.length);
    assert.equal(progress.at(-1)?.sessionReceivedBytes, payload.length - initialBytes);
    assert.ok(progress.every((event, index) => index === 0 || event.sessionReceivedBytes >= progress[index - 1]!.sessionReceivedBytes));
    const manifest = await readManifest(target.manifestPath);
    assert.ok(manifest && manifest !== "invalid");
    assert.equal(manifest.state, "complete");
    assert.equal(manifest.totalBytes, payload.length);
  });
}

it("restarts from zero if a later range has a conflicting validator", async () => {
  const ranges: (string | undefined)[] = [];
  const { options } = await fixture((request, response) => {
    ranges.push(request.headers.range);
    if (request.headers.range === undefined) {
      response.writeHead(200, { "content-length": payload.length, etag: '"replacement"' });
      response.end(payload);
    } else if (request.headers.range === "bytes=4-") {
      sendRange(response, 4, 7);
    } else {
      response.writeHead(206, { "content-range": "bytes 8-11/26", etag: '"replacement"' });
      response.end("bad!");
    }
  });

  const result = await managedDownload(options);

  assert.deepEqual(ranges, ["bytes=4-", "bytes=8-", undefined]);
  assert.equal(result.resumed, false);
  assert.deepEqual(await readFile(result.path), payload);
});

it("retries a short range body from the bytes actually retained", async () => {
  const ranges: string[] = [];
  let shortened = false;
  const { options } = await fixture((request, response) => {
    ranges.push(String(request.headers.range));
    const start = Number(/^bytes=(\d+)-$/.exec(String(request.headers.range))?.[1]);
    if (start === 8 && !shortened) {
      shortened = true;
      response.writeHead(206, { "content-range": "bytes 8-11/26", etag });
      response.end(payload.subarray(8, 10));
    } else {
      sendRange(response, start, Math.min(start + 3, payload.length - 1));
    }
  });

  const result = await managedDownload({ ...options, maxAttempts: 2 });

  assert.deepEqual(ranges, ["bytes=4-", "bytes=8-", "bytes=10-", "bytes=14-", "bytes=18-", "bytes=22-"]);
  assert.equal(result.resumed, true);
  assert.deepEqual(await readFile(result.path), payload);
});

for (const failure of ["short body", "request failure"] as const) {
  it(`retains learned range metadata after a later ${failure}`, async () => {
    const ranges: string[] = [];
    const validators: (string | undefined)[] = [];
    let failed = false;
    const { options, target } = await fixture((request, response) => {
      ranges.push(String(request.headers.range));
      validators.push(request.headers["if-range"]);
      const start = Number(/^bytes=(\d+)-$/.exec(String(request.headers.range))?.[1]);
      if (start === 8 && !failed) {
        failed = true;
        if (failure === "request failure") {
          response.destroy();
        } else {
          response.writeHead(206, { "content-range": "bytes 8-11/*", etag });
          response.end(payload.subarray(8, 10));
        }
      } else {
        sendRange(response, start, Math.min(start + 3, payload.length - 1), start === initialBytes ? payload.length : "*");
      }
    }, false);
    await writeFile(target.manifestPath, JSON.stringify(createManifest(target, "partial")));

    const result = await managedDownload({ ...options, maxAttempts: 2 });

    assert.equal(result.resumed, true);
    assert.deepEqual(await readFile(result.path), payload);
    assert.deepEqual(ranges, failure === "short body"
      ? ["bytes=4-", "bytes=8-", "bytes=10-", "bytes=14-", "bytes=18-", "bytes=22-"]
      : ["bytes=4-", "bytes=8-", "bytes=8-", "bytes=12-", "bytes=16-", "bytes=20-", "bytes=24-"]);
    assert.equal(validators[0], undefined);
    assert.ok(validators.slice(1).every((value) => value === etag));
    const manifest = await readManifest(target.manifestPath);
    assert.ok(manifest && manifest !== "invalid");
    assert.equal(manifest.totalBytes, payload.length);
  });
}

it("keeps learned continuation metadata after the retry budget is exhausted", async () => {
  const { options, target } = await fixture((request, response) => {
    if (request.headers.range === "bytes=4-") {
      sendRange(response, 4, 7);
    } else {
      response.writeHead(206, { "content-range": "bytes 8-11/*", etag });
      response.end(payload.subarray(8, 10));
    }
  }, false);
  await writeFile(target.manifestPath, JSON.stringify(createManifest(target, "partial")));

  await assert.rejects(managedDownload(options), { code: MANAGED_DOWNLOAD_ERROR_CODES.NETWORK_EXHAUSTED });

  const manifest = await readManifest(target.manifestPath);
  assert.ok(manifest && manifest !== "invalid");
  assert.equal(manifest.state, "partial");
  assert.equal(manifest.totalBytes, payload.length);
  assert.deepEqual(manifest.validators, { etag });
  assert.deepEqual(await readFile(target.partialPath), payload.subarray(0, 10));
});

it("restarts when a learned validator changes after a later segment fails", async () => {
  const ranges: (string | undefined)[] = [];
  const validators: (string | undefined)[] = [];
  const { options, target } = await fixture((request, response) => {
    ranges.push(request.headers.range);
    validators.push(request.headers["if-range"]);
    if (request.headers.range === undefined) {
      response.writeHead(200, { "content-length": payload.length, etag: '"replacement"' });
      response.end(payload);
    } else if (request.headers.range === "bytes=4-") {
      sendRange(response, 4, 7);
    } else if (request.headers.range === "bytes=8-") {
      response.writeHead(206, { "content-range": "bytes 8-11/*", etag });
      response.end(payload.subarray(8, 10));
    } else {
      response.writeHead(206, { "content-range": "bytes 10-13/*", etag: '"replacement"' });
      response.end("bad!");
    }
  }, false);
  await writeFile(target.manifestPath, JSON.stringify(createManifest(target, "partial")));

  const result = await managedDownload({ ...options, maxAttempts: 2 });

  assert.deepEqual(ranges, ["bytes=4-", "bytes=8-", "bytes=10-", undefined]);
  assert.deepEqual(validators, [undefined, etag, etag, undefined]);
  assert.equal(result.resumed, false);
  assert.deepEqual(await readFile(result.path), payload);
});

it("bounds retries for an empty range instead of repeatedly requesting the same offset", async () => {
  let requests = 0;
  const { options, target } = await fixture((_request, response) => {
    requests += 1;
    response.writeHead(206, { "content-range": "bytes 4-7/26", etag });
    response.end();
  });

  await assert.rejects(managedDownload({ ...options, maxAttempts: 2 }), {
    code: MANAGED_DOWNLOAD_ERROR_CODES.NETWORK_EXHAUSTED,
  });

  assert.equal(requests, 2);
  assert.deepEqual(await readFile(target.partialPath), payload.subarray(0, initialBytes));
  const manifest = await readManifest(target.manifestPath);
  assert.ok(manifest && manifest !== "invalid");
  assert.equal(manifest.state, "partial");
});

it("still verifies a complete tail when neither response nor manifest knows the total", async () => {
  let requests = 0;
  const { options } = await fixture((_request, response) => {
    requests += 1;
    sendRange(response, initialBytes, payload.length - 1, "*");
  }, false);

  const result = await managedDownload(options);

  assert.equal(requests, 1);
  assert.equal(result.resumed, true);
  assert.deepEqual(await readFile(result.path), payload);
});
