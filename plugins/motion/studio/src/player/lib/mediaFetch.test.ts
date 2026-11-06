import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaFetchError, mediaUrlSourceOptions, reportMediaFetchFailure } from "./mediaFetch";

const URL_WITH_PATH = "http://127.0.0.1:5190/api/projects/demo/preview/clips/take-1.mp4";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mediaUrlSourceOptions", () => {
  it("turns a network failure into a typed error without the URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const { fetchFn } = mediaUrlSourceOptions("probe");

    const error = await fetchFn(URL_WITH_PATH).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MediaFetchError);
    expect(error).toMatchObject({ reader: "probe", status: null, code: "TypeError" });
    expect(String((error as Error).message)).not.toContain("take-1");
  });

  it("names the network code when the failure carries one", async () => {
    const failure = Object.assign(new TypeError("fetch failed"), { cause: { code: "EBUSY" } });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(failure));

    const error = await mediaUrlSourceOptions("thumbnail")
      .fetchFn(URL_WITH_PATH)
      .catch((e) => e);

    expect(error).toMatchObject({ reader: "thumbnail", code: "EBUSY" });
  });

  it("turns an HTTP error status into a typed error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));

    const error = await mediaUrlSourceOptions("probe")
      .fetchFn(URL_WITH_PATH)
      .catch((e) => e);

    expect(error).toMatchObject({
      status: 403,
      message: "probe range fetch failed: HTTP 403 after 0 retries",
    });
  });

  it("lets a cancellation through untouched", async () => {
    const abort = new DOMException("Aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));

    await expect(mediaUrlSourceOptions("probe").fetchFn(URL_WITH_PATH)).rejects.toBe(abort);
  });

  it("retries a network failure twice, then gives up and records the retries", () => {
    const { getRetryDelay } = mediaUrlSourceOptions("probe");
    const failure = new MediaFetchError("probe", null, "TypeError");

    expect([1, 2, 3].map((attempt) => getRetryDelay(attempt, failure))).toEqual([0.5, 1, null]);
    expect(failure).toMatchObject({
      retries: 2,
      message: "probe range fetch failed: network TypeError after 2 retries",
    });
  });

  it("gives up on a body that breaks mid-read with the typed error, through a real mediabunny read", async () => {
    const brokenBody = () =>
      new Response(
        new ReadableStream({
          pull: (controller) => controller.error(new TypeError("network error")),
        }),
        {
          status: 206,
          headers: { "Content-Range": "bytes 0-65535/1000000", "Content-Length": "65536" },
        },
      );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => brokenBody()),
    );
    vi.useFakeTimers();
    const mb = await import("mediabunny");
    const runnerListeners = process.listeners("unhandledRejection");
    const unhandled: unknown[] = [];
    process.removeAllListeners("unhandledRejection");
    process.on("unhandledRejection", (reason) => unhandled.push(reason));
    try {
      const input = new mb.Input({
        source: new mb.UrlSource(URL_WITH_PATH, mediaUrlSourceOptions("thumbnail")),
        formats: mb.ALL_FORMATS,
      });
      const read = input.getDurationFromMetadata().catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      const error = await read;
      input.dispose();
      await vi.runAllTimersAsync();

      expect(error).toMatchObject({
        name: "MediaFetchError",
        message: "thumbnail range fetch failed: network TypeError after 2 retries",
      });
      for (const reason of unhandled) expect(reason).toBeInstanceOf(MediaFetchError);
    } finally {
      vi.useRealTimers();
      process.removeAllListeners("unhandledRejection");
      for (const listener of runnerListeners) process.on("unhandledRejection", listener);
    }
  });

  it("fails a read stalled mid-body once its reader is disposed and its reads cancelled", async () => {
    // Like fetch, the stub ends its body when the request's signal aborts, and not before.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        let sent = false;
        const body = new ReadableStream<Uint8Array>({
          pull(controller) {
            if (!sent) {
              sent = true;
              return controller.enqueue(new Uint8Array(16));
            }
            return new Promise<void>((resolve) => {
              const end = () => {
                controller.error(init?.signal?.reason);
                resolve();
              };
              init?.signal?.addEventListener("abort", end, { once: true });
            });
          },
        });
        const headers = { "Content-Range": "bytes 0-999999/1000000", "Content-Length": "1000000" };
        return new Response(body, { status: 206, headers });
      }),
    );
    const mb = await import("mediabunny");
    const runnerListeners = process.listeners("unhandledRejection");
    process.removeAllListeners("unhandledRejection");
    process.on("unhandledRejection", () => {});
    try {
      const options = mediaUrlSourceOptions("thumbnail");
      const input = new mb.Input({
        source: new mb.UrlSource(URL_WITH_PATH, options),
        formats: mb.ALL_FORMATS,
      });
      let settled = false;
      const read = input.getDurationFromMetadata().finally(() => (settled = true));
      read.catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(settled).toBe(false);

      input.dispose();
      options.cancelReads();
      await expect(read).rejects.toBeDefined();
      // The cancelled read-ahead's own rejection lands a turn later; keep it out of the next test.
      await new Promise(setImmediate);
      await new Promise(setImmediate);
    } finally {
      process.removeAllListeners("unhandledRejection");
      for (const listener of runnerListeners) process.on("unhandledRejection", listener);
    }
  });

  // Like fetch, a stub whose waits end when the request's signal aborts, and not before.
  const endsOnAbort = (signal: AbortSignal | null | undefined) =>
    new Promise<never>((_, reject) =>
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true }),
    );

  it("gives up on a response that sends no bytes, as a stall, inside the load timeout", async () => {
    vi.useFakeTimers();
    const requests: (string | null)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Headers(init?.headers).get("Range"));
        const body = new ReadableStream<Uint8Array>({ pull: () => endsOnAbort(init?.signal) });
        const headers = { "Content-Range": "bytes 0-999999/1000000", "Content-Length": "1000000" };
        return new Response(body, { status: 206, headers });
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mb = await import("mediabunny");
    const runnerListeners = process.listeners("unhandledRejection");
    process.removeAllListeners("unhandledRejection");
    process.on("unhandledRejection", () => {});
    try {
      const input = new mb.Input({
        source: new mb.UrlSource(URL_WITH_PATH, mediaUrlSourceOptions("thumbnail")),
        formats: mb.ALL_FORMATS,
      });
      let outcome: unknown = "pending";
      void input.getDurationFromMetadata().then(
        () => (outcome = "resolved"),
        (error: unknown) => (outcome = error),
      );
      // Three silent waits of 8 s, with mediabunny's 0.5 s and 1 s retry delays between them.
      await vi.advanceTimersByTimeAsync(25_400);
      expect(outcome).toBe("pending");
      await vi.advanceTimersByTimeAsync(200);
      expect(outcome).toMatchObject({
        name: "MediaFetchError",
        message: "thumbnail range fetch failed: network stalled after 2 retries",
      });
      expect(requests).toHaveLength(3);
      input.dispose();
    } finally {
      vi.useRealTimers();
      // mediabunny rethrows the failed read-ahead a turn later; keep it out of the next test.
      await new Promise(setImmediate);
      await new Promise(setImmediate);
      process.removeAllListeners("unhandledRejection");
      for (const listener of runnerListeners) process.on("unhandledRejection", listener);
    }
  });

  it("never cuts off a request still waiting for its answer, however long it queues", async () => {
    // Chrome queues a request for one of six connections per host, which streaming previews may hold.
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) =>
            setTimeout(() => resolve(new Response("", { status: 206 })), 20_000),
          ),
      ),
    );
    try {
      const answer = mediaUrlSourceOptions("thumbnail").fetchFn(URL_WITH_PATH, {
        headers: { Range: "bytes=0-" },
      });
      await vi.advanceTimersByTimeAsync(20_000);
      expect((await answer).status).toBe(206);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails a body that sends nothing for 8 s as stalled, and aborts its fetch", async () => {
    vi.useFakeTimers();
    let sentSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        sentSignal = init?.signal ?? undefined;
        // Deaf to its signal: only the watchdog can end this wait.
        const body = new ReadableStream<Uint8Array>({ pull: () => new Promise<void>(() => {}) });
        return new Response(body, { status: 206 });
      }),
    );
    try {
      const response = await mediaUrlSourceOptions("thumbnail").fetchFn(URL_WITH_PATH, {
        headers: { Range: "bytes=4096-" },
      });
      const read = response
        .body!.getReader()
        .read()
        .catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(8_000);
      expect(await read).toMatchObject({ name: "MediaFetchError", code: "stalled", start: 4096 });
      expect(sentSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never times out a probe's body, however slow", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const body = new ReadableStream<Uint8Array>({
          pull: (controller) =>
            new Promise<void>((resolve) =>
              setTimeout(() => {
                controller.enqueue(new Uint8Array(8));
                controller.close();
                resolve();
              }, 20_000),
            ),
        });
        return new Response(body, { status: 206 });
      }),
    );
    try {
      const response = await mediaUrlSourceOptions("probe").fetchFn(URL_WITH_PATH, {
        headers: { Range: "bytes=0-" },
      });
      const read = response.arrayBuffer();
      await vi.advanceTimersByTimeAsync(20_000);
      expect((await read).byteLength).toBe(8);
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts every request made after its reader's reads were cancelled already aborted", async () => {
    const seen: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.signal) seen.push(init.signal);
        return new Response("", { status: 206 });
      }),
    );
    const { fetchFn, cancelReads } = mediaUrlSourceOptions("thumbnail");
    cancelReads();
    await fetchFn(URL_WITH_PATH, { headers: { Range: "bytes=0-" } }).catch(() => {});
    await Promise.resolve();
    expect(seen[0]?.aborted).toBe(true);
  });

  it("unlinks every request from mediabunny's signal however it ends", async () => {
    const answers: (() => Promise<Response>)[] = [
      async () => new Response(new Uint8Array(4), { status: 206 }),
      async () => Promise.reject(new TypeError("Failed to fetch")),
      async () => new Response("", { status: 503 }),
      async () => new Response(null, { status: 206 }),
      async () =>
        new Response(
          new ReadableStream({ pull: (controller) => controller.error(new TypeError("network")) }),
          { status: 206 },
        ),
      async () =>
        new Response(
          new ReadableStream({ pull: (controller) => controller.enqueue(new Uint8Array(4)) }),
          { status: 206 },
        ),
    ];
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => answers[call++]!()),
    );
    const { fetchFn } = mediaUrlSourceOptions("thumbnail");
    let added = 0;
    let removed = 0;
    for (const exit of ["ok", "rejected", "503", "no body", "body error", "cancel"]) {
      const signal = new AbortController().signal;
      const add = signal.addEventListener.bind(signal);
      const remove = signal.removeEventListener.bind(signal);
      signal.addEventListener = (...args: Parameters<typeof add>) => (added++, add(...args));
      signal.removeEventListener = (...args: Parameters<typeof remove>) => (
        removed++, remove(...args)
      );
      const response = await fetchFn(URL_WITH_PATH, {
        headers: { Range: "bytes=0-" },
        signal,
      }).catch(() => null);
      const reader = response?.body?.getReader();
      if (exit === "cancel") {
        await reader!.read();
        await reader!.cancel();
      } else if (reader) {
        await (async () => {
          for (;;) if ((await reader.read()).done) return;
        })().catch(() => {});
      }
    }

    expect({ added, removed }).toEqual({ added: 6, removed: 6 });
  });

  it("never cuts off a slow response that keeps sending", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        let chunks = 0;
        const body = new ReadableStream<Uint8Array>({
          // Like fetch, the body fails if the request is aborted.
          start: (controller) =>
            init?.signal?.addEventListener("abort", () => controller.error(init.signal?.reason)),
          pull: (controller) =>
            new Promise<void>((resolve) =>
              setTimeout(() => {
                if (++chunks > 10) controller.close();
                else controller.enqueue(new Uint8Array(1024));
                resolve();
              }, 2_000),
            ),
        });
        return new Response(body, { status: 206 });
      }),
    );
    try {
      const response = await mediaUrlSourceOptions("thumbnail").fetchFn(URL_WITH_PATH, {
        headers: { Range: "bytes=0-" },
      });
      const read = response.arrayBuffer();
      await vi.advanceTimersByTimeAsync(24_000);
      expect((await read).byteLength).toBe(10 * 1024);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts a request when mediabunny aborts its own signal", async () => {
    const seen: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.signal) seen.push(init.signal);
        return new Response("", { status: 206 });
      }),
    );
    const stop = new AbortController();
    await mediaUrlSourceOptions("thumbnail").fetchFn(URL_WITH_PATH, {
      headers: { Range: "bytes=0-" },
      signal: stop.signal,
    });
    expect(seen[0]?.aborted).toBe(false);
    stop.abort();
    expect(seen[0]?.aborted).toBe(true);
  });

  it("counts mid-stream read failures, which always arrive as attempt 1", () => {
    const { getRetryDelay } = mediaUrlSourceOptions("thumbnail");
    const readError = new TypeError("network error");

    expect([1, 1, 1].map((attempt) => getRetryDelay(attempt, readError))).toEqual([0.5, 1, null]);
  });

  // What mediabunny does with a body that breaks: feed the failure to getRetryDelay, then ask again.
  async function readUntilBroken(
    fetchFn: ReturnType<typeof mediaUrlSourceOptions>["fetchFn"],
    range: string,
  ) {
    const reader = (await fetchFn(URL_WITH_PATH, { headers: { Range: range } })).body!.getReader();
    for (;;) await reader.read();
  }

  it("gives up on a server that ignores Range and breaks at the same byte, whatever it sent first", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        let sent = false;
        const body = new ReadableStream<Uint8Array>({
          pull(controller) {
            if (sent) return controller.error(new TypeError("network error"));
            sent = true;
            controller.enqueue(new Uint8Array(64 * 1024));
          },
        });
        return new Response(body, { status: 200 });
      }),
    );
    const { fetchFn, getRetryDelay } = mediaUrlSourceOptions("thumbnail");
    const delays: (number | null)[] = [];
    // A 200 answers from byte 0, so mediabunny resumes at 64 KiB and is sent byte 0 again.
    for (const range of ["bytes=0-", "bytes=65536-", "bytes=65536-"]) {
      const failure = await readUntilBroken(fetchFn, range).catch((e: unknown) => e);
      delays.push(getRetryDelay(1, failure));
    }

    expect(delays).toEqual([0.5, 1, null]);
  });

  it("gives up on a region that keeps failing while another region of the same reader streams", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const start = Number(/\d+/.exec(new Headers(init?.headers).get("Range") ?? "")?.[0]);
        if (start >= 500_000) return new Response("", { status: 503 });
        const headers = { "Content-Range": `bytes ${start}-999999/1000000` };
        return new Response(new Uint8Array(1024), { status: 206, headers });
      }),
    );
    const { fetchFn, getRetryDelay } = mediaUrlSourceOptions("thumbnail");
    const delays: (number | null)[] = [];
    for (const healthy of [0, 1024, 2048]) {
      await (
        await fetchFn(URL_WITH_PATH, { headers: { Range: `bytes=${healthy}-` } })
      ).arrayBuffer();
      const failure = await fetchFn(URL_WITH_PATH, { headers: { Range: "bytes=600000-" } }).catch(
        (e: unknown) => e,
      );
      delays.push(getRetryDelay(1, failure));
    }

    expect(delays).toEqual([0.5, 1, null]);
  });

  it("keeps a budget for each start, so failures on many clips of one reader never add up", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const { fetchFn, getRetryDelay } = mediaUrlSourceOptions("thumbnail");
    const failAt = async (start: number) =>
      getRetryDelay(
        1,
        await fetchFn(URL_WITH_PATH, { headers: { Range: `bytes=${start}-` } }).catch(
          (e: unknown) => e,
        ),
      );
    const spread = [];
    for (const start of [0, 1000, 2000, 3000, 4000]) spread.push(await failAt(start));
    const repeated = [await failAt(5000), await failAt(5000), await failAt(5000)];

    expect(spread).toEqual([0.5, 0.5, 0.5, 0.5, 0.5]);
    expect(repeated).toEqual([0.5, 1, null]);
  });

  it("forgets a start's failures once a read from it ends cleanly, so a long-lived reader meeting it again retries", async () => {
    const headers = { "Content-Range": "bytes 5000-6023/1000000" };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce(new Response(new Uint8Array(1024), { status: 206, headers }))
        .mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const { fetchFn, getRetryDelay } = mediaUrlSourceOptions("thumbnail");
    const read5000 = () => fetchFn(URL_WITH_PATH, { headers: { Range: "bytes=5000-" } });
    const failAt5000 = async () => getRetryDelay(1, await read5000().catch((e: unknown) => e));
    const early = [await failAt5000(), await failAt5000()];
    await (await read5000()).arrayBuffer();
    const later = [await failAt5000(), await failAt5000(), await failAt5000()];

    expect(early).toEqual([0.5, 1]);
    expect(later).toEqual([0.5, 1, null]);
  });

  it("forgets a start's failures when mediabunny stops a read from it at its target", async () => {
    const headers = { "Content-Range": "bytes 5000-999999/1000000" };
    const endless = () =>
      new ReadableStream<Uint8Array>({ pull: (c) => c.enqueue(new Uint8Array(4096)) });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce(new Response(endless(), { status: 206, headers }))
        .mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const { fetchFn, getRetryDelay } = mediaUrlSourceOptions("thumbnail");
    const read5000 = (signal?: AbortSignal) =>
      fetchFn(URL_WITH_PATH, { headers: { Range: "bytes=5000-" }, signal });
    const failAt5000 = async () => getRetryDelay(1, await read5000().catch((e: unknown) => e));
    const early = [await failAt5000(), await failAt5000()];
    // what mediabunny's _runWorker does once a read reaches its target: abort the signal it passed
    const target = new AbortController();
    const reader = (await read5000(target.signal)).body!.getReader();
    await reader.read();
    target.abort();
    await reader.read().catch(() => {});
    const later = [await failAt5000(), await failAt5000(), await failAt5000()];

    expect(early).toEqual([0.5, 1]);
    expect(later).toEqual([0.5, 1, null]);
  });

  it("keeps a start's failures when its read broke before mediabunny stopped it", async () => {
    const headers = { "Content-Range": "bytes 5000-999999/1000000" };
    let sent = false;
    const breaking = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) return controller.error(new TypeError("network error"));
        sent = true;
        controller.enqueue(new Uint8Array(4096));
      },
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(breaking, { status: 206, headers }))
        .mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const { fetchFn, getRetryDelay } = mediaUrlSourceOptions("thumbnail");
    const target = new AbortController();
    const reader = (
      await fetchFn(URL_WITH_PATH, { headers: { Range: "bytes=5000-" }, signal: target.signal })
    ).body!.getReader();
    await reader.read();
    const broken = await reader.read().catch((e: unknown) => e);
    const delays = [getRetryDelay(1, broken)];
    target.abort();
    for (let i = 0; i < 2; i++) {
      const failure = await fetchFn(URL_WITH_PATH, { headers: { Range: "bytes=5000-" } }).catch(
        (e: unknown) => e,
      );
      delays.push(getRetryDelay(1, failure));
    }

    expect(delays).toEqual([0.5, 1, null]);
  });

  it("keeps counting a start's failures however far apart they come, while no read from it ends", async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 28, 9, 0, 0) });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const { fetchFn, getRetryDelay } = mediaUrlSourceOptions("thumbnail");
    const delays = [];
    for (let i = 0; i < 3; i++) {
      const failure = await fetchFn(URL_WITH_PATH, { headers: { Range: "bytes=5000-" } }).catch(
        (e: unknown) => e,
      );
      delays.push(getRetryDelay(1, failure));
      // a slow server streaming for minutes before it breaks
      vi.setSystemTime(Date.now() + 20 * 60_000);
    }
    vi.useRealTimers();

    expect(delays).toEqual([0.5, 1, null]);
  });

  it("does not retry a client error status", () => {
    const failure = new MediaFetchError("probe", 404, null);

    expect(mediaUrlSourceOptions("probe").getRetryDelay(1, failure)).toBeNull();
    expect(failure.retries).toBe(0);
  });

  // mediabunny rethrows a failed read-ahead nobody awaits "so it doesn't get swallowed": that copy is typed too.
  it("fails a real mediabunny read, and its unawaited read-ahead, with the typed error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    const mb = await import("mediabunny");
    const runnerListeners = process.listeners("unhandledRejection");
    const unhandled: unknown[] = [];
    process.removeAllListeners("unhandledRejection");
    process.on("unhandledRejection", (reason) => unhandled.push(reason));
    try {
      const input = new mb.Input({
        source: new mb.UrlSource(URL_WITH_PATH, mediaUrlSourceOptions("probe")),
        formats: mb.ALL_FORMATS,
      });
      const error = await input.getDurationFromMetadata().catch((e: unknown) => e);
      input.dispose();
      await new Promise(setImmediate);

      expect(error).toMatchObject({ name: "MediaFetchError", status: 404, retries: 0 });
      expect(unhandled.length).toBeGreaterThan(0);
      for (const reason of unhandled) expect(reason).toBeInstanceOf(MediaFetchError);
    } finally {
      process.removeAllListeners("unhandledRejection");
      for (const listener of runnerListeners) process.on("unhandledRejection", listener);
    }
  });
});

describe("thumbnail reads", () => {
  // A 206 answering each request, with its Content-Range readable or (cross-origin, unexposed) hidden.
  function rangeServer(answers: ("readable" | "hidden" | "whole" | { start: number })[]) {
    const ranges: (string | null)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const range = new Headers(init?.headers).get("Range");
        ranges.push(range);
        const answer = answers[ranges.length - 1] ?? "readable";
        const start = typeof answer === "object" ? answer.start : Number(/\d+/.exec(range ?? "0"));
        const headers =
          answer === "hidden" ? {} : { "Content-Range": `bytes ${start}-9999999/10000000` };
        return new Response("", { status: answer === "whole" ? 200 : 206, headers });
      }),
    );
    return ranges;
  }
  const BOUND = 512 * 1024;

  it("bounds an open-ended thumbnail range once this reader has read a Content-Range", async () => {
    const ranges = rangeServer(["readable"]);
    const { fetchFn } = mediaUrlSourceOptions("thumbnail");
    await fetchFn(URL_WITH_PATH, { headers: { Range: "bytes=0-" } });
    await fetchFn(URL_WITH_PATH, { headers: { Range: "bytes=1000-" } });
    await fetchFn(URL_WITH_PATH, { headers: new Headers({ Range: "bytes=0-99" }) });
    // A bounded answer's Content-Range is read too, so the reader stays bounded.
    await fetchFn(URL_WITH_PATH, { headers: { Range: "bytes=2000-" } });

    // The first stays open-ended: without a readable Content-Range mediabunny sizes the file from it.
    expect(ranges).toEqual([
      "bytes=0-",
      `bytes=1000-${1000 + BOUND - 1}`,
      "bytes=0-99",
      `bytes=2000-${2000 + BOUND - 1}`,
    ]);
  });

  it("never bounds a reader once an answer hid its Content-Range", async () => {
    const ranges = rangeServer(["hidden", "readable"]);
    const { fetchFn } = mediaUrlSourceOptions("thumbnail");
    for (const start of [0, 1000, 2000]) {
      await fetchFn(URL_WITH_PATH, { headers: { Range: `bytes=${start}-` } });
    }

    expect(ranges).toEqual(["bytes=0-", "bytes=1000-", "bytes=2000-"]);
  });

  it("does not trust a Content-Range for a range it did not ask for", async () => {
    const ranges = rangeServer([{ start: 4096 }]);
    const { fetchFn } = mediaUrlSourceOptions("thumbnail");
    await fetchFn(URL_WITH_PATH, { headers: { Range: "bytes=0-" } });
    await fetchFn(URL_WITH_PATH, { headers: { Range: "bytes=1000-" } });

    expect(ranges).toEqual(["bytes=0-", "bytes=1000-"]);
  });

  it("does not trust a whole-file answer, whatever its headers say", async () => {
    const ranges = rangeServer(["whole"]);
    const { fetchFn } = mediaUrlSourceOptions("thumbnail");
    await fetchFn(URL_WITH_PATH, { headers: { Range: "bytes=0-" } });
    await fetchFn(URL_WITH_PATH, { headers: { Range: "bytes=1000-" } });

    expect(ranges).toEqual(["bytes=0-", "bytes=1000-"]);
  });

  it("never bounds a probe's range", async () => {
    const ranges = rangeServer(["readable"]);
    const { fetchFn } = mediaUrlSourceOptions("probe");
    await fetchFn(URL_WITH_PATH, { headers: { Range: "bytes=0-" } });
    await fetchFn(URL_WITH_PATH, { headers: { Range: "bytes=1000-" } });

    expect(ranges).toEqual(["bytes=0-", "bytes=1000-"]);
  });

  it("keeps a thumbnail reader's cache at 16 MiB, and a probe's at mediabunny's default", () => {
    expect(mediaUrlSourceOptions("thumbnail")).toMatchObject({ maxCacheSize: 16 * 1024 * 1024 });
    expect(mediaUrlSourceOptions("probe")).not.toHaveProperty("maxCacheSize");
  });
});

describe("reportMediaFetchFailure", () => {
  it("writes one scrubbed line for a typed failure and nothing for anything else", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failure = new MediaFetchError("thumbnail", null, "TypeError");
    failure.setRetries(2);

    reportMediaFetchFailure(failure);
    reportMediaFetchFailure(new Error("Video source has no decodable video track"));

    expect(warn.mock.calls).toEqual([
      ["[Studio] thumbnail range fetch failed: network TypeError after 2 retries"],
    ]);
  });
});
