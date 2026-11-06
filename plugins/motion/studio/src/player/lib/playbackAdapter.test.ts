import { describe, expect, it, vi } from "vitest";
import {
  createStaticSeekPlaybackAdapter,
  wrapTimeline,
  resolveStaticSeekFallback,
  releaseStaticSeekCache,
  type StaticSeekCacheEntry,
} from "./playbackAdapter";
import type {
  RuntimePlaybackAdapter,
  StaticSeekPlaybackClock,
  TimelineLike,
} from "./playbackTypes";

describe("wrapTimeline seek keepPlaying option (#834)", () => {
  function mockTimeline(): TimelineLike & {
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    seek: ReturnType<typeof vi.fn>;
  } {
    return {
      play: vi.fn(),
      pause: vi.fn(),
      seek: vi.fn(),
      time: () => 0,
      duration: () => 10,
      isActive: () => false,
    };
  }

  it("default seek pauses the GSAP timeline before and after seeking", () => {
    const tl = mockTimeline();
    const adapter = wrapTimeline(tl);

    adapter.seek(5);

    expect(tl.pause).toHaveBeenCalledTimes(2);
    expect(tl.seek).toHaveBeenCalledWith(5);
  });

  it("seek with { keepPlaying: true } skips the implicit pause", () => {
    const tl = mockTimeline();
    const adapter = wrapTimeline(tl);

    adapter.seek(5, { keepPlaying: true });

    expect(tl.pause).not.toHaveBeenCalled();
    expect(tl.seek).toHaveBeenCalledWith(5);
  });

  it("seek with { keepPlaying: false } still pauses (explicit default)", () => {
    const tl = mockTimeline();
    const adapter = wrapTimeline(tl);

    adapter.seek(5, { keepPlaying: false });

    expect(tl.pause).toHaveBeenCalledTimes(2);
    expect(tl.seek).toHaveBeenCalledWith(5);
  });
});

describe("createStaticSeekPlaybackAdapter seek keepPlaying option", () => {
  type StaticSeekPlayer = Pick<RuntimePlaybackAdapter, "getTime"> &
    Partial<Pick<RuntimePlaybackAdapter, "renderSeek" | "seek">>;

  function makeFakeClock(): StaticSeekPlaybackClock & {
    runNextFrame: () => boolean;
    cancelled: number[];
    scheduled: number;
    setNow: (ms: number) => void;
  } {
    let now = 0;
    let nextHandle = 0;
    const pending = new Map<number, FrameRequestCallback>();
    const cancelled: number[] = [];
    let scheduled = 0;
    return {
      now: () => now,
      requestAnimationFrame: (cb) => {
        nextHandle += 1;
        pending.set(nextHandle, cb);
        scheduled += 1;
        return nextHandle;
      },
      cancelAnimationFrame: (handle) => {
        if (pending.delete(handle)) cancelled.push(handle);
      },
      runNextFrame: () => {
        const next = pending.entries().next();
        if (next.done) return false;
        const [handle, cb] = next.value;
        pending.delete(handle);
        cb(now);
        return true;
      },
      cancelled,
      get scheduled() {
        return scheduled;
      },
      setNow: (ms) => {
        now = ms;
      },
    };
  }

  function makePlayer(): StaticSeekPlayer & {
    renderSeek: ReturnType<typeof vi.fn>;
  } {
    return {
      getTime: () => 0,
      renderSeek: vi.fn(),
    };
  }

  it("default seek stops the RAF ticker so the adapter reports paused", () => {
    const clock = makeFakeClock();
    const player = makePlayer();
    const adapter = createStaticSeekPlaybackAdapter(player, 10, clock);

    adapter.play();
    expect(adapter.isPlaying()).toBe(true);

    adapter.seek(5);

    expect(adapter.isPlaying()).toBe(false);
    expect(adapter.getTime()).toBe(5);
    expect(player.renderSeek).toHaveBeenLastCalledWith(5);
    expect(clock.cancelled.length).toBeGreaterThan(0);
  });

  it("default seek prevents the ticker from advancing further", () => {
    const clock = makeFakeClock();
    const player = makePlayer();
    const adapter = createStaticSeekPlaybackAdapter(player, 10, clock);

    adapter.play();
    player.renderSeek.mockClear();

    adapter.seek(5);

    // Any frame the RAF callback already had queued before cancel should be a no-op.
    clock.setNow(1000);
    clock.runNextFrame();
    expect(player.renderSeek).toHaveBeenCalledTimes(1); // only the seek itself
    expect(player.renderSeek).toHaveBeenLastCalledWith(5);
    expect(adapter.getTime()).toBe(5);
  });

  it("seek with { keepPlaying: true } preserves playback and rebases the ticker", () => {
    const clock = makeFakeClock();
    const player = makePlayer();
    const adapter = createStaticSeekPlaybackAdapter(player, 10, clock);

    adapter.play();
    clock.setNow(500);
    expect(adapter.isPlaying()).toBe(true);

    adapter.seek(3, { keepPlaying: true });

    expect(adapter.isPlaying()).toBe(true);
    expect(adapter.getTime()).toBe(3);

    // Advance 1s of wall-clock time. With playStartTime rebased to 3 and
    // playStartNow rebased to 500, the next tick should render around t=4.
    clock.setNow(1500);
    clock.runNextFrame();
    expect(player.renderSeek).toHaveBeenLastCalledWith(4);
  });

  it("seek with { keepPlaying: false } pauses (matches default)", () => {
    const clock = makeFakeClock();
    const player = makePlayer();
    const adapter = createStaticSeekPlaybackAdapter(player, 10, clock);

    adapter.play();
    adapter.seek(5, { keepPlaying: false });

    expect(adapter.isPlaying()).toBe(false);
    expect(player.renderSeek).toHaveBeenLastCalledWith(5);
  });

  it("seek with { keepPlaying: true } does not force playback when adapter is paused", () => {
    const clock = makeFakeClock();
    const player = makePlayer();
    const adapter = createStaticSeekPlaybackAdapter(player, 10, clock);

    adapter.seek(2, { keepPlaying: true });

    expect(adapter.isPlaying()).toBe(false);
    expect(adapter.getTime()).toBe(2);
    expect(player.renderSeek).toHaveBeenLastCalledWith(2);
  });

  it("seek without options stays back-compatible with the previous signature", () => {
    const clock = makeFakeClock();
    const player = makePlayer();
    const adapter = createStaticSeekPlaybackAdapter(player, 10, clock);

    // Caller written before the options parameter existed.
    adapter.seek(4);

    expect(player.renderSeek).toHaveBeenLastCalledWith(4);
    expect(adapter.getTime()).toBe(4);
    expect(adapter.isPlaying()).toBe(false);
  });

  it("default seek clamps to duration and still pauses", () => {
    const clock = makeFakeClock();
    const player = makePlayer();
    const adapter = createStaticSeekPlaybackAdapter(player, 10, clock);

    adapter.play();
    adapter.seek(99);

    expect(adapter.getTime()).toBe(10);
    expect(player.renderSeek).toHaveBeenLastCalledWith(10);
    expect(adapter.isPlaying()).toBe(false);
  });
});

describe("static-seek fallback cache (resolveStaticSeekFallback / releaseStaticSeekCache)", () => {
  function makeClock(): StaticSeekPlaybackClock {
    return {
      now: () => 0,
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
    };
  }

  function makePlayer() {
    return { getTime: () => 0, renderSeek: vi.fn() };
  }

  function resolve(
    cache: { current: StaticSeekCacheEntry | null },
    warned: { current: boolean },
    player: ReturnType<typeof makePlayer>,
    duration: number,
  ) {
    return resolveStaticSeekFallback({
      cache,
      warned,
      bestAdapter: player as unknown as RuntimePlaybackAdapter,
      effectiveDuration: duration,
      docDuration: duration,
      clock: makeClock(),
      getPlaybackRate: () => 1,
    });
  }

  it("warns once per downgrade streak and re-arms after release", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cache: { current: StaticSeekCacheEntry | null } = { current: null };
    const warned = { current: false };
    const player = makePlayer();

    resolve(cache, warned, player, 10);
    resolve(cache, warned, player, 11); // cache miss (new duration) — must not warn again
    expect(warn).toHaveBeenCalledTimes(1);

    releaseStaticSeekCache(cache, warned);
    resolve(cache, warned, player, 12);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("returns the cached adapter for the same player and duration", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cache: { current: StaticSeekCacheEntry | null } = { current: null };
    const warned = { current: false };
    const player = makePlayer();

    const first = resolve(cache, warned, player, 10);
    const second = resolve(cache, warned, player, 10);
    expect(second).toBe(first);
    warn.mockRestore();
  });

  it("pauses the replaced adapter on cache miss and the cached adapter on release", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const cache: { current: StaticSeekCacheEntry | null } = { current: null };
    const warned = { current: false };
    const player = makePlayer();

    const first = resolve(cache, warned, player, 10);
    first.play();
    expect(first.isPlaying()).toBe(true);
    const second = resolve(cache, warned, player, 20);
    expect(first.isPlaying()).toBe(false);

    second.play();
    expect(second.isPlaying()).toBe(true);
    releaseStaticSeekCache(cache, warned);
    expect(second.isPlaying()).toBe(false);
    expect(cache.current).toBeNull();
    vi.restoreAllMocks();
  });
});
