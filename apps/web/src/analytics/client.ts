// PostHog browser client wrapper. Lazy-loads posthog-js only after the
// daemon /api/analytics/config response confirms a key is present, so dev
// builds and forks impose zero runtime cost. All entry points are
// fire-and-forget: capture failures must never propagate to product code.

import type { PostHog } from 'posthog-js';
import {
  EVENT_SCHEMA_VERSION,
  type AnalyticsClientType,
  type AnalyticsConfigResponse,
} from '@open-design/contracts/analytics';
import { scrubBeforeSend } from './scrub';

interface AnalyticsContext {
  anonymousId: string;
  sessionId: string;
  clientType: AnalyticsClientType;
  locale: string;
  appVersion: string;
}

let client: PostHog | null = null;
let initPromise: Promise<PostHog | null> | null = null;
let resolvedAnonymousId: string | null = null;

// Returns the installationId the daemon stamped on /api/analytics/config
// after the user opted in via Privacy → "Share usage data". The provider
// uses this in preference to its locally-generated UUID so PostHog,
// Langfuse, and any future sink share a single anonymous identity.
export function getResolvedAnonymousId(): string | null {
  return resolvedAnonymousId;
}

export async function getAnalyticsClient(
  context: AnalyticsContext,
): Promise<PostHog | null> {
  if (client) return client;
  if (initPromise) return initPromise;
  // PR #1428 reviewer (Siri-Ray): the first /api/analytics/config response
  // is cached forever if it resolves to null. On first launch before the
  // user accepts the privacy banner the daemon returns enabled=false, this
  // promise resolves null, and every later track() call returns the cached
  // null without re-fetching the now-enabled config. Clear initPromise
  // whenever the resolution is null so a subsequent setConsent(true) can
  // trigger a fresh init.
  const pending = (async () => {
    try {
      const res = await fetch('/api/analytics/config');
      if (!res.ok) return null;
      const cfg = (await res.json()) as AnalyticsConfigResponse;
      if (!cfg.enabled || !cfg.key || !cfg.host) return null;
      const distinctId =
        (typeof cfg.installationId === 'string' && cfg.installationId) ||
        context.anonymousId;
      resolvedAnonymousId = distinctId;
      const mod = await import('posthog-js');
      const posthog = mod.default;
      posthog.init(cfg.key, {
        api_host: cfg.host,
        // Identify by installationId when present so daemon-side captures
        // (which also key off installationId via the analytics context
        // header) land on the same person record. Falls back to the
        // locally-generated UUID for the legacy / pre-consent path.
        bootstrap: { distinctID: distinctId },
        persistence: 'localStorage',

        // --- Auto-capture layers --------------------------------------
        // Anonymous diagnostic features (click paths, page transitions,
        // web vitals, browser errors). The single Privacy → "Share
        // usage data" toggle gates ALL of these via posthog-js's global
        // opt_out_capturing() — see applyConsent() below and
        // AnalyticsProvider's setConsent wiring in App.tsx.
        autocapture: true,
        capture_pageview: 'history_change',
        capture_pageleave: 'if_capture_pageview',
        capture_dead_clicks: true,
        capture_performance: {
          web_vitals: true,
          network_timing: true,
        },
        capture_exceptions: true,

        // --- Privacy defenses -----------------------------------------
        // 1. scrub.ts runs on every outgoing event and strips $el_text
        //    from input/textarea/contenteditable elements, removes
        //    query strings from URLs, and rewrites absolute filesystem
        //    paths in exception stack traces. Single audit point — new
        //    sensitive surfaces extend the rules there, not by
        //    sprinkling class names through the codebase.
        // 2. The chat composer textarea keeps a `ph-no-capture` class
        //    as defense in depth: PostHog won't even generate an event
        //    for clicks inside that subtree, so a future scrub regression
        //    can't leak prompt content. Only the most sensitive surface
        //    (prompt body) gets this treatment; everything else relies
        //    on scrub.ts.
        before_send: scrubBeforeSend,

        // --- Explicitly disabled --------------------------------------
        // Session replay captures the user's entire screen. For a tool
        // where prompts, generated artifacts, and provider API keys are
        // all visible in DOM, this needs an extensive mask catalogue
        // before we can satisfy the CSV's no-prompt-content rule. Off
        // until a dedicated consent surface ships.
        disable_session_recording: true,

        loaded: (instance) => {
          instance.register({
            event_schema_version: EVENT_SCHEMA_VERSION,
            ui_version: context.appVersion,
            app_version: context.appVersion,
            client_type: context.clientType,
            locale: context.locale,
            session_id: context.sessionId,
            anonymous_id: distinctId,
          });
        },
      });
      client = posthog;
      return posthog;
    } catch {
      // Network failure, missing endpoint, third-party fork without keys —
      // all collapse to the same no-op.
      return null;
    }
  })();
  initPromise = pending;
  // Clear the cache as soon as the result is null so a later opt-in retries.
  void pending.then((result) => {
    if (!result) initPromise = null;
  });
  return pending;
}

// Called from the AnalyticsProvider when the user toggles Privacy →
// metrics off so events stop flowing immediately, before the next
// reload re-reads /api/analytics/config. The posthog-js client persists
// its opt-out flag in localStorage; subsequent capture() calls become
// no-ops until the user opts back in.
//
// `opt_out_capturing()` is a global gate — it halts not only explicit
// capture() calls but also autocapture, $pageview, $pageleave,
// $exception, web vitals, and dead clicks. One toggle covers every
// PostHog code path.
//
// On opt-out we ALSO call `posthog.reset()` to clear the persisted
// `ph_*_posthog` localStorage entry. Without this, the SDK keeps the
// old distinct_id; if the user later clicks Delete my data (which
// rotates installationId via the daemon) and toggles metrics back on,
// posthog-js would still think the user is the old id and stitch the
// new session to the deleted identity. reset() prevents that.
export function applyConsent(consentGranted: boolean): void {
  if (!client) return;
  try {
    if (consentGranted) {
      client.opt_in_capturing();
    } else {
      client.opt_out_capturing();
      client.reset();
      resolvedAnonymousId = null;
    }
  } catch {
    // best-effort — capture should never throw out of this path.
  }
}

// Called from the AnalyticsProvider when `config.installationId` rotates
// (Delete my data). posthog-js's `bootstrap.distinctID` only takes
// effect on first init; once the client is alive, identify() is the
// only way to switch identities. We pair it with reset() first so any
// $device_id stored under the OLD installation is wiped — the new
// session is fully decoupled from the deleted one.
export function applyIdentity(installationId: string | null): void {
  if (!client || !installationId) return;
  if (resolvedAnonymousId === installationId) return;
  try {
    client.reset();
    client.identify(installationId);
    resolvedAnonymousId = installationId;
  } catch {
    // best-effort — never propagate.
  }
}

export function capture(
  client: PostHog | null,
  args: {
    event: string;
    properties: Record<string, unknown>;
    insertId: string;
    requestId?: string | null;
  },
): void {
  if (!client) return;
  try {
    client.capture(args.event, {
      ...args.properties,
      event_id: args.insertId,
      // PostHog's official dedup key. The daemon mirrors result events with
      // the same $insert_id so duplicates from the dual-side capture pattern
      // get coalesced server-side.
      $insert_id: args.insertId,
      ...(args.requestId ? { request_id: args.requestId } : {}),
    });
  } catch {
    // Swallow — analytics failures must not propagate.
  }
}
