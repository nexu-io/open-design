// PostHog browser client wrapper. Lazy-loads posthog-js only after the
// daemon /api/analytics/config response confirms a key is present, so dev
// builds and forks impose zero runtime cost. All entry points are
// fire-and-forget: capture failures must never propagate to product code.

import type { PostHog } from 'posthog-js';
import {
  EVENT_SCHEMA_VERSION,
  type AnalyticsClientType,
  type AnalyticsConfigResponse,
  type AnalyticsConfigureGlobals,
} from '@open-design/contracts/analytics';
import { scrubBeforeSend } from './scrub';
import {
  clearExceptionTrackingContext,
  setExceptionTrackingContext,
} from './error-tracking';

interface AnalyticsContext {
  anonymousId: string;
  sessionId: string;
  clientType: AnalyticsClientType;
  locale: string;
  appVersion: string;
}

let client: PostHog | null = null;
let initPromise: Promise<PostHog | null> | null = null;
let resolvedDeviceId: string | null = null;
// Latest configure-state triplet. Re-registered on the PostHog client as
// soon as it changes so every subsequent event inherits the current values.
let configureGlobals: AnalyticsConfigureGlobals = {
  has_available_configure_cli: false,
  configure_type: 'unknown',
  configure_availability: 'unknown',
  cli_runnable: false,
  byok_runnable: false,
  amr_runnable: false,
};
// Snapshot of the super-property payload sent on the most recent `loaded()`
// init. `reset()` clears posthog-js's persisted super-properties as well as
// the distinct_id, so privacy → metrics off → on, or a Delete-my-data
// rotation (applyIdentity()), would otherwise resume capture without
// `event_schema_version`, `device_id`, `session_id`, `locale`, or the
// configure-state globals. We restash this on init and re-register it
// after every reset()/identify() so every subsequent event keeps the
// v2 schema contract.
let lastRegisterPayload: Record<string, unknown> | null = null;

// Returns the installationId the daemon stamped on /api/analytics/config
// after the user opted in via Privacy → "Share usage data". The provider
// uses this in preference to its locally-generated UUID so PostHog,
// Langfuse, and any future sink share a single anonymous identity.
//
// Kept under the legacy name for callers that still import it; new code
// should prefer `getResolvedDeviceId`.
export function getResolvedAnonymousId(): string | null {
  return resolvedDeviceId;
}

export function getResolvedDeviceId(): string | null {
  return resolvedDeviceId;
}

// Web-side accessor for the daemon header bridge: when the web client POSTs
// to /api/runs the daemon needs to know what device_id to stamp on its
// own server-side captures.
export function getConfigureGlobals(): AnalyticsConfigureGlobals {
  return configureGlobals;
}

// Called from the AnalyticsProvider when the configure-state triplet changes
// (mode switch, BYOK key save, CLI rescan). The values are registered on the
// PostHog client so every subsequent capture inherits them — no per-event
// boilerplate needed.
export function setConfigureGlobals(next: AnalyticsConfigureGlobals): void {
  configureGlobals = { ...next };
  // Keep the cached register payload aligned so a future reset/identify
  // flow that calls `restoreSuperProperties()` uses the LATEST configure
  // state, not the stale snapshot captured during the initial `loaded()`.
  if (lastRegisterPayload) {
    lastRegisterPayload = {
      ...lastRegisterPayload,
      ...(configureGlobals as unknown as Record<string, unknown>),
    };
  }
  if (!client) return;
  try {
    client.register(configureGlobals as unknown as Record<string, unknown>);
  } catch {
    // best-effort — capture should never throw out of this path.
  }
}

// AMR account id, registered as the `user_id` public param once sign-in
// state is known. This is the only cross-project join key between the main
// app's PostHog project and the AMR project (whose events carry the same
// id as `app_user_id`), so it must survive reset()/identify() flows the
// same way the configure globals do.
let registeredUserId: string | null = null;

// Called from the AnalyticsProvider when the AMR login status resolves
// (boot fetch or a login/logout mid-session). Passing null unregisters the
// param so events after a logout stop carrying a stale account id.
export function setAnalyticsUserId(userId: string | null): void {
  if (registeredUserId === userId) return;
  registeredUserId = userId;
  if (lastRegisterPayload) {
    if (userId) {
      lastRegisterPayload = { ...lastRegisterPayload, user_id: userId };
    } else {
      const { user_id: _dropped, ...rest } = lastRegisterPayload;
      lastRegisterPayload = rest;
    }
  }
  if (!client) return;
  try {
    if (userId) {
      client.register({ user_id: userId });
    } else {
      client.unregister('user_id');
    }
  } catch {
    // best-effort — capture should never throw out of this path.
  }
}

// Fetches `/api/analytics/config` once and wires up the exception-tracking
// module's context — independent of consent state. The error tracker
// installs its `window.error` / `unhandledrejection` listeners at module
// load (see `error-tracking.ts`), but cannot dispatch buffered events
// until it has the PostHog `phc_` key + host + distinct_id. This bootstrap
// step provides those.
//
// Runs in parallel with — and unrelated to — `getAnalyticsClient` above.
// When the user has consented, both paths fetch the same endpoint once
// each; the duplicate fetch is cheap and avoids cross-coupling the
// (consent-gated) analytics init with the (always-on) error tracker.
let exceptionBootstrapPromise: Promise<void> | null = null;
export function bootstrapExceptionTracking(context: AnalyticsContext): Promise<void> {
  if (exceptionBootstrapPromise) return exceptionBootstrapPromise;
  exceptionBootstrapPromise = (async () => {
    try {
      const res = await fetch('/api/analytics/config');
      if (!res.ok) {
        clearExceptionTrackingContext();
        return;
      }
      const cfg = (await res.json()) as AnalyticsConfigResponse;
      if (!cfg.key || !cfg.host) {
        clearExceptionTrackingContext();
        return;
      }
      const telemetryEnv = cfg.env || 'unknown';
      const distinctId =
        (typeof cfg.installationId === 'string' && cfg.installationId) ||
        context.anonymousId;
      setExceptionTrackingContext({
        apiKey: cfg.key,
        host: cfg.host,
        distinctId,
        appVersion: context.appVersion,
        sessionId: context.sessionId,
        telemetryEnv,
      });
    } catch {
      // Network failure / endpoint unavailable — leave the buffer in
      // place so a future retry could still flush, but don't crash boot.
    }
  })();
  return exceptionBootstrapPromise;
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
      const telemetryEnv = cfg.env || 'unknown';
      const distinctId =
        (typeof cfg.installationId === 'string' && cfg.installationId) ||
        context.anonymousId;
      resolvedDeviceId = distinctId;
      const mod = await import('posthog-js');
      const posthog = mod.default;
      const cfgKey = cfg.key;
      const cfgHost = cfg.host;
      posthog.init(cfgKey, {
        api_host: cfg.host,
        // Identify by installationId when present so daemon-side captures
        // (which also key off installationId via the analytics context
        // header) land on the same person record. Falls back to the
        // locally-generated UUID for the legacy / pre-consent path.
        bootstrap: { distinctID: distinctId },
        persistence: 'localStorage',
        // PostHog's default UA filter silently drops captures whose
        // user-agent matches its built-in bot list (HeadlessChrome,
        // various automation flags). The list also rejects some real users
        // — embedded webviews, fingerprinted browsers, e2e CI runs — which
        // is unacceptable for product analytics that needs to count every
        // session. We instead rely on the Privacy → "Share usage data"
        // toggle as the single consent gate and treat every UA equally.
        opt_out_useragent_filter: true,

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
        // Exception capture is owned by `apps/web/src/analytics/error-tracking.ts`,
        // which runs unconditionally — outside this consent gate, before
        // posthog-js loads, and via a direct ingest fetch. Letting posthog-js
        // also autocapture exceptions would only produce duplicates server-side
        // (the $insert_id dedupe runs but it's still wasted ingest cost).
        capture_exceptions: false,

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

        // --- Session replay (privacy-masked) --------------------------
        // Session replay captures the user's entire screen. For a tool
        // where prompts, generated artifacts, and provider API keys are
        // all visible in DOM, recording the raw screen would violate the
        // CSV's no-prompt-content rule. Rather than gate replay behind a
        // separate consent surface, we record only layout + interaction
        // and over-redact every content surface — the same
        // "redact-by-default, single audit point" philosophy scrub.ts
        // uses for events (see scrub.ts header). Replay stays gated by the
        // existing Privacy → "Share usage data" consent: posthog-js's
        // global opt_out_capturing() halts replay too (see applyConsent()).
        //
        // The three redaction layers, in order of how much they cover:
        //   1. maskTextSelector '*' masks EVERY text node into asterisks,
        //      so prompts, generated artifact text, provider/model names,
        //      project titles, and any future text surface never appear in
        //      a replay. A new sensitive surface is covered automatically.
        //   2. maskAllInputs masks every <input>/<textarea> value, so the
        //      prompt composer and BYOK provider-key fields are blanked
        //      even though only the composer carries `ph-no-capture`.
        //   3. blockSelector 'iframe' fully blocks every embedded frame.
        //      The artifact/preview FileViewer iframes (and plugin embeds)
        //      render generated HTML that can contain anything; rrweb would
        //      otherwise serialize same-origin/srcDoc frame DOM into the
        //      recording. They render as an inert placeholder instead.
        // `ph-no-capture` remains posthog-js's default replay block class,
        // so the composer subtree stays blocked as defense in depth.
        disable_session_recording: false,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: '*',
          blockSelector: 'iframe',
          // Don't reach into cross-origin frames either — belt and braces
          // alongside blockSelector for the URL-load artifact iframe.
          recordCrossOriginIframes: false,
        },

        loaded: (instance) => {
          lastRegisterPayload = {
            event_schema_version: EVENT_SCHEMA_VERSION,
            env: telemetryEnv,
            ui_version: context.appVersion,
            app_version: context.appVersion,
            client_type: context.clientType,
            locale: context.locale,
            session_id: context.sessionId,
            // v2 rename: was `anonymous_id`. Value is unchanged — the same
            // installationId / local-UUID fallback.
            device_id: distinctId,
            ...(configureGlobals as unknown as Record<string, unknown>),
            // AMR sign-in can resolve before consent-gated init finishes;
            // fold the already-known account id into the first register.
            ...(registeredUserId ? { user_id: registeredUserId } : {}),
          };
          instance.register(lastRegisterPayload);
          // Re-bridge the error-tracking context once posthog-js is fully
          // initialized. `bootstrapExceptionTracking` may have already
          // wired this up at app boot via its own fetch; this duplicate
          // assignment is harmless (same key/host) but ensures the most
          // up-to-date appVersion / sessionId metadata is attached.
          setExceptionTrackingContext({
            apiKey: cfgKey,
            host: cfgHost,
            distinctId,
            appVersion: context.appVersion,
            sessionId: context.sessionId,
            telemetryEnv,
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
      // If the user previously toggled metrics off in this session, the
      // earlier opt-out path called reset() and wiped the persisted
      // super-properties. opt_in_capturing() only flips the consent flag
      // and does not re-run init(), so without this restore the next
      // capture would emit no event_schema_version / device_id /
      // session_id / locale / configure-state. See PR #2285 review
      // 2026-05-20 04:35.
      restoreSuperProperties();
    } else {
      client.opt_out_capturing();
      client.reset();
      resolvedDeviceId = null;
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
  if (resolvedDeviceId === installationId) return;
  try {
    client.reset();
    client.identify(installationId);
    resolvedDeviceId = installationId;
    // reset() also clears the persisted super-properties from
    // posthog-js's localStorage cache. Re-register them with the new
    // distinct_id so the rest of this session keeps emitting v2-schema
    // events. See PR #2285 review 2026-05-20 04:35.
    restoreSuperProperties({ device_id: installationId });
  } catch {
    // best-effort — never propagate.
  }
}

// Push the cached super-property payload back onto the PostHog client. Used
// after reset()/identify() flows; takes an optional override patch so the
// caller can swap fields (e.g. a rotated device_id) without re-deriving the
// rest of the payload.
function restoreSuperProperties(patch?: Record<string, unknown>): void {
  if (!client || !lastRegisterPayload) return;
  const next = patch ? { ...lastRegisterPayload, ...patch } : lastRegisterPayload;
  lastRegisterPayload = next;
  try {
    client.register(next);
  } catch {
    // best-effort.
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
