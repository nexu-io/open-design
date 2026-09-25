// Daemon-owned routes for the Cloudflare OAuth flow.
//
// Mirrors apps/daemon/src/routes/xai.ts in shape, but the redirect lands on
// the Cloudflare loopback listener (127.0.0.1:56122) instead of the daemon's
// main HTTP port, because the loopback redirect_uri is registered with the
// user's own Cloudflare OAuth client.
//
// Endpoints:
//   POST /api/cloudflare/oauth/start       — mint PKCE state, open :56122
//                                             listener, return authorize URL
//   POST /api/cloudflare/oauth/complete    — manual paste-back of {state, code}
//                                             when the provider shows a code
//                                             instead of redirecting
//   POST /api/cloudflare/oauth/cancel      — stop the in-flight :56122 listener
//                                             without touching any stored token
//                                             (UI Cancel button)
//   GET  /api/cloudflare/auth/status       — has-token / expiry / in-flight bit
//   POST /api/cloudflare/oauth/disconnect  — wipe stored token, stop listener

import type { Express } from 'express';

import { proxyDispatcherRequestInit } from '../connectionTest.js';
import {
  cloudflareOAuthTokensDir,
  commitCloudflareOAuthMode,
  getCloudflareAccessToken,
  readCloudflareWorkersConfig,
  resetCloudflareCredentialMode,
  writeCloudflareOAuthIdentity,
} from '../deploy.js';
import {
  listCloudflareD1Databases,
  listCloudflareR2Buckets,
} from '../deploy/cloudflare-workers.js';
import {
  type OAuthTokenResponse,
  PendingAuthCache,
} from '../mcp-oauth.js';
import {
  beginCloudflareAuth,
  completeCloudflareAuth,
  cloudflareRedirectUri,
  CLOUDFLARE_OAUTH_SCOPES,
} from '../integrations/cloudflare-oauth.js';
import {
  startCallbackListener,
  type CallbackListener,
  type CallbackOutcome,
} from '../integrations/cloudflare-oauth-server.js';
import {
  clearCloudflareOAuthToken,
  getCloudflareOAuthToken,
  setCloudflareOAuthToken,
  type StoredCloudflareOAuthToken,
} from '../integrations/cloudflare-tokens.js';
import type { RouteDeps } from '../server-context.js';

export interface RegisterCloudflareRoutesDeps extends RouteDeps<'http' | 'paths'> {}

type CloudflareWorkersConfig = Awaited<
  ReturnType<typeof readCloudflareWorkersConfig>
>;

function fetchWithRequestInit(
  requestInit: Pick<RequestInit, 'dispatcher'>,
): typeof fetch {
  return (input, init) => fetch(input, { ...init, ...requestInit });
}

/** Build the persisted token record from a token-endpoint response, carrying
 * the client/redirect identity (and account) that authorized it so a changed
 * local client can fail closed at refresh time. */
function buildStoredCloudflareToken(
  tokenResp: OAuthTokenResponse,
  cfg: CloudflareWorkersConfig,
  prevGeneration: number | undefined,
): StoredCloudflareOAuthToken {
  const stored: StoredCloudflareOAuthToken = {
    accessToken: tokenResp.access_token,
    tokenType: tokenResp.token_type ?? 'Bearer',
    redirectUri: (cfg.redirectUri ?? '').trim() || cloudflareRedirectUri(),
    generation: (prevGeneration ?? 0) + 1,
    savedAt: Date.now(),
  };
  const clientId = (cfg.clientId ?? '').trim();
  const accountId = (cfg.accountId ?? '').trim();
  if (clientId) stored.clientId = clientId;
  if (accountId) stored.accountId = accountId;
  if (tokenResp.refresh_token) stored.refreshToken = tokenResp.refresh_token;
  if (tokenResp.scope) stored.scope = tokenResp.scope;
  if (typeof tokenResp.expires_in === 'number') {
    stored.expiresAt = Date.now() + tokenResp.expires_in * 1000;
  }
  return stored;
}

export function registerCloudflareRoutes(
  app: Express,
  ctx: RegisterCloudflareRoutesDeps,
) {
  const { isLocalSameOrigin, resolvedPortRef } = ctx.http;
  const getResolvedPort = () => resolvedPortRef.current;

  // Match the loopback listener's 30 min self-close timeout so the PKCE
  // state, the open :56122 socket, and the paste-back UI all expire together.
  const pendingAuth = new PendingAuthCache(30 * 60 * 1000);
  let activeListener: CallbackListener | null = null;
  // Monotonic attempt generation: bumped on start/disconnect/cancel so a slow
  // token exchange cannot persist a token after the user cancelled, disconnected,
  // or restarted the flow (see handleCallback's pre-persist generation check).
  let oauthAttemptGeneration = 0;

  const stopActiveListener = async () => {
    const cur = activeListener;
    activeListener = null;
    if (!cur) return;
    try {
      await cur.stop();
    } catch {
      // Best-effort; the listener self-closes on completion / timeout anyway.
    }
  };

  const handleCallback = async (outcome: CallbackOutcome): Promise<boolean> => {
    activeListener = null;
    if (outcome.kind !== 'ok') {
      console.warn(`[cloudflare-oauth] callback failed: ${outcome.error}`);
      return false;
    }
    // Capture the attempt generation so a concurrent disconnect/start (which
    // bumps it) aborts this exchange before it can persist a stale token.
    const attemptGeneration = oauthAttemptGeneration;
    const proxyDispatcher = proxyDispatcherRequestInit(process.env);
    try {
      const tokenResp = await completeCloudflareAuth({
        pending: pendingAuth,
        state: outcome.state,
        code: outcome.code,
        fetchImpl: fetchWithRequestInit(proxyDispatcher.requestInit),
      });
      if (attemptGeneration !== oauthAttemptGeneration) {
        // The attempt was cancelled, disconnected, or replaced while the token
        // endpoint was in flight — do not persist a token the user already
        // abandoned.
        console.warn('[cloudflare-oauth] attempt superseded; discarding token');
        return false;
      }
      const cfg = await readCloudflareWorkersConfig();
      const dataDir = cloudflareOAuthTokensDir();
      const existing = await getCloudflareOAuthToken(dataDir);
      const stored = buildStoredCloudflareToken(
        tokenResp,
        cfg,
        existing?.generation,
      );
      await setCloudflareOAuthToken(dataDir, stored);
      // Only now — with the token durable — switch the credential authority to
      // OAuth, so a denied/closed/cancelled flow never strands a token-mode user.
      await commitCloudflareOAuthMode();
      console.log('[cloudflare-oauth] token stored');
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[cloudflare-oauth] token exchange failed:', msg);
      return false;
    } finally {
      await proxyDispatcher.close();
    }
  };

  app.post('/api/cloudflare/oauth/start', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    // Only one OAuth dance can be in flight at a time — :56122 is singleton.
    await stopActiveListener();
    oauthAttemptGeneration += 1;

    try {
      const cfg = await readCloudflareWorkersConfig();
      // The Connect UI posts the clientId/redirectUri it just collected; on a
      // fresh setup these are not yet in the persisted config, so read the body
      // first (falling back to the config) instead of failing on an empty config.
      const body = (req.body ?? {}) as { clientId?: unknown; redirectUri?: unknown };
      const bodyClientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
      const bodyRedirectUri = typeof body.redirectUri === 'string' ? body.redirectUri.trim() : '';
      const clientId = bodyClientId || (cfg.clientId ?? '').trim();
      if (!clientId) {
        return res.status(400).json({
          error:
            'Cloudflare OAuth client ID is required — add it in Settings before connecting.',
        });
      }
      const redirectUri =
        bodyRedirectUri || (cfg.redirectUri ?? '').trim() || cloudflareRedirectUri();
      // The callback listener is fixed to the loopback URI — an arbitrary
      // redirect_uri would send the authorization code somewhere the daemon is
      // not listening, so reject it before any OAuth state is created.
      const expectedRedirectUri = cloudflareRedirectUri();
      if (redirectUri !== expectedRedirectUri) {
        return res.status(400).json({
          error: `Cloudflare OAuth redirect URI must be ${expectedRedirectUri} — the daemon callback listener is fixed to it.`,
        });
      }
      // Persist the identity now so the callback handler + refresh path (which
      // re-read the persisted config) carry the same clientId/redirectUri that
      // authorized this flow.
      await writeCloudflareOAuthIdentity({ clientId, redirectUri });
      // Always request the full set in one connect so the D1/R2/zones pickers
      // populate and Access gating works without a manual scope dance.
      const scopes = CLOUDFLARE_OAUTH_SCOPES;
      const { authorizeUrl, state } = beginCloudflareAuth({
        pending: pendingAuth,
        clientId,
        redirectUri,
        scopes,
      });
      // Open the one-shot listener BEFORE returning so the client can navigate
      // the browser to authorizeUrl without racing startup.
      activeListener = await startCallbackListener({
        expectedState: state,
        onCallback: handleCallback,
      });
      console.log(
        `[cloudflare-oauth] start ok state=${state.slice(0, 8)}… listener=${activeListener.address.host}:${activeListener.address.port}`,
      );
      res.json({
        authorizeUrl,
        state,
        callback: {
          host: activeListener.address.host,
          port: activeListener.address.port,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[cloudflare-oauth] start failed:', msg);
      await stopActiveListener();
      res.status(502).json({ error: msg });
    }
  });

  app.post('/api/cloudflare/oauth/complete', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    const state =
      typeof req.body?.state === 'string' ? req.body.state.trim() : '';
    const code =
      typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!state || !code) {
      return res
        .status(400)
        .json({ error: 'state and code are required' });
    }
    // Capture the attempt generation so a concurrent cancel/disconnect/start
    // (which bumps it) aborts this exchange before it can persist a token the
    // user already abandoned — the same fence the loopback callback enforces.
    const attemptGeneration = oauthAttemptGeneration;
    const proxyDispatcher = proxyDispatcherRequestInit(process.env);
    try {
      const tokenResp = await completeCloudflareAuth({
        pending: pendingAuth,
        state,
        code,
        fetchImpl: fetchWithRequestInit(proxyDispatcher.requestInit),
      });
      if (attemptGeneration !== oauthAttemptGeneration) {
        console.warn('[cloudflare-oauth] attempt superseded; discarding token');
        return res
          .status(409)
          .json({ error: 'Cloudflare OAuth attempt was cancelled or superseded — restart the connection.' });
      }
      const cfg = await readCloudflareWorkersConfig();
      const dataDir = cloudflareOAuthTokensDir();
      const existing = await getCloudflareOAuthToken(dataDir);
      const stored = buildStoredCloudflareToken(
        tokenResp,
        cfg,
        existing?.generation,
      );
      await setCloudflareOAuthToken(dataDir, stored);
      // Only now — with the token durable — switch the credential authority to
      // OAuth, mirroring the loopback callback path.
      await commitCloudflareOAuthMode();
      // We won the race against the loopback listener (or it was never going
      // to resolve); shut it down so the next /start has a clean slate.
      await stopActiveListener();
      console.log('[cloudflare-oauth] manual paste-back ok, token stored');
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[cloudflare-oauth] manual complete failed:', msg);
      res.status(400).json({ error: msg });
    } finally {
      await proxyDispatcher.close();
    }
  });

  app.get('/api/cloudflare/auth/status', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const tok = await getCloudflareOAuthToken(cloudflareOAuthTokensDir());
      if (!tok) {
        return res.json({ connected: false, listening: activeListener !== null });
      }
      res.json({
        connected: true,
        expiresAt: tok.expiresAt ?? null,
        scope: tok.scope ?? null,
        accountId: tok.accountId ?? null,
        savedAt: tok.savedAt,
        listening: activeListener !== null,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/cloudflare/oauth/cancel', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    // Cancel only stops the in-flight loopback listener. It must NOT wipe the
    // stored token — a user clicking Cancel mid-Reconnect would otherwise lose
    // their existing grant. Disconnect is the destructive path; this one only
    // releases the singleton :56122 port.
    try {
      await stopActiveListener();
      oauthAttemptGeneration += 1;
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/cloudflare/oauth/disconnect', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      await stopActiveListener();
      oauthAttemptGeneration += 1;
      await clearCloudflareOAuthToken(cloudflareOAuthTokensDir());
      // Reset the credential authority back to a static token so a disconnected
      // profile doesn't keep reporting 'configured' with no live token.
      await resetCloudflareCredentialMode();
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // List the account's R2 buckets / D1 databases using the live Workers
  // credential (static token or rotating OAuth access token), so the bindings
  // editor can offer name-based pickers. Missing account ID, an unconfigured
  // credential, or a not-enabled resource resolves to an empty list so the UI
  // can fall back to free-text input instead of erroring out.
  app.get('/api/cloudflare/resources/r2-buckets', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const cfg = await readCloudflareWorkersConfig();
      const accountId = (cfg.accountId ?? '').trim();
      if (!accountId) return res.json({ buckets: [] });
      const token = await getCloudflareAccessToken();
      const buckets = await listCloudflareR2Buckets(token, accountId);
      res.json({ buckets });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[cloudflare-resources] r2-buckets failed:', msg);
      res.json({ buckets: [] });
    }
  });

  app.get('/api/cloudflare/resources/d1-databases', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const cfg = await readCloudflareWorkersConfig();
      const accountId = (cfg.accountId ?? '').trim();
      if (!accountId) return res.json({ databases: [] });
      const token = await getCloudflareAccessToken();
      const databases = await listCloudflareD1Databases(token, accountId);
      res.json({ databases });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[cloudflare-resources] d1-databases failed:', msg);
      res.json({ databases: [] });
    }
  });
}
