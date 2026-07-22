import { timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Express, Request, Response as ExpressResponse } from 'express';
import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';

import {
  chatGptV1RequiredScopes,
  createOpenDesignMcpServer,
  isChatGptWidgetResourceUri,
} from '../mcp.js';
import {
  CHATGPT_STUDIO_COOKIE,
  chatGptCapabilitySecret,
  chatGptCapabilityTtlSeconds,
  chatGptStudioCookieToken,
  createChatGptCapabilityToken,
  encodeChatGptCapabilityPath,
  verifyChatGptCapabilityToken,
  type ChatGptCapabilityClaims,
} from '../services/chatgpt-capabilities.js';
import { chatGptTenantKey } from '../services/chatgpt-tenant-daemons.js';

export const CHATGPT_MCP_SCOPES = [
  'openid',
  'profile',
  'offline_access',
  'opendesign.account.read',
  'opendesign.catalog.read',
  'opendesign.projects.read',
  'opendesign.projects.write',
  'opendesign.runs.read',
  'opendesign.runs.write',
  'opendesign.versions.write',
  'opendesign.exports.read',
] as const;

const ALL_RUNTIME_SCOPES = new Set<string>(CHATGPT_MCP_SCOPES);

export interface RegisterChatGptMcpRoutesDeps {
  getDaemonUrl: () => string;
  resolveTenantDaemonUrl?: (
    principal: ChatGptMcpPrincipal,
    accessToken: string,
  ) => Promise<string>;
  resolveTenantDaemonByKey?: (tenantKey: string) => Promise<string>;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export interface ChatGptMcpPrincipal {
  mode: 'anonymous' | 'loopback' | 'development' | 'static' | 'oauth';
  subject: string;
  scopes: Set<string>;
}

function truthy(value: unknown): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  return address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1';
}

function isLoopbackHostname(hostname: string): boolean {
  return ['127.0.0.1', 'localhost', '::1'].includes(hostname.toLowerCase());
}

function isDirectLoopbackRequest(request: Request, env: NodeJS.ProcessEnv): boolean {
  if (!isLoopbackAddress(request.socket.remoteAddress)) return false;
  // A public reverse proxy commonly connects to the daemon over loopback. Do
  // not let that transport detail bypass OAuth: local no-auth inspection is
  // available only when the request Host is itself loopback and no public or
  // bearer boundary has been configured.
  if (
    env.OD_PUBLIC_BASE_URL?.trim()
    || env.OD_CHATGPT_MCP_RESOURCE_URL?.trim()
    || env.OD_CHATGPT_OAUTH_ISSUER?.trim()
    || env.OD_CHATGPT_MCP_TOKEN?.trim()
    || env.OD_API_TOKEN?.trim()
  ) return false;
  const host = request.get('host');
  if (!host) return false;
  try {
    return isLoopbackHostname(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

function constantTimeEqual(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function bearerToken(request: Pick<Request, 'headers'>): string | null {
  const authorization = String(request.headers.authorization ?? '');
  return /^Bearer\s+(\S+)\s*$/i.exec(authorization)?.[1] ?? null;
}

function requestOrigin(request: Request, env: NodeJS.ProcessEnv): string {
  const configured = String(env.OD_PUBLIC_BASE_URL ?? '').trim();
  if (/^https?:\/\//iu.test(configured)) return configured.replace(/\/+$/u, '');
  const host = request.get('host');
  return `${request.protocol || 'http'}://${host || 'localhost'}`;
}

function resourceUrl(request: Request, env: NodeJS.ProcessEnv): string {
  const configured = String(env.OD_CHATGPT_MCP_RESOURCE_URL ?? '').trim();
  return configured || `${requestOrigin(request, env)}/mcp`;
}

function resourceMetadataUrl(request: Request, env: NodeJS.ProcessEnv): string {
  return `${new URL(resourceUrl(request, env)).origin}/.well-known/oauth-protected-resource/mcp`;
}

function widgetFrameDomains(env: NodeJS.ProcessEnv): string[] {
  return String(env.OD_CHATGPT_WIDGET_FRAME_DOMAINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .flatMap((value) => {
      try {
        const url = new URL(value);
        if (url.username || url.password) return [];
        if (url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname))) {
          return [url.origin];
        }
      } catch {
        // Ignore malformed optional CSP entries; production acceptance tests
        // verify the actual preview origin is present.
      }
      return [];
    });
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function entryFileFromPreviewUrl(value: unknown): string | null {
  const url = stringValue(value);
  if (!url) return null;
  try {
    const marker = '/raw/';
    const pathname = new URL(url).pathname;
    const index = pathname.indexOf(marker);
    return index >= 0 ? decodeURIComponent(pathname.slice(index + marker.length)) : null;
  } catch {
    return null;
  }
}

function conversationIdFromStudioUrl(value: unknown): string | null {
  const url = stringValue(value);
  if (!url) return null;
  try {
    const match = new URL(url).pathname.match(/\/conversations\/([^/]+)/u);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export function rewriteManagedTenantResultUrls(input: {
  result: any;
  subject: string;
  publicOrigin: string;
  env: NodeJS.ProcessEnv;
}): any {
  const structured = input.result?.structuredContent;
  if (!structured || typeof structured !== 'object' || Array.isArray(structured)) return input.result;
  const next = { ...structured } as Record<string, unknown>;
  const projectRecord = next.project && typeof next.project === 'object' && !Array.isArray(next.project)
    ? next.project as Record<string, unknown>
    : null;
  const projectId = stringValue(next.projectId) ?? stringValue(projectRecord?.id);
  if (!projectId) return input.result;

  const entryFile = stringValue(next.entryFile) ?? entryFileFromPreviewUrl(next.previewUrl);
  const conversationId = stringValue(next.conversationId)
    ?? conversationIdFromStudioUrl(next.studioUrl);
  const secret = chatGptCapabilitySecret(input.env);
  const ttlSeconds = chatGptCapabilityTtlSeconds(input.env);
  const tenantKey = chatGptTenantKey(input.subject);

  // Never allow the child daemon's loopback URLs to escape the managed
  // gateway. Replace them only with signed, subject-bound public routes.
  delete next.previewUrl;
  delete next.studioUrl;
  if (entryFile) {
    const previewToken = createChatGptCapabilityToken({
      purpose: 'preview',
      tenantKey,
      projectId,
      entryFile,
    }, secret, { ttlSeconds });
    next.entryFile = entryFile;
    next.previewUrl = `${input.publicOrigin}/chatgpt/preview/${previewToken}/raw/${encodeChatGptCapabilityPath(entryFile)}`;
  }
  if (conversationId) {
    const studioToken = createChatGptCapabilityToken({
      purpose: 'studio',
      tenantKey,
      projectId,
      conversationId,
      entryFile,
    }, secret, { ttlSeconds });
    next.studioUrl = `${input.publicOrigin}/chatgpt/studio/${studioToken}`;
  }

  return {
    ...input.result,
    structuredContent: next,
    content: Array.isArray(input.result.content)
      ? input.result.content.map((item: any) => item?.type === 'text'
        ? { ...item, text: JSON.stringify(next, null, 2) }
        : item)
      : input.result.content,
  };
}

function capabilityClaims(
  token: string,
  purpose: ChatGptCapabilityClaims['purpose'],
  env: NodeJS.ProcessEnv,
): ChatGptCapabilityClaims | null {
  const claims = verifyChatGptCapabilityToken(token, chatGptCapabilitySecret(env));
  return claims?.purpose === purpose ? claims : null;
}

function responseHeaderAllowed(name: string): boolean {
  return [
    'accept-ranges',
    'cache-control',
    'content-encoding',
    'content-language',
    'content-length',
    'content-range',
    'content-security-policy',
    'content-type',
    'etag',
    'last-modified',
  ].includes(name.toLowerCase());
}

async function pipeUpstreamResponse(
  upstream: globalThis.Response,
  response: ExpressResponse,
): Promise<void> {
  response.status(upstream.status);
  upstream.headers.forEach((value, name) => {
    if (responseHeaderAllowed(name)) response.setHeader(name, value);
  });
  if (!upstream.body || upstream.status === 204 || upstream.status === 304) {
    response.end();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const stream = Readable.fromWeb(upstream.body as any);
    stream.once('error', reject);
    response.once('error', reject);
    response.once('finish', resolve);
    stream.pipe(response);
  });
}

function proxyRequestHeaders(request: Request): Headers {
  const headers = new Headers();
  const blocked = new Set([
    'authorization',
    'connection',
    'content-length',
    'cookie',
    'forwarded',
    'host',
    'origin',
    'referer',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-proto',
  ]);
  for (const [name, rawValue] of Object.entries(request.headers)) {
    if (blocked.has(name.toLowerCase())) continue;
    if (Array.isArray(rawValue)) headers.set(name, rawValue.join(', '));
    else if (typeof rawValue === 'string') headers.set(name, rawValue);
  }
  return headers;
}

async function proxyStudioApiRequest(input: {
  request: Request;
  response: ExpressResponse;
  daemonUrl: string;
  fetchImpl: typeof fetch;
}): Promise<void> {
  if (!input.request.originalUrl.startsWith('/api')) {
    throw new Error('Studio proxy accepts only Open Design API paths.');
  }
  const daemonOrigin = new URL(input.daemonUrl);
  const upstreamUrl = new URL(input.request.originalUrl, `${daemonOrigin.origin}/`);
  if (upstreamUrl.origin !== daemonOrigin.origin) {
    throw new Error('Studio proxy rejected a cross-origin upstream URL.');
  }
  const method = input.request.method.toUpperCase();
  const headers = proxyRequestHeaders(input.request);
  let body: string | Request | undefined;
  let duplex: 'half' | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    if (input.request.is('application/json') && input.request.body !== undefined) {
      body = JSON.stringify(input.request.body);
      headers.set('content-type', 'application/json');
    } else {
      body = input.request;
      duplex = 'half';
    }
  }
  const upstream = await input.fetchImpl(upstreamUrl, {
    method,
    headers,
    body,
    redirect: 'manual',
    ...(duplex ? { duplex } : {}),
  } as RequestInit & { duplex?: 'half' });
  await pipeUpstreamResponse(upstream, input.response);
}

function studioRedirectPath(claims: ChatGptCapabilityClaims): string {
  let path = `/projects/${encodeURIComponent(claims.projectId)}`;
  if (claims.conversationId) {
    path += `/conversations/${encodeURIComponent(claims.conversationId)}`;
    if (claims.entryFile) path += `/files/${encodeChatGptCapabilityPath(claims.entryFile)}`;
  }
  return path;
}

function oauthChallenge(request: Request, env: NodeJS.ProcessEnv, error?: string, scope?: string): string {
  const fields = [`resource_metadata="${resourceMetadataUrl(request, env)}"`];
  if (error) fields.push(`error="${error}"`);
  if (scope) fields.push(`scope="${scope}"`);
  return `Bearer ${fields.join(', ')}`;
}

function requestedScopes(body: unknown): Set<string> {
  const scopes = new Set<string>();
  const messages = Array.isArray(body) ? body : [body];
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    const record = message as { method?: unknown; params?: { name?: unknown; uri?: unknown } };
    if (
      record.method === 'resources/list'
      || (record.method === 'resources/read' && !isChatGptWidgetResourceUri(record.params?.uri))
    ) {
      scopes.add('opendesign.catalog.read');
      continue;
    }
    if (record.method !== 'tools/call') continue;
    for (const scope of chatGptV1RequiredScopes(String(record.params?.name ?? ''))) scopes.add(scope);
  }
  return scopes;
}

function isPublicChatGptMcpRequest(body: unknown): boolean {
  // Anonymous batching is unnecessary for the host handshake and can amplify
  // repeated widget reads into a disproportionately large public response.
  if (Array.isArray(body)) return false;
  return [body].every((message) => {
    if (!message || typeof message !== 'object') return false;
    const record = message as {
      method?: unknown;
      params?: { name?: unknown; uri?: unknown };
    };
    if (
      record.method === 'initialize'
      || record.method === 'notifications/initialized'
      || record.method === 'ping'
      || record.method === 'tools/list'
    ) return true;
    if (record.method === 'tools/call') return record.params?.name === 'collect_brief';
    if (record.method === 'resources/read') return isChatGptWidgetResourceUri(record.params?.uri);
    return false;
  });
}

interface IntrospectionResponse {
  active?: boolean;
  sub?: string;
  scope?: string | string[];
  aud?: string | string[];
  exp?: number;
}

function jwtValidationUnavailable(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'ERR_JWKS_TIMEOUT';
}

async function validateJwtAccessToken(
  token: string,
  issuer: string,
  audience: string,
  jwksUrl: string,
  fetchImpl: typeof fetch,
): Promise<ChatGptMcpAuthorization> {
  try {
    const jwks = createRemoteJWKSet(new URL(jwksUrl), {
      [customFetch]: fetchImpl,
    });
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience,
    });
    if (!payload.sub) {
      return {
        ok: false,
        status: 401,
        code: 'CHATGPT_MCP_INVALID_TOKEN',
        message: 'The Open Design access token has no subject.',
      };
    }
    return {
      ok: true,
      accessToken: token,
      principal: {
        mode: 'oauth',
        subject: payload.sub,
        scopes: stringSet(typeof payload.scope === 'string' ? payload.scope : undefined),
      },
    };
  } catch (error) {
    if (jwtValidationUnavailable(error)) {
      return {
        ok: false,
        status: 503,
        code: 'CHATGPT_MCP_OAUTH_UNAVAILABLE',
        message: 'Open Design authorization is temporarily unavailable.',
      };
    }
    return {
      ok: false,
      status: 401,
      code: 'CHATGPT_MCP_INVALID_TOKEN',
      message: 'The Open Design access token is invalid, expired, or was issued for another resource.',
    };
  }
}

function stringSet(value: string | string[] | undefined): Set<string> {
  if (Array.isArray(value)) return new Set(value.filter((entry) => typeof entry === 'string'));
  return new Set(String(value ?? '').split(/\s+/u).filter(Boolean));
}

export type ChatGptMcpAuthorization =
  | { ok: true; principal: ChatGptMcpPrincipal; accessToken?: string }
  | { ok: false; status: 401 | 403 | 503; code: string; message: string; challenge?: string };

export async function authorizeChatGptMcpRequest(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<ChatGptMcpAuthorization> {
  if (isDirectLoopbackRequest(request, env)) {
    return { ok: true, principal: { mode: 'loopback', subject: 'local', scopes: ALL_RUNTIME_SCOPES } };
  }
  if (truthy(env.OD_CHATGPT_MCP_ALLOW_UNAUTHENTICATED)) {
    return { ok: true, principal: { mode: 'development', subject: 'development', scopes: ALL_RUNTIME_SCOPES } };
  }

  const token = bearerToken(request);
  if (!token && isPublicChatGptMcpRequest(request.body)) {
    return { ok: true, principal: { mode: 'anonymous', subject: 'anonymous', scopes: new Set() } };
  }
  const staticToken = String(env.OD_CHATGPT_MCP_TOKEN || env.OD_API_TOKEN || '').trim();
  if (staticToken && token && constantTimeEqual(token, staticToken)) {
    return { ok: true, principal: { mode: 'static', subject: 'single-tenant', scopes: ALL_RUNTIME_SCOPES } };
  }

  const issuer = String(env.OD_CHATGPT_OAUTH_ISSUER ?? '').trim();
  const introspectionUrl = String(env.OD_CHATGPT_OAUTH_INTROSPECTION_URL ?? '').trim();
  const configuredJwksUrl = String(env.OD_CHATGPT_OAUTH_JWKS_URL ?? '').trim();
  const jwksUrl = configuredJwksUrl
    || (!introspectionUrl && issuer ? `${issuer.replace(/\/+$/u, '')}/jwks` : '');
  const expectedResource = String(env.OD_CHATGPT_MCP_RESOURCE_URL ?? '').trim();
  if (!token) {
    if (!issuer && !staticToken) {
      return {
        ok: false,
        status: 503,
        code: 'CHATGPT_MCP_AUTH_NOT_CONFIGURED',
        message: 'Remote ChatGPT MCP access is disabled. Configure Open Design OAuth or a single-tenant development token.',
      };
    }
    return {
      ok: false,
      status: 401,
      code: 'CHATGPT_MCP_AUTH_REQUIRED',
      message: 'Open Design authorization is required.',
      challenge: oauthChallenge(request, env),
    };
  }
  if (staticToken && !issuer) {
    return {
      ok: false,
      status: 401,
      code: 'CHATGPT_MCP_INVALID_TOKEN',
      message: 'The single-tenant development token is invalid.',
      challenge: oauthChallenge(request, env, 'invalid_token'),
    };
  }
  if (!issuer || !expectedResource) {
    return {
      ok: false,
      status: 503,
      code: 'CHATGPT_MCP_OAUTH_NOT_CONFIGURED',
      message: 'OAuth bearer validation requires an issuer and exact MCP resource audience.',
    };
  }

  if (jwksUrl) {
    const result = await validateJwtAccessToken(
      token,
      issuer,
      expectedResource,
      jwksUrl,
      fetchImpl,
    );
    if (!result.ok) {
      return result.status === 401
        ? { ...result, challenge: oauthChallenge(request, env, 'invalid_token') }
        : result;
    }
    const missing = [...requestedScopes(request.body)].filter(
      (scope) => !result.principal.scopes.has(scope),
    );
    if (missing.length > 0) {
      return {
        ok: false,
        status: 403,
        code: 'CHATGPT_MCP_INSUFFICIENT_SCOPE',
        message: `The Open Design access token is missing required scope: ${missing.join(' ')}`,
        challenge: oauthChallenge(request, env, 'insufficient_scope', missing.join(' ')),
      };
    }
    return result;
  }

  const form = new URLSearchParams({ token, token_type_hint: 'access_token' });
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/x-www-form-urlencoded',
  };
  const clientId = String(env.OD_CHATGPT_OAUTH_CLIENT_ID ?? '').trim();
  const clientSecret = String(env.OD_CHATGPT_OAUTH_CLIENT_SECRET ?? '').trim();
  if (clientId || clientSecret) {
    headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  }

  let response: globalThis.Response;
  try {
    response = await fetchImpl(introspectionUrl, { method: 'POST', headers, body: form.toString() });
  } catch {
    return { ok: false, status: 503, code: 'CHATGPT_MCP_OAUTH_UNAVAILABLE', message: 'Open Design authorization is temporarily unavailable.' };
  }
  if (!response.ok) {
    return { ok: false, status: 503, code: 'CHATGPT_MCP_OAUTH_UNAVAILABLE', message: 'Open Design authorization could not validate the access token.' };
  }
  const introspection = await response.json() as IntrospectionResponse;
  const audience = stringSet(introspection.aud);
  const expired = typeof introspection.exp === 'number' && introspection.exp <= Math.floor(Date.now() / 1000);
  if (introspection.active !== true || !introspection.sub || expired || !audience.has(expectedResource)) {
    return {
      ok: false,
      status: 401,
      code: 'CHATGPT_MCP_INVALID_TOKEN',
      message: 'The Open Design access token is inactive, expired, or was issued for another resource.',
      challenge: oauthChallenge(request, env, 'invalid_token'),
    };
  }
  const scopes = stringSet(introspection.scope);
  const missing = [...requestedScopes(request.body)].filter((scope) => !scopes.has(scope));
  if (missing.length > 0) {
    return {
      ok: false,
      status: 403,
      code: 'CHATGPT_MCP_INSUFFICIENT_SCOPE',
      message: `The Open Design access token is missing required scope: ${missing.join(' ')}`,
      challenge: oauthChallenge(request, env, 'insufficient_scope', missing.join(' ')),
    };
  }
  return {
    ok: true,
    accessToken: token,
    principal: { mode: 'oauth', subject: introspection.sub, scopes },
  };
}

export function resolveChatGptMcpDaemonUrl(
  fallbackUrl: string,
  principal: ChatGptMcpPrincipal,
  env: NodeJS.ProcessEnv,
): string {
  if (principal.mode !== 'oauth') return fallbackUrl;
  const template = String(env.OD_CHATGPT_MCP_TENANT_URL_TEMPLATE ?? '').trim();
  if (!template || !template.includes('{sub}')) {
    throw new Error('OAuth mode requires OD_CHATGPT_MCP_TENANT_URL_TEMPLATE with a {sub} placeholder; shared user storage is refused.');
  }
  const resolved = template.replaceAll('{sub}', encodeURIComponent(principal.subject));
  const url = new URL(resolved);
  if (url.username || url.password || (url.protocol !== 'https:' && !['127.0.0.1', 'localhost', '::1'].includes(url.hostname))) {
    throw new Error('Tenant daemon URL must use HTTPS (except loopback) and must not contain credentials.');
  }
  return url.toString().replace(/\/+$/u, '');
}

function sendMethodNotAllowed(response: ExpressResponse): void {
  response.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  });
}

export function registerChatGptMcpRoutes(
  app: Express,
  {
    getDaemonUrl,
    resolveTenantDaemonUrl,
    resolveTenantDaemonByKey,
    env = process.env,
    fetchImpl = fetch,
  }: RegisterChatGptMcpRoutesDeps,
): void {
  if (resolveTenantDaemonByKey) {
    // A ChatGPT iframe cannot attach an OAuth bearer to nested HTML/CSS/JS
    // requests. Signed preview capabilities expose only one tenant project and
    // keep the child daemon on loopback.
    app.get('/chatgpt/preview/:token/raw/*splat', async (request, response) => {
      let claims: ChatGptCapabilityClaims | null = null;
      try {
        claims = capabilityClaims(String(request.params.token ?? ''), 'preview', env);
      } catch {
        response.status(503).send('Open Design preview signing is not configured.');
        return;
      }
      if (!claims) {
        response.status(401).send('This Open Design preview link is invalid or expired.');
        return;
      }
      const rawSplat = request.params.splat;
      const segments = (Array.isArray(rawSplat) ? rawSplat : [rawSplat])
        .filter((segment): segment is string => typeof segment === 'string' && segment.length > 0);
      if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
        response.status(400).send('Invalid Open Design preview path.');
        return;
      }
      try {
        const daemonUrl = await resolveTenantDaemonByKey(claims.tenantKey);
        const upstreamUrl = new URL(
          `/api/projects/${encodeURIComponent(claims.projectId)}/raw/${segments.map(encodeURIComponent).join('/')}`,
          `${daemonUrl.replace(/\/+$/u, '')}/`,
        );
        const upstream = await fetchImpl(upstreamUrl, {
          headers: proxyRequestHeaders(request),
          redirect: 'manual',
        });
        await pipeUpstreamResponse(upstream, response);
      } catch (error) {
        if (!response.headersSent) {
          response.status(410).send(error instanceof Error ? error.message : 'Open Design preview is unavailable.');
        }
      }
    });

    // Exchange the signed Studio link for an HttpOnly cookie, then remove the
    // capability from browser history via a same-origin redirect.
    app.get('/chatgpt/studio/:token', (request, response) => {
      let claims: ChatGptCapabilityClaims | null = null;
      try {
        claims = capabilityClaims(String(request.params.token ?? ''), 'studio', env);
      } catch {
        response.status(503).send('Open Design Studio signing is not configured.');
        return;
      }
      if (!claims) {
        response.status(401).send('This Open Design Studio link is invalid or expired.');
        return;
      }
      const maxAge = Math.max(1, claims.exp - Math.floor(Date.now() / 1000));
      const secure = requestOrigin(request, env).startsWith('https:') ? '; Secure' : '';
      response.setHeader(
        'Set-Cookie',
        `${CHATGPT_STUDIO_COOKIE}=${encodeURIComponent(String(request.params.token))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
      );
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Referrer-Policy', 'no-referrer');
      response.redirect(303, studioRedirectPath(claims));
    });

    // The shared static web bundle stays on the gateway, while every API call
    // from a signed Studio session is routed to that OAuth subject's daemon.
    app.use('/api', async (request, response, next) => {
      const token = chatGptStudioCookieToken(request.headers.cookie);
      if (!token) {
        next();
        return;
      }
      let claims: ChatGptCapabilityClaims | null = null;
      try {
        claims = capabilityClaims(token, 'studio', env);
      } catch {
        response.status(503).json({ error: { code: 'CHATGPT_STUDIO_NOT_CONFIGURED' } });
        return;
      }
      if (!claims) {
        response.setHeader(
          'Set-Cookie',
          `${CHATGPT_STUDIO_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
        );
        response.status(401).json({
          error: {
            code: 'CHATGPT_STUDIO_SESSION_EXPIRED',
            message: 'Return to ChatGPT and open the latest Open Design result.',
          },
        });
        return;
      }
      const browserOrigin = request.get('origin');
      if (browserOrigin && browserOrigin !== requestOrigin(request, env)) {
        response.status(403).json({
          error: {
            code: 'CHATGPT_STUDIO_ORIGIN_REJECTED',
            message: 'Open Design Studio accepts only same-origin API requests.',
          },
        });
        return;
      }
      try {
        const daemonUrl = await resolveTenantDaemonByKey(claims.tenantKey);
        await proxyStudioApiRequest({ request, response, daemonUrl, fetchImpl });
      } catch (error) {
        if (!response.headersSent) {
          response.status(503).json({
            error: {
              code: 'CHATGPT_STUDIO_TENANT_UNAVAILABLE',
              message: error instanceof Error ? error.message : 'Open Design Studio is unavailable.',
            },
          });
        }
      }
    });
  }

  const metadataHandler = (request: Request, response: ExpressResponse) => {
    const issuer = String(env.OD_CHATGPT_OAUTH_ISSUER ?? '').trim();
    response.json({
      resource: resourceUrl(request, env),
      authorization_servers: issuer ? [issuer] : [],
      scopes_supported: CHATGPT_MCP_SCOPES,
      bearer_methods_supported: ['header'],
      resource_documentation: 'https://open-design.ai/docs/chatgpt',
    });
  };
  app.get('/.well-known/oauth-protected-resource', metadataHandler);
  app.get('/.well-known/oauth-protected-resource/mcp', metadataHandler);

  app.post('/mcp', async (request, response) => {
    const authorization = await authorizeChatGptMcpRequest(request, env, fetchImpl);
    if (!authorization.ok) {
      if (authorization.challenge) response.setHeader('WWW-Authenticate', authorization.challenge);
      response.status(authorization.status).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: authorization.message, data: { code: authorization.code } },
        id: null,
      });
      return;
    }

    let daemonUrl: string;
    try {
      if (authorization.principal.mode === 'oauth' && resolveTenantDaemonUrl) {
        if (!authorization.accessToken) {
          throw new Error('OAuth access token is unavailable for managed tenant routing.');
        }
        daemonUrl = await resolveTenantDaemonUrl(
          authorization.principal,
          authorization.accessToken,
        );
      } else {
        daemonUrl = resolveChatGptMcpDaemonUrl(getDaemonUrl(), authorization.principal, env);
      }
    } catch (error) {
      response.status(503).json({
        jsonrpc: '2.0',
        error: { code: -32002, message: error instanceof Error ? error.message : 'Tenant routing is unavailable.' },
        id: null,
      });
      return;
    }

    const server = createOpenDesignMcpServer({
      daemonUrl,
      widgetFrameDomains: [
        ...widgetFrameDomains(env),
        // Local previews are served by this same origin, while managed
        // tenant previews are rewritten back through it. Keep both paths in
        // the widget CSP instead of relying on a historical fixed dev port.
        requestOrigin(request, env),
      ],
      widgetRedirectDomains: authorization.principal.mode === 'oauth' && resolveTenantDaemonByKey
        ? [requestOrigin(request, env), 'https://open-design.ai']
        : [],
      ...(authorization.principal.mode === 'oauth' && resolveTenantDaemonByKey
        ? {
            transformToolResult: (_toolName: string, result: any) => rewriteManagedTenantResultUrls({
              result,
              subject: authorization.principal.subject,
              publicOrigin: requestOrigin(request, env),
              env,
            }),
          }
        : {}),
    });
    const transport = new StreamableHTTPServerTransport();
    try {
      await server.connect(transport as unknown as Parameters<typeof server.connect>[0]);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Internal MCP error',
          },
          id: null,
        });
      }
    } finally {
      await transport.close().catch(() => {});
      await server.close().catch(() => {});
    }
  });

  app.get('/mcp', (_request, response) => sendMethodNotAllowed(response));
  app.delete('/mcp', (_request, response) => sendMethodNotAllowed(response));
}
