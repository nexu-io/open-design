import type { Input, InputVideoTrack } from "mediabunny";
import { mediaUrlSourceOptions } from "./mediaFetch";

export interface SourceInfo {
  aspect: number;
  metadataDuration: number | null;
}

type Mediabunny = typeof import("mediabunny");

interface OpenedSource {
  mediabunny: Mediabunny;
  track: InputVideoTrack;
  info: SourceInfo;
  etag: string | undefined;
}

export interface ThumbnailSource extends OpenedSource {
  /** Ends this job's use. A failed job retires the reader, so the next job opens a fresh one. */
  release(failed: boolean): void;
  /** The job waited for the reader to open: the open finishing was progress the job saw. */
  waitedForOpen: boolean;
  progress: { framesFromAnyJob: number };
}

interface PooledSource {
  version: string | undefined;
  input: Input | null;
  cancelReads: (() => void) | null;
  ready: boolean;
  opened: Promise<OpenedSource>;
  users: number;
  progress: { framesFromAnyJob: number };
  idleTimer: ReturnType<typeof setTimeout> | null;
  disposed: boolean;
}

// One reader per source URL, shared by every clip cut from it: the index is parsed once.
const pool = new Map<string, PooledSource>();
let mediabunnyModule: Promise<Mediabunny> | null = null;
const loadMediabunny = () => (mediabunnyModule ??= import("mediabunny"));

const abortError = () => new DOMException("Aborted", "AbortError");
/** The scheduler's own timeout, as opposed to a cancel. */
export const timedOut = (signal: AbortSignal) =>
  (signal.reason as { name?: unknown } | null)?.name === "TimeoutError";
const isAbortError = (error: unknown) =>
  (error as { name?: unknown } | null)?.name === "AbortError";

function dispose(source: string, entry: PooledSource): void {
  if (entry.disposed) return;
  entry.disposed = true;
  if (entry.idleTimer !== null) clearTimeout(entry.idleTimer);
  if (pool.get(source) === entry) pool.delete(source);
  entry.input?.dispose();
  entry.cancelReads?.();
}

function retire(source: string, entry: PooledSource): void {
  if (pool.get(source) === entry) pool.delete(source);
  if (entry.users === 0) dispose(source, entry);
}

async function open(source: string, pooled: () => PooledSource): Promise<OpenedSource> {
  const mediabunny = await loadMediabunny();
  const entry = pooled();
  // A reader every job let go of while it opened was disposed: stop before reading more of it.
  const live = () => {
    if (entry.disposed) throw abortError();
  };
  live();
  const options = mediaUrlSourceOptions("thumbnail");
  const input = new mediabunny.Input({
    source: new mediabunny.UrlSource(source, options),
    formats: mediabunny.ALL_FORMATS,
  });
  entry.input = input;
  entry.cancelReads = options.cancelReads;
  const track = await input.getPrimaryVideoTrack();
  live();
  if (!track) throw new Error("Video source has no decodable video track");
  const [displayWidth, displayHeight] = await Promise.all([
    track.getDisplayWidth(),
    track.getDisplayHeight(),
  ]);
  live();
  if (!(displayWidth > 0 && displayHeight > 0)) {
    throw new Error("Video source has invalid dimensions");
  }
  const metadataDuration = await track.getDurationFromMetadata({ skipLiveWait: true });
  live();
  const info = { aspect: displayWidth / displayHeight, metadataDuration };
  return { mediabunny, track, info, etag: options.etagOf() };
}

function pooledSource(source: string, version: string | undefined): PooledSource {
  const current = pool.get(source);
  if (current && current.version === version) return current;
  if (current) retire(source, current);
  const entry: PooledSource = {
    version,
    input: null,
    cancelReads: null,
    ready: false,
    opened: open(source, () => entry),
    users: 0,
    progress: { framesFromAnyJob: 0 },
    idleTimer: null,
    disposed: false,
  };
  // A failed open leaves the pool at once; the jobs awaiting it see the failure themselves.
  entry.opened.then(
    () => (entry.ready = true),
    () => retire(source, entry),
  );
  pool.set(source, entry);
  return entry;
}

function untilAborted<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    void pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/**
 * The opened reader for `source` at `version`, shared by concurrent jobs and kept for `idleMs`
 * after the last one ends (0 disposes at once). A new version retires the old reader.
 */
export async function acquireThumbnailSource(
  source: string,
  version: string | undefined,
  signal: AbortSignal,
  idleMs: number,
): Promise<ThumbnailSource> {
  const entry = pooledSource(source, version);
  const waitedForOpen = !entry.ready;
  entry.users += 1;
  if (entry.idleTimer !== null) clearTimeout(entry.idleTimer);
  entry.idleTimer = null;
  let released = false;
  const release = (failed: boolean) => {
    if (released) return;
    released = true;
    entry.users -= 1;
    if (failed) retire(source, entry);
    if (entry.users > 0 || entry.disposed) return;
    if (pool.get(source) === entry && idleMs > 0) {
      entry.idleTimer = setTimeout(() => dispose(source, entry), idleMs);
    } else {
      dispose(source, entry);
    }
  };
  try {
    const { progress } = entry;
    return { ...(await untilAborted(entry.opened, signal)), release, waitedForOpen, progress };
  } catch (error) {
    // Timed out still waiting: the open made no progress in the job's whole run.
    release(!isAbortError(error) || timedOut(signal));
    throw error;
  }
}
