// OrcaRouter OAuth 2.0 + PKCE connect flow (Flow A — loopback redirect).
//
// Flow choice. OrcaRouter's consent screen returns the auth code to whatever
// `callback_url` names, and this integration runs inside a local daemon that can
// bind a loopback port, so the code can be delivered automatically and the user
// clicks exactly once. Flow A it is. The same endpoints support Flow B (an
// out-of-band code the user pastes back), and the daemon route file exposes that
// paste-back path too, because the consent screen lets the *user* choose "show me
// a code" regardless of what we asked for — if a human can hand us a code, the
// challenge must be S256, which is why S256 is sent unconditionally here.
//
// Protocol layer. The PKCE primitives, the pending-state cache, and the
// authorize-URL builder come from `mcp-oauth.ts` — the same code the MCP and xAI
// flows use. This module adds only what is OrcaRouter-specific: the endpoints,
// the `callback_url` parameter name, the `sk-orca-…` key exchange, and the scope
// check. No client secret exists anywhere in this flow, and none is needed:
// PKCE binds the code to this process.
//
// Reference: https://www.orcarouter.ai/.well-known/openid-configuration

import {
  buildAuthorizeUrl,
  deriveCodeChallenge,
  generateCodeVerifier,
  generateState,
  type PendingAuthCache,
  type PendingAuthState,
} from '../mcp-oauth.js';
import {
  ORCAROUTER_APP_NAME,
  orcaRouterAuthorizeUrl,
  orcaRouterExchangeUrl,
} from './orcarouter.js';
import {
  ORCAROUTER_SCOPE_API,
  type PkceExchangeResult,
} from './orcarouter-credentials.js';

export const ORCAROUTER_REDIRECT_HOST = '127.0.0.1';
export const ORCAROUTER_REDIRECT_PATH = '/cb';
/** Sent on the exchange as the downgrade defence the relay checks. */
export const ORCAROUTER_CHALLENGE_METHOD = 'S256';
/** Public client — OrcaRouter's flow has no client registration and no secret. */
export const ORCAROUTER_CLIENT_ID = 'orcarouter';

/**
 * `callback_url` rules, validated by the consent endpoint before the user sees
 * a screen: https on any host and port, http only on loopback, no userinfo and
 * no fragment. Enforced here too so a self-hosted override cannot produce a URL
 * the consent screen will reject.
 */
export function assertValidCallbackUrl(callbackUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(callbackUrl);
  } catch {
    throw new Error(`OrcaRouter callback URL is not a valid URL: ${callbackUrl}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('OrcaRouter callback URL must not embed credentials');
  }
  if (parsed.hash) {
    throw new Error('OrcaRouter callback URL must not carry a fragment');
  }
  if (parsed.protocol === 'https:') return callbackUrl;
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (parsed.protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1' || host === '::1')) {
    return callbackUrl;
  }
  throw new Error(
    `OrcaRouter callback URL must use https, or http on loopback: ${callbackUrl}`,
  );
}

export function buildLoopbackCallbackUrl(port: number): string {
  return assertValidCallbackUrl(
    `http://${ORCAROUTER_REDIRECT_HOST}:${port}${ORCAROUTER_REDIRECT_PATH}`,
  );
}

export interface BeginOrcaRouterAuthInput {
  pending: PendingAuthCache;
  authBase: string;
  /** Where the consent screen should deliver the code. */
  callbackUrl: string;
  appName?: string;
  scope?: string;
  /** Pre-fills the email field when the user has to sign in. */
  loginHint?: string;
  workspaceHint?: string;
  /** `consent` forces re-approval even if the user approved before. */
  prompt?: string;
}

export interface BeginOrcaRouterAuthResult {
  authorizeUrl: string;
  state: string;
}

/**
 * Pre-redirect half of the dance. Mints a fresh cryptographic verifier and
 * state for this attempt, builds the authorize URL, and parks the verifier in
 * the pending cache.
 *
 * The verifier never leaves this process until the exchange and is never placed
 * on the authorize URL — only its SHA-256 challenge is.
 */
export function beginOrcaRouterAuth(
  input: BeginOrcaRouterAuthInput,
): BeginOrcaRouterAuthResult {
  const callbackUrl = assertValidCallbackUrl(input.callbackUrl);
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = deriveCodeChallenge(codeVerifier);
  const state = generateState();

  const authorizeUrl = new URL(orcaRouterAuthorizeUrl(input.authBase));
  authorizeUrl.searchParams.set('callback_url', callbackUrl);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', ORCAROUTER_CHALLENGE_METHOD);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('app_name', input.appName ?? ORCAROUTER_APP_NAME);
  authorizeUrl.searchParams.set('scope', input.scope ?? ORCAROUTER_SCOPE_API);
  if (input.loginHint) authorizeUrl.searchParams.set('login_hint', input.loginHint);
  if (input.workspaceHint) authorizeUrl.searchParams.set('workspace_hint', input.workspaceHint);
  if (input.prompt) authorizeUrl.searchParams.set('prompt', input.prompt);

  const pending: PendingAuthState = {
    serverId: ORCAROUTER_CLIENT_ID,
    authServerIssuer: input.authBase,
    tokenEndpoint: orcaRouterExchangeUrl(input.authBase),
    clientId: ORCAROUTER_CLIENT_ID,
    redirectUri: callbackUrl,
    codeVerifier,
    createdAt: Date.now(),
  };

  input.pending.put(state, pending);
  return { authorizeUrl: authorizeUrl.toString(), state };
}

/** Typed exchange failure so the route layer can map it to useful copy. */
export class OrcaRouterExchangeError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`OrcaRouter authorization exchange failed (HTTP ${status}): ${detail}`);
    this.name = 'OrcaRouterExchangeError';
  }
}

export interface CompleteOrcaRouterAuthInput {
  pending: PendingAuthCache;
  state: string;
  code: string;
  fetchImpl?: typeof fetch;
}

/**
 * Post-redirect half: consume the single-use state and redeem the code.
 *
 * The exchange always goes to the auth origin's `/api/v1/auth/keys` — never to
 * the inference origin, whose `/v1/auth/keys` is a 404 — and posts the verifier
 * with `code_challenge_method` so the relay can enforce its downgrade defence.
 */
export async function completeOrcaRouterAuth(
  input: CompleteOrcaRouterAuthInput,
): Promise<{ exchange: PkceExchangeResult; pending: PendingAuthState }> {
  // One-shot consume: a replayed state finds nothing here.
  const pending = input.pending.consume(input.state);
  if (!pending) {
    throw new OrcaRouterExchangeError(
      403,
      'this authorization attempt is no longer valid — it was already completed, cancelled, or timed out',
    );
  }
  const code = input.code.trim();
  if (!code) throw new OrcaRouterExchangeError(403, 'the authorization code was empty');

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(pending.tokenEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      code,
      code_verifier: pending.codeVerifier,
      code_challenge_method: ORCAROUTER_CHALLENGE_METHOD,
    }),
  });

  if (!response.ok) {
    const detail = await readExchangeError(response);
    throw new OrcaRouterExchangeError(response.status, detail);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OrcaRouterExchangeError(response.status, 'response was not JSON');
  }
  const obj = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const key = typeof obj.key === 'string' ? obj.key : '';
  if (!key) throw new OrcaRouterExchangeError(response.status, 'response did not include a key');
  const exchange: PkceExchangeResult = { key };
  if (typeof obj.user_id === 'string') exchange.user_id = obj.user_id;
  if (typeof obj.scope === 'string') exchange.scope = obj.scope;
  return { exchange, pending };
}

/**
 * Surface the relay's structured OAuth error without echoing anything that
 * could carry a credential back to the caller.
 */
async function readExchangeError(response: Response): Promise<string> {
  try {
    const text = (await response.text()).slice(0, 400);
    if (!text) return response.statusText || 'no detail';
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const err = parsed.error;
      const desc = parsed.error_description;
      if (typeof err === 'string' && err) {
        return typeof desc === 'string' && desc ? `${err}: ${desc}` : err;
      }
    } catch {
      // Not the OAuth envelope; fall through to the raw text.
    }
    return text;
  } catch {
    return response.statusText || 'no detail';
  }
}
