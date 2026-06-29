import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { PendingAuthCache } from '../../../src/mcp-oauth.js';
import {
  XAI_OAUTH_AUTHORIZATION_ENDPOINT,
  XAI_OAUTH_CLIENT_ID,
  XAI_OAUTH_REDIRECT_PORT,
  XAI_OAUTH_SCOPE,
  XAI_OAUTH_TOKEN_ENDPOINT,
  XAI_PROVIDER_ID,
  beginXAIAuth,
  completeXAIAuth,
  refreshXAIToken,
  xaiRedirectUri,
} from '../../../src/integrations/xai-oauth.js';

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function makeFetch(
  handler: (url: string, init?: FetchInit) => Promise<Response> | Response,
) {
  return async (input: FetchInput, init?: FetchInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    return handler(url, init);
  };
}

describe('xaiRedirectUri', () => {
  it('matches the loopback / port hermes-agent uses', () => {
    expect(xaiRedirectUri()).toBe(
      `http://127.0.0.1:${XAI_OAUTH_REDIRECT_PORT}/callback`,
    );
  });
});

describe('beginXAIAuth', () => {
  it('builds an authorize URL with PKCE, state, and the configured scope', () => {
    const pending = new PendingAuthCache();
    try {
      const { authorizeUrl, state } = beginXAIAuth({ pending });

      const u = new URL(authorizeUrl);
      expect(u.origin + u.pathname).toBe(XAI_OAUTH_AUTHORIZATION_ENDPOINT);
      expect(u.searchParams.get('response_type')).toBe('code');
      expect(u.searchParams.get('client_id')).toBe(XAI_OAUTH_CLIENT_ID);
      expect(u.searchParams.get('redirect_uri')).toBe(xaiRedirectUri());
      expect(u.searchParams.get('scope')).toBe(XAI_OAUTH_SCOPE);
      expect(u.searchParams.get('code_challenge_method')).toBe('S256');
      const challenge = u.searchParams.get('code_challenge');
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(u.searchParams.get('state')).toBe(state);
    } finally {
      pending.stop();
    }
  });

  it('puts a pending state keyed by `state` whose serverId is "xai"', () => {
    const pending = new PendingAuthCache();
    try {
      const { state } = beginXAIAuth({ pending });
      expect(pending.size()).toBe(1);

      // We don't expose the inner state, but consume() should yield a
      // record with the right serverId and a non-empty verifier.
      const consumed = pending.consume(state);
      expect(consumed).not.toBeNull();
      expect(consumed!.serverId).toBe(XAI_PROVIDER_ID);
      expect(consumed!.codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(consumed!.tokenEndpoint).toBe(XAI_OAUTH_TOKEN_ENDPOINT);
    } finally {
      pending.stop();
    }
  });

  it('produces distinct verifiers / states across calls', () => {
    const pending = new PendingAuthCache();
    try {
      const a = beginXAIAuth({ pending });
      const b = beginXAIAuth({ pending });
      expect(a.state).not.toBe(b.state);
      expect(a.authorizeUrl).not.toBe(b.authorizeUrl);
    } finally {
      pending.stop();
    }
  });

  it('challenge is sha256(verifier) base64url, end-to-end', () => {
    const pending = new PendingAuthCache();
    try {
      const { authorizeUrl, state } = beginXAIAuth({ pending });
      const consumed = pending.consume(state);
      expect(consumed).not.toBeNull();

      const expected = createHash('sha256')
        .update(consumed!.codeVerifier)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
      const actual = new URL(authorizeUrl).searchParams.get('code_challenge');
      expect(actual).toBe(expected);
    } finally {
      pending.stop();
    }
  });
});

describe('completeXAIAuth', () => {
  it('exchanges code for tokens via the xAI token endpoint', async () => {
    const pending = new PendingAuthCache();
    try {
      const { state } = beginXAIAuth({ pending });

      const fakeFetch = makeFetch(async (url, init) => {
        expect(url).toBe(XAI_OAUTH_TOKEN_ENDPOINT);
        const body = String((init as RequestInit).body ?? '');
        const params = new URLSearchParams(body);
        expect(params.get('grant_type')).toBe('authorization_code');
        expect(params.get('client_id')).toBe(XAI_OAUTH_CLIENT_ID);
        expect(params.get('redirect_uri')).toBe(xaiRedirectUri());
        expect(params.get('code')).toBe('auth-code-123');
        expect(params.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]+$/);
        return new Response(
          JSON.stringify({
            access_token: 'access-abc',
            refresh_token: 'refresh-xyz',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      });

      const tokens = await completeXAIAuth({
        pending,
        state,
        code: 'auth-code-123',
        fetchImpl: fakeFetch,
      });
      expect(tokens.access_token).toBe('access-abc');
      expect(tokens.refresh_token).toBe('refresh-xyz');
      expect(tokens.expires_in).toBe(3600);
    } finally {
      pending.stop();
    }
  });

  it('throws when state is unknown', async () => {
    const pending = new PendingAuthCache();
    try {
      await expect(
        completeXAIAuth({
          pending,
          state: 'never-issued',
          code: 'x',
        }),
      ).rejects.toThrow(/state not found/i);
    } finally {
      pending.stop();
    }
  });

  it('throws when state is replayed (one-shot consume)', async () => {
    const pending = new PendingAuthCache();
    try {
      const { state } = beginXAIAuth({ pending });

      const fakeFetch = makeFetch(
        async () =>
          new Response(
            JSON.stringify({ access_token: 'a', token_type: 'Bearer' }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      );

      // First consume succeeds.
      await completeXAIAuth({
        pending,
        state,
        code: 'c',
        fetchImpl: fakeFetch,
      });
      // Second consume of the same state must fail.
      await expect(
        completeXAIAuth({
          pending,
          state,
          code: 'c',
          fetchImpl: fakeFetch,
        }),
      ).rejects.toThrow(/state not found/i);
    } finally {
      pending.stop();
    }
  });

  it('rejects state issued for a different serverId', async () => {
    const pending = new PendingAuthCache();
    try {
      // Hand-craft a pending entry as if some other provider had stashed it.
      pending.put('foreign-state', {
        serverId: 'some-other-provider',
        authServerIssuer: 'https://example.test',
        tokenEndpoint: 'https://example.test/token',
        clientId: 'x',
        redirectUri: 'http://localhost/cb',
        codeVerifier: 'v',
        createdAt: Date.now(),
      });
      await expect(
        completeXAIAuth({
          pending,
          state: 'foreign-state',
          code: 'c',
        }),
      ).rejects.toThrow(/serverId/i);
    } finally {
      pending.stop();
    }
  });
});

describe('refreshXAIToken', () => {
  it('refreshes against the fixed xAI token endpoint and client_id', async () => {
    const fakeFetch = makeFetch(async (url, init) => {
      expect(url).toBe(XAI_OAUTH_TOKEN_ENDPOINT);
      const body = String((init as RequestInit).body ?? '');
      const params = new URLSearchParams(body);
      expect(params.get('grant_type')).toBe('refresh_token');
      expect(params.get('refresh_token')).toBe('rt-1');
      expect(params.get('client_id')).toBe(XAI_OAUTH_CLIENT_ID);
      return new Response(
        JSON.stringify({
          access_token: 'new-access',
          refresh_token: 'rt-2',
          token_type: 'Bearer',
          expires_in: 1800,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const tokens = await refreshXAIToken({
      refreshToken: 'rt-1',
      fetchImpl: fakeFetch,
    });
    expect(tokens.access_token).toBe('new-access');
    expect(tokens.refresh_token).toBe('rt-2');
  });

  it('surfaces token-endpoint errors with the body included', async () => {
    const fakeFetch = makeFetch(
      async () =>
        new Response('{"error":"invalid_grant"}', {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    );

    await expect(
      refreshXAIToken({ refreshToken: 'expired', fetchImpl: fakeFetch }),
    ).rejects.toThrow(/HTTP 400/);
  });
});
