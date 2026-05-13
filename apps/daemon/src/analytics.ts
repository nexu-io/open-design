// Daemon-side PostHog capture. Mirrors apps/daemon/src/langfuse-trace.ts in
// its env-gating discipline: without POSTHOG_KEY in the env every entry point
// is a no-op, so dev builds and third-party forks impose zero overhead.
//
// Web-side captures (apps/web/src/analytics) carry the matching identity in
// HTTP headers (see x-od-analytics-* constants in @open-design/contracts);
// daemon reads those headers off the request and reuses the same
// anonymous_id as the PostHog distinct_id so events from both sides land on
// the same person.

import crypto from 'node:crypto';
import { PostHog } from 'posthog-node';
import type { Request } from 'express';
import {
  ANALYTICS_HEADER_ANONYMOUS_ID,
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
  anonymousId: string;
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
  const anonymousId = headerString(req, ANALYTICS_HEADER_ANONYMOUS_ID);
  if (!anonymousId) return null;
  const sessionId = headerString(req, ANALYTICS_HEADER_SESSION_ID) ?? anonymousId;
  const clientHeader = headerString(req, ANALYTICS_HEADER_CLIENT_TYPE);
  const clientType: AnalyticsClientType =
    clientHeader === 'desktop' ? 'desktop' : 'web';
  const locale = headerString(req, ANALYTICS_HEADER_LOCALE) ?? 'en';
  const requestId = headerString(req, ANALYTICS_HEADER_REQUEST_ID);
  return { anonymousId, sessionId, clientType, locale, requestId };
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
  shutdown(): Promise<void>;
}

const NOOP_SERVICE: AnalyticsService = {
  capture: () => undefined,
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
            distinctId: context.anonymousId,
            event: eventName,
            properties: {
              ...properties,
              event_id: insertId,
              event_schema_version: EVENT_SCHEMA_VERSION,
              ui_version: appVersion,
              app_version: appVersion,
              session_id: context.sessionId,
              anonymous_id: context.anonymousId,
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
    shutdown: async () => {
      try {
        await client.shutdown();
      } catch {
        // best-effort flush on shutdown.
      }
    },
  };
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
