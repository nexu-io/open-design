import { authoredSrcPath, resolveMediaPreviewUrl } from "../components/thumbnailUtils";
import { TIMELINE_VIEWPORT_BUDGETS } from "./timelineViewportBudgets";
import { mediaUrlSourceOptions, reportMediaFetchFailure } from "./mediaFetch";

export interface MediaProbeResult {
  duration: number;
  width?: number;
  height?: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

interface CachedProbe {
  result: MediaProbeResult;
  lastAccess: number;
}

const cache = new Map<string, CachedProbe>();
const inflight = new Map<string, Promise<MediaProbeResult | null>>();
// URLs whose probe failed (CORS, 404, non-media). Remembered so the rAF-driven
// timeline re-derive doesn't re-fetch them every frame and flood the console.
const failed = new Map<string, { failedAt: number; lastAccess: number }>();
let accessSequence = 0;
let activeProbes = 0;
let registryEpoch = 0;
const probeQueue: Array<{
  key: string;
  epoch: number;
  resolve: (result: MediaProbeResult | null) => void;
}> = [];

let mediabunnyModule: typeof import("mediabunny") | null | false = null;

async function loadMediabunny() {
  if (mediabunnyModule === false) return null;
  if (mediabunnyModule) return mediabunnyModule;
  try {
    mediabunnyModule = await import("mediabunny");
    return mediabunnyModule;
  } catch {
    mediabunnyModule = false;
    return null;
  }
}

function normalizeUrl(url: string): string {
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}

async function probeOne(url: string): Promise<MediaProbeResult | null> {
  const mb = await loadMediabunny();
  if (!mb) return null;

  const input = new mb.Input({
    source: new mb.UrlSource(url, mediaUrlSourceOptions("probe")),
    formats: mb.ALL_FORMATS,
  });
  try {
    const duration = await input.getDurationFromMetadata();
    if (duration == null || !Number.isFinite(duration) || duration <= 0) return null;

    const videoTrack = await input.getPrimaryVideoTrack();
    const audioTracks = await input.getAudioTracks();

    const result: MediaProbeResult = {
      duration,
      width: videoTrack?.displayWidth,
      height: videoTrack?.displayHeight,
      hasVideo: videoTrack != null,
      hasAudio: audioTracks.length > 0,
    };
    return result;
  } catch (error) {
    reportMediaFetchFailure(error);
    return null;
  } finally {
    input.dispose();
  }
}

function getCachedProbe(url: string): MediaProbeResult | undefined {
  const cached = cache.get(normalizeUrl(url));
  if (cached) cached.lastAccess = ++accessSequence;
  return cached?.result;
}

function resolveProbeSource(src: string, projectId: string | null): string {
  return projectId
    ? resolveMediaPreviewUrl(authoredSrcPath(src), projectId, window.location.origin)
    : src;
}

function evictMetadataOverflow(): void {
  const overflow = cache.size + failed.size - TIMELINE_VIEWPORT_BUDGETS.metadataRegistryEntries;
  if (overflow <= 0) return;
  const entries = [
    ...Array.from(cache, ([key, value]) => ({ key, at: value.lastAccess, failed: false })),
    ...Array.from(failed, ([key, value]) => ({ key, at: value.lastAccess, failed: true })),
  ].sort((left, right) => left.at - right.at);
  for (const entry of entries.slice(0, overflow)) {
    if (entry.failed) failed.delete(entry.key);
    else cache.delete(entry.key);
  }
}

/**
 * Re-apply the cached probe `sourceDuration` to media elements that arrive
 * without it. Re-deriving the timeline (e.g. after a clip move) produces fresh
 * objects whose duration the DOM scan may not have, and the async probe skips
 * already-cached srcs — so without this, trimmed waveforms lose their window.
 */
export function applyCachedSourceDurations<
  T extends { src?: string; tag: string; sourceDuration?: number },
>(elements: T[], projectId: string | null): T[] {
  return elements.map((el) => {
    const tag = el.tag.toLowerCase();
    if (!el.src || el.sourceDuration != null || (tag !== "audio" && tag !== "video")) return el;
    const cached = getCachedProbe(resolveProbeSource(el.src, projectId));
    return cached?.duration && cached.duration > 0
      ? { ...el, sourceDuration: cached.duration }
      : el;
  });
}

/**
 * Probe (header-only, cheap) any media elements still missing sourceDuration
 * after the cache pass, applying each resolved duration via `apply(key, secs)`.
 * Skips already-cached srcs.
 */
export async function probeMissingSourceDurations<
  T extends { src?: string; tag: string; sourceDuration?: number; key?: string; id: string },
>(
  elements: T[],
  projectId: string | null,
  apply: (key: string, durationSeconds: number) => void,
): Promise<void> {
  const needs = elements.flatMap((el) => {
    if (
      !el.src ||
      el.sourceDuration != null ||
      !["video", "audio"].includes(el.tag.toLowerCase())
    ) {
      return [];
    }
    const source = resolveProbeSource(el.src, projectId);
    return !getCachedProbe(source) && !hasFreshFailure(normalizeUrl(source))
      ? [{ el, source }]
      : [];
  });
  if (needs.length === 0) return;
  await Promise.allSettled(
    needs.map(async ({ el, source }) => {
      const result = await probeMediaUrl(source);
      if (result) apply(el.key ?? el.id, result.duration);
    }),
  );
}

function hasFreshFailure(key: string): boolean {
  const failedAt = failed.get(key);
  if (failedAt === undefined) return false;
  if (Date.now() - failedAt.failedAt < TIMELINE_VIEWPORT_BUDGETS.metadataFailureTtlMs) {
    failedAt.lastAccess = ++accessSequence;
    return true;
  }
  failed.delete(key);
  return false;
}

export async function probeMediaUrl(url: string): Promise<MediaProbeResult | null> {
  const key = normalizeUrl(url);
  const cached = getCachedProbe(key);
  if (cached) return cached;
  if (hasFreshFailure(key)) return null;

  let pending = inflight.get(key);
  if (pending) return pending;

  pending = new Promise<MediaProbeResult | null>((resolve) => {
    probeQueue.push({ key, epoch: registryEpoch, resolve });
    pumpProbeQueue();
  });
  inflight.set(key, pending);
  return pending;
}

function pumpProbeQueue(): void {
  while (activeProbes < TIMELINE_VIEWPORT_BUDGETS.concurrentMetadataJobs) {
    const queued = probeQueue.shift();
    if (!queued) return;
    if (queued.epoch !== registryEpoch) {
      queued.resolve(null);
      continue;
    }
    activeProbes++;
    void probeOne(queued.key)
      .then((result) => {
        if (queued.epoch !== registryEpoch) return null;
        inflight.delete(queued.key);
        if (result) cache.set(queued.key, { result, lastAccess: ++accessSequence });
        else failed.set(queued.key, { failedAt: Date.now(), lastAccess: ++accessSequence });
        evictMetadataOverflow();
        return result;
      })
      .then(queued.resolve)
      .finally(() => {
        activeProbes--;
        pumpProbeQueue();
      });
  }
}

export function getMediaProbeDiagnostics() {
  return { cached: cache.size, failed: failed.size, inflight: inflight.size };
}

export function resetMediaProbeRegistry(): void {
  registryEpoch++;
  for (const queued of probeQueue.splice(0)) queued.resolve(null);
  cache.clear();
  failed.clear();
  inflight.clear();
  accessSequence = 0;
}
