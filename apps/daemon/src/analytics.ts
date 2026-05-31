// Daemon-side PostHog capture. Mirrors apps/daemon/src/langfuse-trace.ts in
// its env-gating discipline: without POSTHOG_KEY in the env every entry point
// is a no-op, so dev builds and third-party forks impose zero overhead.
//
// Web-side captures (apps/web/src/analytics) carry the matching identity in
// HTTP headers (see x-od-analytics-* constants in @open-design/contracts);
// daemon reads those headers off the request and reuses the same
// device_id as the PostHog distinct_id so events from both sides land on
// the same person. (v2: renamed from `anonymous_id`.)

import crypto from 'node:crypto';
import { PostHog } from 'posthog-node';
import type { Request } from 'express';
import {
  ANALYTICS_HEADER_DEVICE_ID,
  ANALYTICS_HEADER_CLIENT_TYPE,
  ANALYTICS_HEADER_LOCALE,
  ANALYTICS_HEADER_REQUEST_ID,
  ANALYTICS_HEADER_SESSION_ID,
  anonymizeArtifactId as anonymizeArtifactIdShared,
  type AnalyticsClientType,
  type AnalyticsConfigResponse,
  EVENT_SCHEMA_VERSION,
} from '@open-design/contracts/analytics';
import { readAppConfig } from './app-config.js';

const DEFAULT_HOST = 'https://us.i.posthog.com';

export interface AnalyticsContext {
  deviceId: string;
  sessionId: string;
  clientType: AnalyticsClientType;
  locale: string;
  requestId: string | null;
}

// Read context from an incoming request. Returns null when the web client did
// not include analytics headers (likely because analytics is disabled on the
// web side too). Daemon-internal capture sites (e.g. background sweeps with
// no request) should not invoke this path.
export function readAnalyticsContext(req: Request): AnalyticsContext | null {
  const deviceId = headerString(req, ANALYTICS_HEADER_DEVICE_ID);
  if (!deviceId) return null;
  const sessionId = headerString(req, ANALYTICS_HEADER_SESSION_ID) ?? deviceId;
  const clientHeader = headerString(req, ANALYTICS_HEADER_CLIENT_TYPE);
  const clientType: AnalyticsClientType =
    clientHeader === 'desktop' ? 'desktop' : 'web';
  const locale = headerString(req, ANALYTICS_HEADER_LOCALE) ?? 'en';
  const requestId = headerString(req, ANALYTICS_HEADER_REQUEST_ID);
  return { deviceId, sessionId, clientType, locale, requestId };
}

function headerString(req: Request, name: string): string | null {
  const raw = req.headers[name];
  if (Array.isArray(raw)) return raw[0]?.trim() || null;
  if (typeof raw === 'string') return raw.trim() || null;
  return null;
}

export interface PosthogConfig {
  key: string;
  host: string;
}

export function readPosthogConfig(
  env: NodeJS.ProcessEnv = process.env,
): PosthogConfig | null {
  const key = env.POSTHOG_KEY?.trim();
  if (!key) return null;
  const host = (env.POSTHOG_HOST?.trim() || DEFAULT_HOST).replace(/\/+$/, '');
  return { key, host };
}

// Baseline wire response for GET /api/analytics/config — checks only the
// env-var gate. The route handler in server.ts further narrows this with
// the user's telemetry.metrics consent before sending it to the client.
export function readPublicConfigResponse(
  env: NodeJS.ProcessEnv = process.env,
): AnalyticsConfigResponse {
  const cfg = readPosthogConfig(env);
  if (!cfg) return { enabled: false, key: null, host: null };
  return { enabled: true, key: cfg.key, host: cfg.host };
}

export interface AnalyticsService {
  capture(args: {
    eventName: string;
    context: AnalyticsContext;
    appVersion: string;
    properties: Record<string, unknown>;
    insertId: string;
  }): void;
  /**
   * Safety / reliability events (renderer crashes, daemon uncaught errors,
   * SSE health, etc.) that intentionally BYPASS the user's analytics
   * consent toggle. The product policy is: we always retain ground-truth
   * stability data even for opted-out users — the user-facing consent copy
   * in Settings → Privacy must call this out.
   *
   * Falls back to a synthetic distinctId when the installationId is not
   * yet stamped (first-launch or fork builds without an app-config file).
   *
   * Returns a Promise that resolves AFTER the event has been enqueued in
   * posthog-node's local buffer. Fire-and-forget callers (e.g. the
   * /api/observability/event endpoint) can `void` it; fatal-exit paths
   * MUST await before calling `shutdown()` so the crash event actually
   * makes it into the flush.
   */
  captureSafety(args: {
    eventName: string;
    distinctId?: string;
    appVersion: string;
    properties: Record<string, unknown>;
    insertId?: string;
  }): Promise<void>;
  shutdown(): Promise<void>;
}

const NOOP_SERVICE: AnalyticsService = {
  capture: () => undefined,
  captureSafety: async () => undefined,
  shutdown: async () => undefined,
};

// PostHog node client is created lazily so that import-time of this module
// stays free in keyless dev/test environments. Returns the no-op service
// when POSTHOG_KEY is unset.
//
// `dataDir` is required so capture can re-read app-config and gate on the
// user's telemetry.metrics consent. This is defense in depth against PR
// #1428 reviewer (codex-connector, lefarcen): even if a stale fetch wrapper
// somehow attaches x-od-analytics-* headers to a request after the user
// opted out, the daemon will still drop the capture.
export function createAnalyticsService(args: {
  env?: NodeJS.ProcessEnv;
  dataDir: string;
}): AnalyticsService {
  const env = args.env ?? process.env;
  const cfg = readPosthogConfig(env);
  if (!cfg) return NOOP_SERVICE;

  // flushAt: 1 keeps the daemon-emit-then-respond pattern simple at the cost
  // of one network round-trip per event; flushInterval: 1000 still batches
  // bursts so a streaming run doesn't fire one HTTP per event.
  const client = new PostHog(cfg.key, {
    host: cfg.host,
    flushAt: 1,
    flushInterval: 1000,
  });

  // Suppress posthog-node's own internal error spam — analytics failures
  // must never look like product errors. The library exposes `on('error')`.
  client.on?.('error', () => undefined);

  return {
    capture: ({ eventName, context, appVersion, properties, insertId }) => {
      // Defense-in-depth consent re-check. The route handler already gates
      // on header presence, but a future header leak or a Settings toggle
      // mid-request would still let events through without this. Reading
      // app-config.json adds one small file read per event; the daemon is
      // not on a hot critical path here.
      void (async () => {
        try {
          const appCfg = await readAppConfig(args.dataDir);
          if (appCfg.telemetry?.metrics !== true) return;
          client.capture({
            distinctId: context.deviceId,
            event: eventName,
            properties: {
              ...properties,
              event_id: insertId,
              event_schema_version: EVENT_SCHEMA_VERSION,
              ui_version: appVersion,
              app_version: appVersion,
              session_id: context.sessionId,
              // v2 rename: was `anonymous_id`. Value unchanged.
              device_id: context.deviceId,
              client_type: context.clientType,
              locale: context.locale,
              ...(context.requestId ? { request_id: context.requestId } : {}),
              // $insert_id is PostHog's dedup key — passing the same id
              // from web and daemon prevents the mirrored result event
              // from being counted twice.
              $insert_id: insertId,
            },
          });
        } catch {
          // Swallowed by design; capture failures must never propagate.
        }
      })();
    },
    captureSafety: async ({ eventName, distinctId, appVersion, properties, insertId }) => {
      // No consent re-check here — that's the entire point of this surface.
      // We still fall back gracefully when the installationId is missing
      // (cold start before the daemon has stamped one in app-config) by
      // synthesizing an anonymous distinct id rooted at the process boot.
      //
      // Returns a Promise that resolves AFTER `client.capture()` has run.
      // The fatal-shutdown path in server.ts awaits this before invoking
      // `shutdown()` so the event is guaranteed to be in posthog-node's
      // local queue when the flush starts — otherwise a fast `shutdown()`
      // would drain an empty queue and the crash signal would be lost.
      // See codex review on PR #2527 (Siri-Ray) for the original race.
      const resolvedInsertId = insertId ?? randomInsertId();
      try {
        const resolvedDistinctId =
          distinctId && distinctId.length > 0
            ? distinctId
            : await readInstallationIdSafe(args.dataDir);
        client.capture({
          distinctId: resolvedDistinctId,
          event: eventName,
          properties: {
            ...properties,
            event_id: resolvedInsertId,
            event_schema_version: EVENT_SCHEMA_VERSION,
            ui_version: appVersion,
            app_version: appVersion,
            device_id: resolvedDistinctId,
            client_type: 'daemon',
            capture_source: 'daemon/safety',
            $insert_id: resolvedInsertId,
          },
        });
      } catch {
        // Capture failures must never propagate. The whole point of this
        // path is best-effort observability into a degraded state.
      }
    },
    shutdown: async () => {
      try {
        await client.shutdown();
      } catch {
        // best-effort flush on shutdown.
      }
    },
  };
}

const SYNTHETIC_DISTINCT_ID = `daemon-anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

async function readInstallationIdSafe(dataDir: string): Promise<string> {
  try {
    const cfg = await readAppConfig(dataDir);
    if (typeof cfg.installationId === 'string' && cfg.installationId.length > 0) {
      return cfg.installationId;
    }
  } catch {
    // fall through to synthetic id
  }
  return SYNTHETIC_DISTINCT_ID;
}

function randomInsertId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Re-export so server.ts and route handlers don't need a second import
// path; the canonical hash lives in @open-design/contracts/analytics so
// the web bundle produces the same id for the same (projectId, fileName).
export const anonymizeArtifactId = anonymizeArtifactIdShared;

// Generate a fresh insert_id when the request didn't carry one. Used for
// daemon-internal events where there is no matching web emission.
export function newInsertId(): string {
  return crypto.randomUUID();
}
