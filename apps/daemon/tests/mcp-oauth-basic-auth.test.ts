import { once } from 'node:events';
import { createServer } from 'node:http';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { exchangeCodeForToken, refreshAccessToken } from '../src/mcp-oauth.js';

describe('MCP OAuth client-password authentication', () => {
  let server: ReturnType<typeof createServer>;
  let tokenEndpoint: string;
  let expectedAuthorization: string | undefined;
  let received: Array<{ authorization: string | undefined; body: string; method: string | undefined }>;

  beforeEach(async () => {
    expectedAuthorization = undefined;
    received = [];
    server = createServer(async (request, response) => {
      let body = '';
      for await (const chunk of request) body += chunk;
      received.push({ authorization: request.headers.authorization, body, method: request.method });
      const accepted = request.headers.authorization === expectedAuthorization;
      response.writeHead(accepted ? 200 : 401, { 'content-type': 'application/json' });
      response.end(JSON.stringify(accepted
        ? { access_token: 'synthetic-access-token', token_type: 'Bearer' }
        : { error: 'invalid_client' }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (address == null || typeof address === 'string') throw new Error('missing test TCP address');
    tokenEndpoint = `http://127.0.0.1:${address.port}/token`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function invoke(grant: 'authorization_code' | 'refresh_token', clientId: string, clientSecret?: string) {
    const common = { tokenEndpoint, clientId, ...(clientSecret === undefined ? {} : { clientSecret }) };
    return grant === 'authorization_code'
      ? exchangeCodeForToken({
        ...common, redirectUri: 'http://app.example/callback', code: 'test-code', codeVerifier: 'test-verifier',
      })
      : refreshAccessToken({ ...common, refreshToken: 'test-refresh' });
  }

  for (const grant of ['authorization_code', 'refresh_token'] as const) {
    it.each([
      {
        name: 'reserved characters',
        clientId: 'design:client+one',
        clientSecret: 'secret+ with:%/&=',
        basic: 'design%3Aclient%2Bone:secret%2B+with%3A%25%2F%26%3D',
      },
      {
        name: 'Unicode characters',
        clientId: '设计团队',
        clientSecret: '密钥 🔐',
        basic: '%E8%AE%BE%E8%AE%A1%E5%9B%A2%E9%98%9F:%E5%AF%86%E9%92%A5+%F0%9F%94%90',
      },
      {
        name: 'plain credentials',
        clientId: 'client-id_1',
        clientSecret: 'secret._-*123',
        basic: 'client-id_1:secret._-*123',
      },
    ])(`${grant} authenticates $name with form-encoded Basic credentials`, async (credential) => {
      expectedAuthorization = `Basic ${Buffer.from(credential.basic).toString('base64')}`;

      const result = await invoke(grant, credential.clientId, credential.clientSecret);

      expect(result.access_token).toBe('synthetic-access-token');
      expect(received).toHaveLength(1);
      const params = new URLSearchParams(received[0]?.body);
      expect(params.get('client_id')).toBe(credential.clientId);
      expect(params.get('grant_type')).toBe(grant);
      expect(params.has('client_secret')).toBe(false);
      expect(received[0]?.method).toBe('POST');
    });

    it(`${grant} omits Basic authentication for a public client`, async () => {
      const result = await invoke(grant, 'public-client');

      expect(result.access_token).toBe('synthetic-access-token');
      expect(received[0]?.authorization).toBeUndefined();
    });
  }
});
