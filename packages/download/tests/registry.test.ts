import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { getEventListeners } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, it } from "vitest";

import { writeJson } from "../src/fs-io.js";
import {
  MANAGED_DOWNLOAD_ERROR_CODES,
  managedDownload,
  type ManagedDownloadOptions,
  type ManagedDownloadProgress,
  type ManagedDownloadResult,
} from "../src/index.js";
import { createManifest } from "../src/manifest.js";
import { waitForTask, type ActiveTask } from "../src/registry.js";
import { ensureManagedBase } from "../src/store.js";
import { targetFromOptions } from "../src/target.js";

const roots: string[] = [];
const body = "shared bytes must not depend on an individual progress observer";
const checksum = { algorithm: "sha256", value: createHash("sha256").update(body).digest("hex") } as const;
const completed: ManagedDownloadResult = {
  bucket: "artifacts", bytes: body.length, checksum, fileName: "payload.bin",
  path: "completed/payload.bin", reusedComplete: false, resumed: false, urlDigest: "fixture",
};

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

/** Expose the same progress fan-out used by the shared transfer. */
function taskFixture() {
  let resolve!: (value: ManagedDownloadResult) => void;
  let reject!: (error: unknown) => void;
  const task: ActiveTask = {
    targetKey: "fixture",
    listeners: new Set(),
    promise: new Promise((resolveTask, rejectTask) => { resolve = resolveTask; reject = rejectTask; }),
  };
  return {
    task,
    complete: () => resolve(completed),
    fail: (error: unknown) => reject(error),
    emit: (receivedBytes: number) => {
      for (const listener of task.listeners) listener({ receivedBytes, sessionReceivedBytes: receivedBytes });
    },
  };
}

describe("managed download progress subscribers", () => {
  it("retains a shared callback for another waiter after one caller aborts", async () => {
    const source = taskFixture();
    const controller = new AbortController();
    const received: number[] = [];
    const onProgress = (progress: ManagedDownloadProgress) => received.push(progress.receivedBytes);
    const first = waitForTask(source.task, { onProgress, signal: controller.signal });
    const second = waitForTask(source.task, { onProgress });
    const outcomes = Promise.allSettled([first, second]);

    controller.abort();
    source.emit(10);
    source.complete();
    const [cancelled, retained] = await outcomes;

    assert.deepEqual(received, [10]);
    assert.equal(cancelled?.status, "rejected");
    if (cancelled?.status === "rejected") assert.equal(cancelled.reason.code, MANAGED_DOWNLOAD_ERROR_CODES.ABORTED);
    assert.deepEqual(retained, { status: "fulfilled", value: completed });
  });

  it("rejects only a throwing observer and detaches its signal before more progress", async () => {
    const source = taskFixture();
    const controller = new AbortController();
    const failure = new Error("progress observer failed");
    let calls = 0;
    const healthy: number[] = [];
    const first = waitForTask(source.task, {
      signal: controller.signal,
      onProgress: () => { calls += 1; throw failure; },
    });
    const second = waitForTask(source.task, { onProgress: (progress) => healthy.push(progress.receivedBytes) });
    const outcomes = Promise.allSettled([first, second]);
    let thrown: unknown;
    try {
      source.emit(10);
      source.emit(20);
    } catch (error) {
      thrown = error;
    }
    const remainingAbortListeners = getEventListeners(controller.signal, "abort").length;
    source.complete();
    const [failed, retained] = await outcomes;

    assert.equal(thrown, undefined);
    assert.equal(calls, 1);
    assert.equal(remainingAbortListeners, 0);
    assert.deepEqual(healthy, [10, 20]);
    assert.deepEqual(failed, { status: "rejected", reason: failure });
    assert.deepEqual(retained, { status: "fulfilled", value: completed });
  });

  it("lets an observer cancel itself without skipping other subscribers", async () => {
    const source = taskFixture();
    const controller = new AbortController();
    const healthy: number[] = [];
    const first = waitForTask(source.task, { signal: controller.signal, onProgress: () => controller.abort() });
    const second = waitForTask(source.task, { onProgress: (progress) => healthy.push(progress.receivedBytes) });
    const outcomes = Promise.allSettled([first, second]);

    source.emit(10);
    source.emit(20);
    source.complete();
    const [cancelled, retained] = await outcomes;

    assert.equal(cancelled?.status, "rejected");
    assert.deepEqual(healthy, [10, 20]);
    assert.deepEqual(retained, { status: "fulfilled", value: completed });
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  });

  it("still propagates the shared transfer's own error to every caller", async () => {
    const source = taskFixture();
    const controller = new AbortController();
    const failure = new Error("transfer failed");
    const outcomes = Promise.allSettled([
      waitForTask(source.task, { signal: controller.signal, onProgress: () => {} }),
      waitForTask(source.task, {}),
    ]);

    source.fail(failure);

    assert.deepEqual(await outcomes, [{ status: "rejected", reason: failure }, { status: "rejected", reason: failure }]);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  });

  for (const resume of [false, true]) {
    it(`keeps a shared real transfer running after an observer fails during ${resume ? "resume progress replay" : "body progress"}`, async () => {
      const root = await mkdtemp(join(tmpdir(), "od-progress-subscriber-"));
      roots.push(root);
      const prefix = resume ? body.slice(0, 10) : "";
      let requests = 0;
      const options: ManagedDownloadOptions = {
        basePath: join(root, "downloads"), bucket: "artifacts", fileName: "payload.bin",
        payload: { checksum, url: "https://example.invalid/payload.bin" },
        maxAttempts: 2,
        fetch: async (_url, init) => {
          requests += 1;
          if (resume) assert.equal(new Headers(init?.headers).get("range"), `bytes=${prefix.length}-`);
          return new Response(body.slice(prefix.length), resume ? {
            status: 206,
            headers: { "content-range": `bytes ${prefix.length}-${body.length - 1}/${body.length}` },
          } : {});
        },
      };
      if (resume) {
        const target = targetFromOptions(options);
        await ensureManagedBase(options.basePath);
        await writeFile(target.partialPath, prefix);
        await writeJson(target.manifestPath, createManifest(target, "partial", { totalBytes: body.length }));
      }
      const failure = new Error("observer failed");
      let failedObserverCalls = 0;
      const healthy: ManagedDownloadProgress[] = [];

      const [failed, retained] = await Promise.allSettled([
        managedDownload({ ...options, onProgress: () => { failedObserverCalls += 1; throw failure; } }),
        managedDownload({ ...options, onProgress: (progress) => healthy.push(progress) }),
      ]);

      assert.deepEqual(failed, { status: "rejected", reason: failure });
      assert.ok(retained?.status === "fulfilled");
      assert.equal(retained.value.resumed, resume);
      assert.equal(await readFile(retained.value.path, "utf8"), body);
      assert.equal(requests, 1, "observer errors must not trigger network retries");
      assert.equal(failedObserverCalls, 1);
      assert.ok(healthy.length > 0);
      if (resume) assert.ok(healthy.some((progress) => progress.sessionReceivedBytes === 0 && progress.receivedBytes === prefix.length));
    });
  }
});
