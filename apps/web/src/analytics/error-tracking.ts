// Direct-fetch safety telemetry transport.
//
// Why this exists alongside posthog-js's autocapture
// ---------------------------------------------------
// Two design constraints make posthog-js's normal capture path insufficient
// for safety / reliability telemetry:
//
//   1. **Consent gate.** `posthog.opt_out_capturing()` silences ALL captures.
//      Product policy is that *safety* telemetry — exceptions, white
//      screens, dropped chunks, long tasks, stuck runs — flows
//      unconditionally so we don't lose ground truth on stability when a
//      user opts out of general analytics. The user-facing copy in
//      Settings → Privacy must reflect this.
//
//   2. **Lazy-load window.** posthog-js is dynamically `import()`-ed only
//      after `/api/analytics/config` returns AND the user has consented.
//      Errors / metrics that fire during the first 1-2 seconds (React
//      hydration, early effects, route init) are lost. We hook the
//      relevant browser events synchronously at module load, before any
//      of that, and buffer until we have credentials.
//
// This module exposes two surfaces:
//
//   - `reportHandledException` / `installErrorHandlers` — emit shaped
//     `$exception` events (used directly + via `window.error` /
//     `unhandledrejection`).
//   - `reportSafetyEvent(eventName, properties)` — generic transport for
//     non-exception observability events (long tasks, white screens,
//     resource errors, boot timing, etc.) that need the same
//     consent-bypass + early-buffer guarantees.
//
// To avoid duplicate `$exception` events, `client.ts` sets
// `capture_exceptions: false` on the posthog-js init — this module is the
// single source of truth for browser exception capture.

import { scrubExceptionList, scrubFilePath } from './scrub';

interface ExceptionTrackingContext {
  apiKey: string;
  host: string;
  distinctId: string;
  appVersion?: string;
  sessionId?: string;
  telemetryEnv?: string;
}

interface BufferedSafetyEvent {
  eventName: string;
  body: { properties: Record<string, unknown> };
  timestamp: string;
}

// Cap the buffer so a chain of early errors (e.g. infinite render loop
// before posthog-js loads) cannot grow indefinitely. 50 is enough to
// capture the burst that usually surrounds a real bug while keeping the
// memory footprint trivial.
const MAX_BUFFER_SIZE = 50;

// PostHog's exception ingestion requires a `platform` on each stack frame.
// Mirrors the value posthog-js stamps so our hand-built events pass the
// same server-side processing. See `buildExceptionList`.
const FRAME_PLATFORM = 'web:javascript';

let context: ExceptionTrackingContext | null = null;
const buffer: BufferedSafetyEvent[] = [];
let installed = false;

export function setExceptionTrackingContext(next: ExceptionTrackingContext): void {
  context = next;
  if (buffer.length === 0) return;
  const drain = buffer.splice(0, buffer.length);
  for (const item of drain) {
    dispatch(item);
  }
}

export function clearExceptionTrackingContext(): void {
  // Called when /api/analytics/config returns `key: null` (no build-time
  // POSTHOG_KEY, e.g. a fork build). The buffered events stay in memory
  // until the page unloads — no key, nowhere to send them, but also
  // nothing leaks.
  context = null;
}

// Patches only the appVersion field on an existing context. Safe to call
// mid-session when the real version arrives after boot (e.g. /api/version
// resolves after the initial '0.0.0' placeholder). No-op if context hasn't
// been set yet.
export function patchExceptionTrackingAppVersion(version: string): void {
  if (!context || !version) return;
  context = { ...context, appVersion: version };
}

// Called once at app boot. Idempotent — repeated calls are no-ops.
export function installErrorHandlers(): void {
  if (installed) return;
  if (typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    captureException(event.error, event.message ?? 'Uncaught error', {
      filename: typeof event.filename === 'string' ? event.filename : undefined,
      lineno: typeof event.lineno === 'number' ? event.lineno : undefined,
      colno: typeof event.colno === 'number' ? event.colno : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const fallback =
      typeof reason === 'string' ? reason : 'Unhandled promise rejection';
    captureException(reason, fallback);
  });
}

// Public entry point for code paths that catch their own error but still
// want it visible in PostHog (e.g. an ErrorBoundary's componentDidCatch).
// Unhandled errors go through the window listeners above.
export function reportHandledException(error: unknown, message?: string): void {
  captureException(error, message ?? defaultMessage(error), { handled: true });
}

interface CaptureMetadata {
  filename?: string;
  lineno?: number;
  colno?: number;
  handled?: boolean;
}

// Generic "the fetch could not complete" wordings across engines. As an
// uncaught exception these carry no URL and no status, so they're
// uninformative on their own — but we only suppress them in the packaged
// runtime (see `isIgnorableNoise`), never the web app.
const FETCH_FAILURE_MESSAGES = new Set([
  'Failed to fetch', // Chromium (Electron, Chrome)
  'Load failed', // WebKit (Safari)
  'NetworkError when attempting to fetch resource.', // Firefox
]);

// A frame originates in packaged desktop app code when its (pre-scrub) path
// is either:
//   - served from the `od://` scheme — the packaged renderer, all platforms;
//   - a `file://` path inside the macOS app bundle, i.e. it contains
//     `.app/Contents/Resources` (source-mapped frames; scrub.ts rewrites
//     these for privacy — see `scrubFilePath`). We match the bundle marker
//     rather than a channel-specific app name so `Open Design Beta.app` /
//     `Open Design Preview.app` builds are covered too.
function isPackagedFramePath(path: string): boolean {
  return path.startsWith('od://') || path.includes('.app/Contents/Resources');
}

// True when the exception originated in packaged desktop app code. We key off
// the stack origin rather than `window.location` so the decision is tied to
// where the failing call actually ran, and so it's deterministic to test.
function originatesInPackagedApp(list: Array<Record<string, unknown>>): boolean {
  const stacktrace = list[0]?.stacktrace as
    | { frames?: Array<Record<string, unknown>> }
    | undefined;
  const frames = stacktrace?.frames ?? [];
  return frames.some((frame) => {
    const path = typeof frame.abs_path === 'string' ? frame.abs_path : frame.filename;
    return typeof path === 'string' && isPackagedFramePath(path);
  });
}

// Fetch failures are environmental noise ONLY in the packaged app, where the
// renderer constantly polls the local daemon and a momentary gap (daemon
// restart, boot race, navigation/unmount abort, offline blip) makes
// `Failed to fetch` ~90% of all captured exceptions — pure churn that buries
// real bugs. We scope the drop to that runtime deliberately: in a normal
// web context the very same TypeError can be the only signal of a broken
// `/api/*` deployment or a CORS/TLS regression, so it must stay captured.
function isIgnorableNoise(list: Array<Record<string, unknown>>): boolean {
  const value = list[0]?.value;
  if (typeof value !== 'string' || !FETCH_FAILURE_MESSAGES.has(value)) return false;
  return originatesInPackagedApp(list);
}

function captureException(
  error: unknown,
  fallbackMessage: string,
  metadata: CaptureMetadata = {},
): void {
  const list = buildExceptionList(error, fallbackMessage, metadata);
  if (isIgnorableNoise(list)) return;
  const scrubbed = scrubExceptionList(list);
  const properties: Record<string, unknown> = {
    $exception_list: scrubbed,
    $exception_type: scrubbed[0]?.type,
    $exception_message: scrubbed[0]?.value,
    $exception_source: scrubFirstFrameSource(scrubbed),
    $current_url: scrubUrl(typeof window !== 'undefined' ? window.location.href : ''),
    $insert_id: randomId(),
    capture_source: 'web/error-tracking',
    handled: metadata.handled === true,
  };

  enqueue('$exception', properties);
}

// Generic safety-telemetry surface for non-exception observability events
// (long tasks, white screens, resource errors, boot timing, stuck runs,
// visibility changes, etc.). Goes through the same buffer + direct-fetch
// transport as `$exception` so the same consent-bypass + early-firing
// guarantees apply. Callers should namespace event names with `client_*`
// (or `desktop_*` / `daemon_*` for cross-process forwards) so they're
// easy to filter against posthog-js-captured product events.
export function reportSafetyEvent(
  eventName: string,
  properties: Record<string, unknown> = {},
): void {
  const merged: Record<string, unknown> = {
    ...properties,
    $current_url: scrubUrl(typeof window !== 'undefined' ? window.location.href : ''),
    $insert_id: randomId(),
    capture_source: 'web/error-tracking',
  };
  enqueue(eventName, merged);
}

function enqueue(eventName: string, properties: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const item: BufferedSafetyEvent = {
    eventName,
    body: { properties },
    timestamp,
  };
  if (context == null) {
    if (buffer.length >= MAX_BUFFER_SIZE) buffer.shift();
    buffer.push(item);
    return;
  }
  dispatch(item);
}

function dispatch(item: BufferedSafetyEvent): void {
  if (context == null) return;
  const payload = {
    api_key: context.apiKey,
    event: item.eventName,
    distinct_id: context.distinctId,
    properties: {
      ...item.body.properties,
      $lib: 'web/error-tracking',
      ...(context.telemetryEnv ? { env: context.telemetryEnv } : {}),
      ...(context.appVersion ? { app_version: context.appVersion, ui_version: context.appVersion } : {}),
      ...(context.sessionId ? { session_id: context.sessionId } : {}),
    },
    timestamp: item.timestamp,
  };
  // `keepalive` ensures the request survives an immediate window unload —
  // important for events that fire during navigation that are followed by
  // a route change a millisecond later.
  try {
    void fetch(`${context.host.replace(/\/+$/, '')}/i/v0/e/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
      // No credentials — PostHog ingest uses the public `phc_` key as the
      // auth surface; cookies are irrelevant and sending them would just
      // add CORS preflight friction.
      credentials: 'omit',
    }).catch(() => {
      // Swallow the async rejection too. The synchronous try/catch below
      // only guards against fetch throwing on a malformed argument; the
      // returned promise rejects separately when the beacon can't reach
      // PostHog (offline, ingest down). Left unhandled, that rejection is
      // itself scooped up by the `unhandledrejection` listener above and
      // re-reported as a `Failed to fetch` $exception — a self-amplifying
      // loop where our own telemetry transport manufactures telemetry.
    });
  } catch {
    // best-effort: safety telemetry must never propagate
  }
}

// Frame-level source-map correlation.
//
// `@posthog/cli sourcemap inject` (run from tools/pack/src/web-sourcemaps.ts
// on every packaged build) bakes a unique chunk id into each browser chunk
// and the matching id into the .map it uploads to PostHog. At load time each
// injected chunk registers `globalThis._posthogChunkIds[<its Error().stack>] =
// <chunkId>`. Symbolication then requires that chunk id to ride along on each
// captured frame: packaged chunks load over the `od://` scheme, which PostHog
// cannot fetch a `.map` from, so the chunk id is the ONLY correlation key.
//
// posthog-js stamps it natively, but we set `capture_exceptions: false` and
// hand-build exceptions here, so we must replicate the stamping or every
// packaged frame ships un-symbolicatable (observed in prod: 100% of frames
// failed with "had no source url or chunk id"). This mirrors
// @posthog/core error-tracking/chunk-ids.ts so the filename→chunkId map is
// identical to what the uploaded maps were injected against.
type ChunkIdMap = Record<string, string>;

let cachedRegistry: ChunkIdMap | undefined;
let cachedFilenameChunkIds: ChunkIdMap | undefined;
let cachedRegistryKeyCount = -1;

function getFilenameToChunkIdMap(): ChunkIdMap {
  const registry = (globalThis as { _posthogChunkIds?: ChunkIdMap })._posthogChunkIds;
  if (!registry) return {};
  const keys = Object.keys(registry);
  // Chunks register lazily as they load, so the registry grows over the
  // session. Rebuild only when it changes (same identity + same size = hit).
  if (
    cachedFilenameChunkIds &&
    cachedRegistry === registry &&
    keys.length === cachedRegistryKeyCount
  ) {
    return cachedFilenameChunkIds;
  }
  const map: ChunkIdMap = {};
  for (const stackKey of keys) {
    const chunkId = registry[stackKey];
    if (!chunkId) continue;
    // The registry key is an Error().stack captured inside the injected chunk.
    // Key the chunk id on the frame where that Error was constructed — the
    // chunk's own file. @posthog/core scans its stackParser output (which it
    // reverses to oldest-first) from the end, i.e. the NEWEST frame; parseStack
    // here keeps Error.stack's native newest-first order, so the newest frame
    // is frames[0]. Take the first frame with a filename. A registration stack
    // is typically multi-frame (the injected IIFE sits above webpack
    // require/loader frames), so picking the wrong end would key the id onto a
    // runtime-chunk filename and leave the real chunk with no entry.
    const frames = parseStack(stackKey, {});
    for (const frame of frames) {
      const filename = frame?.filename;
      if (typeof filename === 'string' && filename) {
        map[filename] = chunkId;
        break;
      }
    }
  }
  cachedRegistry = registry;
  cachedRegistryKeyCount = keys.length;
  cachedFilenameChunkIds = map;
  return map;
}

function buildExceptionList(
  error: unknown,
  fallbackMessage: string,
  metadata: CaptureMetadata,
): Array<Record<string, unknown>> {
  const isError = error instanceof Error;
  const type = isError ? error.name : typeof error === 'string' ? 'Error' : 'NonError';
  const value = isError
    ? error.message
    : typeof error === 'string'
      ? error
      : fallbackMessage;
  const stack = isError && typeof error.stack === 'string' ? error.stack : '';
  const chunkIds = getFilenameToChunkIdMap();
  // Stamp `platform` on every frame. PostHog's exception ingestion treats
  // it as a required field (it selects the symbolication / issue-grouping
  // strategy per frame); a frame without it fails the exceptions pipeline
  // with "missing field platform" and the whole event is dropped
  // server-side — which is why 100% of our hand-built `$exception` events
  // were failing to ingest. posthog-js stamps the same value on each frame;
  // we replicate it because client.ts sets `capture_exceptions: false` and
  // this module is the sole browser-exception transport.
  //
  // Also stamp `chunk_id` when the frame's chunk registered one (see
  // `getFilenameToChunkIdMap`). Without it, packaged `od://` frames carry no
  // source URL PostHog can fetch, so the uploaded sourcemap can never be
  // matched and every frame stays minified — the reason production stacks
  // showed `?:?` despite the tools-pack sourcemap upload succeeding.
  const frames = parseStack(stack, metadata).map((frame) => {
    const filename = typeof frame.filename === 'string' ? frame.filename : undefined;
    const chunkId = filename ? chunkIds[filename] : undefined;
    return {
      ...frame,
      platform: FRAME_PLATFORM,
      ...(chunkId ? { chunk_id: chunkId } : {}),
    };
  });
  return [
    {
      type,
      value,
      stacktrace: { type: 'raw', frames },
      mechanism: {
        type: metadata.handled === true ? 'handled' : 'generic',
        handled: metadata.handled === true,
      },
    },
  ];
}

// Minimal stack parser. Covers V8 (`at Foo (url:1:2)` and `at url:1:2`)
// and the SpiderMonkey-style `Foo@url:1:2`. Lines we cannot parse are
// kept as a raw line so the report stays useful even without symbolicated
// frames.
const STACK_RE_V8 = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/;
const STACK_RE_SPIDERMONKEY = /^(.*?)@(.+?):(\d+):(\d+)$/;

function parseStack(stack: string, metadata: CaptureMetadata): Array<Record<string, unknown>> {
  if (!stack) {
    if (metadata.filename) {
      return [
        {
          function: '<anonymous>',
          filename: metadata.filename,
          abs_path: metadata.filename,
          lineno: metadata.lineno ?? 0,
          colno: metadata.colno ?? 0,
          in_app: true,
        },
      ];
    }
    return [];
  }
  const lines = stack.split('\n');
  // The first line is usually the message (e.g. "TypeError: foo is not a
  // function") rather than a frame — skip it when it doesn't start with
  // `at` or contain `@`.
  const frameLines = lines[0]?.match(/^\s*at\b|@/) ? lines : lines.slice(1);
  return frameLines
    .map((line) => parseFrame(line))
    .filter((frame): frame is Record<string, unknown> => frame != null);
}

function parseFrame(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const v8 = STACK_RE_V8.exec(trimmed);
  if (v8) {
    return {
      function: v8[1] ?? '<anonymous>',
      filename: v8[2],
      abs_path: v8[2],
      lineno: Number(v8[3]),
      colno: Number(v8[4]),
      in_app: true,
    };
  }
  const sm = STACK_RE_SPIDERMONKEY.exec(trimmed);
  if (sm) {
    return {
      function: sm[1] || '<anonymous>',
      filename: sm[2],
      abs_path: sm[2],
      lineno: Number(sm[3]),
      colno: Number(sm[4]),
      in_app: true,
    };
  }
  return { raw: trimmed, in_app: true };
}

function scrubFirstFrameSource(list: Array<Record<string, unknown>>): string | undefined {
  const first = list[0];
  if (!first) return undefined;
  const stacktrace = first.stacktrace as
    | { frames?: Array<{ abs_path?: unknown }> }
    | undefined;
  const frame = stacktrace?.frames?.[0];
  if (frame == null || typeof frame.abs_path !== 'string') return undefined;
  // Already scrubbed by scrubExceptionList; just narrow the type.
  return frame.abs_path;
}

function scrubUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function defaultMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older browsers / SSR — collision risk is negligible
  // because $insert_id only needs to dedupe within a single user-session
  // window on the PostHog ingest side.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Re-exported helpers for the file-path scrub so callers that hand-build
// frames (e.g. legacy code paths) can apply the same redaction without
// reaching into scrub.ts directly.
export { scrubFilePath };
