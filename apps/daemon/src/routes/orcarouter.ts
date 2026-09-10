// Daemon-owned routes for the OrcaRouter connect flow and catalog.
//
// Shaped after `routes/xai.ts` (same one-shot listener + pending cache +
// status/cancel/disconnect contract), because OrcaRouter's Flow A is the same
// dance: local daemon, loopback redirect, code exchanged server-side. The
// differences are OrcaRouter's: an ephemeral port instead of a locked one, a
// separate auth origin, and a `sk-orca-…` key rather than an OAuth token pair.
//
// Endpoints:
//   POST /api/orcarouter/oauth/start    — mint PKCE state, open the loopback
//                                         listener, return the authorize URL
//   POST /api/orcarouter/oauth/complete — paste-back of {state, code} for the
//                                         Flow B path the consent screen can
//                                         put a human on
//   POST /api/orcarouter/oauth/cancel   — release the in-flight attempt without
//                                         touching stored credentials
//   GET  /api/orcarouter/auth/status    — connection + credential state
//   POST /api/orcarouter/oauth/disconnect — explicit removal of the credential
//   POST /api/orcarouter/credentials    — API-key adapter: adopt a pasted key
//   POST /api/orcarouter/models         — capability-filtered live catalogue
//
// Neither the verifier nor the issued key is ever logged here.

import type { Express } from 'express';

import { proxyDispatcherRequestInit } from '../connectionTest.js';
import { PendingAuthCache } from '../mcp-oauth.js';
import {
  ORCAROUTER_PROVIDER_ID,
  ORCAROUTER_VERIFIED_SEED,
  fetchOrcaRouterCatalog,
  orcaRouterSeedModelOptions,
  resolveOrcaRouterApiBase,
  resolveOrcaRouterAuthBase,
  toOrcaRouterModelOptions,
  type OrcaRouterCapability,
  type OrcaRouterInputModality,
} from '../integrations/orcarouter.js';
import {
  OrcaRouterAttemptSupersededError,
  OrcaRouterAuthAttempts,
  OrcaRouterScopeDowngradeError,
  acquireApiKeyCredential,
  acquirePkceCredential,
  cleanOrcaRouterKey,
  clearOrcaRouterCredential,
  isCredentialUsable,
  looksLikeOrcaRouterKey,
  markOrcaRouterCredentialNeedsReauth,
  readOrcaRouterCredential,
  resolveOrcaRouterCredential,
  setOrcaRouterCredential,
} from '../integrations/orcarouter-credentials.js';
import {
  OrcaRouterExchangeError,
  beginOrcaRouterAuth,
  buildLoopbackCallbackUrl,
  completeOrcaRouterAuth,
} from '../integrations/orcarouter-oauth.js';
import {
  startOrcaRouterCallbackListener,
  type OrcaRouterCallbackListener,
  type OrcaRouterCallbackOutcome,
} from '../integrations/orcarouter-oauth-server.js';
import type { RouteDeps } from '../server-context.js';

export interface RegisterOrcaRouterRoutesDeps extends RouteDeps<'http' | 'paths'> {}

function fetchWithRequestInit(
  requestInit: Pick<RequestInit, 'dispatcher'>,
): typeof fetch {
  return (input, init) => fetch(input, { ...init, ...requestInit });
}

const CAPABILITIES: readonly OrcaRouterCapability[] = [
  'chat',
  'embedding',
  'image',
  'video',
  'rerank',
];

function readCapability(raw: unknown): OrcaRouterCapability {
  return typeof raw === 'string' && (CAPABILITIES as readonly string[]).includes(raw)
    ? (raw as OrcaRouterCapability)
    : 'chat';
}

function readModalities(raw: unknown): OrcaRouterInputModality[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<OrcaRouterInputModality>(['image', 'audio', 'video', 'file']);
  return raw
    .filter((m): m is OrcaRouterInputModality =>
      typeof m === 'string' && allowed.has(m as OrcaRouterInputModality))
    .filter((m, i, arr) => arr.indexOf(m) === i);
}

export function registerOrcaRouterRoutes(
  app: Express,
  ctx: RegisterOrcaRouterRoutesDeps,
) {
  const { isLocalSameOrigin, resolvedPortRef } = ctx.http;
  const { RUNTIME_DATA_DIR } = ctx.paths;
  const getResolvedPort = () => resolvedPortRef.current;
  // The credential store derives from the resolved daemon data root, not from
  // the media-config directory: `OD_MEDIA_CONFIG_DIR` is a narrow override for
  // media-config.json only, and two daemons that share a media config must not
  // share (and overwrite) one OrcaRouter account.
  const dataDir = () => RUNTIME_DATA_DIR;

  // The relay expires an auth code after 10 minutes; the listener, the pending
  // state, and the paste-back affordance all share that window so they cannot
  // drift out of step.
  const pendingAuth = new PendingAuthCache(10 * 60 * 1000);
  let activeListener: OrcaRouterCallbackListener | null = null;
  // Which authorization attempt is live. Cancel, Disconnect, and a new Start all
  // bump it; an exchange that reads a superseded generation refuses to store.
  const authAttempts = new OrcaRouterAuthAttempts();

  const stopActiveListener = async () => {
    const current = activeListener;
    activeListener = null;
    if (!current) return;
    try {
      await current.stop();
    } catch {
      // Best-effort; the listener self-closes on completion or timeout.
    }
  };

  /**
   * Release the in-flight attempt: stop listening AND invalidate its pending
   * state so a late callback or paste-back cannot still exchange. The stored
   * credential is untouched — Cancel is not Disconnect.
   */
  const releaseActiveAttempt = async () => {
    authAttempts.bump();
    pendingAuth.clear();
    await stopActiveListener();
  };

  /**
   * Persist whatever the exchange produced. Shared by the loopback callback and
   * the paste-back path so both land identical credential records.
   *
   * The attempt generation is captured before the first await and re-checked
   * before the write, so an exchange that finishes after a Cancel, a Disconnect,
   * or a newer Start commits nothing: without that fence a delayed provider
   * response would restore an account the user just removed.
   */
  const persistExchange = async (
    state: string,
    code: string,
  ): Promise<{ ok: true } | { ok: false; status: number; error: string }> => {
    const attempt = authAttempts.current();
    const previous = await readOrcaRouterCredential(dataDir());
    const dispatcher = proxyDispatcherRequestInit(process.env);
    try {
      const { exchange } = await completeOrcaRouterAuth({
        pending: pendingAuth,
        state,
        code,
        fetchImpl: fetchWithRequestInit(dispatcher.requestInit),
      });
      if (!authAttempts.isCurrent(attempt)) {
        throw new OrcaRouterAttemptSupersededError();
      }
      const credential = acquirePkceCredential({ exchange, previous });
      await setOrcaRouterCredential(dataDir(), credential);
      // A completed exchange is itself a state change: a callback still queued
      // behind this one belongs to the attempt that just ended.
      authAttempts.bump();
      console.log(
        `[orcarouter-oauth] credential stored source=pkce generation=${credential.generation}`,
      );
      return { ok: true };
    } catch (err: unknown) {
      if (err instanceof OrcaRouterAttemptSupersededError) {
        return { ok: false, status: 409, error: err.message };
      }
      if (err instanceof OrcaRouterScopeDowngradeError) {
        return { ok: false, status: 403, error: err.message };
      }
      if (err instanceof OrcaRouterExchangeError) {
        return { ok: false, status: err.status === 403 ? 403 : 400, error: err.message };
      }
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, status: 400, error: message };
    } finally {
      await dispatcher.close();
    }
  };

  const handleCallback = async (outcome: OrcaRouterCallbackOutcome): Promise<void> => {
    activeListener = null;
    if (outcome.kind !== 'ok') {
      console.warn(`[orcarouter-oauth] callback rejected: ${outcome.error}`);
      return;
    }
    const result = await persistExchange(outcome.state, outcome.code);
    if (!result.ok) {
      console.error(`[orcarouter-oauth] exchange failed: ${result.error}`);
    }
  };

  app.post('/api/orcarouter/oauth/start', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    // One dance at a time: a second Start (user clicked twice, or closed the tab
    // and came back) must not leave two listeners racing for one callback, nor
    // leave the previous attempt's state exchangeable.
    await releaseActiveAttempt();

    try {
      const authBase = resolveOrcaRouterAuthBase();
      // Bind first, then mint the state: the callback URL we put on the
      // authorize URL has to name a port that is already listening, but the
      // authorize URL is what produces the state the listener must validate.
      // The listener reads `expectedState` lazily, so it is inert until the
      // line below writes it.
      let expectedState = '';
      const listener = await startOrcaRouterCallbackListener({
        expectedState: () => expectedState,
        onCallback: handleCallback,
      });
      const { authorizeUrl, state } = beginOrcaRouterAuth({
        pending: pendingAuth,
        authBase,
        callbackUrl: buildLoopbackCallbackUrl(listener.address.port),
        scope: 'api',
      });
      expectedState = state;
      activeListener = listener;
      console.log(
        `[orcarouter-oauth] start ok listener=${listener.address.host}:${listener.address.port}`,
      );
      res.json({
        authorizeUrl,
        state,
        callback: { host: listener.address.host, port: listener.address.port },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[orcarouter-oauth] start failed:', message);
      await stopActiveListener();
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/orcarouter/oauth/complete', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    const state = typeof req.body?.state === 'string' ? req.body.state.trim() : '';
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!state || !code) {
      return res.status(400).json({ error: 'state and code are required' });
    }
    const result = await persistExchange(state, code);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    // The paste-back won the race against the loopback listener (or the user
    // chose the shown-code path); release the port so the next Start is clean.
    await stopActiveListener();
    res.json({ ok: true });
  });

  app.post('/api/orcarouter/oauth/cancel', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    // Cancel releases the in-flight attempt only. It must never remove a stored
    // credential: a user cancelling a Reconnect would otherwise lose a working
    // grant. Disconnect is the destructive path.
    try {
      await releaseActiveAttempt();
      res.json({ ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/orcarouter/auth/status', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const resolved = await resolveOrcaRouterCredential(RUNTIME_DATA_DIR);
      const stored = await readOrcaRouterCredential(dataDir());
      res.json({
        connected: isCredentialUsable(stored) || resolved.source === 'env',
        source: resolved.source,
        authState: resolved.authState,
        needsReauth: resolved.authState === 'needsReauth',
        accountId: resolved.accountId ?? null,
        scope: resolved.scope ?? null,
        savedAt: stored?.savedAt ?? null,
        reauthReason: resolved.reauthReason ?? null,
        listening: activeListener !== null,
        // Which credential generation the daemon currently holds, and which
        // authorization attempt is live. The connect control cannot tell
        // "reconnected" from "still the old, working credential" by
        // `connected` alone — a Reconnect leaves the previous credential in
        // place while the user authorizes — so it captures `generation` before
        // Start and waits for it to change instead of clearing its paste-back
        // input on the first poll.
        generation: stored?.generation ?? resolved.generation ?? null,
        attempt: authAttempts.current(),
        // The origin the browser will be sent to, so the UI can show it rather
        // than making the user trust an invisible redirect.
        authBase: resolveOrcaRouterAuthBase(),
        apiBase: resolveOrcaRouterApiBase(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/orcarouter/oauth/disconnect', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      // Invalidate the in-flight attempt FIRST: an exchange already awaiting
      // the provider must not resolve later and restore the account this call
      // is removing.
      await releaseActiveAttempt();
      await clearOrcaRouterCredential(dataDir());
      res.json({ ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // API-key adapter. Same destination as the PKCE path — a stored OrcaRouter
  // credential — so downstream code cannot tell which entry point was used.
  app.post('/api/orcarouter/credentials', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    const rawKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : '';
    // `clear` lets the UI remove a pasted key without leaving the connect flow.
    if (req.body?.clear === true) {
      try {
        authAttempts.bump();
        await clearOrcaRouterCredential(dataDir());
        return res.json({ ok: true, cleared: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return res.status(500).json({ error: message });
      }
    }
    const apiKey = cleanOrcaRouterKey(rawKey);
    if (!apiKey) {
      return res.status(400).json({ error: 'apiKey is required' });
    }
    // A prefix is a paste check, not proof of validity — say so instead of
    // implying the key works. The first real request settles that.
    const prefixOk = looksLikeOrcaRouterKey(apiKey);
    try {
      const previous = await readOrcaRouterCredential(dataDir());
      const credential = acquireApiKeyCredential({ apiKey, previous });
      await setOrcaRouterCredential(dataDir(), credential);
      // Adopting a key replaces whatever the account was; any authorization
      // still in flight is now stale and must not overwrite it on arrival.
      authAttempts.bump();
      console.log(`[orcarouter] API key stored generation=${credential.generation}`);
      res.json({ ok: true, prefixOk, generation: credential.generation });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/orcarouter/models', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    const capability = readCapability(req.body?.capability);
    const requiredModalities = readModalities(req.body?.requiredModalities);
    // The key is read here, server-side, and never travels to the browser. A
    // caller that names an override base URL still fetches with our credential.
    // A `needsReauth` credential resolves to an empty key, so a revoked
    // credential stops re-issuing the request the relay already rejected.
    const resolved = await resolveOrcaRouterCredential(RUNTIME_DATA_DIR);
    if (!resolved.apiKey) {
      return res.json({
        ok: false,
        capability,
        degraded: true,
        reason: resolved.authState === 'needsReauth'
          ? (resolved.reauthReason
            ?? 'OrcaRouter rejected this credential. Sign in again or paste a new API key.')
          : 'no OrcaRouter credential — connect an account or paste an API key',
        source: resolved.source,
        models: [],
        seed: false,
      });
    }
    const apiBase = (typeof req.body?.apiBase === 'string' && req.body.apiBase.trim())
      ? req.body.apiBase.trim()
      : resolved.baseUrl;
    const dispatcher = proxyDispatcherRequestInit(process.env);
    try {
      const result = await fetchOrcaRouterCatalog({
        apiKey: resolved.apiKey,
        capability,
        requiredModalities,
        apiBase,
        fetchImpl: fetchWithRequestInit(dispatcher.requestInit),
      });
      if (result.ok) {
        // Live discovery is authoritative. The seed is deliberately NOT merged
        // in here — mixing unverified rows into a live list is how a model that
        // the account cannot call ends up in the picker.
        //
        // Rows are projected onto the shared option shape (`id` + `label` +
        // metadata) because that is what every model picker consumes; handing
        // back the raw catalogue shape would leave `label` undefined and crash
        // the client's merge step.
        const models = toOrcaRouterModelOptions(result.models, result.rawRows);
        return res.json({
          ok: true,
          capability,
          degraded: false,
          source: resolved.source,
          models,
          seed: false,
          count: models.length,
        });
      }
      // A revoked credential is a terminal state, not a retry: mark the exact
      // account+generation that failed so the UI can offer a reconnect.
      if (result.status === 401 && resolved.generation !== undefined) {
        await markOrcaRouterCredentialNeedsReauth(dataDir(), {
          accountId: resolved.accountId ?? ORCAROUTER_PROVIDER_ID,
          generation: resolved.generation,
          reason: 'OrcaRouter rejected this credential (HTTP 401). Sign in again or paste a new API key.',
        });
      }
      return res.json({
        ok: false,
        capability,
        degraded: true,
        status: result.status ?? null,
        reason: result.degradedReason ?? 'catalogue unavailable',
        source: resolved.source,
        // Explicitly labelled fallback so the UI can render "verified seed"
        // rather than passing these off as the live catalogue. Same option
        // shape as the live branch, so the client has one code path.
        models: orcaRouterSeedModelOptions(capability, requiredModalities),
        seed: true,
        verifiedSeed: ORCAROUTER_VERIFIED_SEED.map((m) => m.id),
      });
    } finally {
      await dispatcher.close();
    }
  });
}
