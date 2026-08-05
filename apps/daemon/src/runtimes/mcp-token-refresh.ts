import type { OAuthTokenResponse, RefreshTokenInput } from '../mcp-oauth.js';
import type { StoredMcpToken } from '../mcp-tokens.js';

export interface McpTokenRefreshDeps {
  refreshAccessToken(input: RefreshTokenInput): Promise<OAuthTokenResponse>;
  setToken(dataDir: string, serverId: string, token: StoredMcpToken): Promise<void>;
}

export interface RefreshableMcpToken extends StoredMcpToken {
  refreshToken: string;
}

/** Refresh and persist one MCP token while keeping OAuth and storage injectable. */
export function createMcpTokenRefresher({
  refreshAccessToken,
  setToken,
}: McpTokenRefreshDeps) {
  return async function refreshAndPersistMcpToken(
    dataDir: string,
    serverId: string,
    current: RefreshableMcpToken,
  ): Promise<StoredMcpToken | null> {
    if (!current.tokenEndpoint || !current.clientId) return null;

    const refreshInput: RefreshTokenInput = {
      tokenEndpoint: current.tokenEndpoint,
      clientId: current.clientId,
      refreshToken: current.refreshToken,
    };
    if (current.clientSecret !== undefined) refreshInput.clientSecret = current.clientSecret;
    if (current.scope !== undefined) refreshInput.scope = current.scope;
    if (current.resourceUrl !== undefined) refreshInput.resource = current.resourceUrl;

    const tokenResp = await refreshAccessToken(refreshInput);
    const next: StoredMcpToken = {
      accessToken: tokenResp.access_token,
      refreshToken: tokenResp.refresh_token ?? current.refreshToken,
      tokenType: tokenResp.token_type ?? 'Bearer',
      savedAt: Date.now(),
      tokenEndpoint: current.tokenEndpoint,
      clientId: current.clientId,
    };
    const scope = tokenResp.scope ?? current.scope;
    if (scope !== undefined) next.scope = scope;
    if (typeof tokenResp.expires_in === 'number') {
      next.expiresAt = Date.now() + tokenResp.expires_in * 1000;
    }
    if (current.clientSecret !== undefined) next.clientSecret = current.clientSecret;
    if (current.authServerIssuer !== undefined) next.authServerIssuer = current.authServerIssuer;
    if (current.redirectUri !== undefined) next.redirectUri = current.redirectUri;
    if (current.resourceUrl !== undefined) next.resourceUrl = current.resourceUrl;
    await setToken(dataDir, serverId, next);
    return next;
  };
}
