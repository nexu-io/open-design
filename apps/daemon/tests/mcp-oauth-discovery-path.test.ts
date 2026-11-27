import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { beginAuth, deriveCodeChallenge, discoverAuthServer } from '../src/mcp-oauth.js';

describe('MCP OAuth issuer-path discovery', () => {
  let dataDir: string;
  let server: ReturnType<typeof createServer>;
  let origin: string;
  let routes: Map<string, unknown>;
  let requests: Array<{ path: string; method: string; body: string }>;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-oidc-discovery-'));
    routes = new Map();
    requests = [];
    server = createServer(async (request, response) => {
      let body = '';
      for await (const chunk of request) body += chunk;
      requests.push({ path: request.url ?? '', method: request.method ?? '', body });
      const payload = routes.get(request.url ?? '');
      response.writeHead(payload === undefined ? 404 : 200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(payload ?? { error: 'not found' }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (address == null || typeof address === 'string') throw new Error('missing test TCP address');
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dataDir, { recursive: true, force: true });
  });

  function metadata(issuer: string) {
    return {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      registration_endpoint: `${issuer}/register`,
    };
  }

  it.each(['/realms/design', '/realms/design/', '/tenants/%E5%9B%A2%E9%98%9F'])(
    'discovers the OIDC configuration appended to issuer path %s',
    async (issuerPath) => {
      const issuer = `${origin}${issuerPath}`;
      const document = metadata(issuer);
      routes.set(`${issuerPath.replace(/\/+$/, '')}/.well-known/openid-configuration`, document);

      expect(await discoverAuthServer(issuer)).toEqual(document);
    },
  );

  it('uses issuer-path OIDC metadata before falling back to another origin-level document', async () => {
    const issuer = `${origin}/realms/design`;
    const document = metadata(issuer);
    routes.set('/realms/design/.well-known/openid-configuration', document);
    routes.set('/.well-known/openid-configuration', metadata(origin));

    expect(await discoverAuthServer(issuer)).toEqual(document);
    expect(requests.some((request) => request.path === '/.well-known/openid-configuration')).toBe(false);
  });

  it('preserves priority for RFC 8414 OAuth metadata', async () => {
    const issuer = `${origin}/realms/design`;
    const document = metadata(issuer);
    routes.set('/.well-known/oauth-authorization-server/realms/design', document);
    routes.set('/realms/design/.well-known/openid-configuration', metadata(`${origin}/other`));

    expect(await discoverAuthServer(issuer)).toEqual(document);
    expect(requests).toHaveLength(1);
  });

  it('retains the RFC 8414 openid-configuration prefix layout', async () => {
    const issuer = `${origin}/realms/design`;
    const document = metadata(issuer);
    routes.set('/.well-known/openid-configuration/realms/design', document);

    expect(await discoverAuthServer(issuer)).toEqual(document);
  });

  it('requests each metadata URL only once for an origin-only issuer', async () => {
    expect(await discoverAuthServer(origin)).toBeNull();
    expect(requests.map((request) => request.path)).toEqual([
      '/.well-known/oauth-authorization-server',
      '/.well-known/openid-configuration',
    ]);
  });

  it('completes MCP discovery, client registration, and PKCE authorization through an OIDC issuer path', async () => {
    const issuer = `${origin}/realms/design`;
    routes.set('/.well-known/oauth-protected-resource/mcp', {
      resource: `${origin}/mcp`,
      authorization_servers: [issuer],
      scopes_supported: ['design:read'],
    });
    routes.set('/realms/design/.well-known/openid-configuration', metadata(issuer));
    routes.set('/realms/design/register', { client_id: 'test-mcp-client' });
    const input = {
      serverId: 'test-mcp', serverUrl: `${origin}/mcp`, redirectUri: `${origin}/callback`, dataDir,
    };

    const result = await beginAuth(input);

    const authorizeUrl = new URL(result.authorizeUrl);
    expect(authorizeUrl.origin + authorizeUrl.pathname).toBe(`${issuer}/authorize`);
    expect(authorizeUrl.searchParams.get('client_id')).toBe('test-mcp-client');
    expect(authorizeUrl.searchParams.get('scope')).toBe('design:read');
    expect(authorizeUrl.searchParams.get('state')).toBe(result.state);
    expect(authorizeUrl.searchParams.get('code_challenge')).toBe(deriveCodeChallenge(result.pending.codeVerifier));
    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(result.pending.tokenEndpoint).toBe(`${issuer}/token`);
    const registration = requests.find((request) => request.method === 'POST');
    expect(registration?.path).toBe('/realms/design/register');
    expect(JSON.parse(registration?.body ?? '{}').redirect_uris).toEqual([input.redirectUri]);

    await beginAuth(input);
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(1);
  });
});
