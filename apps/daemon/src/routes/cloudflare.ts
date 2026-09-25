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
} from '../deploy.js';
import {
  listCloudflareD1Databases,
  listCloudflareR2Buckets,
} from '../deploy/cloudflare-workers.js';
import {
  PendingAuthCache,
} from '../mcp-oauth.js';
import {
  beginCloudflareAuth,
  completeCloudflareAuth,
  fetchCloudflareUserEmail,
  cloudflareRedirectUri,
  CLOUDFLARE_OAUTH_SCOPES,
  type CompleteCloudflareAuthResult,
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
  setCloudflareOAuthTokenGuarded,
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
 * local client can fail closed at refresh time. The generation is a placeholder
 * — the token store assigns the real monotonic value. */
function buildStoredCloudflareToken(
  result: CompleteCloudflareAuthResult,
  cfg: CloudflareWorkersConfig,
): StoredCloudflareOAuthToken {
  const stored: StoredCloudflareOAuthToken = {
    accessToken: result.access_token,
    tokenType: result.token_type ?? 'Bearer',
    redirectUri: result.redirectUri,
    generation: 0,
    savedAt: Date.now(),
  };
  const accountId = (cfg.accountId ?? '').trim();
  if (result.clientId) stored.clientId = result.clientId;
  if (accountId) stored.accountId = accountId;
  if (result.refresh_token) stored.refreshToken = result.refresh_token;
  if (result.scope) stored.scope = result.scope;
  if (typeof result.expires_in === 'number') {
    stored.expiresAt = Date.now() + result.expires_in * 1000;
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
  // Serializes every credential mutation (persist vs disconnect vs cancel) so
  // the generation check, token write, and config commit form one critical
  // section that a disconnect clear/reset cannot interleave with.
  let credentialMutationTail: Promise<unknown> = Promise.resolve();
  function runCredentialMutation<T>(fn: () => Promise<T>): Promise<T> {
    const run = credentialMutationTail.then(fn, fn);
    credentialMutationTail = run.catch(() => {});
    return run;
  }

  // Persist the token + flip credential authority as ONE serialized mutation so
  // a disconnect (which bumps the generation, clears the token, and resets the
  // mode under the same lock) can never interleave between the token write and
  // the config commit.
  const persistCredential = async (
    result: CompleteCloudflareAuthResult,
    attemptGeneration: number,
    fetchImpl: typeof fetch,
  ): Promise<boolean> => {
    const cfg = await readCloudflareWorkersConfig();
    const dataDir = cloudflareOAuthTokensDir();
    const stored = buildStoredCloudflareToken(result, cfg);
    // Capture the account email NOW, with the token that just authorized, so
    // the Access "only me" rule resolves from the stored record at deploy time
    // instead of discovering after the assets upload that GET /user is not
    // permitted. Best-effort: a client without `user-details.read` still
    // connects; the deploy then falls back to a live lookup and fails closed.
    const email = await fetchCloudflareUserEmail(result.access_token, fetchImpl);
    if (email) stored.email = email;
    return runCredentialMutation(async () => {
      if (attemptGeneration !== oauthAttemptGeneration) return false;
      const prev = await getCloudflareOAuthToken(dataDir);
      const ok = await setCloudflareOAuthTokenGuarded(
        dataDir,
        stored,
        () => attemptGeneration === oauthAttemptGeneration,
      );
      if (!ok) return false;
      try {
        await commitCloudflareOAuthMode({ clientId: result.clientId, redirectUri: result.redirectUri });
        return true;
      } catch (err) {
        // The token write already landed but the config commit failed — restore
        // the prior token so a previously working credential stays usable instead
        // of leaving a token issued to the new client against a config that still
        // names the old identity.
        if (prev) await setCloudflareOAuthToken(dataDir, prev);
        else await clearCloudflareOAuthToken(dataDir);
        throw err;
      }
    });
  };

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

  // Stop the listener only if it is still the one expected points at — a manual
  // /complete must not tear down a listener a newer /start already installed.
  const stopActiveListenerIf = async (expected: CallbackListener | null) => {
    if (!expected || activeListener !== expected) return;
    await stopActiveListener();
  };

  const handleCallback = async (outcome: CallbackOutcome, listener?: CallbackListener): Promise<boolean> => {
    // Only clear activeListener if it is still the listener this callback was
    // created for — a newer /start may have already replaced it.
    if (listener && activeListener === listener) activeListener = null;
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
      const persisted = await persistCredential(
        tokenResp,
        attemptGeneration,
        fetchWithRequestInit(proxyDispatcher.requestInit),
      );
      if (!persisted) {
        console.warn('[cloudflare-oauth] attempt superseded; discarding token');
        return false;
      }
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

    try {
      const cfg = await readCloudflareWorkersConfig();
      // The Connect UI posts the clientId/redirectUri it just collected; on a
      // fresh setup these are not yet in the persisted config, so read the body
      // first (falling back to the config) instead of failing on an empty config.
      const body = (req.body ?? {}) as { clientId?: unknown; redirectUri?: unknown; scopes?: unknown };
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
      // Honor a caller/persisted scope set (least privilege): a narrow BYO
      // client must not be asked for every permission, and a broad request
      // defeats the purpose. Validate as a non-empty array of non-empty
      // strings; fall back to the default only when none is configured.
      // beginCloudflareAuth merges offline_access regardless.
      const requestedScopes = Array.isArray(body.scopes) ? body.scopes : cfg.scopes;
      const scopes =
        Array.isArray(requestedScopes) &&
        requestedScopes.length > 0 &&
        requestedScopes.every((scope) => typeof scope === 'string' && scope.trim().length > 0)
          ? requestedScopes.map((scope) => String(scope).trim())
          : CLOUDFLARE_OAUTH_SCOPES;
      let authorizeUrl = '';
      let state = '';
      let callbackHost = '';
      let callbackPort = 0;
      // Serialize the FULL attempt transition (stop prior listener, bump
      // generation, evict stale PKCE state, mint new state, install the new
      // listener) so two overlapping /start calls can never race to bind :56122.
      await runCredentialMutation(async () => {
        await stopActiveListener();
        oauthAttemptGeneration += 1;
        pendingAuth.clear();
        const begun = beginCloudflareAuth({ pending: pendingAuth, clientId, redirectUri, scopes });
        authorizeUrl = begun.authorizeUrl;
        state = begun.state;
        const listenerRef: { current: CallbackListener | null } = { current: null };
        const listener = await startCallbackListener({
          expectedState: state,
          onCallback: (o) => handleCallback(o, listenerRef.current ?? undefined),
        });
        listenerRef.current = listener;
        activeListener = listener;
        callbackHost = listener.address.host;
        callbackPort = listener.address.port;
      });
      console.log(
        `[cloudflare-oauth] start ok state=${state.slice(0, 8)}… listener=${callbackHost}:${callbackPort}`,
      );
      res.json({
        authorizeUrl,
        state,
        callback: { host: callbackHost, port: callbackPort },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[cloudflare-oauth] start failed:', msg);
      // No cleanup here: stopActiveListener already ran inside the mutation,
      // and a failed bind never assigns activeListener. A second queued stop
      // could tear down a newer attempt's listener that a concurrent /start
      // installed after this mutation rejected.
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
    const myListener = activeListener;
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
      const persisted = await persistCredential(
        tokenResp,
        attemptGeneration,
        fetchWithRequestInit(proxyDispatcher.requestInit),
      );
      if (!persisted) {
        console.warn('[cloudflare-oauth] attempt superseded; discarding token');
        return res
          .status(409)
          .json({ error: 'Cloudflare OAuth attempt was cancelled or superseded — restart the connection.' });
      }
      // We won the race against the loopback listener (or it was never going
      // to resolve); shut it down so the next /start has a clean slate — but
      // only if a newer /start hasn't already replaced it.
      await stopActiveListenerIf(myListener);
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
        return res.json({ connected: false, refreshable: false, listening: activeListener !== null });
      }
      // `refreshable` lets the client tell an ordinary access-token expiry (the
      // daemon refreshes silently on the next call) from a credential that
      // genuinely needs a Reconnect; `savedAt` changes on every persist, so a
      // Reconnect poll can wait for a NEW token rather than the still-present
      // old one.
      res.json({
        connected: true,
        expiresAt: tok.expiresAt ?? null,
        refreshable: Boolean(tok.refreshToken),
        scope: tok.scope ?? null,
        accountId: tok.accountId ?? null,
        email: tok.email ?? null,
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
      await runCredentialMutation(async () => {
        await stopActiveListener();
        oauthAttemptGeneration += 1;
        pendingAuth.clear();
      });
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
      await runCredentialMutation(async () => {
        await stopActiveListener();
        oauthAttemptGeneration += 1;
        pendingAuth.clear();
        await clearCloudflareOAuthToken(cloudflareOAuthTokensDir());
        // Reset the credential authority back to a static token so a disconnected
        // profile doesn't keep reporting 'configured' with no live token.
        await resetCloudflareCredentialMode();
      });
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
