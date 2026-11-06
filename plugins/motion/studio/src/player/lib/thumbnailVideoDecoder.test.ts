// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { decodeVideoThumbnail, videoThumbnailTimestamps } from "./thumbnailVideoDecoder";
import { MediaFetchError } from "./mediaFetch";
import { resolveTimelineViewportBudgets } from "./timelineViewportBudgets";
import { releaseSharedFrames } from "./thumbnailFrameCache";

const dispose = vi.fn();
const sourceRetryRules: string[] = [];
const cancelledReads: ReturnType<typeof vi.fn>[] = [];
const canvasesAtTimestamps = vi.fn();
const canvasSinks: unknown[] = [];
const getKeyPacket = vi.fn(async (_time: number) => null as { timestamp: number } | null);
const input = {
  getPrimaryVideoTrack: vi.fn(),
  dispose,
};
// The ETag the mocked server answers the reader's reads with; none unless a test sets one.
let servedEtag: string | undefined;

vi.mock("mediabunny", () => ({
  ALL_FORMATS: {},
  UrlSource: class {
    constructor(
      readonly url: string,
      readonly options?: { getRetryDelay?: unknown; cancelReads?: () => void },
    ) {
      sourceRetryRules.push(typeof options?.getRetryDelay);
      if (servedEtag && options) Object.assign(options, { etagOf: () => servedEtag });
      // Spied where the pool reads it, after constructing the source.
      if (options?.cancelReads)
        cancelledReads.push((options.cancelReads = vi.fn(options.cancelReads)));
    }
  },
  Input: class {
    getPrimaryVideoTrack = input.getPrimaryVideoTrack;
    dispose = input.dispose;
  },
  CanvasSink: class {
    constructor() {
      canvasSinks.push(this);
    }
    canvasesAtTimestamps = canvasesAtTimestamps;
  },
  EncodedPacketSink: class {
    getKeyPacket = getKeyPacket;
  },
}));

function recordDecodes(decoded: number[][]): void {
  canvasesAtTimestamps.mockImplementation(async function* (timestamps: AsyncIterable<number>) {
    const run: number[] = [];
    decoded.push(run);
    for await (const time of timestamps) {
      run.push(time);
      yield { canvas: document.createElement("canvas") };
    }
  });
}

const endOf = (start: number, duration: number) => start + Math.max(0, duration - 0.001);

// Keeps no released frame and no idle source, so a release revokes and disposes at once.
const NOTHING_KEPT = resolveTimelineViewportBudgets({
  sharedFrameCacheBytes: 0,
  thumbnailSourceIdleMs: 0,
});

// Decoded frames are shared per source for the module's life, so each test decodes its own file.
let sources = 0;
let source = "";

beforeEach(() => {
  vi.unstubAllGlobals();
  servedEtag = undefined;
  source = `/clip-${++sources}.mp4`;
  // Released frames outlive their test; evict them so each test counts only its own revokes.
  releaseSharedFrames([], 0);
  vi.clearAllMocks();
  canvasSinks.length = 0;
  cancelledReads.length = 0;
  getKeyPacket.mockImplementation(async () => null);
  vi.spyOn(URL, "createObjectURL")
    .mockReturnValueOnce("blob:one")
    .mockReturnValueOnce("blob:two")
    .mockReturnValueOnce("blob:end");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  HTMLCanvasElement.prototype.toBlob = function toBlob(callback) {
    callback(new Blob(["frame"], { type: "image/jpeg" }));
  };
  input.getPrimaryVideoTrack.mockResolvedValue({
    getDisplayWidth: vi.fn(async () => 1080),
    getDisplayHeight: vi.fn(async () => 1920),
    getDurationFromMetadata: vi.fn(async () => 10),
  });
});

describe("videoThumbnailTimestamps", () => {
  it("uses the midpoint for a poster, and each slice's left edge then the end for a strip", () => {
    expect(videoThumbnailTimestamps(2, 6, 1)).toEqual([5]);
    expect(videoThumbnailTimestamps(2, 6, 4)).toEqual([2, 3.5, 5, 6.5, endOf(2, 6)]);
  });

  it("nests each strip in the strip twice as long, and the poster in every strip", () => {
    const strip = videoThumbnailTimestamps(0, 8, 4);
    expect(videoThumbnailTimestamps(0, 8, 8).filter((_, i) => i % 2 === 0)).toEqual(strip);
    expect(strip).toContain(videoThumbnailTimestamps(0, 8, 1)[0]);
  });

  it("clamps invalid source ranges", () => {
    expect(videoThumbnailTimestamps(-2, Number.NaN, 0)).toEqual([0]);
    expect(videoThumbnailTimestamps(2, 8, Number.NaN)).toEqual([6]);
  });
});

/** Cache Storage as a Map of Maps, empty, with an empty index: what a browser keeps across sessions. */
function stubCacheStorage(): Map<string, Map<string, Response>> {
  const stores = new Map<string, Map<string, Response>>();
  vi.stubGlobal("caches", {
    open: async (name: string) => {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return {
        match: async (url: string) => store.get(url)?.clone(),
        put: async (url: string, response: Response) => void store.set(url, response),
      };
    },
    has: async (name: string) => stores.has(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  });
  localStorage.clear();
  return stores;
}

describe("decodeVideoThumbnail", () => {
  it("extracts sparse frames, returns object URLs, and disposes once", async () => {
    const decoded: number[][] = [];
    recordDecodes(decoded);
    const result = await decodeVideoThumbnail(
      { source, sourceStart: 2, sourceRangeDuration: 6, frameCount: 2 },
      new AbortController().signal,
      NOTHING_KEPT,
    );

    expect(decoded).toEqual([[2, 5, endOf(2, 6)]]);
    expect(result.value).toEqual({
      kind: "filmstrip",
      urls: ["blob:one", "blob:two", "blob:end"],
      aspect: 9 / 16,
    });
    result.dispose?.();
    result.dispose?.();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("decodes each strip frame at its keyframe unless that keyframe is before the clip's range", async () => {
    getKeyPacket.mockImplementation(async (time) => ({ timestamp: time - 0.5 }));
    const decoded: number[][] = [];
    recordDecodes(decoded);
    await decodeVideoThumbnail(
      { source, sourceStart: 2, sourceRangeDuration: 8, frameCount: 4 },
      new AbortController().signal,
    );
    expect(decoded).toEqual([[2, 3.5, 5.5, 7.5, endOf(2, 8)]]);
  });

  it("keeps a slot's own time when its keyframe is more than half a slot earlier", async () => {
    getKeyPacket.mockImplementation(async () => ({ timestamp: 0 }));
    const decoded: number[][] = [];
    recordDecodes(decoded);
    await decodeVideoThumbnail(
      { source, sourceStart: 0, sourceRangeDuration: 10, frameCount: 4 },
      new AbortController().signal,
    );
    expect(decoded).toEqual([[0, 2.5, 5, 7.5, endOf(0, 10)]]);
  });

  it("looks up each keyframe just before decoding it", async () => {
    const events: string[] = [];
    getKeyPacket.mockImplementation(async (time) => {
      events.push(`key ${time}`);
      return { timestamp: time };
    });
    canvasesAtTimestamps.mockImplementation(async function* (timestamps: AsyncIterable<number>) {
      for await (const time of timestamps) {
        events.push(`frame ${time}`);
        yield { canvas: document.createElement("canvas") };
      }
    });
    await decodeVideoThumbnail(
      { source, sourceStart: 0, sourceRangeDuration: 10, frameCount: 2 },
      new AbortController().signal,
    );
    const end = endOf(0, 10);
    expect(events).toEqual(["key 0", "frame 0", "key 5", "frame 5", `key ${end}`, `frame ${end}`]);
  });

  it("ends the decode times without throwing when cancelled during a keyframe lookup", async () => {
    const controller = new AbortController();
    getKeyPacket.mockImplementation(async () => (controller.abort(), null));
    const decoded: number[] = [];
    let timesEnded = false;
    canvasesAtTimestamps.mockImplementation(async function* (timestamps: AsyncIterable<number>) {
      for await (const time of timestamps) {
        decoded.push(time);
        yield { canvas: document.createElement("canvas") };
      }
      timesEnded = true;
    });
    await expect(
      decodeVideoThumbnail(
        { source, sourceStart: 0, sourceRangeDuration: 10, frameCount: 3 },
        controller.signal,
      ),
    ).rejects.toThrow("Aborted");
    expect(getKeyPacket).toHaveBeenCalledTimes(1);
    expect(decoded).toEqual([]);
    expect(timesEnded).toBe(true);
  });

  it("spreads a trimmed strip across its range when the file reports no duration", async () => {
    input.getPrimaryVideoTrack.mockResolvedValue({
      getDisplayWidth: vi.fn(async () => 1080),
      getDisplayHeight: vi.fn(async () => 1920),
      getDurationFromMetadata: vi.fn(async () => null),
    });
    const decoded: number[][] = [];
    recordDecodes(decoded);
    await decodeVideoThumbnail(
      { source, sourceStart: 5, sourceRangeDuration: 5, frameCount: 2 },
      new AbortController().signal,
    );
    expect(decoded).toEqual([[5, 7.5, endOf(5, 5)]]);
  });

  it("reuses the frames a strip of the same source shows, so a zoom decodes only new times", async () => {
    vi.mocked(URL.createObjectURL).mockImplementation(() => `blob:${Math.random()}`);
    const decoded: number[][] = [];
    recordDecodes(decoded);
    const range = { source, sourceStart: 0, sourceRangeDuration: 8 };
    const signal = new AbortController().signal;
    const four = await decodeVideoThumbnail({ ...range, frameCount: 4 }, signal);
    // Twice the frames decodes only the new half; half the frames decodes nothing. All share the end.
    const eight = await decodeVideoThumbnail({ ...range, frameCount: 8 }, signal);
    const two = await decodeVideoThumbnail({ ...range, frameCount: 2 }, signal);
    expect(decoded).toEqual([
      [0, 2, 4, 6, endOf(0, 8)],
      [1, 3, 5, 7],
    ]);
    const urls = (result: typeof four) =>
      result.value.kind === "filmstrip" ? result.value.urls : [];
    expect(urls(eight).filter((_, i) => i % 2 === 0)).toEqual(urls(four));
    expect(urls(two)).toEqual([urls(four)[0], urls(four)[2], urls(four)[4]]);
    for (const result of [four, eight, two]) result.dispose?.();
  });

  it("decodes a frame again when the one shared for its time sits too far before it", async () => {
    // Every keyframe is 2 s before the time asked: a 2-frame strip of 8 s accepts that (its
    // frames stand for 4 s each), a 4-frame strip does not, or its frames would run backwards.
    getKeyPacket.mockImplementation(async (time) => ({ timestamp: time - 2 }));
    const decoded: number[][] = [];
    recordDecodes(decoded);
    const range = { source, sourceStart: 0, sourceRangeDuration: 8 };
    const signal = new AbortController().signal;
    const two = await decodeVideoThumbnail({ ...range, frameCount: 2 }, signal);
    const four = await decodeVideoThumbnail({ ...range, frameCount: 4 }, signal);
    expect(decoded).toEqual([
      [0, 2, endOf(0, 8)],
      [2, 4, 6],
    ]);
    two.dispose?.();
    four.dispose?.();
  });

  it("returns a strip whose frames are all shared without opening the file again", async () => {
    recordDecodes([]);
    const range = { source, sourceStart: 0, sourceRangeDuration: 8 };
    const signal = new AbortController().signal;
    const four = await decodeVideoThumbnail({ ...range, frameCount: 4 }, signal);
    const two = await decodeVideoThumbnail({ ...range, frameCount: 2 }, signal);
    expect(input.getPrimaryVideoTrack).toHaveBeenCalledTimes(1);
    four.dispose?.();
    two.dispose?.();
  });

  it("reopens the same asset after a project round trip and keeps new-session frames separate", async () => {
    let frame = 0;
    vi.mocked(URL.createObjectURL)
      .mockReset()
      .mockImplementation(() => `blob:version-${++frame}`);
    const decoded: number[][] = [];
    recordDecodes(decoded);
    const signal = new AbortController().signal;
    const original = await decodeVideoThumbnail(
      { source, contentVersion: "A:1", frameCount: 1 },
      signal,
      NOTHING_KEPT,
    );
    const other = await decodeVideoThumbnail(
      { source: `${source}?B`, contentVersion: "B:2", frameCount: 1 },
      signal,
      NOTHING_KEPT,
    );
    input.getPrimaryVideoTrack.mockResolvedValue({
      getDisplayWidth: vi.fn(async () => 1280),
      getDisplayHeight: vi.fn(async () => 360),
      getDurationFromMetadata: vi.fn(async () => 10),
    });
    const reopened = await decodeVideoThumbnail(
      { source, contentVersion: "A:3", frameCount: 1 },
      signal,
      NOTHING_KEPT,
    );
    const shared = await decodeVideoThumbnail(
      { source, contentVersion: "A:3", frameCount: 1 },
      signal,
      NOTHING_KEPT,
    );
    expect(reopened.value).toEqual({ kind: "image", url: "blob:version-3", aspect: 32 / 9 });
    expect(shared.value).toEqual(reopened.value);
    expect(decoded).toEqual([[5], [5], [5]]);
    expect(input.getPrimaryVideoTrack).toHaveBeenCalledTimes(3);
    original.dispose?.();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:version-1");
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith("blob:version-3");
    other.dispose?.();
    reopened.dispose?.();
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith("blob:version-3");
    shared.dispose?.();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
  });

  it("keeps one copy of a frame two strips decode at once, and revokes the other", async () => {
    vi.mocked(URL.createObjectURL).mockImplementation(() => `blob:${Math.random()}`);
    // The first strip holds its first frame until the second is decoding too.
    let release!: () => void;
    const bothDecoding = new Promise<void>((resolve) => (release = resolve));
    canvasesAtTimestamps.mockImplementation(async function* (timestamps: AsyncIterable<number>) {
      const first = canvasesAtTimestamps.mock.calls.length === 1;
      for await (const _time of timestamps) {
        if (first) await bothDecoding;
        else release();
        yield { canvas: document.createElement("canvas") };
      }
    });
    const range = { source, sourceStart: 0, sourceRangeDuration: 8 };
    const signal = new AbortController().signal;
    const decodingTwo = decodeVideoThumbnail({ ...range, frameCount: 2 }, signal, NOTHING_KEPT);
    await vi.waitFor(() => expect(canvasesAtTimestamps).toHaveBeenCalledOnce());
    const [two, four] = await Promise.all([
      decodingTwo,
      decodeVideoThumbnail({ ...range, frameCount: 4 }, signal, NOTHING_KEPT),
    ]);
    // Both decoded the frames at 0 s, 4 s and the end; the second copy of each goes at once.
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
    two.dispose?.();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
    four.dispose?.();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(8);
  });

  it("fills a frame that failed to decode from the one before it, so tiles stay on their times", async () => {
    canvasesAtTimestamps.mockImplementation(async function* (timestamps: AsyncIterable<number>) {
      let slot = 0;
      for await (const _time of timestamps) {
        yield slot++ === 2 ? null : { canvas: document.createElement("canvas") };
      }
    });
    const signal = new AbortController().signal;
    const result = await decodeVideoThumbnail(
      { source, sourceStart: 0, sourceRangeDuration: 8, frameCount: 2 },
      signal,
    );
    expect(result.value).toMatchObject({
      kind: "filmstrip",
      urls: ["blob:one", "blob:two", "blob:two"],
    });
    // The cache is charged for the two decoded frames, not the filled copy.
    recordDecodes([]);
    const whole = await decodeVideoThumbnail(
      { source: `${source}?whole`, sourceStart: 0, sourceRangeDuration: 8, frameCount: 2 },
      signal,
    );
    expect(result.weight * 3).toBe(whole.weight * 2);
    result.dispose?.();
    whole.dispose?.();
  });

  it("snaps a poster up to a quarter of its range and a strip frame up to half a slice", async () => {
    const decoded: number[][] = [];
    recordDecodes(decoded);
    const signal = new AbortController().signal;
    getKeyPacket.mockImplementation(async (time) => ({ timestamp: time - 2.4 }));
    await decodeVideoThumbnail(
      { source, sourceStart: 0, sourceRangeDuration: 10, frameCount: 1 },
      signal,
    );
    getKeyPacket.mockImplementation(async (time) => ({ timestamp: time - 2.6 }));
    await decodeVideoThumbnail(
      { source: `${source}?b`, sourceStart: 0, sourceRangeDuration: 10, frameCount: 1 },
      signal,
    );
    // Four slices of 8 s: a keyframe 0.9 s early snaps, one 1.1 s early does not.
    getKeyPacket.mockImplementation(async (time) => ({
      timestamp: time - (time === 4 ? 0.9 : 1.1),
    }));
    await decodeVideoThumbnail(
      { source: `${source}?c`, sourceStart: 0, sourceRangeDuration: 8, frameCount: 4 },
      signal,
    );
    expect(decoded).toEqual([[5 - 2.4], [5], [0, 2, 4 - 0.9, 6, endOf(0, 8)]]);
  });

  it("revokes a shared frame only once no strip shows it", async () => {
    vi.mocked(URL.createObjectURL).mockImplementation(() => `blob:${Math.random()}`);
    recordDecodes([]);
    const range = { source, sourceStart: 0, sourceRangeDuration: 8 };
    const signal = new AbortController().signal;
    const four = await decodeVideoThumbnail({ ...range, frameCount: 4 }, signal, NOTHING_KEPT);
    const two = await decodeVideoThumbnail({ ...range, frameCount: 2 }, signal, NOTHING_KEPT);
    four.dispose?.();
    // The three frames the 2-slice strip still shows stay; the other two go.
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    two.dispose?.();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(5);
  });

  it("keeps a strip's frames after it is released, so scrolling back to it decodes nothing", async () => {
    const decoded: number[][] = [];
    recordDecodes(decoded);
    const strip = { source, sourceStart: 0, sourceRangeDuration: 8, frameCount: 2 };
    const signal = new AbortController().signal;
    const first = await decodeVideoThumbnail(strip, signal);
    first.dispose?.();
    const again = await decodeVideoThumbnail(strip, signal);
    expect(decoded).toEqual([[0, 4, endOf(0, 8)]]);
    expect(again.value).toEqual(first.value);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    again.dispose?.();
  });

  it("revokes released frames oldest first once they pass the byte budget, never a shown one", async () => {
    let frame = 0;
    vi.mocked(URL.createObjectURL)
      .mockReset()
      .mockImplementation(() => `blob:frame-${++frame}`);
    recordDecodes([]);
    // Each test frame is the 5-byte blob "frame": the budget holds one released strip of three.
    const budgets = resolveTimelineViewportBudgets({ sharedFrameCacheBytes: 15 });
    const signal = new AbortController().signal;
    const strip = (file: string) =>
      decodeVideoThumbnail(
        { source: `${source}?${file}`, sourceStart: 0, sourceRangeDuration: 8, frameCount: 2 },
        signal,
        budgets,
      );
    const older = await strip("older");
    const newer = await strip("newer");
    const shown = await strip("shown");
    const sameFrames = await strip("shown");
    const urls = (result: typeof older) =>
      result.value.kind === "filmstrip" ? [...result.value.urls] : [];
    older.dispose?.();
    for (const url of urls(older)) expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(url);
    // Its frames are still on screen in `shown`, so they are not released and cannot be evicted.
    sameFrames.dispose?.();
    newer.dispose?.();
    for (const url of urls(older)) expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
    for (const url of [...urls(newer), ...urls(shown)]) {
      expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(url);
    }
    shown.dispose?.();
  });

  it("reports a failed range fetch as one typed line and rethrows it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    sourceRetryRules.length = 0;
    input.getPrimaryVideoTrack.mockRejectedValue(
      new MediaFetchError("thumbnail", null, "TypeError"),
    );
    await expect(
      decodeVideoThumbnail({ source: "/locked.mp4", frameCount: 1 }, new AbortController().signal),
    ).rejects.toBeInstanceOf(MediaFetchError);
    expect(sourceRetryRules).toEqual(["function"]);
    expect(warn.mock.calls).toEqual([
      ["[Studio] thumbnail range fetch failed: network TypeError after 0 retries"],
    ]);
    warn.mockRestore();
  });

  it("releases input and degrades when the source has no video track", async () => {
    input.getPrimaryVideoTrack.mockResolvedValue(null);
    await expect(
      decodeVideoThumbnail(
        { source: "/audio.mp3", frameCount: 1 },
        new AbortController().signal,
        NOTHING_KEPT,
      ),
    ).rejects.toThrow("no decodable video track");
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("revokes partial results when cancellation lands during extraction", async () => {
    const controller = new AbortController();
    const canvas = document.createElement("canvas");
    canvasesAtTimestamps.mockImplementation(async function* (timestamps: AsyncIterable<number>) {
      let frames = 0;
      for await (const timestamp of timestamps) {
        if (frames++ === 1) controller.abort();
        yield { canvas, timestamp, duration: 1 };
      }
    });
    await expect(
      decodeVideoThumbnail({ source, frameCount: 2 }, controller.signal, NOTHING_KEPT),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("stops after metadata cancellation before occupying the decoder", async () => {
    const controller = new AbortController();
    let resolveWidth!: (width: number) => void;
    const width = new Promise<number>((resolve) => {
      resolveWidth = resolve;
    });
    const getDisplayWidth = vi.fn(() => width);
    const getDurationFromMetadata = vi.fn(async () => 10);
    input.getPrimaryVideoTrack.mockResolvedValue({
      getDisplayWidth,
      getDisplayHeight: vi.fn(async () => 1920),
      getDurationFromMetadata,
    });

    const decoding = decodeVideoThumbnail(
      { source, frameCount: 1 },
      controller.signal,
      NOTHING_KEPT,
    );
    await vi.waitFor(() => expect(getDisplayWidth).toHaveBeenCalledOnce());
    controller.abort();
    resolveWidth(1080);

    await expect(decoding).rejects.toMatchObject({ name: "AbortError" });
    expect(getDurationFromMetadata).not.toHaveBeenCalled();
    expect(canvasesAtTimestamps).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe("decodeVideoThumbnail's shared source", () => {
  const signal = new AbortController().signal;
  const clip = (sourceStart: number, extra: object = {}) => ({
    source,
    sourceStart,
    sourceRangeDuration: 4,
    frameCount: 2,
    ...extra,
  });

  it("opens a source once for every clip cut from it", async () => {
    recordDecodes([]);
    await decodeVideoThumbnail(clip(0), signal);
    await decodeVideoThumbnail(clip(6), signal);
    expect(input.getPrimaryVideoTrack).toHaveBeenCalledTimes(1);
  });

  it("opens a source once for clips decoding at the same time, each with its own canvas sink", async () => {
    recordDecodes([]);
    await Promise.all([
      decodeVideoThumbnail(clip(0), signal),
      decodeVideoThumbnail(clip(6), signal),
    ]);
    expect(input.getPrimaryVideoTrack).toHaveBeenCalledTimes(1);
    expect(canvasSinks).toHaveLength(2);
  });

  it("closes a source once it has sat idle for its budget", async () => {
    vi.useFakeTimers();
    try {
      recordDecodes([]);
      const budgets = resolveTimelineViewportBudgets({ thumbnailSourceIdleMs: 1_000 });
      await decodeVideoThumbnail(clip(0), signal, budgets);
      await vi.advanceTimersByTimeAsync(999);
      expect(dispose).not.toHaveBeenCalled();
      await decodeVideoThumbnail(clip(6), signal, budgets);
      await vi.advanceTimersByTimeAsync(999);
      expect(dispose).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(input.getPrimaryVideoTrack).toHaveBeenCalledTimes(1);
      // Disposing alone leaves a stalled fetch waiting; its reads are cancelled too.
      expect(cancelledReads[0]).toHaveBeenCalledOnce();
      // A closed reader has left the pool: the next clip opens a live one.
      await expect(decodeVideoThumbnail(clip(12), signal, budgets)).resolves.toBeDefined();
      expect(input.getPrimaryVideoTrack).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens a new reader when the source's content version changes, and closes the old one at once", async () => {
    recordDecodes([]);
    const budgets = resolveTimelineViewportBudgets({ thumbnailSourceIdleMs: 60_000 });
    await decodeVideoThumbnail(clip(0, { contentVersion: "A:1" }), signal, budgets);
    await decodeVideoThumbnail(clip(0, { contentVersion: "A:2" }), signal, budgets);
    expect(input.getPrimaryVideoTrack).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("closes the old version's reader only once the job still decoding on it ends", async () => {
    recordDecodes([]);
    let finish!: () => void;
    const held = new Promise<void>((resolve) => (finish = resolve));
    canvasesAtTimestamps.mockImplementationOnce(async function* (
      timestamps: AsyncIterable<number>,
    ) {
      for await (const _time of timestamps) {
        await held;
        yield { canvas: document.createElement("canvas") };
      }
    });
    const budgets = resolveTimelineViewportBudgets({ thumbnailSourceIdleMs: 60_000 });
    const old = decodeVideoThumbnail(clip(0, { contentVersion: "A:1" }), signal, budgets);
    await vi.waitFor(() => expect(canvasesAtTimestamps).toHaveBeenCalledOnce());
    await decodeVideoThumbnail(clip(6, { contentVersion: "A:2" }), signal, budgets);
    expect(input.getPrimaryVideoTrack).toHaveBeenCalledTimes(2);
    expect(dispose).not.toHaveBeenCalled();

    finish();
    await old;
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("stops opening a source every job let go of before its track was read", async () => {
    let giveTrack!: (track: unknown) => void;
    input.getPrimaryVideoTrack.mockImplementationOnce(
      () => new Promise((resolve) => (giveTrack = resolve)),
    );
    const controller = new AbortController();
    const decoding = decodeVideoThumbnail(clip(0), controller.signal, NOTHING_KEPT);
    await vi.waitFor(() => expect(input.getPrimaryVideoTrack).toHaveBeenCalledOnce());
    controller.abort();
    await expect(decoding).rejects.toMatchObject({ name: "AbortError" });
    expect(dispose).toHaveBeenCalledTimes(1);

    const getDisplayWidth = vi.fn(async () => 1080);
    giveTrack({ getDisplayWidth, getDisplayHeight: vi.fn(async () => 1920) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getDisplayWidth).not.toHaveBeenCalled();
  });

  it("keeps no source whose open failed, so the next clip opens it again", async () => {
    recordDecodes([]);
    input.getPrimaryVideoTrack.mockRejectedValueOnce(new Error("unreadable"));
    await expect(decodeVideoThumbnail(clip(0), signal)).rejects.toThrow("unreadable");
    expect(dispose).toHaveBeenCalledTimes(1);
    await expect(decodeVideoThumbnail(clip(6), signal)).resolves.toBeDefined();
    expect(input.getPrimaryVideoTrack).toHaveBeenCalledTimes(2);
  });

  it("reopens a source whose open failed after every clip waiting on it had cancelled", async () => {
    recordDecodes([]);
    let failOpen!: (error: Error) => void;
    input.getPrimaryVideoTrack.mockImplementationOnce(
      () => new Promise((_, reject) => (failOpen = reject)),
    );
    const budgets = resolveTimelineViewportBudgets({ thumbnailSourceIdleMs: 60_000 });
    const controller = new AbortController();
    const cancelled = decodeVideoThumbnail(clip(0), controller.signal, budgets);
    await vi.waitFor(() => expect(input.getPrimaryVideoTrack).toHaveBeenCalledOnce());
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    failOpen(new Error("unreadable"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(decodeVideoThumbnail(clip(6), signal, budgets)).resolves.toBeDefined();
    expect(input.getPrimaryVideoTrack).toHaveBeenCalledTimes(2);
  });

  it("keeps the reader when a clip's own decode yields no frames", async () => {
    canvasesAtTimestamps.mockImplementationOnce(async function* (
      timestamps: AsyncIterable<number>,
    ) {
      for await (const _time of timestamps) yield null;
    });
    await expect(decodeVideoThumbnail(clip(0), signal)).rejects.toThrow("no thumbnail frames");
    recordDecodes([]);
    await decodeVideoThumbnail(clip(6), signal);
    expect(input.getPrimaryVideoTrack).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();
  });

  it("keeps the reader when a clip's frame will not encode", async () => {
    HTMLCanvasElement.prototype.toBlob = function toBlob(callback) {
      callback(null);
    };
    recordDecodes([]);
    await expect(decodeVideoThumbnail(clip(0), signal)).rejects.toThrow("encode failed");
    HTMLCanvasElement.prototype.toBlob = function toBlob(callback) {
      callback(new Blob(["frame"], { type: "image/jpeg" }));
    };
    await decodeVideoThumbnail(clip(6), signal);
    expect(input.getPrimaryVideoTrack).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();
  });

  it("keeps the reader when an offscreen frame will not encode", async () => {
    const offscreen = { width: 1, height: 1, convertToBlob: () => Promise.reject(new Error("no")) };
    canvasesAtTimestamps.mockImplementationOnce(async function* (
      timestamps: AsyncIterable<number>,
    ) {
      for await (const _time of timestamps) yield { canvas: offscreen };
    });
    await expect(decodeVideoThumbnail(clip(0), signal)).rejects.toThrow("encode failed");
    recordDecodes([]);
    await decodeVideoThumbnail(clip(6), signal);
    expect(input.getPrimaryVideoTrack).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();
  });

  it("keeps the reader of a clip scrolled away from, for the next clip", async () => {
    vi.useFakeTimers();
    try {
      const budgets = resolveTimelineViewportBudgets({ thumbnailSourceIdleMs: 60_000 });
      const controller = new AbortController();
      getKeyPacket.mockImplementationOnce(async () => (controller.abort(), null));
      recordDecodes([]);
      await expect(decodeVideoThumbnail(clip(0), controller.signal, budgets)).rejects.toMatchObject(
        {
          name: "AbortError",
        },
      );
      // Past a load timeout: nothing a cancel left behind may close the reader.
      await vi.advanceTimersByTimeAsync(31_000);
      await decodeVideoThumbnail(clip(6), signal, budgets);
      expect(input.getPrimaryVideoTrack).toHaveBeenCalledTimes(1);
      expect(dispose).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  const timedOut = () => new DOMException("Thumbnail load timed out", "TimeoutError");
  const TIMEOUT_LINE = "[Studio] thumbnail range fetch failed: network timeout after 0 retries";
  // A read that never returns until its reader is disposed, like one on a source that never answers.
  const untilDisposed = () =>
    new Promise<never>((_, reject) =>
      dispose.mockImplementationOnce(() => reject(new Error("Input disposed"))),
    );

  it("fails a job that times out without progress as its source's failure, once, and drops the reader", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    recordDecodes([]);
    await decodeVideoThumbnail(clip(0), signal);
    const stalled = untilDisposed();
    canvasesAtTimestamps.mockImplementationOnce(async function* () {
      yield await stalled;
    });
    const controller = new AbortController();
    const stuck = decodeVideoThumbnail(clip(6), controller.signal);
    await vi.waitFor(() => expect(canvasesAtTimestamps).toHaveBeenCalledTimes(2));
    controller.abort(timedOut());

    await expect(stuck).rejects.toThrow("Input disposed");
    expect(warn.mock.calls).toEqual([[TIMEOUT_LINE]]);
    await decodeVideoThumbnail(clip(12), signal);
    expect(input.getPrimaryVideoTrack).toHaveBeenCalledTimes(2);
  });

  it("keeps the reader when a job times out after decoding a frame", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    recordDecodes([]);
    await decodeVideoThumbnail(clip(0), signal);
    canvasesAtTimestamps.mockImplementationOnce(async function* (
      timestamps: AsyncIterable<number>,
    ) {
      await timestamps[Symbol.asyncIterator]().next();
      yield { canvas: document.createElement("canvas") };
      await new Promise(() => {});
    });
    const controller = new AbortController();
    void decodeVideoThumbnail(clip(6), controller.signal).catch(() => {});
    await vi.waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(4));
    controller.abort(timedOut());

    await decodeVideoThumbnail(clip(12), signal);
    expect(warn).not.toHaveBeenCalled();
    expect(dispose).not.toHaveBeenCalled();
    expect(input.getPrimaryVideoTrack).toHaveBeenCalledTimes(1);
  });

  it("keeps the reader when a clip times out while another clip decodes frames from it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    recordDecodes([]);
    await decodeVideoThumbnail(clip(0), signal);
    canvasesAtTimestamps.mockImplementationOnce(async function* () {
      await new Promise(() => {});
      yield null;
    });
    canvasesAtTimestamps.mockImplementationOnce(async function* (
      timestamps: AsyncIterable<number>,
    ) {
      await timestamps[Symbol.asyncIterator]().next();
      yield { canvas: document.createElement("canvas") };
      await new Promise(() => {});
    });
    const controller = new AbortController();
    void decodeVideoThumbnail(clip(6), controller.signal).catch(() => {});
    void decodeVideoThumbnail(clip(12), new AbortController().signal).catch(() => {});
    await vi.waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(4));
    controller.abort(timedOut());

    expect(warn).not.toHaveBeenCalled();
    await decodeVideoThumbnail(clip(18), signal);
    expect(input.getPrimaryVideoTrack).toHaveBeenCalledTimes(1);
  });

  it("fails a job that times out waiting for its source to open, and the next clip opens afresh", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stalled = untilDisposed();
    input.getPrimaryVideoTrack.mockImplementationOnce(() => stalled);
    const controller = new AbortController();
    const waiting = decodeVideoThumbnail(clip(0), controller.signal);
    await vi.waitFor(() => expect(input.getPrimaryVideoTrack).toHaveBeenCalledOnce());
    controller.abort(timedOut());

    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    expect(warn.mock.calls).toEqual([[TIMEOUT_LINE]]);
    expect(dispose).toHaveBeenCalledTimes(1);
    recordDecodes([]);
    await expect(decodeVideoThumbnail(clip(6), signal)).resolves.toBeDefined();
    expect(input.getPrimaryVideoTrack).toHaveBeenCalledTimes(2);
  });

  it("keeps the reader of a slow open that finished, when the clip that waited for it times out", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let open!: () => void;
    const opening = new Promise<void>((resolve) => (open = resolve));
    const track = await input.getPrimaryVideoTrack();
    input.getPrimaryVideoTrack.mockClear();
    input.getPrimaryVideoTrack.mockImplementationOnce(async () => (await opening, track));
    canvasesAtTimestamps.mockImplementationOnce(async function* () {
      await new Promise(() => {});
      yield null;
    });
    const controller = new AbortController();
    void decodeVideoThumbnail(clip(0), controller.signal).catch(() => {});
    open();
    await vi.waitFor(() => expect(canvasesAtTimestamps).toHaveBeenCalledOnce());
    controller.abort(timedOut());

    recordDecodes([]);
    await decodeVideoThumbnail(clip(6), signal);
    expect(warn).not.toHaveBeenCalled();
    expect(dispose).not.toHaveBeenCalled();
    expect(input.getPrimaryVideoTrack).toHaveBeenCalledTimes(1);
  });

  it("lets a reader close when idle while a cancelled job is still stuck in a read on it", async () => {
    vi.useFakeTimers();
    try {
      const budgets = resolveTimelineViewportBudgets({ thumbnailSourceIdleMs: 1_000 });
      const stalled = untilDisposed();
      canvasesAtTimestamps.mockImplementationOnce(async function* () {
        yield await stalled;
      });
      const controller = new AbortController();
      const stuck = decodeVideoThumbnail(clip(0), controller.signal, budgets);
      stuck.catch(() => {});
      await vi.waitFor(() => expect(canvasesAtTimestamps).toHaveBeenCalledOnce());
      controller.abort();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(dispose).toHaveBeenCalledTimes(1);
      await expect(stuck).rejects.toThrow("Input disposed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops a reader for one clip's timeout only once the clip still decoding on it ends", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    recordDecodes([]);
    await decodeVideoThumbnail(clip(0), signal);
    let go!: () => void;
    const healthy = new Promise<void>((resolve) => (go = resolve));
    canvasesAtTimestamps.mockImplementationOnce(async function* () {
      await new Promise(() => {});
      yield null;
    });
    canvasesAtTimestamps.mockImplementationOnce(async function* (
      timestamps: AsyncIterable<number>,
    ) {
      for await (const _time of timestamps) {
        await healthy;
        yield { canvas: document.createElement("canvas") };
      }
    });
    const controller = new AbortController();
    void decodeVideoThumbnail(clip(6), controller.signal).catch(() => {});
    const decoding = decodeVideoThumbnail(clip(12), signal);
    await vi.waitFor(() => expect(canvasesAtTimestamps).toHaveBeenCalledTimes(3));
    controller.abort(timedOut());
    expect(dispose).not.toHaveBeenCalled();

    go();
    await expect(decoding).resolves.toMatchObject({ value: { kind: "filmstrip" } });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("keeps the reader, and the clip decoding on it, when another clip on it times out", async () => {
    let unstick!: () => void;
    const stuck = new Promise<void>((resolve) => (unstick = resolve));
    let go!: () => void;
    const healthy = new Promise<void>((resolve) => (go = resolve));
    canvasesAtTimestamps.mockImplementationOnce(async function* () {
      yield await stuck;
    });
    canvasesAtTimestamps.mockImplementationOnce(async function* (
      timestamps: AsyncIterable<number>,
    ) {
      for await (const _time of timestamps) {
        await healthy;
        yield { canvas: document.createElement("canvas") };
      }
    });
    const timedOut = new AbortController();
    const first = decodeVideoThumbnail(clip(0), timedOut.signal);
    first.catch(() => {});
    const second = decodeVideoThumbnail(clip(6), signal);
    await vi.waitFor(() => expect(canvasesAtTimestamps).toHaveBeenCalledTimes(2));
    timedOut.abort(new DOMException("Thumbnail load timed out", "TimeoutError"));
    go();

    await expect(second).resolves.toMatchObject({ value: { kind: "filmstrip" } });
    expect(dispose).not.toHaveBeenCalled();
    unstick();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
  });

  it("drops a reader whose reads gave up, so the next clip retries on a fresh one", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    sourceRetryRules.length = 0;
    canvasesAtTimestamps.mockImplementationOnce(() => {
      throw new MediaFetchError("thumbnail", null, "TypeError");
    });
    await expect(decodeVideoThumbnail(clip(0), signal)).rejects.toBeInstanceOf(MediaFetchError);
    expect(dispose).toHaveBeenCalledTimes(1);
    recordDecodes([]);
    await decodeVideoThumbnail(clip(6), signal);
    // A UrlSource counts its own retries (mediaUrlSourceOptions), so a fresh one retries afresh.
    expect(sourceRetryRules).toEqual(["function", "function"]);
  });

  it("paints a strip from a past session's frames on disk, without opening the file", async () => {
    const stores = stubCacheStorage();
    const signal = new AbortController().signal;
    servedEtag = '"take-v1"';
    recordDecodes([]);
    const request = { source, sourceStart: 0, sourceRangeDuration: 4, frameCount: 2 };
    await decodeVideoThumbnail({ ...request, contentVersion: "session-1" }, signal);
    // the source's facts and its three frames, then the index the next session reads
    await vi.waitFor(() => expect([...stores.values()][0]?.size).toBe(4));
    await vi.waitFor(
      () => expect(localStorage.getItem("hf-thumbnails-index")).toContain("take-v1"),
      {
        timeout: 3000,
      },
    );

    vi.resetModules();
    const nextSession = await import("./thumbnailVideoDecoder");
    const validate = vi.fn(async () => new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", validate);
    input.getPrimaryVideoTrack.mockClear();
    canvasesAtTimestamps.mockClear();
    const result = await nextSession.decodeVideoThumbnail(
      { ...request, contentVersion: "session-2" },
      signal,
    );

    expect(validate).toHaveBeenCalledTimes(1);
    expect(input.getPrimaryVideoTrack).not.toHaveBeenCalled();
    expect(canvasesAtTimestamps).not.toHaveBeenCalled();
    expect(result.value).toMatchObject({ kind: "filmstrip" });
    expect((result.value as { urls: string[] }).urls).toHaveLength(3);
  });

  it("checks the file again when a project opens anew, so a replaced video never paints its old frames", async () => {
    const stores = stubCacheStorage();
    const signal = new AbortController().signal;
    servedEtag = '"v1"';
    recordDecodes([]);
    const request = { source, sourceStart: 0, sourceRangeDuration: 4, frameCount: 2 };
    await decodeVideoThumbnail({ ...request, contentVersion: "open-1" }, signal);
    await vi.waitFor(() => expect([...stores.values()][0]?.size).toBe(4));

    // the video is replaced at the same path, then its project opened again in this page
    servedEtag = '"v2"';
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x", { status: 206, headers: { ETag: '"v2"' } })),
    );
    await decodeVideoThumbnail({ ...request, contentVersion: "open-2" }, signal);

    expect(input.getPrimaryVideoTrack).toHaveBeenCalledTimes(2);
  });
});
