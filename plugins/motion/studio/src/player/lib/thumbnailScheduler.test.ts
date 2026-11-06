import { describe, expect, it, vi } from "vitest";
import { resolveTimelineViewportBudgets } from "./timelineViewportBudgets";
import {
  createThumbnailKey,
  createThumbnailRequestIdentity,
  ThumbnailScheduler,
  type ThumbnailLoadedResult,
  type ThumbnailPriority,
  type ThumbnailRequest,
} from "./thumbnailScheduler";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function result(name: string, weight = 1, dispose = vi.fn()): ThumbnailLoadedResult {
  return { value: { kind: "image", url: name, aspect: 1 }, weight, dispose };
}

function request(
  key: string,
  load: ThumbnailRequest["load"],
  priority: ThumbnailPriority = "visible",
  overrides: Partial<ThumbnailRequest> = {},
): ThumbnailRequest {
  return {
    key,
    projectId: "project-a",
    sessionEpoch: 1,
    kind: "image",
    priority,
    load,
    ...overrides,
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("ThumbnailScheduler", () => {
  it("deduplicates identical requests and releases subscribers independently", async () => {
    const scheduler = new ThumbnailScheduler();
    const pending = deferred<ThumbnailLoadedResult>();
    const load = vi.fn(() => pending.promise);
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    const leaseA = scheduler.acquire(request("same", load), listenerA);
    const leaseB = scheduler.acquire(request("same", load), listenerB);
    expect(load).toHaveBeenCalledTimes(1);

    leaseA.release();
    listenerA.mockClear();
    pending.resolve(result("poster"));
    await flush();
    expect(scheduler.getSnapshot(request("same", load))).toMatchObject({
      status: "ready",
      value: { url: "poster" },
    });
    expect(listenerA).not.toHaveBeenCalled();
    expect(listenerB).toHaveBeenCalled();

    leaseB.release();
    expect(scheduler.getDiagnostics().leases).toBe(0);
  });

  it("keeps snapshots referentially stable and supports independent leases sharing a callback", async () => {
    const scheduler = new ThumbnailScheduler();
    const listener = vi.fn();
    const shared = request("stable", async () => result("stable"));
    const first = scheduler.acquire(shared, listener);
    const second = scheduler.acquire(shared, listener);
    await flush();
    expect(scheduler.getSnapshot(shared)).toBe(scheduler.getSnapshot(shared));
    listener.mockClear();
    scheduler.invalidateProject("project-a");
    expect(listener).not.toHaveBeenCalled();
    expect(scheduler.getDiagnostics().leases).toBe(2);
    first.release();
    second.release();
    scheduler.invalidateProject("project-a");
    expect(scheduler.getSnapshot(shared).status).toBe("idle");
  });

  it("scopes the same caller key by work shape", async () => {
    const scheduler = new ThumbnailScheduler();
    const poster = request("shared", async () => result("poster"));
    const strip = request("shared", async () => result("strip"), "visible", {
      kind: "video",
      rich: true,
    });

    scheduler.acquire(poster, vi.fn());
    scheduler.acquire(strip, vi.fn());
    await flush();

    expect(scheduler.getSnapshot(poster)).toMatchObject({
      status: "ready",
      value: { url: "poster" },
    });
    expect(scheduler.getSnapshot(strip)).toMatchObject({
      status: "ready",
      value: { url: "strip" },
    });
  });

  it("orders interaction before visible before overscan when a slot opens", async () => {
    const scheduler = new ThumbnailScheduler(
      resolveTimelineViewportBudgets({ concurrentMetadataJobs: 1 }),
    );
    const first = deferred<ThumbnailLoadedResult>();
    const starts: string[] = [];
    const load = (name: string, pending?: ReturnType<typeof deferred<ThumbnailLoadedResult>>) =>
      vi.fn(() => {
        starts.push(name);
        return pending?.promise ?? Promise.resolve(result(name));
      });

    scheduler.acquire(request("first", load("first", first)), vi.fn());
    scheduler.acquire(request("overscan", load("overscan"), "overscan"), vi.fn());
    scheduler.acquire(request("visible", load("visible"), "visible"), vi.fn());
    scheduler.acquire(request("interaction", load("interaction"), "interaction"), vi.fn());
    expect(starts).toEqual(["first"]);

    first.resolve(result("first"));
    await vi.waitFor(() => {
      expect(starts).toEqual(["first", "interaction", "visible", "overscan"]);
    });
  });

  it("suspends new rich work while scrolling but lets posters proceed", async () => {
    const scheduler = new ThumbnailScheduler();
    const richLoad = vi.fn(async () => result("rich"));
    const posterLoad = vi.fn(async () => result("poster"));
    scheduler.setScrolling(true);

    scheduler.acquire(request("rich", richLoad, "interaction", { rich: true }), vi.fn());
    scheduler.acquire(request("poster", posterLoad), vi.fn());
    await flush();
    expect(richLoad).not.toHaveBeenCalled();
    expect(posterLoad).toHaveBeenCalledTimes(1);

    scheduler.setScrolling(false);
    await flush();
    expect(richLoad).toHaveBeenCalledTimes(1);
  });

  it("starts no visible or overscan video decode while the preview plays, but still a scrub's", async () => {
    const scheduler = new ThumbnailScheduler();
    const starts: string[] = [];
    const load = (name: string) =>
      vi.fn(async () => {
        starts.push(name);
        return result(name);
      });
    const video = { kind: "video" as const };
    scheduler.setPlaybackActive(true);

    const visible = scheduler.acquire(
      request("visible", load("visible"), "visible", video),
      vi.fn(),
    );
    scheduler.acquire(request("overscan", load("overscan"), "overscan", video), vi.fn());
    scheduler.acquire(request("scrub", load("scrub"), "interaction", video), vi.fn());
    scheduler.acquire(request("image", load("image"), "visible"), vi.fn());
    await flush();
    expect(starts).toEqual(["scrub", "image"]);

    visible.updatePriority("interaction");
    await flush();
    expect(starts).toEqual(["scrub", "image", "visible"]);
  });

  it("drains the video decodes it held once playback pauses", async () => {
    const scheduler = new ThumbnailScheduler();
    const starts: string[] = [];
    const load = (name: string) =>
      vi.fn(async () => {
        starts.push(name);
        return result(name);
      });
    scheduler.setPlaybackActive(true);
    scheduler.acquire(request("visible", load("visible"), "visible", { kind: "video" }), vi.fn());
    scheduler.acquire(
      request("overscan", load("overscan"), "overscan", { kind: "video" }),
      vi.fn(),
    );
    await flush();
    expect(starts).toEqual([]);

    scheduler.setPlaybackActive(false);
    await vi.waitFor(() => expect(starts).toEqual(["visible", "overscan"]));
  });

  it("holds composition renders while the preview reloads and re-runs the ones it preempted", async () => {
    const scheduler = new ThumbnailScheduler();
    const signals: AbortSignal[] = [];
    const composition = vi.fn((signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<ThumbnailLoadedResult>((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        if (signals.length > 1) resolve(result("scene"));
      });
    });
    const image = vi.fn(async () => result("still"));
    const scene = request("scene", composition, "visible", { kind: "composition" });
    const still = request("still", image);

    scheduler.acquire(scene, vi.fn());
    expect(composition).toHaveBeenCalledTimes(1);
    scheduler.setPreviewReloading(true);
    await flush();
    expect(signals[0]?.aborted).toBe(true);
    expect(scheduler.getSnapshot(scene)).toEqual({ status: "queued" });
    scheduler.acquire(still, vi.fn());
    expect(image).toHaveBeenCalledTimes(1);
    expect(composition).toHaveBeenCalledTimes(1);

    scheduler.setPreviewReloading(false);
    await flush();
    expect(composition).toHaveBeenCalledTimes(2);
    expect(scheduler.getSnapshot(scene)).toMatchObject({
      status: "ready",
      value: { url: "scene" },
    });
  });

  it("aborts queued and active jobs after the final release", async () => {
    const scheduler = new ThumbnailScheduler(
      resolveTimelineViewportBudgets({ concurrentVideoDecodes: 1 }),
    );
    const active = deferred<ThumbnailLoadedResult>();
    let activeSignal: AbortSignal | undefined;
    const activeLease = scheduler.acquire(
      request(
        "active",
        (signal) => {
          activeSignal = signal;
          return active.promise;
        },
        "visible",
        { kind: "video" },
      ),
      vi.fn(),
    );
    const queuedLoad = vi.fn(async () => result("queued"));
    const queuedLease = scheduler.acquire(
      request("queued", queuedLoad, "visible", { kind: "video" }),
      vi.fn(),
    );

    queuedLease.release();
    activeLease.release();
    expect(activeSignal?.aborted).toBe(true);
    expect(queuedLoad).not.toHaveBeenCalled();
    active.reject(new DOMException("aborted", "AbortError"));
    await flush();
    expect(scheduler.getDiagnostics()).toMatchObject({ queued: 0, active: 0, leases: 0 });
  });

  it("starts nothing that a release later in the same batch drops", async () => {
    const scheduler = new ThumbnailScheduler(
      resolveTimelineViewportBudgets({ concurrentVideoDecodes: 1 }),
    );
    const video = (key: string, load: ThumbnailRequest["load"]) =>
      scheduler.acquire(request(key, load, "visible", { kind: "video" }), vi.fn());
    const activeLease = video("active", () => deferred<ThumbnailLoadedResult>().promise);
    const droppedLoad = vi.fn(async () => result("dropped"));
    const droppedLease = video("dropped", droppedLoad);
    const keptLoad = vi.fn(async () => result("kept"));
    video("kept", keptLoad);

    // A timeline jump unmounts its clips in one commit, the loading one first.
    activeLease.release();
    droppedLease.release();
    await flush();
    expect(droppedLoad).not.toHaveBeenCalled();
    expect(keptLoad).toHaveBeenCalledTimes(1);
  });

  it("frees an aborted job's slot at once, even when its loader ignores the abort", async () => {
    const scheduler = new ThumbnailScheduler(
      resolveTimelineViewportBudgets({ concurrentVideoDecodes: 1 }),
    );
    const stuck = deferred<ThumbnailLoadedResult>();
    const lease = scheduler.acquire(
      request("stuck", () => stuck.promise, "visible", { kind: "video" }),
      vi.fn(),
    );
    lease.release();
    const nextLoad = vi.fn(async () => result("next"));
    scheduler.acquire(request("next", nextLoad, "visible", { kind: "video" }), vi.fn());
    expect(nextLoad).toHaveBeenCalledTimes(1);
  });

  it("disposes a late result exactly once after its final lease releases", async () => {
    const scheduler = new ThumbnailScheduler();
    const pending = deferred<ThumbnailLoadedResult>();
    const dispose = vi.fn();
    const lease = scheduler.acquire(
      request("late", () => pending.promise),
      vi.fn(),
    );

    lease.release();
    pending.resolve(result("late", 1, dispose));
    await flush();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(scheduler.getSnapshot(request("late", () => pending.promise))).toEqual({
      status: "idle",
    });
  });

  it("preserves a synchronous re-acquire when an expired failure is replaced", async () => {
    vi.useFakeTimers();
    const scheduler = new ThumbnailScheduler(
      resolveTimelineViewportBudgets({ metadataFailureTtlMs: 10 }),
    );
    const load = vi
      .fn<ThumbnailRequest["load"]>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue(result("recovered"));
    const failed = request("retry", load);
    let reacquireOnNotify = false;
    let nestedLease: ReturnType<ThumbnailScheduler["acquire"]> | undefined;
    const firstLease = scheduler.acquire(failed, () => {
      if (!reacquireOnNotify) return;
      reacquireOnNotify = false;
      nestedLease = scheduler.acquire(failed, vi.fn());
    });
    await flush();
    vi.advanceTimersByTime(11);
    reacquireOnNotify = true;

    const outerLease = scheduler.acquire(failed, vi.fn());
    await flush();

    expect(load).toHaveBeenCalledTimes(2);
    expect(scheduler.getSnapshot(failed)).toMatchObject({
      status: "ready",
      value: { url: "recovered" },
    });
    expect(scheduler.getDiagnostics().leases).toBe(2);
    firstLease.release();
    nestedLease?.release();
    outerLease.release();
    vi.useRealTimers();
  });

  it("times out a hung loader, frees its bucket, and disposes a late result", async () => {
    vi.useFakeTimers();
    const scheduler = new ThumbnailScheduler(
      resolveTimelineViewportBudgets({
        concurrentVideoDecodes: 1,
        thumbnailLoadTimeoutMs: 10,
      }),
    );
    const hung = deferred<ThumbnailLoadedResult>();
    const dispose = vi.fn();
    let signal: AbortSignal | undefined;
    const hungRequest = request(
      "hung",
      (activeSignal) => {
        signal = activeSignal;
        return hung.promise;
      },
      "visible",
      { kind: "video" },
    );
    const nextLoad = vi.fn(async () => result("next"));
    const nextRequest = request("next", nextLoad, "visible", { kind: "video" });
    const hungLease = scheduler.acquire(hungRequest, vi.fn());
    const nextLease = scheduler.acquire(nextRequest, vi.fn());

    await vi.advanceTimersByTimeAsync(11);
    await flush();
    expect(signal?.aborted).toBe(true);
    // Said apart from a cancel: a job that timed out without progress failed its source.
    expect(signal?.reason).toMatchObject({ name: "TimeoutError" });
    expect(nextLoad).toHaveBeenCalledTimes(1);
    expect(scheduler.getSnapshot(hungRequest).status).toBe("error");

    hung.resolve(result("late", 1, dispose));
    await flush();
    expect(dispose).toHaveBeenCalledTimes(1);
    hungLease.release();
    nextLease.release();
    vi.useRealTimers();
  });

  it("isolates late results by session epoch", async () => {
    const scheduler = new ThumbnailScheduler();
    const old = deferred<ThumbnailLoadedResult>();
    const oldRequest = request("poster", () => old.promise, "visible", { sessionEpoch: 1 });
    const nextRequest = request("poster", async () => result("next"), "visible", {
      sessionEpoch: 2,
    });
    scheduler.acquire(oldRequest, vi.fn());
    scheduler.acquire(nextRequest, vi.fn());
    await flush();
    old.resolve(result("old"));
    await flush();
    expect(scheduler.getSnapshot(nextRequest)).toMatchObject({
      status: "ready",
      value: { url: "next" },
    });
  });

  it("turns synchronous loader errors into bounded failure snapshots", async () => {
    const scheduler = new ThumbnailScheduler();
    const bad = request("throws", () => {
      throw new Error("sync failure");
    });
    const lease = scheduler.acquire(bad, vi.fn());
    await flush();
    expect(scheduler.getSnapshot(bad)).toMatchObject({ status: "error" });
    expect(scheduler.getDiagnostics().active).toBe(0);
    lease.release();
  });

  it("disposes uncached results after the final lease and tolerates broken disposers", async () => {
    const scheduler = new ThumbnailScheduler(
      resolveTimelineViewportBudgets({ thumbnailCacheBytes: 1 }),
    );
    const dispose = vi.fn(() => {
      throw new Error("cleanup failure");
    });
    const oversized = request("oversized", async () => result("large", 2, dispose));
    const lease = scheduler.acquire(oversized, vi.fn());
    await flush();
    expect(scheduler.getSnapshot(oversized).status).toBe("ready");
    expect(() => lease.release()).not.toThrow();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(scheduler.getSnapshot(oversized).status).toBe("idle");
  });

  it("evicts least-recently-used unleased values by bytes, count, and project count", async () => {
    const scheduler = new ThumbnailScheduler(
      resolveTimelineViewportBudgets({
        thumbnailCacheBytes: 6,
        thumbnailCacheEntries: 2,
        thumbnailCacheEntriesPerProject: 2,
      }),
    );
    const disposals = [vi.fn(), vi.fn(), vi.fn()];
    for (let index = 0; index < 3; index++) {
      const lease = scheduler.acquire(
        request(`key-${index}`, async () => result(`url-${index}`, 3, disposals[index])),
        vi.fn(),
      );
      await flush();
      lease.release();
    }

    expect(scheduler.getDiagnostics()).toMatchObject({ cacheEntries: 2, cacheBytes: 6 });
    expect(disposals[0]).toHaveBeenCalledTimes(1);
    expect(disposals[1]).not.toHaveBeenCalled();
    expect(disposals[2]).not.toHaveBeenCalled();
  });

  it("keeps failed requests quiet until the TTL expires", async () => {
    vi.useFakeTimers();
    const scheduler = new ThumbnailScheduler(
      resolveTimelineViewportBudgets({ metadataFailureTtlMs: 100 }),
    );
    const load = vi.fn(async () => {
      throw new Error("unsupported");
    });

    const first = scheduler.acquire(request("failed", load), vi.fn());
    await flush();
    first.release();
    const second = scheduler.acquire(request("failed", load), vi.fn());
    expect(load).toHaveBeenCalledTimes(1);
    second.release();

    vi.advanceTimersByTime(101);
    scheduler.acquire(request("failed", load), vi.fn());
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe("createThumbnailKey", () => {
  it("normalizes field order and preserves sentinel zero values", () => {
    expect(createThumbnailKey({ source: "clip a", time: 0, missing: undefined })).toBe(
      createThumbnailKey({ time: 0, source: "clip a" }),
    );
  });

  it("includes the work shape in request identity", () => {
    const poster = request("shared", vi.fn(), "visible", { kind: "video" });
    const strip = { ...poster, rich: true };
    expect(createThumbnailRequestIdentity(poster)).not.toBe(createThumbnailRequestIdentity(strip));
  });
});
