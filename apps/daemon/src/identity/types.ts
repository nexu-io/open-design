// Identity seam — minimal types and resolver for attributing chat runs
// and revision history to "who initiated this." Ships one default
// implementation (LocalFallbackProvider) so the history feature can
// land without a separate identity layer.
//
// A future multi-user feature will register richer providers (OAuth,
// reverse-proxy header trust) ahead of the fallback. Existing call
// sites continue to read through resolveIdentity(req) unchanged.

/**
 * Resolved identity for an incoming request. Consumed by features
 * that need to attribute changes to a user — primarily the history
 * feature (commit author lines, `actor_*` columns on `messages`).
 */
export interface Identity {
  /**
   * Stable, provider-prefixed (e.g., 'local:default',
   * 'oauth:google:weston@…'). Used as the durable key on
   * `messages.actor_identity_id`.
   */
  id: string;
  /** Human-readable name for UI chips and commit author lines. */
  displayName: string;
  /**
   * Optional; used for the git author email when present. Single-user
   * deployments often leave this unset and accept the synthetic
   * `<id>@open-design.local` email the history feature falls back to.
   */
  email?: string;
  /**
   * Free-form provider tag for audit / UI badges
   * (e.g., 'local-fallback', 'header:tailscale', 'oauth:google').
   */
  source: string;
}

/**
 * Structural subset of an Express Request used by providers. Kept
 * minimal so providers can be tested without full Request objects.
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
 * A provider attempts to resolve identity from a request. Returns
 * null when it can't (e.g., header-trust provider sees no relevant
 * headers), letting the next provider try.
 */
export interface IdentityProvider {
  resolve(req: RequestWithIdentityHeaders, env?: NodeJS.ProcessEnv): Identity | null;
}

/**
 * Last-resort provider — always returns a usable placeholder identity.
 * Single-user deployments end up here by default; OD_LOCAL_IDENTITY
 * and OD_LOCAL_IDENTITY_EMAIL customize what's recorded without
 * needing a multi-user identity layer.
 */
// Strip control characters so env-supplied values can't smuggle newlines
// or NULs into git author lines or SQLite text columns.
function sanitizeIdentityField(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\x00-\x1f\x7f]/g, '').trim();
}

export const LocalFallbackProvider: IdentityProvider = {
  resolve(_req, env = process.env) {
    const displayName = sanitizeIdentityField(env.OD_LOCAL_IDENTITY ?? '') || 'Local User';
    const emailRaw = sanitizeIdentityField(env.OD_LOCAL_IDENTITY_EMAIL ?? '');
    return {
      id: 'local:default',
      displayName,
      source: 'local-fallback',
      ...(emailRaw.length > 0 ? { email: emailRaw } : {}),
    };
  },
};

/**
 * Provider registration order. First match wins.
 * LocalFallbackProvider MUST remain the last entry so resolveIdentity
 * always returns a valid Identity.
 */
const REGISTERED_PROVIDERS: IdentityProvider[] = [
  LocalFallbackProvider,
];

/**
 * Resolve identity for a request. Tries each registered provider in
 * order; returns the first non-null result. Always returns a valid
 * Identity while LocalFallbackProvider is registered.
 */
export function resolveIdentity(
  req: RequestWithIdentityHeaders,
  env: NodeJS.ProcessEnv = process.env,
): Identity {
  for (const provider of REGISTERED_PROVIDERS) {
    const result = provider.resolve(req, env);
    if (result) return result;
  }
  // Belt-and-suspenders guard against future re-orderings.
  throw new Error('resolveIdentity: no provider matched (LocalFallbackProvider missing from registration)');
}
