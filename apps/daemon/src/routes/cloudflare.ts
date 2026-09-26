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
  revokeCloudflareToken,
  validateCloudflareOAuthScopes,
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

// A fetch bound to the proxy dispatcher and, when given, to a per-request
// budget. The budget is a default: a caller that passes its own `signal`
// (the revoke does) keeps it.
function fetchWithRequestInit(
  requestInit: Pick<RequestInit, 'dispatcher'>,
  timeoutMs?: number,
): typeof fetch {
  return (input, init) =>
    fetch(input, { ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}), ...init, ...requestInit });
}

// Upper bound on the best-effort revoke call a disconnect makes: it runs inside
// the credential mutation, so a hung token endpoint must not hold every other
// OAuth mutation hostage.
const CLOUDFLARE_REVOKE_TIMEOUT_MS = 10_000;
// Budget for each call of the connect path — the code exchange at the token
// endpoint and the GET /user email capture. Without it a stalled endpoint (or
// a half-open connection through the user's proxy) hung the exchange forever:
// the callback never answered, the listener stayed bound, and the persisted
// state never resolved. A timeout is a failed exchange like any other.
export const CLOUDFLARE_OAUTH_EXCHANGE_TIMEOUT_MS = 20_000;

function describeExchangeError(err: unknown): string {
  if ((err as { name?: unknown } | null)?.name === 'TimeoutError') {
    return 'Cloudflare did not answer within ' + Math.round(CLOUDFLARE_OAUTH_EXCHANGE_TIMEOUT_MS / 1000) + 's; the token exchange was abandoned.';
  }
  return err instanceof Error ? err.message : String(err);
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
  // A listener whose redirect already arrived. It is no longer "active" (the
  // status poll and a manual /complete must not treat it as awaiting a
  // callback) but it still holds :56122 until its self-close lands AFTER the
  // token exchange. A /start in that window must drain it before binding, or
  // the bind fails EADDRINUSE and the user is told to close "another process".
  let drainingListener: CallbackListener | null = null;
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
  // Best-effort: a grant the daemon will NOT keep — its attempt was cancelled,
  // disconnected, or superseded while the token endpoint was in flight, or the
  // config commit after the token write failed and the prior credential was
  // restored — is revoked at Cloudflare before it is forgotten, so an issued
  // refresh token does not stay valid with nobody holding it. Never fails the
  // caller: a transport failure, a timeout, or a refusal is logged and the
  // discard proceeds regardless.
  const revokeGrantBestEffort = async (
    grant: { refreshToken?: string; accessToken?: string; clientId?: string },
    fetchImpl: typeof fetch,
    what: string,
  ): Promise<void> => {
    const token = grant.refreshToken || grant.accessToken;
    if (!token) return;
    const tokenTypeHint = grant.refreshToken ? 'refresh_token' : 'access_token';
    const clientId = (grant.clientId ?? '').trim();
    try {
      const ok = await revokeCloudflareToken({
        token,
        tokenTypeHint,
        ...(clientId ? { clientId } : {}),
        fetchImpl,
        signal: AbortSignal.timeout(CLOUDFLARE_REVOKE_TIMEOUT_MS),
      });
      if (!ok) console.warn(`[cloudflare-oauth] revoke of ${what} grant refused by Cloudflare`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[cloudflare-oauth] revoke of ${what} grant failed:`, msg);
    }
  };

  // Errors thrown out of persistCredential AFTER it already revoked the grant
  // this attempt minted (the config-commit failure path). The route handlers
  // revoke on any other throw; this set keeps the two from double-revoking.
  const grantAlreadyRevoked = new WeakSet<object>();
  const markGrantRevoked = (err: unknown): void => {
    if (typeof err === 'object' && err !== null) grantAlreadyRevoked.add(err);
  };
  const wasGrantRevoked = (err: unknown): boolean =>
    typeof err === 'object' && err !== null && grantAlreadyRevoked.has(err);

  const revokeDiscardedGrant = (tokenResp: CompleteCloudflareAuthResult, fetchImpl: typeof fetch): Promise<void> =>
    revokeGrantBestEffort(
      {
        ...(tokenResp.refresh_token ? { refreshToken: tokenResp.refresh_token } : {}),
        accessToken: tokenResp.access_token,
        ...(tokenResp.clientId ? { clientId: tokenResp.clientId } : {}),
      },
      fetchImpl,
      'discarded',
    );

  // Whether a credential a successful reconnect just replaced holds a grant of
  // its own that must be revoked: one that still exists, and whose token is
  // not the very token now stored (a provider that hands the same refresh
  // token back would otherwise have its live grant revoked).
  const supersededGrantOf = (
    prev: StoredCloudflareOAuthToken | null,
    stored: StoredCloudflareOAuthToken,
  ): StoredCloudflareOAuthToken | null => {
    if (!prev) return null;
    const prevToken = prev.refreshToken || prev.accessToken;
    const storedToken = stored.refreshToken || stored.accessToken;
    if (!prevToken || prevToken === storedToken) return null;
    if (prev.refreshToken && prev.refreshToken === stored.refreshToken) return null;
    return prev;
  };

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
    const committed = await runCredentialMutation(async (): Promise<{ ok: boolean; superseded: StoredCloudflareOAuthToken | null }> => {
      if (attemptGeneration !== oauthAttemptGeneration) return { ok: false, superseded: null };
      // The credential this write replaces comes back from the write itself,
      // read under the store lock. A separate read before the write would
      // race the refresh's compare-and-set: a refresh landing between the two
      // rotates the refresh token, the write then displaces the ROTATED
      // record, and a revoke (or rollback) keyed on the pre-read would name
      // the consumed token while the live one is orphaned.
      const write = await setCloudflareOAuthTokenGuarded(
        dataDir,
        stored,
        () => attemptGeneration === oauthAttemptGeneration,
      );
      if (!write.written) return { ok: false, superseded: null };
      const displaced = write.displaced;
      try {
        await commitCloudflareOAuthMode({ clientId: result.clientId, redirectUri: result.redirectUri });
        return { ok: true, superseded: supersededGrantOf(displaced, stored) };
      } catch (err) {
        // The token write already landed but the config commit failed — restore
        // the token it displaced so a previously working credential stays usable
        // instead of leaving a token issued to the new client against a config
        // that still names the old identity. The local state is restored FIRST
        // (a crash during the revoke round-trip must not leave a soon-revoked
        // token on disk), then the grant this attempt minted is revoked at
        // Cloudflare.
        if (displaced) await setCloudflareOAuthToken(dataDir, displaced);
        else await clearCloudflareOAuthToken(dataDir);
        await revokeDiscardedGrant(result, fetchImpl);
        markGrantRevoked(err);
        throw err;
      }
    });
    // A reconnect that replaced a working credential leaves the OLD grant
    // valid at Cloudflare with nobody holding it. Revoke it now that the new
    // one is committed — best-effort and outside the mutation lock, so a slow
    // revoke endpoint never blocks a concurrent disconnect.
    if (committed.ok && committed.superseded) await revokeGrantBestEffort(committed.superseded, fetchImpl, 'superseded');
    return committed.ok;
  };

  const stopActiveListener = async () => {
    const cur = activeListener;
    activeListener = null;
    const draining = drainingListener;
    drainingListener = null;
    for (const listener of [cur, draining]) {
      if (!listener) continue;
      try {
        // `stop` is memoized in the listener, so awaiting one that is already
        // closing waits for THAT close instead of returning early.
        await listener.stop();
      } catch {
        // Best-effort; the listener self-closes on completion / timeout anyway.
      }
    }
  };

  // Best-effort: tell Cloudflare the grant a disconnect just took off disk is
  // dead, so a copy of the refresh token that leaked out of the data dir
  // cannot keep minting access tokens after the user disconnected. Takes the
  // record the clear DISPLACED (read under the store lock) rather than a
  // pre-read of the store: a refresh whose compare-and-set lands between a
  // pre-read and the clear rotates the refresh token, and revoking the
  // pre-read copy would leave the rotated one valid with nobody holding it.
  // Revokes the refresh token (which invalidates the whole grant) and falls
  // back to the access token when none was issued. Never blocks the
  // disconnect: a transport failure, a timeout, or a non-2xx is logged; the
  // local wipe has already landed.
  const revokeDisplacedGrant = async (displaced: StoredCloudflareOAuthToken): Promise<void> => {
    const token = displaced.refreshToken || displaced.accessToken;
    if (!token) return;
    const tokenTypeHint = displaced.refreshToken ? 'refresh_token' : 'access_token';
    let clientId = (displaced.clientId ?? '').trim();
    if (!clientId) {
      try {
        clientId = ((await readCloudflareWorkersConfig()).clientId ?? '').trim();
      } catch {
        // Revoke without client identification rather than skip it.
      }
    }
    const proxyDispatcher = proxyDispatcherRequestInit(process.env);
    try {
      const ok = await revokeCloudflareToken({
        token,
        tokenTypeHint,
        ...(clientId ? { clientId } : {}),
        fetchImpl: fetchWithRequestInit(proxyDispatcher.requestInit),
        signal: AbortSignal.timeout(CLOUDFLARE_REVOKE_TIMEOUT_MS),
      });
      if (!ok) console.warn('[cloudflare-oauth] revoke refused by Cloudflare; the local token is already cleared');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[cloudflare-oauth] revoke failed; the local token is already cleared:', msg);
    } finally {
      await proxyDispatcher.close();
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
    // created for — a newer /start may have already replaced it. It moves to
    // the draining slot: the port stays bound through the exchange below.
    if (listener && activeListener === listener) {
      activeListener = null;
      drainingListener = listener;
    }
    if (outcome.kind !== 'ok') {
      console.warn(`[cloudflare-oauth] callback failed: ${outcome.error}`);
      return false;
    }
    // Capture the attempt generation so a concurrent disconnect/start (which
    // bumps it) aborts this exchange before it can persist a stale token.
    const attemptGeneration = oauthAttemptGeneration;
    const proxyDispatcher = proxyDispatcherRequestInit(process.env);
    const fetchImpl = fetchWithRequestInit(proxyDispatcher.requestInit, CLOUDFLARE_OAUTH_EXCHANGE_TIMEOUT_MS);
    // Set once Cloudflare has issued a grant and cleared once that grant is
    // either stored or explicitly discarded. Any throw in between leaves it
    // set, and the catch below revokes it: a grant nobody holds must not stay
    // valid at Cloudflare.
    let tokenResp: CompleteCloudflareAuthResult | null = null;
    try {
      tokenResp = await completeCloudflareAuth({
        pending: pendingAuth,
        state: outcome.state,
        code: outcome.code,
        fetchImpl,
      });
      if (attemptGeneration !== oauthAttemptGeneration) {
        // The attempt was cancelled, disconnected, or replaced while the token
        // endpoint was in flight — do not persist a token the user already
        // abandoned.
        console.warn('[cloudflare-oauth] attempt superseded; discarding token');
        const discarded = tokenResp;
        tokenResp = null;
        await revokeDiscardedGrant(discarded, fetchImpl);
        return false;
      }
      const persisted = await persistCredential(tokenResp, attemptGeneration, fetchImpl);
      if (!persisted) {
        console.warn('[cloudflare-oauth] attempt superseded; discarding token');
        const discarded = tokenResp;
        tokenResp = null;
        await revokeDiscardedGrant(discarded, fetchImpl);
        return false;
      }
      tokenResp = null;
      console.log('[cloudflare-oauth] token stored');
      return true;
    } catch (err: unknown) {
      const msg = describeExchangeError(err);
      console.error('[cloudflare-oauth] token exchange failed:', msg);
      if (tokenResp && !wasGrantRevoked(err)) await revokeDiscardedGrant(tokenResp, fetchImpl);
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
      // A corrupt config reads as the unconfigured default with a marker. Do
      // not start the browser dance on top of it: the commit at the end of the
      // exchange would refuse to overwrite the file, and the user would only
      // learn that after authorizing. Refuse here, before any state exists.
      if (cfg.configError) {
        return res.status(409).json({
          error: 'Cloudflare Workers config file is not valid JSON; save the Workers settings before connecting.',
          code: cfg.configError,
        });
      }
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
      // defeats the purpose. An EXPLICIT selection (request body, else the
      // persisted config) is validated against the supported allowlist and a
      // malformed/unknown entry is a 400 before any OAuth state or listener
      // exists — it must never silently widen to the full default grant. The
      // default applies only when nothing was selected at all.
      // beginCloudflareAuth merges offline_access regardless.
      let scopes: string[];
      try {
        if (body.scopes !== undefined) {
          scopes = validateCloudflareOAuthScopes(body.scopes);
        } else if (Array.isArray(cfg.scopes) && cfg.scopes.length > 0) {
          scopes = validateCloudflareOAuthScopes(cfg.scopes);
        } else {
          scopes = CLOUDFLARE_OAUTH_SCOPES;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return res.status(400).json({ error: msg });
      }
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
    const fetchImpl = fetchWithRequestInit(proxyDispatcher.requestInit, CLOUDFLARE_OAUTH_EXCHANGE_TIMEOUT_MS);
    // Same discipline as the loopback callback: a grant Cloudflare issued that
    // this handler then fails to store is revoked on the way out.
    let tokenResp: CompleteCloudflareAuthResult | null = null;
    try {
      tokenResp = await completeCloudflareAuth({
        pending: pendingAuth,
        state,
        code,
        fetchImpl,
      });
      if (attemptGeneration !== oauthAttemptGeneration) {
        console.warn('[cloudflare-oauth] attempt superseded; discarding token');
        const discarded = tokenResp;
        tokenResp = null;
        await revokeDiscardedGrant(discarded, fetchImpl);
        return res
          .status(409)
          .json({ error: 'Cloudflare OAuth attempt was cancelled or superseded — restart the connection.' });
      }
      const persisted = await persistCredential(tokenResp, attemptGeneration, fetchImpl);
      if (!persisted) {
        console.warn('[cloudflare-oauth] attempt superseded; discarding token');
        const discarded = tokenResp;
        tokenResp = null;
        await revokeDiscardedGrant(discarded, fetchImpl);
        return res
          .status(409)
          .json({ error: 'Cloudflare OAuth attempt was cancelled or superseded — restart the connection.' });
      }
      tokenResp = null;
      // We won the race against the loopback listener (or it was never going
      // to resolve); shut it down so the next /start has a clean slate — but
      // only if a newer /start hasn't already replaced it.
      await stopActiveListenerIf(myListener);
      console.log('[cloudflare-oauth] manual paste-back ok, token stored');
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = describeExchangeError(err);
      console.error('[cloudflare-oauth] manual complete failed:', msg);
      if (tokenResp && !wasGrantRevoked(err)) await revokeDiscardedGrant(tokenResp, fetchImpl);
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
        const dataDir = cloudflareOAuthTokensDir();
        // The clear hands back the record it displaced, read under the store
        // lock; that record — not a pre-read that a concurrent refresh may
        // have rotated past — is what gets revoked. The revoke runs before
        // the config reset so the clientId fallback it may need is still
        // there.
        const displaced = await clearCloudflareOAuthToken(dataDir);
        if (displaced) await revokeDisplacedGrant(displaced);
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
