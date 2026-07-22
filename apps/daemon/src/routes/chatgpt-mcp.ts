import { timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Express, Request, Response as ExpressResponse } from 'express';
import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';

import { chatGptV1RequiredScopes, createOpenDesignMcpServer } from '../mcp.js';

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
  transformTenantToolResult?: (
    principal: ChatGptMcpPrincipal,
    toolName: string,
    result: any,
    publicBaseUrl: string,
  ) => any | Promise<any>;
  fetchTenantPreview?: (
    token: string,
    pathAndSearch: string,
    headers: Headers,
  ) => Promise<globalThis.Response>;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export interface ChatGptMcpPrincipal {
  mode: 'loopback' | 'development' | 'static' | 'oauth';
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
  return [String(env.OD_PUBLIC_BASE_URL ?? ''), ...String(env.OD_CHATGPT_WIDGET_FRAME_DOMAINS ?? '').split(',')]
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
    const record = message as { method?: unknown; params?: { name?: unknown } };
    if (record.method === 'resources/list' || record.method === 'resources/read') {
      scopes.add('opendesign.catalog.read');
      continue;
    }
    if (record.method !== 'tools/call') continue;
    for (const scope of chatGptV1RequiredScopes(String(record.params?.name ?? ''))) scopes.add(scope);
  }
  return scopes;
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

export function rewriteManagedChatGptToolResult(input: {
  result: any;
  subject: string;
  publicBaseUrl: string;
  rewritePreviewUrl: (internalUrl: string, publicBaseUrl: string) => string;
  studioUrlTemplate?: string;
}): any {
  const source = input.result?.structuredContent;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return input.result;
  const structuredContent = { ...source } as Record<string, unknown>;
  if (typeof structuredContent.previewUrl === 'string') {
    try {
      structuredContent.previewUrl = input.rewritePreviewUrl(
        structuredContent.previewUrl,
        input.publicBaseUrl,
      );
    } catch {
      delete structuredContent.previewUrl;
    }
  }

  const studioUrl = managedStudioUrl(input.studioUrlTemplate, input.subject, structuredContent);
  if (studioUrl) {
    structuredContent.studioUrl = studioUrl;
  } else if ('studioUrl' in structuredContent) {
    delete structuredContent.studioUrl;
    structuredContent.studioAvailable = false;
    const suffix = 'Full editing will become available after tenant-aware Open Design Studio routing is configured.';
    structuredContent.hint = typeof structuredContent.hint === 'string'
      ? `${structuredContent.hint} ${suffix}`
      : suffix;
  }

  return {
    ...input.result,
    structuredContent,
    content: Array.isArray(input.result.content)
      ? input.result.content.map((item: any) => item?.type === 'text'
        ? { ...item, text: JSON.stringify(structuredContent, null, 2) }
        : item)
      : input.result.content,
  };
}

function managedStudioUrl(
  template: string | undefined,
  subject: string,
  result: Record<string, unknown>,
): string | null {
  const configured = String(template ?? '').trim();
  if (!configured) return null;
  const values: Record<string, string> = {
    sub: subject,
    projectId: typeof result.projectId === 'string' ? result.projectId : '',
    conversationId: typeof result.conversationId === 'string' ? result.conversationId : '',
    entryFile: typeof result.entryFile === 'string' ? result.entryFile : '',
  };
  const resolved = configured.replace(/\{(sub|projectId|conversationId|entryFile)\}/gu, (
    _match,
    key: keyof typeof values,
  ) => encodeURIComponent(values[key] ?? ''));
  if (/\{[^}]+\}/u.test(resolved)) return null;
  try {
    const url = new URL(resolved);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
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
    transformTenantToolResult,
    fetchTenantPreview,
    env = process.env,
    fetchImpl = fetch,
  }: RegisterChatGptMcpRoutesDeps,
): void {
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

  app.get('/chatgpt/preview/:token/*path', async (request, response) => {
    if (!fetchTenantPreview) {
      response.status(404).json({ error: 'preview_not_found' });
      return;
    }
    const wildcard = request.params.path;
    const wildcardPath = `/${Array.isArray(wildcard) ? wildcard.join('/') : String(wildcard ?? '')}`;
    const queryIndex = request.originalUrl.indexOf('?');
    const pathAndSearch = queryIndex >= 0
      ? `${wildcardPath}${request.originalUrl.slice(queryIndex)}`
      : wildcardPath;
    let upstream: globalThis.Response;
    try {
      const forwardedHeaders = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) forwardedHeaders.set(name, value.join(', '));
        else if (value !== undefined) forwardedHeaders.set(name, value);
      }
      upstream = await fetchTenantPreview(
        String(request.params.token ?? ''),
        pathAndSearch,
        forwardedHeaders,
      );
    } catch {
      response.status(502).json({ error: 'preview_unavailable' });
      return;
    }
    response.status(upstream.status);
    for (const name of ['accept-ranges', 'cache-control', 'content-range', 'content-type', 'etag', 'last-modified']) {
      const value = upstream.headers.get(name);
      if (value) response.setHeader(name, value);
    }
    if (!upstream.body) {
      response.end();
      return;
    }
    Readable.fromWeb(upstream.body as any)
      .on('error', () => response.destroy())
      .pipe(response);
  });

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
      widgetFrameDomains: widgetFrameDomains(env),
      ...(transformTenantToolResult
        ? {
            transformToolResult: (toolName, result) => transformTenantToolResult(
              authorization.principal,
              toolName,
              result,
              requestOrigin(request, env),
            ),
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
