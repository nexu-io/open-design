'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useI18n } from '../i18n';
import {
  ANALYTICS_HEADER_ANONYMOUS_ID,
  ANALYTICS_HEADER_CLIENT_TYPE,
  ANALYTICS_HEADER_LOCALE,
  ANALYTICS_HEADER_REQUEST_ID,
  ANALYTICS_HEADER_SESSION_ID,
} from '@open-design/contracts/analytics';
import {
  applyConsent,
  applyIdentity,
  capture,
  getAnalyticsClient,
  getResolvedAnonymousId,
} from './client';
import {
  detectClientType,
  getAnonymousId,
  getSessionId,
} from './identity';
import { randomUUID } from '../utils/uuid';

interface AnalyticsContextValue {
  // The track helper accepts any event/props pair; per-event safety is
  // enforced by the typed wrappers in events.ts that consumers use.
  track: (
    event: string,
    properties: Record<string, unknown>,
    options?: { requestId?: string; insertId?: string },
  ) => void;
  // Toggle PostHog capture without unmounting the provider. App.tsx calls
  // this from a useEffect that watches `config.telemetry?.metrics` so a
  // Privacy toggle takes effect immediately, not on next reload.
  setConsent: (granted: boolean) => void;
  // Switch PostHog's distinct_id to the new installationId after a
  // Delete-my-data rotation. App.tsx watches `config.installationId` and
  // calls this whenever the daemon rotates it; PostHog's localStorage
  // state is reset() then identify()'d to the new id so the next event
  // batch is fully decoupled from the deleted identity.
  setIdentity: (installationId: string | null) => void;
  anonymousId: string;
  sessionId: string;
  newRequestId: () => string;
}

const Ctx = createContext<AnalyticsContextValue | null>(null);

// PR #1428 reviewer (Siri-Ray): the previous `url.includes('/api/')` check
// matched absolute third-party URLs (https://provider.example/api/x), which
// would leak our analytics headers outside the daemon boundary. This helper
// is strictly same-origin + /api/ prefix and is shared by both the global
// fetch wrapper and the per-track request_id wrapper.
function isSameOriginApiCall(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  if (url.startsWith('/api/')) return true;
  if (typeof window === 'undefined') return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return (
      parsed.origin === window.location.origin &&
      parsed.pathname.startsWith('/api/')
    );
  } catch {
    return false;
  }
}

// App version is read from a runtime endpoint rather than at build time so
// the same web bundle reports the daemon-pinned version even when running
// against a newer/older daemon during dev. Falls back to '0.0.0' until the
// fetch resolves; analytics events fired before resolution simply have a
// stale version string and are not re-emitted.
function useAppVersion(): string {
  const versionRef = useRef('0.0.0');
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/version');
        if (!res.ok) return;
        const body = (await res.json()) as { version?: { version?: string } };
        if (cancelled) return;
        if (body?.version?.version) versionRef.current = body.version.version;
      } catch {
        // Best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return versionRef.current;
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  const appVersion = useAppVersion();
  // Identity is computed once on mount; locale flows in as a register update
  // when the user switches locales so subsequent events carry the fresh
  // value without re-initializing the PostHog client.
  const identity = useMemo(
    () => ({
      anonymousId: getAnonymousId(),
      sessionId: getSessionId(),
      clientType: detectClientType(),
    }),
    [],
  );

  // Once the PostHog client has talked to /api/analytics/config, the
  // installationId the daemon stamped becomes the canonical anonymous id —
  // shared with Langfuse. The fetch wrapper below picks this up so daemon
  // server-side captures end up on the same person record.
  const [resolvedAnonId, setResolvedAnonId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getAnalyticsClient({
      anonymousId: identity.anonymousId,
      sessionId: identity.sessionId,
      clientType: identity.clientType,
      locale,
      appVersion,
    }).then(() => {
      if (cancelled) return;
      const resolved = getResolvedAnonymousId();
      if (resolved) setResolvedAnonId(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [identity, locale, appVersion]);

  // Wrap window.fetch so every same-origin /api/* request carries the
  // analytics context for the daemon to mirror result events back with the
  // matching distinct id.
  //
  // Gated on `resolvedAnonId`: PR #1428 reviewer (codex-connector,
  // lefarcen) — when Privacy → metrics is off, /api/analytics/config
  // returns enabled=false → resolvedAnonId stays null → header injection
  // never installs. That way an opted-out user can't produce daemon-side
  // PostHog events even though POSTHOG_KEY exists in the daemon env
  // (daemon's readAnalyticsContext treats the header as consent).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!resolvedAnonId) return;
    const original = window.fetch;
    const baseHeaders: Record<string, string> = {
      [ANALYTICS_HEADER_ANONYMOUS_ID]: resolvedAnonId,
      [ANALYTICS_HEADER_SESSION_ID]: identity.sessionId,
      [ANALYTICS_HEADER_CLIENT_TYPE]: identity.clientType,
    };
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!isSameOriginApiCall(url)) return original(input, init);
      const merged: HeadersInit = {
        ...baseHeaders,
        [ANALYTICS_HEADER_LOCALE]: locale,
        ...(init?.headers ?? {}),
      };
      return original(input, { ...(init ?? {}), headers: merged });
    };
    return () => {
      window.fetch = original;
    };
  }, [identity, locale, resolvedAnonId]);

  // Update PostHog's super-properties whenever locale changes so subsequent
  // captures carry the right `locale` field without us threading it through
  // every track call site.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const client = await getAnalyticsClient({
        anonymousId: identity.anonymousId,
        sessionId: identity.sessionId,
        clientType: identity.clientType,
        locale: locale,
        appVersion,
      });
      if (cancelled || !client) return;
      try {
        client.register({ locale: locale, app_version: appVersion, ui_version: appVersion });
      } catch {
        // Best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identity, locale, appVersion]);

  const track = useCallback<AnalyticsContextValue['track']>(
    (event, properties, options) => {
      const insertId = options?.insertId ?? randomUUID();
      const requestId = options?.requestId ?? null;
      // Attach request_id to the in-flight fetch wrapper too, so the daemon
      // can stitch click→result pairs without the caller threading it.
      if (typeof window !== 'undefined' && requestId) {
        try {
          const baseFetch = window.fetch;
          const wrapped: typeof fetch = async (input, init) => {
            const url =
              typeof input === 'string'
                ? input
                : input instanceof URL
                  ? input.href
                  : input.url;
            if (!isSameOriginApiCall(url)) return baseFetch(input, init);
            const merged: HeadersInit = {
              [ANALYTICS_HEADER_REQUEST_ID]: requestId,
              ...(init?.headers ?? {}),
            };
            return baseFetch(input, { ...(init ?? {}), headers: merged });
          };
          // Single-shot: restore after next microtask so only the originating
          // fetch picks up the request_id header.
          window.fetch = wrapped;
          queueMicrotask(() => {
            window.fetch = baseFetch;
          });
        } catch {
          // Best-effort header injection.
        }
      }
      void (async () => {
        const client = await getAnalyticsClient({
          anonymousId: identity.anonymousId,
          sessionId: identity.sessionId,
          clientType: identity.clientType,
          locale: locale,
          appVersion,
        });
        capture(client, { event, properties, insertId, requestId });
      })();
    },
    [identity, locale, appVersion],
  );

  const value = useMemo<AnalyticsContextValue>(
    () => ({
      track,
      setConsent: (granted: boolean) => {
        applyConsent(granted);
        if (!granted) {
          // Clear the header-injection state so the fetch wrapper effect
          // tears down its hook on the next render. Daemon-side captures
          // will see no x-od-analytics-* headers → readAnalyticsContext
          // returns null → no events emitted, even if POSTHOG_KEY is set.
          setResolvedAnonId(null);
        } else {
          // Re-trigger client init: getAnalyticsClient's null-cache fix
          // (client.ts) allows a fresh /api/analytics/config fetch when
          // the previous response was enabled=false. Resolved id propagates
          // into the wrapper via setResolvedAnonId below.
          void getAnalyticsClient({
            anonymousId: identity.anonymousId,
            sessionId: identity.sessionId,
            clientType: identity.clientType,
            locale,
            appVersion,
          }).then(() => {
            const resolved = getResolvedAnonymousId();
            if (resolved) setResolvedAnonId(resolved);
          });
        }
      },
      setIdentity: (installationId: string | null) => {
        applyIdentity(installationId);
        // Keep the fetch wrapper's header in sync so daemon-side captures
        // start using the new id immediately, not after the next reload.
        if (installationId) setResolvedAnonId(installationId);
      },
      anonymousId: identity.anonymousId,
      sessionId: identity.sessionId,
      newRequestId: () => randomUUID(),
    }),
    [track, identity, locale, appVersion],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAnalytics(): AnalyticsContextValue {
  const value = useContext(Ctx);
  if (!value) {
    // No-op stub for unit tests / SSR / consumers rendered outside the
    // provider tree. Returning a working stub keeps every call site free of
    // null checks.
    return {
      track: () => undefined,
      setConsent: () => undefined,
      setIdentity: () => undefined,
      anonymousId: 'unmounted',
      sessionId: 'unmounted',
      newRequestId: () => randomUUID(),
    };
  }
  return value;
}
