// Cloudflare OAuth 2.0 + PKCE client.
//
// Wraps the PKCE primitives in `mcp-oauth.ts` for Cloudflare's self-managed
// OAuth clients. Unlike xAI, Cloudflare lets the user bring their own
// client_id (registered in the dashboard under "Manage Account > OAuth
// clients"), so there is no hardcoded client here — `beginCloudflareAuth`
// takes it as input. The redirect_uri is the daemon's loopback listener on
// 127.0.0.1:56122.
//
// Endpoints and PKCE support verified against Cloudflare's OIDC discovery
// document and docs (see https://developers.cloudflare.com/fundamentals/oauth/integrate-with-cloudflare/):
//   - authorization_endpoint: https://dash.cloudflare.com/oauth2/auth
//   - token_endpoint:         https://dash.cloudflare.com/oauth2/token
//   - code_challenge_methods_supported includes "S256" (PKCE)
//   - token_endpoint_auth_methods_supported includes "none" (public client)
//
// Cloudflare's desktop/CLI flow is Authorization Code + PKCE with
// token_endpoint_auth_method "none": a PKCE public client needs NO client
// secret, only a clientId. We follow the xAI pattern and use PKCE with no
// client secret throughout.
//
// Scopes map to Cloudflare API token permission names. `offline_access` must
// be requested for the token endpoint to issue a refresh_token.

import {
  buildAuthorizeUrl,
  deriveCodeChallenge,
  exchangeCodeForToken,
  generateCodeVerifier,
  generateState,
  refreshAccessToken,
  type AuthorizationServerMetadata,
  type OAuthTokenResponse,
  type PendingAuthCache,
  type PendingAuthState,
} from '../mcp-oauth.js';

// ───────────────────────────────────────────────────────────────────────
// Cloudflare OAuth constants.
// ───────────────────────────────────────────────────────────────────────

export const CLOUDFLARE_OAUTH_ISSUER = 'https://dash.cloudflare.com';
export const CLOUDFLARE_OAUTH_AUTHORIZATION_ENDPOINT =
  'https://dash.cloudflare.com/oauth2/auth';
export const CLOUDFLARE_OAUTH_TOKEN_ENDPOINT =
  'https://dash.cloudflare.com/oauth2/token';

/**
 * Default OAuth scopes. Cloudflare scope strings correspond to API token
 * permission names (see https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/
 * and https://developers.cloudflare.com/fundamentals/api/reference/permissions/):
 *   - workers-scripts.write  Workers Scripts — write
 *   - page.write             Cloudflare Pages — write
 *   - zone.read              Zone — read
 *   - access.write           Access — apps and policies — write
 *   - offline_access         OIDC scope that grants a refresh_token (not a
 *                            permission scope — see CLOUDFLARE_OFFLINE_ACCESS_SCOPE)
 *
 * `offline_access` only asks the token endpoint to issue a refresh_token
 * alongside the access_token; it never widens what the token may do.
 * VERIFIED supported via dash.cloudflare.com/.well-known/openid-configuration
 * (scopes_supported includes offline_access; grant_types_supported includes
 * refresh_token). The OAuth CLIENT must be configured with this scope — a
 * client that omits it is rejected at authorize time with invalid_scope.
 */
export const CLOUDFLARE_OAUTH_SCOPES: string[] = [
  'workers-scripts.write',
  'd1.read',
  'd1.write',
  'workers-r2.read',
  'workers-r2.write',
  'zone.read',
  'access.write',
  'access-idp.write',
  'offline_access',
];

/** OIDC scope that asks Cloudflare to issue a refresh_token alongside the
 * access_token. It is NOT a permission scope — requesting it never widens
 * what the token may do, it only changes whether a refresh_token comes back. */
export const CLOUDFLARE_OFFLINE_ACCESS_SCOPE = 'offline_access';

/**
 * Return a scope list that always includes `offline_access`, deduplicated.
 * The /oauth/start handler and `beginCloudflareAuth` both use this so the
 * refresh-token grant is requested even when the user pinned a custom
 * `cfg.scopes` list that omits it.
 *
 * NOTE: `offline_access` requires the OAuth CLIENT to be configured with it
 * (add it to the client's scopes). Verified supported via the OpenID config;
 * a client that omits it is rejected with invalid_scope at authorize time.
 */
export function mergeOfflineAccessScope(
  scopes: readonly string[],
): string[] {
  const merged = scopes
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (!merged.includes(CLOUDFLARE_OFFLINE_ACCESS_SCOPE)) {
    merged.push(CLOUDFLARE_OFFLINE_ACCESS_SCOPE);
  }
  return merged;
}

export const CLOUDFLARE_OAUTH_REDIRECT_HOST = '127.0.0.1';
export const CLOUDFLARE_OAUTH_REDIRECT_PORT = 56122;
export const CLOUDFLARE_OAUTH_REDIRECT_PATH = '/callback';

/**
 * Stable provider id used to key the Cloudflare OAuth state in any
 * per-server cache. Distinct from the deploy provider id
 * (`cloudflare-workers`) used by the deploy pipeline.
 */
export const CLOUDFLARE_PROVIDER_ID = 'cloudflare';

const CLOUDFLARE_AUTH_SERVER: AuthorizationServerMetadata = {
  issuer: CLOUDFLARE_OAUTH_ISSUER,
  authorization_endpoint: CLOUDFLARE_OAUTH_AUTHORIZATION_ENDPOINT,
  token_endpoint: CLOUDFLARE_OAUTH_TOKEN_ENDPOINT,
};

export function cloudflareRedirectUri(): string {
  return `http://${CLOUDFLARE_OAUTH_REDIRECT_HOST}:${CLOUDFLARE_OAUTH_REDIRECT_PORT}${CLOUDFLARE_OAUTH_REDIRECT_PATH}`;
}

/** Join an array of scopes into the space-separated form the authorize URL
 * and token endpoint expect, defaulting to the built-in scope set. */
export function cloudflareOAuthScopeString(
  scopes: string[] = CLOUDFLARE_OAUTH_SCOPES,
): string {
  return scopes
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(' ');
}

// ───────────────────────────────────────────────────────────────────────
// Begin / complete / refresh.
// ───────────────────────────────────────────────────────────────────────

export interface BeginCloudflareAuthInput {
  pending: PendingAuthCache;
  /** Bring-your-own client_id from the Cloudflare dashboard. */
  clientId: string;
  /** Loopback redirect_uri; defaults to `cloudflareRedirectUri()`. */
  redirectUri?: string;
  /** Scope list; defaults to `CLOUDFLARE_OAUTH_SCOPES`. */
  scopes?: string[];
}

export interface BeginCloudflareAuthResult {
  authorizeUrl: string;
  state: string;
}

/**
 * Pre-redirect half of the OAuth dance. Mints a PKCE verifier/challenge,
 * builds the authorize URL, and stashes the pending state in `pending`.
 *
 * The caller is responsible for sending the user's browser to
 * `authorizeUrl` and then receiving the callback at the redirect_uri. When
 * the callback arrives, pass `state` and `code` to `completeCloudflareAuth`.
 */
export function beginCloudflareAuth(
  input: BeginCloudflareAuthInput,
): BeginCloudflareAuthResult {
  const clientId = input.clientId?.trim();
  if (!clientId) {
    throw new Error('Cloudflare OAuth client ID is required');
  }
  const redirectUri = input.redirectUri?.trim() || cloudflareRedirectUri();
  // Always request `offline_access` so Cloudflare issues a refresh_token; it
  // is not a permission scope, only a refresh grant (see mergeOfflineAccessScope).
  const scope = cloudflareOAuthScopeString(
    mergeOfflineAccessScope(input.scopes ?? CLOUDFLARE_OAUTH_SCOPES),
  );
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = deriveCodeChallenge(codeVerifier);
  const state = generateState();

  const authorizeUrl = buildAuthorizeUrl({
    authServer: CLOUDFLARE_AUTH_SERVER,
    clientId,
    redirectUri,
    state,
    codeChallenge,
    scope,
  });

  const pendingState: PendingAuthState = {
    serverId: CLOUDFLARE_PROVIDER_ID,
    authServerIssuer: CLOUDFLARE_OAUTH_ISSUER,
    tokenEndpoint: CLOUDFLARE_OAUTH_TOKEN_ENDPOINT,
    clientId,
    redirectUri,
    codeVerifier,
    scope,
    createdAt: Date.now(),
  };

  input.pending.put(state, pendingState);
  return { authorizeUrl, state };
}

export interface CompleteCloudflareAuthInput {
  pending: PendingAuthCache;
  state: string;
  code: string;
  fetchImpl?: typeof fetch;
}

/**
 * Post-callback half of the OAuth dance. Looks up `state` in `pending`,
 * validates it (one-shot, TTL-checked by `PendingAuthCache`), and exchanges
 * `code` for tokens. Throws if `state` is unknown, expired, already
 * consumed, or was issued for a different provider.
 */
export async function completeCloudflareAuth(
  input: CompleteCloudflareAuthInput,
): Promise<OAuthTokenResponse> {
  const consumed = input.pending.consume(input.state);
  if (!consumed) {
    throw new Error('Cloudflare OAuth state not found or expired');
  }
  if (consumed.serverId !== CLOUDFLARE_PROVIDER_ID) {
    throw new Error(
      `Cloudflare OAuth state mismatch: expected serverId=${CLOUDFLARE_PROVIDER_ID}, got ${consumed.serverId}`,
    );
  }
  return exchangeCodeForToken(
    {
      tokenEndpoint: consumed.tokenEndpoint,
      clientId: consumed.clientId,
      redirectUri: consumed.redirectUri,
      code: input.code,
      codeVerifier: consumed.codeVerifier,
    },
    input.fetchImpl ?? fetch,
  );
}

export interface RefreshCloudflareTokenInput {
  clientId: string;
  refreshToken: string;
  fetchImpl?: typeof fetch;
}

/**
 * Refresh an existing Cloudflare access token. The refresh_token is bound to
 * the client_id that originally received it (RFC 6749 §6), so the caller must
 * pass the same client_id used at authorization time.
 */
export async function refreshCloudflareToken(
  input: RefreshCloudflareTokenInput,
): Promise<OAuthTokenResponse> {
  return refreshAccessToken(
    {
      tokenEndpoint: CLOUDFLARE_OAUTH_TOKEN_ENDPOINT,
      clientId: input.clientId,
      refreshToken: input.refreshToken,
    },
    input.fetchImpl ?? fetch,
  );
}
