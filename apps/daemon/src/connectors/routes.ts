import net from 'node:net';

import type { Express, Request, RequestHandler, Response } from 'express';

import type { ToolTokenGrant } from '../tool-tokens.js';
import { validateBoundedJsonObject } from '../live-artifacts/schema.js';
import { executeConnectorTool, listConnectorTools } from '../tools/connectors.js';
import type { ConnectorToolUseCase } from './catalog.js';
import { connectorService, ConnectorService, ConnectorServiceError } from './service.js';

type ConnectorApiErrorCode =
  | 'BAD_REQUEST'
  | 'FORBIDDEN'
  | 'VALIDATION_FAILED'
  | 'CONNECTOR_NOT_FOUND'
  | 'CONNECTOR_NOT_CONNECTED'
  | 'CONNECTOR_DISABLED'
  | 'CONNECTOR_TOOL_NOT_FOUND'
  | 'CONNECTOR_SAFETY_DENIED'
  | 'CONNECTOR_INPUT_SCHEMA_MISMATCH'
  | 'CONNECTOR_RATE_LIMITED'
  | 'CONNECTOR_OUTPUT_TOO_LARGE'
  | 'CONNECTOR_EXECUTION_FAILED';

const COMPOSIO_LOGO_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const COMPOSIO_LOGO_FETCH_TIMEOUT_MS = 2_000;
export const COMPOSIO_LOGO_CACHE_MAX_ENTRIES = 128;
const COMPOSIO_LOGO_MAX_BYTES = 1024 * 1024;
const COMPOSIO_LOGO_SLUG_ALIASES: Record<string, string> = {
  zohobooks: 'zoho_books',
};

interface CachedComposioLogo {
  body: Buffer;
  contentType: string;
  expiresAtMs: number;
}

const composioLogoCache = new Map<string, CachedComposioLogo>();
const composioLogoInflight = new Map<string, Promise<CachedComposioLogo | null>>();

export type ConnectorApiErrorSender = (
  res: Response,
  status: number,
  code: ConnectorApiErrorCode,
  message: string,
  init?: { details?: unknown; retryable?: boolean; requestId?: string; taskId?: string },
) => Response;

export interface RegisterConnectorRoutesOptions {
  service?: ConnectorService;
  sendApiError: ConnectorApiErrorSender;
  projectsRoot?: string;
  authorizeToolRequest?: (req: Request, res: Response, operation: string) => ToolTokenGrant | null;
  requireLocalDaemonRequest?: RequestHandler;
}

function sendConnectorRouteError(res: Response, err: unknown, sendApiError: ConnectorApiErrorSender): Response {
  if (err instanceof ConnectorServiceError) {
    return sendApiError(res, err.status, err.code, err.message, err.details === undefined ? {} : { details: err.details });
  }
  return sendApiError(res, 500, 'CONNECTOR_EXECUTION_FAILED', err instanceof Error ? err.message : String(err));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (normalized === 'localhost') return true;
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
  if (normalized.startsWith('::ffff:')) return isLoopbackHostname(normalized.slice('::ffff:'.length));
  return net.isIP(normalized) === 4 && (normalized === '127.0.0.1' || normalized.startsWith('127.'));
}

function parseConnectorToolUseCase(value: unknown): ConnectorToolUseCase | undefined {
  if (value === undefined) return undefined;
  if (value === 'personal_daily_digest') return value;
  return undefined;
}

function parseConnectorLogoTheme(value: unknown): 'light' | 'dark' {
  return value === 'light' ? 'light' : 'dark';
}

function parseConnectorLogoSlug(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toLowerCase().replace(/[^a-z0-9_]/g, '');
  const slug = COMPOSIO_LOGO_SLUG_ALIASES[normalized] ?? normalized;
  return slug.length > 0 ? slug : undefined;
}

function sendComposioLogo(res: Response, logo: CachedComposioLogo): void {
  res.setHeader('Content-Type', logo.contentType);
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  if (logo.contentType === 'image/svg+xml') {
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'");
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(logo.body);
}

function sendMissingComposioLogo(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(404).end();
}

function normalizeImageContentType(value: string | null): string | null {
  const contentType = value?.split(';')[0]?.trim().toLowerCase();
  if (!contentType?.startsWith('image/')) return null;
  return contentType;
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function parsePositiveIntegerHeader(value: string | null): number | null {
  if (!value) return null;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function readComposioLogoBody(response: globalThis.Response): Promise<Buffer | null> {
  const contentLength = parsePositiveIntegerHeader(response.headers.get('content-length'));
  if (contentLength !== null && contentLength > COMPOSIO_LOGO_MAX_BYTES) return null;

  const reader = response.body?.getReader();
  if (!reader) {
    const body = Buffer.from(await response.arrayBuffer());
    return body.byteLength <= COMPOSIO_LOGO_MAX_BYTES ? body : null;
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    totalBytes += value.byteLength;
    if (totalBytes > COMPOSIO_LOGO_MAX_BYTES) return null;
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes);
}

function pruneExpiredComposioLogos(nowMs: number): void {
  for (const [cacheKey, logo] of composioLogoCache) {
    if (logo.expiresAtMs > nowMs) continue;
    composioLogoCache.delete(cacheKey);
  }
}

function promoteComposioLogoCacheEntry(cacheKey: string, logo: CachedComposioLogo): void {
  composioLogoCache.delete(cacheKey);
  composioLogoCache.set(cacheKey, logo);
}

function cacheComposioLogo(cacheKey: string, logo: CachedComposioLogo): void {
  pruneExpiredComposioLogos(Date.now());
  if (composioLogoCache.has(cacheKey)) composioLogoCache.delete(cacheKey);
  while (composioLogoCache.size >= COMPOSIO_LOGO_CACHE_MAX_ENTRIES) {
    const oldestCacheKey = composioLogoCache.keys().next().value;
    if (oldestCacheKey === undefined) break;
    composioLogoCache.delete(oldestCacheKey);
  }
  composioLogoCache.set(cacheKey, logo);
}

async function fetchComposioLogo(slug: string, theme: 'light' | 'dark'): Promise<CachedComposioLogo | null> {
  const cacheKey = `${slug}:${theme}`;
  const nowMs = Date.now();
  const cached = composioLogoCache.get(cacheKey);
  if (cached && cached.expiresAtMs > nowMs) {
    promoteComposioLogoCacheEntry(cacheKey, cached);
    return cached;
  }
  if (cached) composioLogoCache.delete(cacheKey);

  const inflight = composioLogoInflight.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const upstream = `https://logos.composio.dev/api/${encodeURIComponent(slug)}?theme=${theme}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), COMPOSIO_LOGO_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(upstream, {
        headers: { accept: 'image/avif,image/webp,image/apng,image/png,image/jpeg' },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const body = await readComposioLogoBody(response);
      if (!body) return null;
      const contentType = normalizeImageContentType(response.headers.get('content-type'));
      if (!contentType) return null;
      const logo: CachedComposioLogo = {
        body,
        contentType,
        expiresAtMs: Date.now() + COMPOSIO_LOGO_CACHE_TTL_MS,
      };
      cacheComposioLogo(cacheKey, logo);
      return logo;
    } catch (error) {
      if (isAbortLikeError(error)) return null;
      throw error;
    } finally {
      clearTimeout(timer);
    }
  })().finally(() => {
    composioLogoInflight.delete(cacheKey);
  });
  composioLogoInflight.set(cacheKey, promise);
  return promise;
}

async function proxyComposioLogo(req: Request, res: Response): Promise<void> {
  const slug = parseConnectorLogoSlug(req.params.slug);
  if (!slug) {
    res.status(400).json({ error: 'logo slug is required' });
    return;
  }
  const theme = parseConnectorLogoTheme(req.query.theme);
  const logo = await fetchComposioLogo(slug, theme);
  if (!logo) {
    sendMissingComposioLogo(res);
    return;
  }
  sendComposioLogo(res, logo);
}

function connectorCallbackUrl(req: Request): string {
  const host = req.get('host') ?? 'localhost';
  let hostname = 'localhost';
  try {
    hostname = new URL(`http://${host}`).hostname;
  } catch {
    throw new ConnectorServiceError('CONNECTOR_EXECUTION_FAILED', 'connector OAuth callback host is invalid', 400, { host });
  }
  if (!isLoopbackHostname(hostname)) {
    throw new ConnectorServiceError('CONNECTOR_EXECUTION_FAILED', 'connector OAuth callback host must be loopback', 400, { host });
  }
  return `${req.protocol}://${host}/api/connectors/oauth/callback`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case "'":
        return '&#39;';
      case '"':
        return '&quot;';
      default:
        return char;
    }
  });
}

function renderConnectorConnectedHtml(connectorId: string): string {
  const knownConnectorLabels: Record<string, string> = {
    github: 'GitHub',
    google_drive: 'Google Drive',
    notion: 'Notion',
  };
  const connectorLabel = connectorId
    ? knownConnectorLabels[connectorId] ?? connectorId
      .split(/[-_\s]+/g)
      .filter(Boolean)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(' ')
    : 'Connector';
  const connectorLabelHtml = escapeHtml(connectorLabel);
  const connectorIdJson = JSON.stringify(connectorId);
  const connectorLabelJson = JSON.stringify(connectorLabel);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${connectorLabelHtml} connected · Open Design</title>
    <style>
      :root {
        --bg: #faf9f7;
        --bg-panel: #ffffff;
        --bg-subtle: #f4f2ed;
        --border: #ebe8e1;
        --border-strong: #d8d4cb;
        --text: #1a1916;
        --text-strong: #0d0c0a;
        --text-muted: #74716b;
        --text-soft: #989590;
        --accent: #c96442;
        --accent-hover: #b45a3b;
        --accent-tint: #fbeee5;
        --green: #1f7a3a;
        --green-bg: #e8f7ee;
        --green-border: #c6ead2;
        --shadow-xs: 0 1px 0 rgba(28, 27, 26, 0.04);
        --shadow-lg: 0 24px 60px rgba(28, 27, 26, 0.16), 0 8px 16px rgba(28, 27, 26, 0.07);
        --radius: 10px;
        --radius-lg: 14px;
        --radius-pill: 999px;
        --serif: 'Source Serif Pro', 'Source Serif 4', 'Iowan Old Style', 'Apple Garamond', Georgia, 'Times New Roman', serif;
        --sans: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      }
      * { box-sizing: border-box; }
      html, body { min-height: 100%; margin: 0; }
      body {
        display: grid;
        place-items: center;
        padding: 32px;
        color: var(--text);
        background:
          radial-gradient(circle at 50% 0%, rgba(201, 100, 66, 0.11), transparent 34rem),
          linear-gradient(180deg, #ffffff 0%, var(--bg) 42%, var(--bg) 100%);
        font: 13.5px/1.5 var(--sans);
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      main {
        width: min(440px, 100%);
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        background: color-mix(in srgb, var(--bg-panel) 96%, transparent);
        box-shadow: var(--shadow-lg);
      }
      .chrome {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 42px;
        padding: 8px 14px;
        border-bottom: 1px solid var(--border);
        background: var(--bg);
      }
      .brand-mark {
        display: inline-grid;
        place-items: center;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        color: var(--accent);
        background: linear-gradient(135deg, #fbeee5 0%, #f5d8cb 100%);
        font-family: var(--serif);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: -0.04em;
      }
      .brand-title {
        font-family: var(--serif);
        font-size: 16px;
        font-weight: 600;
        letter-spacing: -0.015em;
        color: var(--text-strong);
      }
      .content {
        display: grid;
        gap: 18px;
        padding: 34px 30px 30px;
        text-align: center;
      }
      .status-icon {
        display: inline-grid;
        place-items: center;
        justify-self: center;
        width: 54px;
        height: 54px;
        border: 1px solid var(--green-border);
        border-radius: 50%;
        color: var(--green);
        background: var(--green-bg);
        box-shadow: var(--shadow-xs);
      }
      h1 {
        margin: 0;
        color: var(--text-strong);
        font-family: var(--serif);
        font-size: clamp(26px, 7vw, 34px);
        line-height: 1.05;
        letter-spacing: -0.03em;
      }
      p { margin: 0; color: var(--text-muted); }
      .summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--bg-subtle);
        text-align: left;
      }
      .summary-label { display: grid; gap: 2px; min-width: 0; }
      .summary-label strong { color: var(--text); font-size: 13px; }
      .summary-label span { color: var(--text-soft); font-size: 12px; }
      .pill {
        flex: 0 0 auto;
        padding: 3px 8px;
        border: 1px solid color-mix(in srgb, var(--green) 24%, transparent);
        border-radius: var(--radius-pill);
        color: var(--green);
        background: var(--green-bg);
        font-size: 11px;
        font-weight: 600;
      }
      button {
        justify-self: center;
        min-width: 132px;
        border: 1px solid var(--accent);
        border-radius: 6px;
        padding: 8px 14px;
        color: white;
        background: var(--accent);
        box-shadow: 0 1px 0 rgba(180, 90, 59, 0.18) inset, var(--shadow-xs);
        font: 500 13px/1.4 var(--sans);
        cursor: pointer;
        transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
      }
      button:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
      button:active { transform: translateY(1px); }
      .hint { color: var(--text-soft); font-size: 12px; }
      @media (max-width: 480px) {
        body { padding: 18px; }
        .content { padding: 28px 22px 24px; }
        .summary { align-items: flex-start; flex-direction: column; }
      }
    </style>
  </head>
  <body>
    <main aria-labelledby="callback-title">
      <div class="chrome" aria-label="Open Design">
        <span class="brand-mark" aria-hidden="true">OD</span>
        <span class="brand-title">Open Design</span>
      </div>
      <section class="content">
        <div class="status-icon" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 6.5L9.5 17L4 11.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <div>
          <h1 id="callback-title">${connectorLabelHtml} connected</h1>
          <p>Your connector is ready to use in Open Design.</p>
        </div>
        <div class="summary" role="status">
          <span class="summary-label">
            <strong>${connectorLabelHtml}</strong>
            <span>Connection synced with the main window</span>
          </span>
          <span class="pill">Connected</span>
        </div>
        <button type="button" id="close-window">Close window</button>
        <p class="hint" id="auto-close-hint">This popup will close automatically if your browser allows it.</p>
      </section>
    </main>
    <script>
      (() => {
        const connectorId = ${connectorIdJson};
        const connectorLabel = ${connectorLabelJson};
        const message = { type: 'open-design:connector-connected', connectorId, connectorLabel };
        const closeButton = document.getElementById('close-window');
        const hint = document.getElementById('auto-close-hint');
        function showManualCloseHint() {
          closeButton.textContent = 'Close this tab manually';
          hint.textContent = 'Your browser blocked automatic closing. You can close this tab and return to Open Design.';
        }
        function requestClose() {
          try {
            window.close();
          } finally {
            window.setTimeout(() => {
              if (document.visibilityState === 'visible') showManualCloseHint();
            }, 250);
          }
        }
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(message, '*');
            window.setTimeout(requestClose, 900);
          } else {
            hint.textContent = 'You can close this tab and return to Open Design.';
          }
        } catch {
          hint.textContent = 'You can close this tab and return to Open Design.';
        }
        closeButton.addEventListener('click', requestClose);
      })();
    </script>
  </body>
</html>`;
}

export function registerConnectorRoutes(app: Express, options: RegisterConnectorRoutesOptions): void {
  const service = options.service ?? connectorService;
  const requireLocalDaemonRequest: RequestHandler = options.requireLocalDaemonRequest ?? ((_req, _res, next) => next());

  app.get('/api/connectors', async (_req: Request, res: Response) => {
    try {
      res.json({ connectors: await service.listConnectors() });
    } catch (err) {
      sendConnectorRouteError(res, err, options.sendApiError);
    }
  });

  app.get('/api/connectors/status', async (_req: Request, res: Response) => {
    try {
      res.json({ statuses: service.listConnectorStatuses() });
    } catch (err) {
      sendConnectorRouteError(res, err, options.sendApiError);
    }
  });

  app.get('/api/connectors/discovery', async (req: Request, res: Response) => {
    try {
      const refresh = typeof req.query.refresh === 'string'
        ? ['1', 'true', 'yes'].includes(req.query.refresh.toLowerCase())
        : false;
      res.json(await service.listConnectorDiscovery({ refresh }));
    } catch (err) {
      sendConnectorRouteError(res, err, options.sendApiError);
    }
  });

  app.get('/api/connectors/logos/:slug', async (req: Request, res: Response) => {
    try {
      await proxyComposioLogo(req, res);
    } catch (err) {
      sendConnectorRouteError(res, err, options.sendApiError);
    }
  });

  app.get('/api/connectors/:connectorId', async (req: Request, res: Response) => {
    try {
      const connectorId = req.params.connectorId;
      if (!connectorId) return options.sendApiError(res, 400, 'CONNECTOR_NOT_FOUND', 'connectorId is required');
      res.json({ connector: await service.getConnector(connectorId) });
    } catch (err) {
      sendConnectorRouteError(res, err, options.sendApiError);
    }
  });

  app.post('/api/connectors/:connectorId/connect', requireLocalDaemonRequest, async (req: Request, res: Response) => {
    try {
      const connectorId = req.params.connectorId;
      if (!connectorId) return options.sendApiError(res, 400, 'CONNECTOR_NOT_FOUND', 'connectorId is required');
      const body = isPlainObject(req.body) ? req.body : {};
      const accountLabel = typeof body.accountLabel === 'string' ? body.accountLabel : undefined;
      const credentials = body.credentials === undefined ? undefined : body.credentials;
      if (credentials !== undefined && !isPlainObject(credentials)) {
        options.sendApiError(res, 400, 'VALIDATION_FAILED', 'credentials must be an object');
        return;
      }
      const definition = await service.getDefinition(connectorId);
      if (definition?.authentication === 'composio' && credentials !== undefined) {
        options.sendApiError(res, 400, 'VALIDATION_FAILED', 'Composio connector credentials can only be stored through OAuth callback completion');
        return;
      }
      res.json({
        ...(await service.connect(connectorId, {
          ...(accountLabel === undefined ? {} : { accountLabel }),
          ...(credentials === undefined ? {} : { credentials }),
          callbackUrl: `${connectorCallbackUrl(req)}/${encodeURIComponent(connectorId)}`,
        })),
      });
    } catch (err) {
      sendConnectorRouteError(res, err, options.sendApiError);
    }
  });

  app.get('/api/connectors/oauth/callback/:connectorId', async (req: Request, res: Response) => {
    try {
      const connectorId = req.params.connectorId;
      if (!connectorId) return options.sendApiError(res, 400, 'CONNECTOR_NOT_FOUND', 'connectorId is required');
      const state = typeof req.query.state === 'string' ? req.query.state : undefined;
      if (!state) return options.sendApiError(res, 400, 'BAD_REQUEST', 'state is required');
      const providerConnectionId = typeof req.query.connected_account_id === 'string'
        ? req.query.connected_account_id
        : typeof req.query.connection_id === 'string'
          ? req.query.connection_id
          : typeof req.query.account_id === 'string'
            ? req.query.account_id
            : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      await service.completeComposioConnection({ connectorId, state, ...(providerConnectionId === undefined ? {} : { providerConnectionId }), ...(status === undefined ? {} : { status }) });
      res.type('html').send(renderConnectorConnectedHtml(connectorId));
    } catch (err) {
      sendConnectorRouteError(res, err, options.sendApiError);
    }
  });

  app.delete('/api/connectors/:connectorId/connection', requireLocalDaemonRequest, async (req: Request, res: Response) => {
    try {
      const connectorId = req.params.connectorId;
      if (!connectorId) return options.sendApiError(res, 400, 'CONNECTOR_NOT_FOUND', 'connectorId is required');
      res.json({ connector: await service.disconnect(connectorId) });
    } catch (err) {
      sendConnectorRouteError(res, err, options.sendApiError);
    }
  });

  app.get('/api/tools/connectors/list', async (req: Request, res: Response) => {
    try {
      if (!options.authorizeToolRequest) {
        options.sendApiError(res, 500, 'CONNECTOR_EXECUTION_FAILED', 'connector tool routes are not configured');
        return;
      }
      const grant = options.authorizeToolRequest?.(req, res, 'connectors:list');
      if (!grant) return;
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      if (projectId && projectId !== grant.projectId) {
        options.sendApiError(res, 403, 'FORBIDDEN', 'projectId is derived from the tool token', {
          details: { suppliedProjectId: projectId },
        });
        return;
      }
      if (!options.projectsRoot) {
        options.sendApiError(res, 500, 'CONNECTOR_EXECUTION_FAILED', 'connector tool routes are not configured');
        return;
      }
      const rawUseCase = typeof req.query.useCase === 'string' ? req.query.useCase : undefined;
      const useCase = parseConnectorToolUseCase(rawUseCase);
      if (rawUseCase !== undefined && useCase === undefined) {
        options.sendApiError(res, 400, 'BAD_REQUEST', 'useCase must be personal_daily_digest');
        return;
      }
      res.json({ connectors: await listConnectorTools({ grant, projectsRoot: options.projectsRoot, service, ...(useCase === undefined ? {} : { useCase }) }) });
    } catch (err) {
      sendConnectorRouteError(res, err, options.sendApiError);
    }
  });

  app.post('/api/tools/connectors/execute', async (req: Request, res: Response) => {
    try {
      if (!options.authorizeToolRequest) {
        options.sendApiError(res, 500, 'CONNECTOR_EXECUTION_FAILED', 'connector tool routes are not configured');
        return;
      }
      const grant = options.authorizeToolRequest?.(req, res, 'connectors:execute');
      if (!grant) return;
      if (!options.projectsRoot) {
        options.sendApiError(res, 500, 'CONNECTOR_EXECUTION_FAILED', 'connector tool routes are not configured');
        return;
      }

      const { projectId, connectorId, toolName, input, purpose } = req.body || {};
      if (projectId && projectId !== grant.projectId) {
        options.sendApiError(res, 403, 'FORBIDDEN', 'projectId is derived from the tool token', {
          details: { suppliedProjectId: projectId },
        });
        return;
      }
      if (purpose !== undefined && purpose !== 'agent_preview') {
        options.sendApiError(res, 403, 'FORBIDDEN', 'connector tool purpose is derived from the tool token', {
          details: { suppliedPurpose: purpose },
        });
        return;
      }
      if (typeof connectorId !== 'string' || connectorId.length === 0) {
        options.sendApiError(res, 400, 'BAD_REQUEST', 'connectorId is required');
        return;
      }
      if (typeof toolName !== 'string' || toolName.length === 0) {
        options.sendApiError(res, 400, 'BAD_REQUEST', 'toolName is required');
        return;
      }
      const inputValidation = validateBoundedJsonObject(input ?? {}, 'input');
      if (!inputValidation.ok) {
        options.sendApiError(res, 400, 'VALIDATION_FAILED', inputValidation.error, {
          details: { kind: 'validation', issues: inputValidation.issues },
        });
        return;
      }

      const result = await executeConnectorTool(
        { connectorId, toolName, input: inputValidation.value },
        { grant, projectsRoot: options.projectsRoot, service },
      );
      res.json(result);
    } catch (err) {
      sendConnectorRouteError(res, err, options.sendApiError);
    }
  });
}
