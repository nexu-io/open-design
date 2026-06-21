// Daemon-owned routes for the xAI OAuth flow.
//
// Mirrors apps/daemon/src/mcp-routes.ts in shape, but the callback path
// has to be different: xAI's PoC client_id locks the redirect_uri to
// http://127.0.0.1:56121/callback (Hermes-issued), so we run a one-shot
// loopback listener (xai-oauth-server.ts) for the redirect instead of
// piggybacking on the daemon's main HTTP port. Once Open Design owns
// its own xAI client_id, this file shrinks back to the daemon-port
// shape that mcp-routes.ts uses.
//
// Endpoints:
//   POST /api/xai/oauth/start       — mint PKCE state, open :56121
//                                     listener, return authorize URL
//   POST /api/xai/oauth/complete    — manual paste-back of {state, code}
//                                     when xAI shows a code instead of
//                                     redirecting (the common case for
//                                     loopback redirect_uri)
//   POST /api/xai/oauth/cancel      — stop the in-flight :56121 listener
//                                     without touching any stored token
//                                     (UI Cancel button)
//   GET  /api/xai/auth/status       — has-token / expiry / in-flight bit
//   POST /api/xai/oauth/disconnect  — wipe stored token, stop listener
//   POST /api/xai/search            — search X posts via Grok's native
//                                     x_search tool, gated on the user's
//                                     SuperGrok subscription bearer

import type { Express } from 'express';

import { proxyDispatcherRequestInit } from '../connectionTest.js';
import { mediaConfigDir, resolveProviderConfig } from '../media/config.js';
import { PendingAuthCache } from '../mcp-oauth.js';
import { beginXAIAuth, completeXAIAuth } from '../integrations/xai-oauth.js';
import {
  startCallbackListener,
  type CallbackListener,
  type CallbackOutcome,
} from '../integrations/xai-oauth-server.js';
import {
  clearXAIToken,
  getXAIToken,
  setXAIToken,
  type StoredXAIToken,
} from '../integrations/xai-tokens.js';
import type { RouteDeps } from '../server-context.js';

export interface RegisterXaiRoutesDeps extends RouteDeps<'http' | 'paths'> {}

function fetchWithRequestInit(
  requestInit: Pick<RequestInit, 'dispatcher'>,
): typeof fetch {
  return (input, init) => fetch(input, { ...init, ...requestInit });
}

export function registerXaiRoutes(app: Express, ctx: RegisterXaiRoutesDeps) {
  const { isLocalSameOrigin, resolvedPortRef } = ctx.http;
  const { PROJECT_ROOT } = ctx.paths;
  const getResolvedPort = () => resolvedPortRef.current;

  // Match the loopback listener's 30 min self-close timeout so the
  // PKCE state, the open :56121 socket, and the paste-back UI all
  // expire together. The default 10 min would let the listener and UI
  // outlive the cached state, then `oauth/complete` and the listener
  // callback would both fail with `state not found or expired` even
  // though everything visible to the user still looks live.
  const pendingAuth = new PendingAuthCache(30 * 60 * 1000);
  let activeListener: CallbackListener | null = null;

  const stopActiveListener = async () => {
    const cur = activeListener;
    activeListener = null;
    if (!cur) return;
    try {
      await cur.stop();
    } catch {
      // Best-effort; the listener self-closes on completion / timeout
      // anyway.
    }
  };

  const handleCallback = async (outcome: CallbackOutcome): Promise<void> => {
    activeListener = null;
    if (outcome.kind !== 'ok') {
      console.warn(`[xai-oauth] callback failed: ${outcome.error}`);
      return;
    }
    const proxyDispatcher = proxyDispatcherRequestInit(process.env);
    try {
      const tokenResp = await completeXAIAuth({
        pending: pendingAuth,
        state: outcome.state,
        code: outcome.code,
        fetchImpl: fetchWithRequestInit(proxyDispatcher.requestInit),
      });
      const stored: StoredXAIToken = {
        accessToken: tokenResp.access_token,
        tokenType: tokenResp.token_type ?? 'Bearer',
        savedAt: Date.now(),
      };
      if (tokenResp.refresh_token) stored.refreshToken = tokenResp.refresh_token;
      if (tokenResp.scope) stored.scope = tokenResp.scope;
      if (typeof tokenResp.expires_in === 'number') {
        stored.expiresAt = Date.now() + tokenResp.expires_in * 1000;
      }
      await setXAIToken(mediaConfigDir(PROJECT_ROOT), stored);
      console.log('[xai-oauth] token stored');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[xai-oauth] token exchange failed:', msg);
    } finally {
      await proxyDispatcher.close();
    }
  };

  app.post('/api/xai/oauth/start', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    // Only one OAuth dance can be in flight at a time — :56121 is
    // singleton. Stop any prior listener (e.g. user closed the browser
    // tab and clicked Sign in again) before opening a new one.
    await stopActiveListener();

    try {
      const { authorizeUrl, state } = beginXAIAuth({ pending: pendingAuth });
      // Open the one-shot listener BEFORE returning so the client can
      // navigate the browser to authorizeUrl without racing startup.
      activeListener = await startCallbackListener({
        expectedState: state,
        onCallback: handleCallback,
      });
      console.log(
        `[xai-oauth] start ok state=${state.slice(0, 8)}… listener=${activeListener.address.host}:${activeListener.address.port}`,
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
      console.error('[xai-oauth] start failed:', msg);
      await stopActiveListener();
      res.status(502).json({ error: msg });
    }
  });

  app.post('/api/xai/oauth/complete', async (req, res) => {
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
    const proxyDispatcher = proxyDispatcherRequestInit(process.env);
    try {
      const tokenResp = await completeXAIAuth({
        pending: pendingAuth,
        state,
        code,
        fetchImpl: fetchWithRequestInit(proxyDispatcher.requestInit),
      });
      const stored: StoredXAIToken = {
        accessToken: tokenResp.access_token,
        tokenType: tokenResp.token_type ?? 'Bearer',
        savedAt: Date.now(),
      };
      if (tokenResp.refresh_token) {
        stored.refreshToken = tokenResp.refresh_token;
      }
      if (tokenResp.scope) stored.scope = tokenResp.scope;
      if (typeof tokenResp.expires_in === 'number') {
        stored.expiresAt = Date.now() + tokenResp.expires_in * 1000;
      }
      await setXAIToken(mediaConfigDir(PROJECT_ROOT), stored);
      // We won the race against the loopback listener (or it was never
      // going to resolve in the first place); shut it down so the next
      // /start has a clean slate.
      await stopActiveListener();
      console.log('[xai-oauth] manual paste-back ok, token stored');
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[xai-oauth] manual complete failed:', msg);
      res.status(400).json({ error: msg });
    } finally {
      await proxyDispatcher.close();
    }
  });

  app.get('/api/xai/auth/status', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const tok = await getXAIToken(mediaConfigDir(PROJECT_ROOT));
      if (!tok) {
        return res.json({ connected: false, listening: activeListener !== null });
      }
      res.json({
        connected: true,
        expiresAt: tok.expiresAt ?? null,
        scope: tok.scope ?? null,
        savedAt: tok.savedAt,
        listening: activeListener !== null,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/xai/oauth/cancel', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    // Cancel only stops the in-flight loopback listener. It must NOT
    // wipe the stored token — a user clicking Cancel mid-Reconnect
    // would otherwise lose their existing SuperGrok grant. Disconnect
    // is the destructive path; this one only releases the singleton
    // :56121 port so a new Sign in (or Hermes) can grab it.
    try {
      await stopActiveListener();
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/xai/oauth/disconnect', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      await stopActiveListener();
      await clearXAIToken(mediaConfigDir(PROJECT_ROOT));
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/xai/search', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    const body = (req.body || {}) as Partial<XaiSearchRequest>;
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    // Reuse media-config's credential chain so the search endpoint sees
    // the same OAuth-first cascade Grok image / video already gets:
    // OD-native xai-tokens → Hermes auth.json borrow → OD_GROK_API_KEY
    // → XAI_API_KEY. Anything that lights up the Grok image button
    // automatically lights up X search too.
    const provider = await resolveProviderConfig(PROJECT_ROOT, 'grok');
    const apiKey = provider.apiKey || '';
    if (!apiKey) {
      return res.status(401).json({
        error:
          'no xAI credentials — sign in with your SuperGrok subscription, set XAI_API_KEY, or configure a key in Settings',
      });
    }

    const baseUrl = (provider.baseUrl || 'https://api.x.ai/v1').replace(
      /\/+$/,
      '',
    );
    const model = body.model || X_SEARCH_DEFAULT_MODEL;

    const xSearchTool: Record<string, unknown> = { type: 'x_search' };
    if (Array.isArray(body.allowed_x_handles) && body.allowed_x_handles.length) {
      xSearchTool.allowed_x_handles = body.allowed_x_handles;
    }
    if (
      Array.isArray(body.excluded_x_handles)
      && body.excluded_x_handles.length
    ) {
      xSearchTool.excluded_x_handles = body.excluded_x_handles;
    }
    if (typeof body.from_date === 'string' && body.from_date) {
      xSearchTool.from_date = body.from_date;
    }
    if (typeof body.to_date === 'string' && body.to_date) {
      xSearchTool.to_date = body.to_date;
    }
    if (body.enable_image_understanding === true) {
      xSearchTool.enable_image_understanding = true;
    }
    if (body.enable_video_understanding === true) {
      xSearchTool.enable_video_understanding = true;
    }

    const requestBody = {
      model,
      input: [{ role: 'user', content: query }],
      tools: [xSearchTool],
      store: false,
    };

    let resp: Response;
    let text: string;
    const proxyDispatcher = proxyDispatcherRequestInit(process.env);
    try {
      resp = await fetch(`${baseUrl}/responses`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        ...proxyDispatcher.requestInit,
      });
      text = await resp.text();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(502).json({ error: `xAI request failed: ${msg}` });
    } finally {
      await proxyDispatcher.close();
    }

    if (!resp.ok) {
      return res
        .status(502)
        .json({ error: `xAI ${resp.status}: ${text.slice(0, 240)}` });
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: 'xAI returned non-JSON response' });
    }
    res.json({
      answer: extractAnswerText(data),
      citations: extractUrlCitations(data),
      model,
    });
  });
}

// xAI Responses API helpers — narrow shapes pulled out so tests can
// assert against them and the route handler stays readable.

const X_SEARCH_DEFAULT_MODEL = 'grok-4.20-reasoning';

interface XaiSearchRequest {
  query: string;
  allowed_x_handles?: string[];
  excluded_x_handles?: string[];
  from_date?: string;
  to_date?: string;
  enable_image_understanding?: boolean;
  enable_video_understanding?: boolean;
  model?: string;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/** Pull the assistant's main text out of an xAI Responses API payload.
 * Handles both the convenience `output_text` field and the structured
 * `output[].content[].text` form. */
export function extractAnswerText(data: unknown): string {
  if (!isPlainObject(data)) return '';
  const direct = data.output_text;
  if (typeof direct === 'string' && direct.trim()) return direct;
  const output = data.output;
  if (!Array.isArray(output)) return '';
  const chunks: string[] = [];
  for (const item of output) {
    if (!isPlainObject(item)) continue;
    const content = item.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!isPlainObject(block)) continue;
      const t = block.text;
      if (typeof t === 'string' && t) chunks.push(t);
    }
  }
  return chunks.join('\n').trim();
}

/** Walk every annotation in the Responses API output and return the
 * unique URL citations. xAI tags them with `type: 'url_citation'` and
 * fills in `url` / `title` (we only surface url here; the title is
 * already inlined into the answer text). */
export function extractUrlCitations(data: unknown): string[] {
  if (!isPlainObject(data)) return [];
  const output = data.output;
  if (!Array.isArray(output)) return [];
  const urls = new Set<string>();
  for (const item of output) {
    if (!isPlainObject(item)) continue;
    const content = item.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!isPlainObject(block)) continue;
      const annotations = block.annotations;
      if (!Array.isArray(annotations)) continue;
      for (const ann of annotations) {
        if (!isPlainObject(ann)) continue;
        if (ann.type !== 'url_citation') continue;
        const url = typeof ann.url === 'string' ? ann.url.trim() : '';
        if (url) urls.add(url);
      }
    }
  }
  return [...urls];
}
