import { describe, expect, it, vi } from 'vitest';
import { createMcpTokenRefresher } from '../../src/runtimes/mcp-token-refresh.js';

const current = {
  accessToken: 'expired-access',
  refreshToken: 'old-refresh',
  tokenType: 'Bearer',
  savedAt: 1,
  tokenEndpoint: 'https://auth.example.test/token',
  clientId: 'client-1',
  clientSecret: 'secret-1',
  scope: 'read write',
  authServerIssuer: 'https://auth.example.test',
  redirectUri: 'http://127.0.0.1/callback',
  resourceUrl: 'https://mcp.example.test',
} as const;

describe('MCP token refresh boundary', () => {
  it('refreshes with persisted OAuth context and stores the rotated token', async () => {
    const refreshAccessToken = vi.fn(async () => ({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'read',
    }));
    const setToken = vi.fn(async () => undefined);
    const refresh = createMcpTokenRefresher({ refreshAccessToken, setToken });

    const result = await refresh('/data', 'server-1', current);

    expect(refreshAccessToken).toHaveBeenCalledWith({
      tokenEndpoint: current.tokenEndpoint,
      clientId: current.clientId,
      clientSecret: current.clientSecret,
      refreshToken: current.refreshToken,
      scope: current.scope,
      resource: current.resourceUrl,
    });
    expect(setToken).toHaveBeenCalledWith('/data', 'server-1', result);
    expect(result).toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      scope: 'read',
      tokenEndpoint: current.tokenEndpoint,
      clientId: current.clientId,
    });
    expect(result?.expiresAt).toBeGreaterThan(Date.now());
  });

  it('does not call OAuth or storage when the persisted client context is incomplete', async () => {
    const refreshAccessToken = vi.fn();
    const setToken = vi.fn();
    const refresh = createMcpTokenRefresher({ refreshAccessToken, setToken });

    const { clientId: _clientId, ...withoutClientId } = current;
    const result = await refresh('/data', 'server-1', withoutClientId);

    expect(result).toBeNull();
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(setToken).not.toHaveBeenCalled();
  });
});
