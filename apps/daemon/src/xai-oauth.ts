// xAI Grok OAuth 2.0 + PKCE client.
//
// Wraps the PKCE primitives in `mcp-oauth.ts` for the specific case of
// xAI's `auth.x.ai` OAuth server. xAI doesn't speak MCP and doesn't
// expose Dynamic Client Registration, so we hardcode the issuer /
// endpoints / client_id / scope / loopback port instead of running
// discovery.
//
// Reference: NousResearch/hermes-agent `hermes_cli/auth.py:93-100`.
//
// PoC: client_id is reused from Hermes (`b1a00492-073a-47ea-816f-4c329264a828`).
// TODO before stable release: apply for our own client_id from xAI.

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
} from './mcp-oauth.js';

// ───────────────────────────────────────────────────────────────────────
// xAI OAuth constants.
// ───────────────────────────────────────────────────────────────────────

export const XAI_OAUTH_ISSUER = 'https://auth.x.ai';
export const XAI_OAUTH_AUTHORIZATION_ENDPOINT =
  'https://auth.x.ai/oauth2/authorize';
export const XAI_OAUTH_TOKEN_ENDPOINT = 'https://auth.x.ai/oauth2/token';
export const XAI_OAUTH_SCOPE =
  'openid profile email offline_access grok-cli:access api:access';

export const XAI_OAUTH_REDIRECT_HOST = '127.0.0.1';
export const XAI_OAUTH_REDIRECT_PORT = 56121;
export const XAI_OAUTH_REDIRECT_PATH = '/callback';

/**
 * PoC client_id reused from NousResearch/hermes-agent. xAI does not yet
 * publish a public application registration flow that we know of; once
 * an Open Design client_id is provisioned, replace this constant.
 */
export const XAI_OAUTH_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';

/** Stable provider id used to key the xAI token in any per-server cache. */
export const XAI_PROVIDER_ID = 'xai';

const XAI_AUTH_SERVER: AuthorizationServerMetadata = {
  issuer: XAI_OAUTH_ISSUER,
  authorization_endpoint: XAI_OAUTH_AUTHORIZATION_ENDPOINT,
  token_endpoint: XAI_OAUTH_TOKEN_ENDPOINT,
};

export function xaiRedirectUri(): string {
  return `http://${XAI_OAUTH_REDIRECT_HOST}:${XAI_OAUTH_REDIRECT_PORT}${XAI_OAUTH_REDIRECT_PATH}`;
}

// ───────────────────────────────────────────────────────────────────────
// Begin / complete / refresh.
// ───────────────────────────────────────────────────────────────────────

export interface BeginXAIAuthInput {
  pending: PendingAuthCache;
}

export interface BeginXAIAuthResult {
  authorizeUrl: string;
  state: string;
}

/**
 * Pre-redirect half of the OAuth dance. Mints a PKCE verifier/challenge,
 * builds the authorize URL, and stashes the pending state in `pending`.
 *
 * The caller is responsible for sending the user's browser to
 * `authorizeUrl` and then receiving the callback at `xaiRedirectUri()`.
 * When the callback arrives, pass `state` and `code` to `completeXAIAuth`.
 */
export function beginXAIAuth(input: BeginXAIAuthInput): BeginXAIAuthResult {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = deriveCodeChallenge(codeVerifier);
  const state = generateState();
  const redirectUri = xaiRedirectUri();

  const authorizeUrl = buildAuthorizeUrl({
    authServer: XAI_AUTH_SERVER,
    clientId: XAI_OAUTH_CLIENT_ID,
    redirectUri,
    state,
    codeChallenge,
    scope: XAI_OAUTH_SCOPE,
  });

  const pendingState: PendingAuthState = {
    serverId: XAI_PROVIDER_ID,
    authServerIssuer: XAI_OAUTH_ISSUER,
    tokenEndpoint: XAI_OAUTH_TOKEN_ENDPOINT,
    clientId: XAI_OAUTH_CLIENT_ID,
    redirectUri,
    codeVerifier,
    scope: XAI_OAUTH_SCOPE,
    createdAt: Date.now(),
  };

  input.pending.put(state, pendingState);
  return { authorizeUrl, state };
}

export interface CompleteXAIAuthInput {
  pending: PendingAuthCache;
  state: string;
  code: string;
  fetchImpl?: typeof fetch;
}

/**
 * Post-callback half of the OAuth dance. Looks up `state` in `pending`,
 * validates it (one-shot, TTL-checked by `PendingAuthCache`), and
 * exchanges `code` for tokens. Throws if `state` is unknown, expired,
 * already consumed, or was issued for a different provider.
 */
export async function completeXAIAuth(
  input: CompleteXAIAuthInput,
): Promise<OAuthTokenResponse> {
  const consumed = input.pending.consume(input.state);
  if (!consumed) {
    throw new Error('xAI OAuth state not found or expired');
  }
  if (consumed.serverId !== XAI_PROVIDER_ID) {
    throw new Error(
      `xAI OAuth state mismatch: expected serverId=${XAI_PROVIDER_ID}, got ${consumed.serverId}`,
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

export interface RefreshXAITokenInput {
  refreshToken: string;
  fetchImpl?: typeof fetch;
}

/**
 * Refresh an existing xAI access token. The refresh_token is bound to
 * the client_id that originally received it (RFC 6749 §6); since we
 * always use the same fixed client_id, we don't need to persist it
 * per-token.
 */
export async function refreshXAIToken(
  input: RefreshXAITokenInput,
): Promise<OAuthTokenResponse> {
  return refreshAccessToken(
    {
      tokenEndpoint: XAI_OAUTH_TOKEN_ENDPOINT,
      clientId: XAI_OAUTH_CLIENT_ID,
      refreshToken: input.refreshToken,
    },
    input.fetchImpl ?? fetch,
  );
}
