// Picks the PlaybackAdapter an iframe's runtime exposes, wrapping it for static seek when needed.
import type { MutableRefObject } from "react";
import { usePlayerStore } from "../store/playerStore";
import type { PlaybackAdapter, IframeWindow } from "../lib/playbackTypes";
import {
  getAdapterDuration,
  wrapTimeline,
  getDefaultStaticSeekPlaybackClock,
  releaseStaticSeekCache,
  resolveStaticSeekFallback,
  type StaticSeekCacheEntry,
} from "../lib/playbackAdapter";
import { readTimelineDurationFromDocument } from "../lib/timelineDOM";

/**
 * Timeline-based adapters (`__timeline`, then `__timelines`): `match` is the first that covers
 * the document duration; otherwise `fallback` is the first with any duration.
 */
function pickTimelineAdapter(
  iframe: HTMLIFrameElement,
  win: IframeWindow,
  docDuration: number,
): { match: PlaybackAdapter | null; fallback: PlaybackAdapter | null } {
  let fallback: PlaybackAdapter | null = null;
  for (const adapter of timelineCandidates(iframe, win)) {
    const dur = getAdapterDuration(adapter);
    if (dur > 0 && docDuration <= dur) return { match: adapter, fallback };
    if (dur > 0) fallback ??= adapter;
  }
  return { match: null, fallback };
}

function* timelineCandidates(
  iframe: HTMLIFrameElement,
  win: IframeWindow,
): Generator<PlaybackAdapter> {
  if (win.__timeline) yield wrapTimeline(win.__timeline);
  const keys = win.__timelines ? Object.keys(win.__timelines) : [];
  if (!win.__timelines || keys.length === 0) return;
  // The outermost [data-composition-id] is the master; Object.keys() order would let a
  // sub-composition hijack transport.
  const rootId = iframe.contentDocument
    ?.querySelector("[data-composition-id]")
    ?.getAttribute("data-composition-id");
  const key = rootId && rootId in win.__timelines ? rootId : keys[keys.length - 1];
  yield wrapTimeline(win.__timelines[key]);
}

interface StaticSeekRefs {
  cache: MutableRefObject<StaticSeekCacheEntry | null>;
  warned: MutableRefObject<boolean>;
}

export function resolvePlaybackAdapter(
  iframe: HTMLIFrameElement,
  win: IframeWindow,
  refs: StaticSeekRefs,
): PlaybackAdapter | null {
  const playerAdapter =
    win.__player && typeof win.__player.play === "function" ? win.__player : null;
  const docDuration = readTimelineDurationFromDocument(iframe.contentDocument);
  const adapterDur = getAdapterDuration(playerAdapter);

  if (adapterDur > 0 && docDuration <= adapterDur) {
    releaseStaticSeekCache(refs.cache, refs.warned);
    return playerAdapter;
  }

  const timelines = pickTimelineAdapter(iframe, win, docDuration);
  if (timelines.match) {
    releaseStaticSeekCache(refs.cache, refs.warned);
    return timelines.match;
  }
  const timelineAdapter = timelines.fallback;

  // The document timeline extends past every native adapter's duration.
  // Wrap the best available adapter with the effective duration so the
  // seek slider, seek clamping, and duration display cover the full range.
  const bestAdapter = playerAdapter ?? timelineAdapter;
  const effectiveDuration = Math.max(usePlayerStore.getState().duration, docDuration, adapterDur);
  if (
    bestAdapter &&
    effectiveDuration > 0 &&
    ("renderSeek" in bestAdapter || typeof bestAdapter.seek === "function")
  ) {
    return resolveStaticSeekFallback({
      cache: refs.cache,
      warned: refs.warned,
      bestAdapter,
      effectiveDuration,
      docDuration,
      clock: getDefaultStaticSeekPlaybackClock(win),
      getPlaybackRate: () => usePlayerStore.getState().playbackRate,
    });
  }

  return bestAdapter;
}
