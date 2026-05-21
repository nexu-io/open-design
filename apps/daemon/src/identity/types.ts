// Identity seam — minimal types and resolver for attributing chat runs
// and revision history to "who initiated this." This module deliberately
// stays small: it defines the contract (Identity, IdentityProvider,
// resolveIdentity) and ships one default implementation
// (LocalFallbackProvider) so the history feature gated by
// OD_GIT_INTEGRATION_ENABLED can land without a separate identity layer.
//
// A future multi-user-support feature will register richer providers
// (OAuth, reverse-proxy header trust, etc.) ahead of the fallback by
// extending REGISTERED_PROVIDERS or wiring a registerProvider helper.
// Existing call sites continue to read through resolveIdentity(req)
// unchanged when that happens.

/**
 * Resolved identity for an incoming request. Consumed by features that
 * need to attribute changes to a user — primarily the history feature
 * (commit author lines, `actor_*` columns on `messages`).
 */
export interface Identity {
  /**
   * Stable, provider-prefixed (e.g., 'local:default', 'oauth:google:weston@...').
   * Used as the durable key on `messages.actor_identity_id`.
   */
  id: string;
  /** Human-readable name for UI chips and commit author lines. */
  displayName: string;
  /**
   * Optional; used for the git author email when present. Single-user
   * deployments often leave this unset and accept the synthetic
   * `<id>@open-design.local` author email the history feature falls back to.
   */
  email?: string;
  /**
   * Free-form provider tag for audit / UI badges
   * (e.g., 'local-fallback', 'header:tailscale', 'oauth:google').
   */
  source: string;
}

/**
 * Structural subset of an Express Request we need to resolve identity —
 * kept minimal so providers can be tested without instantiating full
 * Request objects.
 */
export interface RequestWithIdentityHeaders {
  headers?: {
    host?: unknown;
    'x-forwarded-for'?: unknown;
    'x-forwarded-host'?: unknown;
    'x-forwarded-proto'?: unknown;
  };
  socket?: {
    remoteAddress?: string | null | undefined;
  };
}

/**
 * A provider attempts to resolve identity from a request. Returns null
 * if it can't (e.g., a header-trust provider sees no relevant headers),
 * letting the next provider in the registration order try.
 */
export interface IdentityProvider {
  resolve(req: RequestWithIdentityHeaders, env?: NodeJS.ProcessEnv): Identity | null;
}

/**
 * Last-resort provider — always returns a usable placeholder identity.
 * Single-user deployments (desktop, single-user self-hosted) end up here
 * by default; the OD_LOCAL_IDENTITY and OD_LOCAL_IDENTITY_EMAIL env vars
 * let an operator customize what's recorded for chat-run attribution and
 * commit author lines without needing a multi-user identity layer.
 */
export const LocalFallbackProvider: IdentityProvider = {
  resolve(_req, env = process.env) {
    const displayName = (env.OD_LOCAL_IDENTITY ?? '').trim() || 'Local User';
    const emailRaw = (env.OD_LOCAL_IDENTITY_EMAIL ?? '').trim();
    // Conditional spread keeps `email` absent (not just undefined) when
    // unset, so the type matches Identity under exactOptionalPropertyTypes.
    return {
      id: 'local:default',
      displayName,
      source: 'local-fallback',
      ...(emailRaw.length > 0 ? { email: emailRaw } : {}),
    };
  },
};

/**
 * Provider registration order. First match wins. LocalFallbackProvider
 * must remain the last entry so resolveIdentity always returns a valid
 * Identity. Multi-user features prepend richer providers here.
 */
const REGISTERED_PROVIDERS: IdentityProvider[] = [
  LocalFallbackProvider,
];

/**
 * Resolve identity for a request. Tries each registered provider in
 * order; returns the first non-null result. Because LocalFallbackProvider
 * always returns non-null, this function always returns a valid Identity.
 *
 * Pass an explicit env for testing; defaults to process.env in production.
 */
export function resolveIdentity(
  req: RequestWithIdentityHeaders,
  env: NodeJS.ProcessEnv = process.env,
): Identity {
  for (const provider of REGISTERED_PROVIDERS) {
    const result = provider.resolve(req, env);
    if (result) return result;
  }
  // Unreachable while LocalFallbackProvider is registered; the throw is a
  // belt-and-suspenders guard against future re-orderings of the array.
  throw new Error('resolveIdentity: no provider matched (LocalFallbackProvider missing from registration)');
}
