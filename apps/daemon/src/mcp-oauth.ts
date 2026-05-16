// Daemon-side OAuth 2.1 client for HTTP / SSE MCP servers.
//
// Replaces the per-agent `mcp-remote` subprocess that bound a transient
// `localhost:<port>` listener — that pattern can never work for a cloud-
// deployed daemon (the user's browser can't reach the listener) and it
// also broke locally because the listener died with the agent turn.
//
// What this module owns:
//   - Discovery of the auth server for a given MCP URL
//     (RFC 9728 protected-resource → RFC 8414 authorization-server).
//   - Dynamic Client Registration (RFC 7591) when the server supports it,
//     cached per `(authServerUrl, redirectUri)` in `<dataDir>/mcp-oauth-clients.json`
//     so we register once and reuse forever.
//   - PKCE (RFC 7636) code-verifier / code-challenge generation.
//   - Authorization-code → token exchange and refresh-token rotation.
//   - In-memory state cache keyed by the `state` parameter, used to look
//     up the originating server + verifier when the browser hits our
//     callback endpoint.
//
// Token persistence lives in `mcp-tokens.ts`. This file is the protocol
// layer; storage is somebody else's job.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';

// ───────────────────────────────────────────────────────────────────────
// Types — narrow subsets of the relevant RFC payloads.
// ───────────────────────────────────────────────────────────────────────

/** RFC 9728 `oauth-protected-resource` document fields we use. */
export interface ProtectedResourceMetadata {
  resource?: string;
  authorization_servers?: string[];
  scopes_supported?: string[];
}

/** RFC 8414 / OIDC discovery document fields we use. */
export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  grant_types_supported?: string[];
  code_challenge_methods_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
}

/** Cached client registration for a given auth server + redirect URI. */
export interface RegisteredClient {
  authServerIssuer: string;
  redirectUri: string;
  clientId: string;
  clientSecret?: string;
  registeredAt: number;
}

/** RFC 6749 §5.1 token endpoint response (subset). */
export interface OAuthTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

/** In-flight authorization request. Stashed in memory while the user
 * approves in their browser. */
export interface PendingAuthState {
  serverId: string;
  authServerIssuer: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  codeVerifier: string;
  scope?: string;
  resourceUrl?: string;
  createdAt: number;
}

// ───────────────────────────────────────────────────────────────────────
// PKCE + state helpers.
// ───────────────────────────────────────────────────────────────────────

const VERIFIER_LEN = 64; // RFC 7636 §4.1: 43–128 chars

function base64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function generateCodeVerifier(): string {
  return base64url(randomBytes(VERIFIER_LEN));
}

export function deriveCodeChallenge(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest());
}

export function generateState(): string {
  return base64url(randomBytes(32));
}

// ───────────────────────────────────────────────────────────────────────
// Discovery.
// ───────────────────────────────────────────────────────────────────────

/**
 * Try to fetch the protected-resource metadata for a given MCP URL.
 *
 * Per RFC 9728, the well-known is at the resource origin's
 * `/.well-known/oauth-protected-resource[<path>]`. We try both the
 * path-suffixed form and the bare `/.well-known/...` so servers that
 * only publish at the root still work.
 */
export async function discoverProtectedResource(
  resourceUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProtectedResourceMetadata | null> {
  let parsed: URL;
  try {
    parsed = new URL(resourceUrl);
  } catch {
    return null;
  }
  const candidates = [
    new URL(
      `/.well-known/oauth-protected-resource${parsed.pathname.replace(/\/+$/u, '')}`,
      `${parsed.protocol}//${parsed.host}`,
    ).toString(),
    new URL('/.well-known/oauth-protected-resource', `${parsed.protocol}//${parsed.host}`).toString(),
  ];
  for (const url of candidates) {
    const json = await fetchJson<ProtectedResourceMetadata>(url, fetchImpl);
    if (json) return json;
  }
  return null;
}

/**
 * Fetch the authorization-server metadata for an issuer URL. Tries both
 * the OAuth (RFC 8414) and OIDC layouts (`/.well-known/oauth-authorization-server`
 * and `/.well-known/openid-configuration`); some providers only publish one.
 */
export async function discoverAuthServer(
  issuer: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthorizationServerMetadata | null> {
  let parsed: URL;
  try {
    parsed = new URL(issuer);
  } catch {
    return null;
  }
  const trimmed = parsed.pathname.replace(/\/+$/u, '');
  const base = `${parsed.protocol}//${parsed.host}`;
  const candidates = [
    `${base}/.well-known/oauth-authorization-server${trimmed}`,
    `${base}/.well-known/openid-configuration${trimmed}`,
    `${base}/.well-known/oauth-authorization-server`,
    `${base}/.well-known/openid-configuration`,
  ];
  for (const url of candidates) {
    const json = await fetchJson<AuthorizationServerMetadata>(url, fetchImpl);
    if (json && typeof json.authorization_endpoint === 'string' && typeof json.token_endpoint === 'string') {
      // Spread first so the explicit issuer wins (otherwise duplicate-key
      // assignments under exactOptionalPropertyTypes complain).
      return { ...json, issuer: json.issuer ?? issuer };
    }
  }
  return null;
}

async function fetchJson<T>(
  url: string,
  fetchImpl: typeof fetch,
): Promise<T | null> {
  try {
    const res = await fetchImpl(url, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────
// Dynamic Client Registration (RFC 7591) + cache.
// ───────────────────────────────────────────────────────────────────────

interface ClientCacheFile {
  clients: RegisteredClient[];
}

function clientsFile(dataDir: string): string {
  return path.join(dataDir, 'mcp-oauth-clients.json');
}

async function readClientCache(dataDir: string): Promise<ClientCacheFile> {
  try {
    const raw = await readFile(clientsFile(dataDir), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.clients)) return { clients: [] };
    return { clients: parsed.clients.filter(isRegisteredClient) };
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'ENOENT') return { clients: [] };
    throw err;
  }
}

function isRegisteredClient(v: unknown): v is RegisteredClient {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.authServerIssuer === 'string' &&
    typeof r.redirectUri === 'string' &&
    typeof r.clientId === 'string'
  );
}

async function writeClientCache(
  dataDir: string,
  next: ClientCacheFile,
): Promise<void> {
  const file = clientsFile(dataDir);
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.' + randomBytes(4).toString('hex') + '.tmp';
  await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
  await rename(tmp, file);
}

/**
 * POST to the auth server's `registration_endpoint` per RFC 7591. Returns
 * a freshly issued client_id (and optional client_secret). Caller is
 * responsible for caching the result.
 */
export async function registerClient(
  registrationEndpoint: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ clientId: string; clientSecret?: string }> {
  const body = {
    redirect_uris: [redirectUri],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    client_name: 'Open Design',
    application_type: 'web',
  };
  const res = await fetchImpl(registrationEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await safeText(res);
    throw new Error(
      `dynamic client registration failed: HTTP ${res.status} ${res.statusText} ${txt}`,
    );
  }
  const json = (await res.json()) as { client_id?: string; client_secret?: string };
  if (!json.client_id) {
    throw new Error('dynamic client registration response missing client_id');
  }
  const out: { clientId: string; clientSecret?: string } = { clientId: json.client_id };
  if (json.client_secret) out.clientSecret = json.client_secret;
  return out;
}

/**
 * Cached version of `registerClient`. Looks up `(authServerIssuer, redirectUri)`
 * in the cache file and re-uses the existing client; falls back to a fresh
 * DCR call when nothing is cached.
 */
export async function getOrRegisterClient(
  dataDir: string,
  authServer: AuthorizationServerMetadata,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RegisteredClient> {
  const cache = await readClientCache(dataDir);
  const cached = cache.clients.find(
    (c) => c.authServerIssuer === authServer.issuer && c.redirectUri === redirectUri,
  );
  if (cached) return cached;
  if (!authServer.registration_endpoint) {
    throw new Error(
      `auth server ${authServer.issuer} does not advertise a registration_endpoint and no client is pre-registered`,
    );
  }
  const reg = await registerClient(
    authServer.registration_endpoint,
    redirectUri,
    fetchImpl,
  );
  const next: RegisteredClient = {
    authServerIssuer: authServer.issuer,
    redirectUri,
    clientId: reg.clientId,
    registeredAt: Date.now(),
  };
  if (reg.clientSecret) next.clientSecret = reg.clientSecret;
  cache.clients.push(next);
  await writeClientCache(dataDir, cache);
  return next;
}

// ───────────────────────────────────────────────────────────────────────
// Authorization URL builder.
// ───────────────────────────────────────────────────────────────────────

export interface AuthorizeUrlInput {
  authServer: AuthorizationServerMetadata;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope?: string;
  resource?: string;
}

export function buildAuthorizeUrl(input: AuthorizeUrlInput): string {
  const u = new URL(input.authServer.authorization_endpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', input.clientId);
  u.searchParams.set('redirect_uri', input.redirectUri);
  u.searchParams.set('state', input.state);
  u.searchParams.set('code_challenge', input.codeChallenge);
  u.searchParams.set('code_challenge_method', 'S256');
  if (input.scope) u.searchParams.set('scope', input.scope);
  // RFC 8707 resource indicator — narrows the issued token to the MCP
  // resource we actually care about. Most authoritative MCP servers
  // require it; harmless when ignored.
  if (input.resource) u.searchParams.set('resource', input.resource);
  return u.toString();
}

// ───────────────────────────────────────────────────────────────────────
// Token endpoint: code exchange + refresh.
// ───────────────────────────────────────────────────────────────────────

export interface ExchangeCodeInput {
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
  resource?: string;
}

export async function exchangeCodeForToken(
  input: ExchangeCodeInput,
  fetchImpl: typeof fetch = fetch,
): Promise<OAuthTokenResponse> {
  const form = new URLSearchParams();
  form.set('grant_type', 'authorization_code');
  form.set('code', input.code);
  form.set('redirect_uri', input.redirectUri);
  form.set('client_id', input.clientId);
  form.set('code_verifier', input.codeVerifier);
  if (input.resource) form.set('resource', input.resource);
  return tokenRequest(input.tokenEndpoint, form, input.clientSecret, fetchImpl);
}

export interface RefreshTokenInput {
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
  scope?: string;
  resource?: string;
}

export async function refreshAccessToken(
  input: RefreshTokenInput,
  fetchImpl: typeof fetch = fetch,
): Promise<OAuthTokenResponse> {
  const form = new URLSearchParams();
  form.set('grant_type', 'refresh_token');
  form.set('refresh_token', input.refreshToken);
  form.set('client_id', input.clientId);
  if (input.scope) form.set('scope', input.scope);
  if (input.resource) form.set('resource', input.resource);
  return tokenRequest(input.tokenEndpoint, form, input.clientSecret, fetchImpl);
}

async function tokenRequest(
  tokenEndpoint: string,
  form: URLSearchParams,
  clientSecret: string | undefined,
  fetchImpl: typeof fetch,
): Promise<OAuthTokenResponse> {
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
  };
  if (clientSecret) {
    // RFC 6749 §2.3.1 — confidential clients use HTTP Basic with the
    // client_id we already put in the form. Public clients (PKCE-only)
    // skip this branch.
    const basic = Buffer.from(`${form.get('client_id')}:${clientSecret}`).toString('base64');
    headers['authorization'] = `Basic ${basic}`;
  }
  const res = await fetchImpl(tokenEndpoint, {
    method: 'POST',
    headers,
    body: form.toString(),
  });
  if (!res.ok) {
    const txt = await safeText(res);
    throw new Error(
      `token endpoint rejected request: HTTP ${res.status} ${res.statusText} ${txt}`,
    );
  }
  const json = (await res.json()) as OAuthTokenResponse;
  if (!json.access_token) {
    throw new Error('token endpoint response missing access_token');
  }
  return json;
}

async function safeText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 500);
  } catch {
    return '';
  }
}

// ───────────────────────────────────────────────────────────────────────
// In-memory pending-state cache.
// ───────────────────────────────────────────────────────────────────────

/**
 * The OAuth dance is split across two HTTP requests on our side:
 *   1. POST /api/mcp/oauth/start          — we mint state + verifier
 *   2. GET  /api/mcp/oauth/callback       — browser returns code + state
 * State has to survive between (1) and (2) on the daemon. We keep it in a
 * Map with a TTL sweeper; persistence isn't needed because the user has
 * to complete auth in the same daemon process anyway (state is single-use).
 */
export class PendingAuthCache {
  private store = new Map<string, PendingAuthState>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly ttlMs: number = 10 * 60 * 1000) {}

  put(state: string, value: PendingAuthState): void {
    this.store.set(state, value);
    this.startSweeper();
  }

  /** One-shot consume — any successful callback removes the state so a
   * replay can't reuse it. */
  consume(state: string): PendingAuthState | null {
    const v = this.store.get(state);
    if (!v) return null;
    this.store.delete(state);
    if (Date.now() - v.createdAt > this.ttlMs) return null;
    return v;
  }

  size(): number {
    return this.store.size;
  }

  /** Stop the background sweeper. Used by tests; production lets the
   * timer ride on the daemon process lifetime. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private startSweeper(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.sweep(), Math.min(this.ttlMs, 60_000));
    // unref so the cache doesn't keep the event loop alive in tests
    if (typeof this.timer === 'object' && this.timer && typeof (this.timer as { unref?: () => void }).unref === 'function') {
      (this.timer as { unref: () => void }).unref();
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [k, v] of this.store) {
      if (now - v.createdAt > this.ttlMs) this.store.delete(k);
    }
    if (this.store.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

// ───────────────────────────────────────────────────────────────────────
// Top-level "begin auth" helper.
// ───────────────────────────────────────────────────────────────────────

export interface BeginAuthInput {
  serverId: string;
  serverUrl: string;
  redirectUri: string;
  dataDir: string;
  scope?: string;
  fetchImpl?: typeof fetch;
}

export interface BeginAuthResult {
  authorizeUrl: string;
  state: string;
  pending: PendingAuthState;
}

/**
 * Run the entire pre-redirect half of the OAuth dance:
 *   discovery → DCR (cached) → PKCE → authorize URL.
 *
 * Returns everything the caller needs to (a) push the user's browser at the
 * correct authorize URL, and (b) finish the flow when the callback hits.
 */
export async function beginAuth(
  input: BeginAuthInput,
): Promise<BeginAuthResult> {
  const fetchImpl = input.fetchImpl ?? fetch;

  // Step 1: ask the MCP server who its auth server is. If the server
  // doesn't publish protected-resource metadata, fall back to assuming
  // the resource origin IS the auth server — most "stand-alone" MCP
  // providers (Higgsfield etc.) host both at the same host.
  const prm = await discoverProtectedResource(input.serverUrl, fetchImpl);
  const issuerHint = prm?.authorization_servers?.[0];
  const issuer = issuerHint ?? new URL(input.serverUrl).origin;

  // Step 2: discovery on the auth server.
  const authServer = await discoverAuthServer(issuer, fetchImpl);
  if (!authServer) {
    throw new Error(`could not discover OAuth metadata for ${issuer}`);
  }

  // Step 3: ensure we have a registered client_id (DCR if missing).
  const client = await getOrRegisterClient(
    input.dataDir,
    authServer,
    input.redirectUri,
    fetchImpl,
  );

  // Step 4: PKCE + state.
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = deriveCodeChallenge(codeVerifier);
  const state = generateState();

  const scope =
    input.scope ??
    (Array.isArray(prm?.scopes_supported) && prm!.scopes_supported!.length > 0
      ? prm!.scopes_supported!.join(' ')
      : authServer.scopes_supported?.join(' '));

  const resource = prm?.resource ?? input.serverUrl;
  const authUrlInput: AuthorizeUrlInput = {
    authServer,
    clientId: client.clientId,
    redirectUri: input.redirectUri,
    state,
    codeChallenge,
    resource,
  };
  if (scope) authUrlInput.scope = scope;
  const authorizeUrl = buildAuthorizeUrl(authUrlInput);

  const pending: PendingAuthState = {
    serverId: input.serverId,
    authServerIssuer: authServer.issuer,
    tokenEndpoint: authServer.token_endpoint,
    clientId: client.clientId,
    redirectUri: input.redirectUri,
    codeVerifier,
    resourceUrl: resource,
    createdAt: Date.now(),
  };
  if (client.clientSecret) pending.clientSecret = client.clientSecret;
  if (scope) pending.scope = scope;

  return { authorizeUrl, state, pending };
}
