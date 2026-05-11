import type { Express } from 'express';
import fs from 'node:fs';
import { SIDECAR_DEFAULTS, SIDECAR_ENV } from '@open-design/sidecar-proto';
import { buildMcpInstallPayload } from './mcp-install-info.js';
import { MCP_TEMPLATES, buildAcpMcpServers, buildClaudeMcpJson, isManagedProjectCwd, readMcpConfig, writeMcpConfig } from './mcp-config.js';
import { beginAuth, exchangeCodeForToken, refreshAccessToken } from './mcp-oauth.js';
import { clearToken, getToken, isTokenExpired, readAllTokens, setToken } from './mcp-tokens.js';
import type { RouteDeps } from './server-context.js';

export interface RegisterMcpRoutesDeps extends RouteDeps<'http' | 'paths' | 'mcp'> {}

export function registerMcpRoutes(app: Express, ctx: RegisterMcpRoutesDeps) {
  const { isLocalSameOrigin, resolvedPortRef, sendApiError } = ctx.http;
  const { OD_BIN, RUNTIME_DATA_DIR, PROJECTS_DIR } = ctx.paths;
  const { pendingAuth, daemonUrlRef } = ctx.mcp;
  const getResolvedPort = () => resolvedPortRef.current;
  const getDaemonUrl = () => daemonUrlRef.current;
  // Surfaces the absolute paths to the daemon's Node-compatible runtime and
  // CLI entry so the Settings → MCP server panel can render snippets that work
  // even when `od` isn't on the user's PATH (the common case for source clones
  // - and macOS/Linux ship a /usr/bin/od octal-dump tool that shadows ours
  // anyway). Cached for 5s because the panel pings on every open and these
  // paths cannot change without a daemon restart.
  const INSTALL_INFO_TTL_MS = 5000;
  let installInfoCache: { t: number; payload: object } | null = null;

  app.get('/api/mcp/install-info', (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    const now = Date.now();
    if (installInfoCache && now - installInfoCache.t < INSTALL_INFO_TTL_MS) {
      return res.json(installInfoCache.payload);
    }
    // process.execPath is the absolute path to the Node-compatible
    // runtime that is running the daemon RIGHT NOW. In packaged builds
    // this may be Electron running with ELECTRON_RUN_AS_NODE=1 rather
    // than a separate bundled Node binary; the helper surfaces that env
    // requirement with the command so IDE-spawned MCP clients can
    // reproduce the same mode from a minimal OS launcher environment.
    const cliPath = OD_BIN;
    // The daemon was bootstrapped as a sidecar (tools-dev, packaged) iff
    // bootstrapSidecarRuntime stamped OD_SIDECAR_IPC_PATH into the env.
    // In sidecar mode the snippet omits --daemon-url and the spawned
    // `od mcp` discovers the live URL via the IPC status socket on
    // every spawn, so the client config survives ephemeral-port
    // restarts. We also propagate OD_SIDECAR_NAMESPACE (and IPC_BASE
    // when overridden) so a non-default namespace daemon stays
    // reachable - the MCP client does not inherit the daemon's env,
    // so without this the spawned `od mcp` would probe the default
    // namespace socket and miss. For direct `od` / `od --port X`
    // launches there is no IPC socket; the helper bakes --daemon-url
    // so custom ports keep working.
    const sidecarIpcPath = process.env[SIDECAR_ENV.IPC_PATH];
    const isSidecarMode = sidecarIpcPath != null && sidecarIpcPath.length > 0;
    const sidecarEnv: Record<string, string> = {};
    if (isSidecarMode) {
      const ns = process.env[SIDECAR_ENV.NAMESPACE];
      if (ns != null && ns !== SIDECAR_DEFAULTS.namespace) {
        sidecarEnv[SIDECAR_ENV.NAMESPACE] = ns;
      }
      const ipcBase = process.env[SIDECAR_ENV.IPC_BASE];
      if (ipcBase != null && ipcBase.length > 0) {
        sidecarEnv[SIDECAR_ENV.IPC_BASE] = ipcBase;
      }
    }
    const payload = buildMcpInstallPayload({
      cliPath,
      cliExists: fs.existsSync(cliPath),
      execPath: process.execPath,
      nodeExists: fs.existsSync(process.execPath),
      port: getResolvedPort(),
      platform: process.platform,
      dataDir: RUNTIME_DATA_DIR,
      electronAsNode: process.env.ELECTRON_RUN_AS_NODE === '1',
      isSidecarMode,
      sidecarEnv,
    });
    installInfoCache = { t: now, payload };
    res.json(payload);
  });

  // External MCP server configuration. Open Design connects to these as a
  // CLIENT and surfaces their tools to the underlying agent at spawn time.
  // GET returns user-saved entries plus the built-in template list so the UI
  // can render the "Add MCP server" picker without a second round-trip.
  app.get('/api/mcp/servers', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const cfg = await readMcpConfig(RUNTIME_DATA_DIR);
      res.json({ servers: cfg.servers, templates: MCP_TEMPLATES });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  app.put('/api/mcp/servers', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const cfg = await writeMcpConfig(RUNTIME_DATA_DIR, req.body);
      res.json({ servers: cfg.servers, templates: MCP_TEMPLATES });
    } catch (err: any) {
      res
        .status(400)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // External MCP server OAuth — daemon-owned authorization flow.
  //
  // Replaces per-spawn `mcp-remote` subprocesses. The token is stored
  // server-side in <dataDir>/mcp-tokens.json and injected as a Bearer
  // header into the `.mcp.json` we write for Claude Code at spawn time.
  // The redirect URI points at THIS daemon's public origin so the flow
  // works the same in local dev (loopback) and in cloud deployments
  // where OD_PUBLIC_BASE_URL pins the externally-routable URL.
  // ─────────────────────────────────────────────────────────────────

  app.post('/api/mcp/oauth/start', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    const serverId =
      typeof req.body?.serverId === 'string' ? req.body.serverId.trim() : '';
    if (!serverId) {
      return res.status(400).json({ error: 'serverId is required' });
    }
    try {
      const cfg = await readMcpConfig(RUNTIME_DATA_DIR);
      const server = cfg.servers.find((s) => s.id === serverId);
      if (!server) {
        return res.status(404).json({ error: `unknown serverId ${serverId}` });
      }
      if (server.transport !== 'http' && server.transport !== 'sse') {
        return res
          .status(400)
          .json({ error: 'OAuth flow only applies to http/sse transports' });
      }
      if (!server.url) {
        return res.status(400).json({ error: 'server has no URL configured' });
      }
      const redirectUri = mcpOAuthCallbackUrl(req);
      console.log(
        `[mcp-oauth] start serverId=${serverId} url=${server.url} redirect=${redirectUri}`,
      );
      const result = await beginAuth({
        serverId,
        serverUrl: server.url,
        redirectUri,
        dataDir: RUNTIME_DATA_DIR,
        fetchImpl: fetch,
      });
      pendingAuth.put(result.state, result.pending);
      console.log(
        `[mcp-oauth] start ok serverId=${serverId} authServer=${result.pending.authServerIssuer} clientId=${result.pending.clientId}`,
      );
      res.json({
        authorizeUrl: result.authorizeUrl,
        state: result.state,
        redirectUri,
      });
    } catch (err: any) {
      const msg = err && err.message ? err.message : String(err);
      console.error(`[mcp-oauth] start failed serverId=${serverId}:`, msg);
      res.status(502).json({ error: msg });
    }
  });

  // Public endpoint — the OAuth provider's user-agent redirect lands here
  // after the user approves. We deliberately do NOT enforce
  // isLocalSameOrigin: in cloud the daemon IS the public origin, and even
  // locally the request comes back from the OAuth provider's redirect
  // (no Origin header at all on a top-level navigation).
  app.get('/api/mcp/oauth/callback', async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const error = typeof req.query.error === 'string' ? req.query.error : '';
    if (error) {
      return res.status(400).type('html').send(renderOAuthResultPage({
        ok: false,
        message: `Auth provider returned error: ${error}`,
      }));
    }
    if (!code || !state) {
      return res.status(400).type('html').send(renderOAuthResultPage({
        ok: false,
        message: 'Missing code or state — open Settings → External MCP servers and click Connect again.',
      }));
    }
    const pending = pendingAuth.consume(state);
    if (!pending) {
      return res.status(400).type('html').send(renderOAuthResultPage({
        ok: false,
        message: 'Auth state expired or already used. Click Connect again.',
      }));
    }
    try {
      const tokenResp = await exchangeCodeForToken({
        tokenEndpoint: pending.tokenEndpoint,
        clientId: pending.clientId,
        clientSecret: pending.clientSecret,
        redirectUri: pending.redirectUri,
        code,
        codeVerifier: pending.codeVerifier,
        resource: pending.resourceUrl,
      });
      const stored: any = {
        accessToken: tokenResp.access_token,
        refreshToken: tokenResp.refresh_token,
        tokenType: tokenResp.token_type ?? 'Bearer',
        scope: tokenResp.scope ?? pending.scope,
        expiresAt:
          typeof tokenResp.expires_in === 'number'
            ? Date.now() + tokenResp.expires_in * 1000
            : undefined,
        savedAt: Date.now(),
        // Persist the OAuth client context so refresh-token rotation can
        // hit the same client_id / token endpoint the upstream issued the
        // refresh_token to. Refresh tokens are client-bound (RFC 6749 §6).
        tokenEndpoint: pending.tokenEndpoint,
        clientId: pending.clientId,
        clientSecret: pending.clientSecret,
        authServerIssuer: pending.authServerIssuer,
        redirectUri: pending.redirectUri,
        resourceUrl: pending.resourceUrl,
      };
      await setToken(RUNTIME_DATA_DIR, pending.serverId, stored);
      res.type('html').send(renderOAuthResultPage({
        ok: true,
        serverId: pending.serverId,
      }));
    } catch (err: any) {
      console.error(
        '[mcp-oauth] callback failed:',
        err && err.message ? err.message : err,
      );
      res.status(502).type('html').send(renderOAuthResultPage({
        ok: false,
        message: String(err && err.message ? err.message : err),
      }));
    }
  });

  app.get('/api/mcp/oauth/status', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    const serverId =
      typeof req.query.serverId === 'string' ? req.query.serverId.trim() : '';
    if (!serverId) return res.status(400).json({ error: 'serverId is required' });
    try {
      const tok = await getToken(RUNTIME_DATA_DIR, serverId);
      if (!tok) return res.json({ connected: false });
      res.json({
        connected: true,
        expiresAt: tok.expiresAt ?? null,
        scope: tok.scope ?? null,
        savedAt: tok.savedAt,
      });
    } catch (err: any) {
      res.status(500).json({ error: String(err && err.message ? err.message : err) });
    }
  });

  app.post('/api/mcp/oauth/disconnect', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    const serverId =
      typeof req.body?.serverId === 'string' ? req.body.serverId.trim() : '';
    if (!serverId) return res.status(400).json({ error: 'serverId is required' });
    try {
      await clearToken(RUNTIME_DATA_DIR, serverId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: String(err && err.message ? err.message : err) });
    }
  });


}

function getPublicBaseUrl(req: any) {
  const env = process.env.OD_PUBLIC_BASE_URL;
  if (env && /^https?:\/\//i.test(env)) {
    return env.replace(/\/+$/u, '');
  }
  const proto = req.protocol || 'http';
  const host = req.get('host');
  if (!host) return `http://localhost:${process.env.OD_PORT ?? '7456'}`;
  return `${proto}://${host}`;
}

function mcpOAuthCallbackUrl(req: any) {
  return `${getPublicBaseUrl(req)}/api/mcp/oauth/callback`;
}

function renderOAuthResultPage(opts: any) {
  const ok = Boolean(opts.ok);
  const title = ok ? 'Connected' : 'Authorization failed';
  const heading = ok ? '✅ Connected' : '⚠️ Authorization failed';
  const body = ok
    ? `Your MCP server <code>${escapeHtml(opts.serverId ?? '')}</code> is now connected. You can close this tab and return to Open Design.`
    : escapeHtml(opts.message ?? 'Authorization could not be completed.');
  const accent = ok ? '#1a7f37' : '#cf222e';
  const payload = ok
    ? { type: 'mcp-oauth', ok: true, serverId: opts.serverId ?? null }
    : { type: 'mcp-oauth', ok: false, message: opts.message ?? null };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} — Open Design</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { color-scheme: light dark; }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif;
    background: #f6f7f9; color: #1f2328; padding: 24px;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0d1117; color: #e6edf3; }
    .card { background: #161b22; border-color: #30363d; }
    code { background: #1f242c; }
  }
  .card {
    max-width: 420px; width: 100%; padding: 28px 28px 22px; border-radius: 12px;
    background: white; border: 1px solid #d0d7de; box-shadow: 0 8px 24px rgba(0,0,0,.06);
    text-align: left;
  }
  h1 { margin: 0 0 8px; font-size: 18px; color: ${accent}; }
  p  { margin: 0 0 16px; font-size: 14px; line-height: 1.55; }
  code { background: #f3f4f6; padding: 1px 6px; border-radius: 4px; font-size: 12.5px; }
  button {
    appearance: none; border: 1px solid #d0d7de; background: white;
    border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer;
  }
  button:hover { background: #f6f8fa; }
  @media (prefers-color-scheme: dark) {
    button { background: #21262d; border-color: #30363d; color: #e6edf3; }
    button:hover { background: #30363d; }
  }
</style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(heading)}</h1>
    <p>${body}</p>
    <button type="button" onclick="window.close()">Close this tab</button>
  </div>
  <script>
    try {
      var payload = ${JSON.stringify(payload)};
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, '*');
      }
      if (window.BroadcastChannel) {
        var bc = new BroadcastChannel('open-design-mcp-oauth');
        bc.postMessage(payload);
        bc.close();
      }
    } catch (e) { /* ignore postMessage failures */ }
  </script>
</body>
</html>`;
}

function escapeHtml(s: any) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
