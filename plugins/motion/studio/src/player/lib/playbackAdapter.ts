/**
 * Playback adapter utilities: factory for the static-seek adapter used when a
 * composition exposes only a `renderSeek` / `seek` API (no native play/pause
 * support), plus a thin wrapper that normalises GSAP-style `TimelineLike`
 * objects to the `PlaybackAdapter` interface.
 */

import type {
  PlaybackAdapter,
  RuntimePlaybackAdapter,
  StaticSeekPlaybackClock,
  TimelineLike,
} from "./playbackTypes";

// ---------------------------------------------------------------------------
// Pure numeric helpers
// ---------------------------------------------------------------------------

export function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function clampTime(time: number, duration: number): number {
  const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  const safeTime = Math.max(0, Number.isFinite(time) ? time : 0);
  return safeDuration > 0 ? Math.min(safeTime, safeDuration) : safeTime;
}

export function getAdapterDuration(adapter: PlaybackAdapter | null | undefined): number {
  if (!adapter) return 0;
  try {
    const duration = Number(adapter.getDuration());
    return isFinitePositive(duration) ? duration : 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Clock factory
// ---------------------------------------------------------------------------

export function getDefaultStaticSeekPlaybackClock(win: Window): StaticSeekPlaybackClock {
  return {
    now: () => win.performance.now(),
    requestAnimationFrame: (callback) => win.requestAnimationFrame(callback),
    cancelAnimationFrame: (handle) => win.cancelAnimationFrame(handle),
  };
}

// ---------------------------------------------------------------------------
// Static-seek adapter
// ---------------------------------------------------------------------------

/**
 * Wraps a render-only player (exposes `renderSeek`/`seek` but no native
 * play/pause) and drives playback via `requestAnimationFrame`.
 */
export function createStaticSeekPlaybackAdapter(
  player: Pick<RuntimePlaybackAdapter, "getTime"> &
    Partial<Pick<RuntimePlaybackAdapter, "renderSeek" | "seek">>,
  duration: number,
  clock: StaticSeekPlaybackClock,
  getPlaybackRate: () => number = () => 1,
): PlaybackAdapter {
  const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  let currentTime = clampTime(Number(player.getTime?.() ?? 0), safeDuration);
  let playing = false;
  let rafId = 0;
  let playStartTime = currentTime;
  let playStartNow = clock.now();

  const renderSeek = (time: number) => {
    currentTime = clampTime(time, safeDuration);
    if (typeof player.renderSeek === "function") {
      player.renderSeek(currentTime);
      return;
    }
    player.seek?.(currentTime);
  };

  const stopTicker = () => {
    if (rafId) {
      clock.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  const tick: FrameRequestCallback = (now) => {
    if (!playing) return;
    const playbackRate = Math.max(0.1, Number(getPlaybackRate()) || 1);
    const elapsed = ((now - playStartNow) / 1000) * playbackRate;
    renderSeek(playStartTime + elapsed);
    if (currentTime >= safeDuration) {
      playing = false;
      rafId = 0;
      return;
    }
    rafId = clock.requestAnimationFrame(tick);
  };

  return {
    play: () => {
      if (playing || safeDuration <= 0) return;
      if (currentTime >= safeDuration) renderSeek(0);
      playing = true;
      playStartTime = currentTime;
      playStartNow = clock.now();
      stopTicker();
      rafId = clock.requestAnimationFrame(tick);
    },
    pause: () => {
      playing = false;
      stopTicker();
    },
    seek: (time, options) => {
      renderSeek(time);
      if (options?.keepPlaying) {
        if (playing) {
          playStartTime = currentTime;
          playStartNow = clock.now();
        }
        return;
      }
      // Default seek aligns with wrapTimeline: stop the RAF ticker so the
      // adapter's `playing` flag matches the public seek contract instead of
      // silently driving renderSeek in the background.
      playing = false;
      stopTicker();
    },
    getTime: () => currentTime,
    getDuration: () => safeDuration,
    isPlaying: () => playing,
  };
}

// ---------------------------------------------------------------------------
// Static-seek fallback cache
// ---------------------------------------------------------------------------

export type StaticSeekCacheEntry = {
  player: RuntimePlaybackAdapter | PlaybackAdapter;
  duration: number;
  adapter: PlaybackAdapter;
};

type StaticSeekCacheRef = { current: StaticSeekCacheEntry | null };
type WarnedRef = { current: boolean };

/**
 * Pause and drop the cached static-seek adapter. Must be called whenever
 * adapter selection switches to a native adapter — a cached static-seek
 * adapter that was mid-play keeps its private rAF loop seeking the player
 * forever otherwise, fighting the native transport. Also re-arms the
 * downgrade warning so a later re-downgrade is surfaced again.
 */
export function releaseStaticSeekCache(cache: StaticSeekCacheRef, warned: WarnedRef): void {
  cache.current?.adapter.pause();
  cache.current = null;
  warned.current = false;
}

/**
 * Resolve (with caching) the seek-driven fallback adapter. Warns once per
 * downgrade streak: seek-driven playback never starts media elements or
 * WebAudio, so without the warning the downgrade silently loses audio.
 */
export function resolveStaticSeekFallback(opts: {
  cache: StaticSeekCacheRef;
  warned: WarnedRef;
  bestAdapter: RuntimePlaybackAdapter | PlaybackAdapter;
  effectiveDuration: number;
  docDuration: number;
  clock: StaticSeekPlaybackClock;
  getPlaybackRate: () => number;
}): PlaybackAdapter {
  const { cache, warned, bestAdapter, effectiveDuration, docDuration } = opts;
  const cached = cache.current;
  if (cached?.player === bestAdapter && cached.duration === effectiveDuration) {
    return cached.adapter;
  }
  cached?.adapter.pause();
  if (!warned.current) {
    warned.current = true;
    console.warn(
      `[useTimelinePlayer] Selected adapter duration (${getAdapterDuration(bestAdapter)}s) does not cover the document duration (${docDuration}s); falling back to seek-driven playback, which never starts media elements or WebAudio. Audio will not play in preview. Extend the GSAP timeline to cover the declared data-duration.`,
    );
  }
  const adapter = createStaticSeekPlaybackAdapter(
    bestAdapter,
    effectiveDuration,
    opts.clock,
    opts.getPlaybackRate,
  );
  cache.current = { player: bestAdapter, duration: effectiveDuration, adapter };
  return adapter;
}

// ---------------------------------------------------------------------------
// GSAP timeline wrapper
// ---------------------------------------------------------------------------

export function wrapTimeline(tl: TimelineLike): PlaybackAdapter {
  return {
    play: () => tl.play(),
    pause: () => tl.pause(),
    seek: (t, options) => {
      const shouldPause = !options?.keepPlaying;
      if (shouldPause) tl.pause();
      tl.seek(t);
      if (shouldPause) tl.pause();
    },
    getTime: () => tl.time(),
    getDuration: () => tl.duration(),
    isPlaying: () => tl.isActive(),
  };
}
