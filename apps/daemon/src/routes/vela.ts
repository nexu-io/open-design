import type { Express, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';

import {
  applyAgentLaunchEnv,
  getAgentDef,
  resolveAgentLaunch,
  spawnEnvForAgent,
} from '../agents.js';
import { readAnalyticsContext } from '../analytics.js';
import { agentCliEnvForAgent, type AppConfigPrefs, writeAppConfig } from '../app-config.js';
import {
  validateExternalPluginContext,
  validatePluginWorkflowId,
} from '../mcp-observability.js';
import {
  cancelVelaLogin,
  forgetVelaLogin,
  mergeVelaEnv,
  mirrorAmrEntryAnalytics,
  mirrorAmrOnboardingProfileAnalytics,
  parseAmrEntryAnalyticsPayload,
  parseAmrOnboardingProfileAnalyticsPayload,
  parseVelaAuthAttemptId,
  parseVelaAuthRequestId,
  applyVelaLiveAccount,
  clearAllVelaLiveAccounts,
  parseVelaLoginAttribution,
  peekVelaLiveAccount,
  readVelaApiContext,
  readVelaCredentialRevision,
  readVelaControlApiContext,
  readVelaLoginStatus,
  resolveVelaConsoleOrigin,
  readVelaLoginAttemptSnapshot,
  setVelaLiveAccount,
  shouldRefreshVelaLiveAccount,
  velaLiveAccountCacheKey,
  spawnVelaLoginWithFallback,
  type VelaLiveAccount,
} from '../integrations/vela.js';
import {
  clearVelaWalletSnapshotCache,
  velaWalletSnapshotReader,
} from '../integrations/vela-wallet.js';
import { amrModelLoadingCache } from '../runtimes/amr-model-cache.js';
import { buildAmrModelCacheKey } from '../runtimes/amr-model-probe.js';
import {
  fetchVelaBillingSummary,
  fetchVelaPresetModels,
  fetchVelaRemoteModelsWithRetry,
} from '../runtimes/defs/amr.js';

const AMR_API_PROXY_PREFIX = '/api/integrations/vela/api-proxy';
const VELA_MESSAGE_CENTER_PREFIX = '/api/integrations/vela/message-center';
const VELA_PUBLIC_MESSAGE_CENTER_PREFIX = '/api/integrations/vela/message-center-public';
const AMR_API_UPSTREAM_ORIGIN = 'https://amr-api.open-design.ai';
const PROXY_HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const VELA_WORKSPACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/**
 * Upper bound, in ms, on how long a cold-cache `/status` read waits for the
 * live billing fetch before answering without `account`. `vela billing
 * summary` is a real subprocess spawn (up to the 10s exec timeout in
 * fetchVelaBillingSummary) and every logout clears the live-account cache
 * (see `clearAllVelaLiveAccounts`), so "sign out then sign back in" always
 * lands here cold. Without a bound, a slow or hung billing probe delays the
 * whole login-status response — the very check the avatar/menu/settings
 * surfaces need FIRST — by however long the subprocess takes. Kept short
 * (well under the exec timeout) so /status stays fast even when billing is
 * slow; the single-flight fetch is NOT canceled when the wait lapses, so it
 * keeps running and populates the cache (see `setVelaLiveAccount`) for the
 * next read. Every consumer already re-reads /status on its own (mount,
 * window focus/visibilitychange, or the `od:amr-login-status-change` event
 * dispatched right after sign-in resolves), so the plan/balance simply
 * arrives on that next read instead of holding this one hostage.
 */
const VELA_STATUS_LIVE_ACCOUNT_WAIT_MS = 1_200;

/** Sentinel returned by {@link raceVelaLiveAccountFetch} when the wait lapses. */
const VELA_LIVE_ACCOUNT_PENDING = Symbol('vela-live-account-pending');

/**
 * Race an in-flight live-account fetch against a short timeout. Resolves with
 * the fetched account (or null on failure — the fetch itself never rejects,
 * see {@link fetchVelaLiveAccountSingleFlight}'s `.catch`) when it lands
 * before `timeoutMs`; otherwise resolves with the pending sentinel WITHOUT
 * touching `pending` — the fetch keeps running and still populates the
 * live-account cache when it eventually settles.
 */
function raceVelaLiveAccountFetch(
  pending: Promise<VelaLiveAccount | null>,
  timeoutMs: number,
): Promise<VelaLiveAccount | null | typeof VELA_LIVE_ACCOUNT_PENDING> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(VELA_LIVE_ACCOUNT_PENDING);
    }, timeoutMs);
    pending.then(
      (account) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(account);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

type ReadAppConfig = (dataDir: string) => Promise<AppConfigPrefs>;
type PublicBaseUrlResolver = (req: Request) => string;

export interface RegisterVelaRoutesDeps {
  paths: {
    RUNTIME_DATA_DIR: string;
  };
  appConfig: {
    readAppConfig: ReadAppConfig;
  };
  http: {
    getPublicBaseUrl?: PublicBaseUrlResolver;
  };
  env?: NodeJS.ProcessEnv;
}

interface AmrModelProbe {
  launchPath: string;
  env: NodeJS.ProcessEnv;
  configuredEnv: Record<string, string>;
  cacheKey: string;
}

function velaApiProxyBaseUrl(req: Request, getPublicBaseUrl: PublicBaseUrlResolver): string {
  return `${getPublicBaseUrl(req)}${AMR_API_PROXY_PREFIX}`;
}

function pluginLoginCorrelationEnv(input: {
  body: unknown;
  analyticsContext: ReturnType<typeof readAnalyticsContext>;
  metricsEnabled: boolean;
}): Record<string, string> {
  const { analyticsContext } = input;
  if (
    !input.metricsEnabled
    || !analyticsContext
    || analyticsContext.clientType !== 'external_mcp'
    || analyticsContext.entrySurface !== 'external_mcp'
  ) {
    return {};
  }
  const body =
    input.body && typeof input.body === 'object' && !Array.isArray(input.body)
      ? input.body as Record<string, unknown>
      : {};
  try {
    const context = validateExternalPluginContext({
      id: analyticsContext.externalPluginId,
      version: analyticsContext.externalPluginVersion,
      distributionMechanism: analyticsContext.distributionMechanism,
      publisherClass: analyticsContext.publisherClass,
    });
    const pluginWorkflowId = validatePluginWorkflowId(body.pluginWorkflowId);
    return {
      OD_INSTALLATION_ID: analyticsContext.deviceId,
      OPEN_DESIGN_PLUGIN_WORKFLOW_ID: pluginWorkflowId,
      OPEN_DESIGN_EXTERNAL_PLUGIN_ID: context.id,
      OPEN_DESIGN_EXTERNAL_PLUGIN_VERSION: context.version,
      OPEN_DESIGN_DISTRIBUTION_MECHANISM: context.distributionMechanism,
      OPEN_DESIGN_PUBLISHER_CLASS: context.publisherClass,
    };
  } catch {
    // Login must remain functional when analytics metadata is absent or
    // malformed. Invalid self-reported attribution is dropped rather than
    // being trusted or turned into an authentication dependency.
    return {};
  }
}

function velaProxyRequestBody(req: Request): Buffer | null {
  if (req.method === 'GET' || req.method === 'HEAD') return null;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  if (req.body == null) return null;
  return Buffer.from(JSON.stringify(req.body));
}

function shouldStreamVelaProxyRequest(req: Request, body: Buffer | null): boolean {
  return req.method !== 'GET' && req.method !== 'HEAD' && body == null;
}

function connectionHeaderTokens(value: string | string[] | undefined): Set<string> {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return new Set(
    values
      .flatMap((entry) => entry.split(','))
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isProxyHopByHopHeader(name: string, connectionTokens: Set<string>): boolean {
  const lower = name.toLowerCase();
  return PROXY_HOP_BY_HOP_HEADERS.has(lower) || connectionTokens.has(lower);
}

/**
 * Pipe one leg of the AMR proxy with an explicit source-error guard.
 *
 * `.pipe()` does NOT forward a source `'error'` to the destination, and a
 * stream that emits `'error'` with no listener throws — crashing the privileged
 * daemon. Both legs of this proxy have real-world error paths: the upstream
 * response body can `ECONNRESET` mid-stream (a network drop, routine), and the
 * inbound request body errors when a client aborts an upload. Routing the
 * source error to `onSourceError` (which tears the proxy down) instead of
 * leaving it unhandled is the invariant that keeps the daemon alive. Exported
 * for test.
 */
export function pipeProxyStreamWithGuard(
  source: NodeJS.ReadableStream,
  dest: NodeJS.WritableStream,
  onSourceError: (err: Error) => void,
): void {
  source.on('error', onSourceError);
  source.pipe(dest);
}

function proxyAmrApiRequest(req: Request, res: Response): void {
  const suffix = req.originalUrl.slice(AMR_API_PROXY_PREFIX.length);
  if (!suffix.startsWith('/api/v1/')) {
    res.status(404).json({ error: 'unknown_amr_api_proxy_path' });
    return;
  }
  const target = new URL(suffix, AMR_API_UPSTREAM_ORIGIN);
  if (!target.pathname.startsWith('/api/v1/')) {
    res.status(404).json({ error: 'unknown_amr_api_proxy_path' });
    return;
  }
  const workspaceId = req.headers['x-vela-workspace-id'];
  if (
    workspaceId !== undefined
    && (Array.isArray(workspaceId) || !VELA_WORKSPACE_ID_PATTERN.test(workspaceId))
  ) {
    res.status(400).json({ error: 'invalid_workspace_id' });
    return;
  }
  const requestConnectionTokens = connectionHeaderTokens(req.headers.connection);
  if (workspaceId !== undefined && requestConnectionTokens.has('x-vela-workspace-id')) {
    res.status(400).json({ error: 'invalid_workspace_id' });
    return;
  }
  const body = velaProxyRequestBody(req);
  const streamBody = shouldStreamVelaProxyRequest(req, body);
  const headers: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (lower === 'host' || isProxyHopByHopHeader(lower, requestConnectionTokens)) {
      continue;
    }
    if (lower === 'content-length' && body) continue;
    if (value !== undefined) headers[key] = value;
  }
  if (body) headers['content-length'] = String(body.length);

  const upstream = https.request(
    target,
    {
      method: req.method,
      headers,
      lookup: (hostname, options, callback) => {
        dns.lookup(hostname, { ...options, family: 4, all: false }, callback);
      },
    },
    (upstreamRes) => {
      res.status(upstreamRes.statusCode ?? 502);
      const responseConnectionTokens = connectionHeaderTokens(upstreamRes.headers.connection);
      for (const [key, value] of Object.entries(upstreamRes.headers)) {
        if (
          value !== undefined
          && !isProxyHopByHopHeader(key, responseConnectionTokens)
        ) {
          res.setHeader(key, value);
        }
      }
      pipeProxyStreamWithGuard(upstreamRes, res, (err) => {
        if (!res.headersSent) {
          res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
        } else {
          res.destroy();
        }
      });
    },
  );
  upstream.setTimeout(30_000, () => upstream.destroy(new Error('AMR API proxy timed out')));
  upstream.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    } else {
      res.end();
    }
  });
  const abortUpstream = () => {
    if (!res.writableEnded && !upstream.destroyed) upstream.destroy();
  };
  req.once('aborted', abortUpstream);
  res.once('close', abortUpstream);
  if (body) upstream.write(body);
  if (streamBody) {
    pipeProxyStreamWithGuard(req, upstream, () => upstream.destroy());
  } else {
    upstream.end();
  }
}

function isAllowedMessageCenterRequest(method: string, pathname: string): boolean {
  if (method === 'GET' && pathname === '/messages') return true;
  if (method !== 'POST') return false;
  return pathname === '/read-all' || /^\/messages\/[^/]+\/read$/.test(pathname);
}

function proxyVelaMessageCenterRequest(
  req: Request,
  res: Response,
  context: { apiUrl: string; controlKey?: string },
  proxyPrefix = VELA_MESSAGE_CENTER_PREFIX,
): void {
  const suffix = req.originalUrl.slice(proxyPrefix.length);
  const parsedSuffix = new URL(suffix, 'http://message-center.local');
  if (!isAllowedMessageCenterRequest(req.method, parsedSuffix.pathname)) {
    res.status(404).json({ error: 'unknown_message_center_path' });
    return;
  }
  const target = new URL(
    `/api/v1/message-center${parsedSuffix.pathname}${parsedSuffix.search}`,
    context.apiUrl,
  );
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    res.status(500).json({ error: 'invalid_vela_api_url' });
    return;
  }
  const body = velaProxyRequestBody(req);
  const headers: Record<string, string> = {
    accept: typeof req.headers.accept === 'string' ? req.headers.accept : 'application/json',
  };
  if (context.controlKey) headers.authorization = `Bearer ${context.controlKey}`;
  if (typeof req.headers['content-type'] === 'string') {
    headers['content-type'] = req.headers['content-type'];
  }
  if (body) headers['content-length'] = String(body.length);
  const transport = target.protocol === 'https:' ? https : http;
  const upstream = transport.request(
    target,
    { method: req.method, headers },
    (upstreamRes) => {
      res.status(upstreamRes.statusCode ?? 502);
      for (const [key, value] of Object.entries(upstreamRes.headers)) {
        if (value !== undefined) res.setHeader(key, value);
      }
      pipeProxyStreamWithGuard(upstreamRes, res, (err) => {
        if (!res.headersSent) {
          res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
        } else {
          res.end();
        }
      });
    },
  );
  upstream.setTimeout(30_000, () => upstream.destroy(new Error('Vela Message Center timed out')));
  upstream.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    } else {
      res.end();
    }
  });
  if (body) upstream.write(body);
  upstream.end();
}

export function registerVelaRoutes(app: Express, deps: RegisterVelaRoutesDeps): void {
  const env = deps.env ?? process.env;
  const { RUNTIME_DATA_DIR } = deps.paths;
  const { readAppConfig } = deps.appConfig;
  const getPublicBaseUrl = deps.http.getPublicBaseUrl ?? ((req: Request) => {
    const proto = req.protocol || 'http';
    const host = req.get('host');
    return host ? `${proto}://${host}` : 'http://localhost:7456';
  });

  function resolveAmrModelProbeForEnv(configuredEnv: Record<string, string>): AmrModelProbe {
    const def = getAgentDef('amr');
    if (!def) throw new Error('AMR runtime definition is missing');
    const agentLaunch = resolveAgentLaunch(def, configuredEnv);
    const launchPath = agentLaunch.launchPath ?? agentLaunch.selectedPath;
    if (!launchPath) throw new Error('AMR vela binary could not be resolved');
    const spawnEnv = applyAgentLaunchEnv(
      spawnEnvForAgent(
        def.id,
        {
          ...env,
          ...(def.env || {}),
        },
        configuredEnv,
        undefined,
      ),
      agentLaunch,
    );
    const credentialRevision = readVelaCredentialRevision(env, configuredEnv);
    const cacheKey = buildAmrModelCacheKey({
      launchPath,
      env: spawnEnv,
      credentialRevision,
    });
    return { launchPath, env: spawnEnv, configuredEnv, cacheKey };
  }

  async function resolveAmrModelProbe(): Promise<AmrModelProbe> {
    const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
    const configuredEnv = agentCliEnvForAgent(appConfig.agentCliEnv, 'amr');
    return resolveAmrModelProbeForEnv(configuredEnv);
  }

  // Single-flight the live billing fetch per credential revision. Treating
  // `peekVelaLiveAccount(key) === null` as the cold signal (rather than the
  // refresh throttle) means a concurrent second /status that arrives during the
  // first fetch awaits the SAME promise instead of slipping past the throttle
  // and returning config-only — which the read-once surfaces can't recover from.
  const inFlightVelaAccountFetches = new Map<
    string,
    Promise<VelaLiveAccount | null>
  >();
  const inFlightVelaAccountInvalidations = new Set<string>();
  function fetchVelaLiveAccountSingleFlight(
    accountCacheKey: string,
    probe: AmrModelProbe,
    options: { invalidateModelsOnPlanChange?: boolean } = {},
  ): Promise<VelaLiveAccount | null> {
    if (options.invalidateModelsOnPlanChange === true) {
      inFlightVelaAccountInvalidations.add(accountCacheKey);
    }
    const existing = inFlightVelaAccountFetches.get(accountCacheKey);
    if (existing) return existing;
    const pending = (async () => {
      const previousAccount = peekVelaLiveAccount(accountCacheKey);
      amrModelLoadingCache.warm(probe.cacheKey, () =>
        fetchVelaRemoteModelsWithRetry(probe.launchPath, probe.env),
      );
      const account = await fetchVelaBillingSummary(probe.launchPath, probe.env);
      if (
        inFlightVelaAccountInvalidations.has(accountCacheKey) &&
        (!previousAccount || previousAccount.plan !== account.plan)
      ) {
        amrModelLoadingCache.invalidate(probe.cacheKey);
      }
      setVelaLiveAccount(accountCacheKey, account);
      return account;
    })()
      .catch((err) => {
        // Keep the refresh throttle as a short negative cache/backoff. /status
        // is read by focus/menu/login surfaces, so a persistent optional
        // billing failure must not make every poll await the same slow probe.
        console.warn('[amr] live account fetch failed', err);
        return null;
      })
      .finally(() => {
        inFlightVelaAccountFetches.delete(accountCacheKey);
        inFlightVelaAccountInvalidations.delete(accountCacheKey);
      });
    inFlightVelaAccountFetches.set(accountCacheKey, pending);
    return pending;
  }

  app.get('/api/amr/models', async (_req, res) => {
    try {
      const probe = await resolveAmrModelProbe();
      const response = await amrModelLoadingCache.get(probe.cacheKey, {
        fetchPreset: () => fetchVelaPresetModels(probe.launchPath, probe.env),
        fetchRemote: () => fetchVelaRemoteModelsWithRetry(probe.launchPath, probe.env),
      });
      res.json(response);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/integrations/vela/status', async (_req, res) => {
    try {
      const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
      const configuredEnv = agentCliEnvForAgent(appConfig.agentCliEnv, 'amr');
      const refresh = _req.query.refresh === '1' || _req.query.refresh === 'true';
      const status = readVelaLoginStatus(mergeVelaEnv(env, configuredEnv));
      // Reported on every response, signed in or not: the client builds console
      // links (wallet, plans, upgrade) from it and must not have to carry a
      // hostname table for internal AMR environments. Absent for prod/fork
      // builds, where the client keeps using the public product console.
      const consoleOrigin = resolveVelaConsoleOrigin(env);
      if (consoleOrigin) status.consoleOrigin = consoleOrigin;
      if (status.loggedIn) {
        // Key the live-account cache by the full credential revision (not just
        // profile) so a logout / account switch can never surface the previous
        // account's plan or balance. Merge the cached projection synchronously
        // (works for env-backed sessions where status.user is null too); the
        // background refresh below updates the cache for the next poll.
        const accountCacheKey = velaLiveAccountCacheKey(
          readVelaCredentialRevision(env, configuredEnv),
        );
        const probe = resolveAmrModelProbeForEnv(configuredEnv);
        const cachedAccount = peekVelaLiveAccount(accountCacheKey);
        if (refresh) {
          const liveAccount = await fetchVelaLiveAccountSingleFlight(accountCacheKey, probe, {
            invalidateModelsOnPlanChange: true,
          });
          applyVelaLiveAccount(status, liveAccount);
        } else if (!cachedAccount) {
          // Cold cache (or a fetch already in flight): wait up to
          // VELA_STATUS_LIVE_ACCOUNT_WAIT_MS for the single-flight billing
          // fetch so the first open still carries plan/balance in the common
          // case (billing typically answers in well under a second). On
          // failure the helper resolves null and the refresh throttle
          // becomes a short negative cache/backoff, so repeated menu/focus
          // polls degrade to config-only instead of each awaiting the same
          // slow probe. If billing is genuinely slow (or hung), the wait
          // lapses and this response goes out with `account` absent rather
          // than blocking the login-status check itself — the fetch is left
          // running and populates the cache for the next /status read (see
          // VELA_STATUS_LIVE_ACCOUNT_WAIT_MS's docblock for why that is
          // always reached soon after).
          if (
            inFlightVelaAccountFetches.has(accountCacheKey) ||
            shouldRefreshVelaLiveAccount(accountCacheKey)
          ) {
            const pending = fetchVelaLiveAccountSingleFlight(accountCacheKey, probe);
            const liveAccount = await raceVelaLiveAccountFetch(
              pending,
              VELA_STATUS_LIVE_ACCOUNT_WAIT_MS,
            );
            if (liveAccount !== VELA_LIVE_ACCOUNT_PENDING) {
              applyVelaLiveAccount(status, liveAccount);
            }
          }
        } else {
          // Warm cache: serve it immediately; refresh in the background for the
          // next poll once the TTL has lapsed.
          applyVelaLiveAccount(status, cachedAccount);
          if (shouldRefreshVelaLiveAccount(accountCacheKey)) {
            void fetchVelaLiveAccountSingleFlight(accountCacheKey, probe, {
              invalidateModelsOnPlanChange: true,
            }).catch(() => {});
          }
        }
      }
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/integrations/vela/wallet', async (req, res) => {
    try {
      const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
      const configuredEnv = agentCliEnvForAgent(appConfig.agentCliEnv, 'amr');
      const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
      const snapshot = await velaWalletSnapshotReader.read({
        env,
        configuredEnv,
        refresh,
      });
      if (refresh) {
        try {
          const modelProbe = resolveAmrModelProbeForEnv(configuredEnv);
          amrModelLoadingCache.invalidate(modelProbe.cacheKey);
        } catch (err) {
          console.warn('[amr] model cache invalidation after wallet refresh failed', err);
        }
      }
      res.json(snapshot);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.all('/api/integrations/vela/api-proxy/*splat', proxyAmrApiRequest);

  app.get('/api/integrations/vela/message-center-public/messages', async (req, res) => {
    try {
      const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
      const configuredEnv = agentCliEnvForAgent(appConfig.agentCliEnv, 'amr');
      const context = readVelaApiContext(env, configuredEnv);
      proxyVelaMessageCenterRequest(req, res, context, VELA_PUBLIC_MESSAGE_CENTER_PREFIX);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.all('/api/integrations/vela/message-center/*splat', async (req, res) => {
    try {
      const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
      const configuredEnv = agentCliEnvForAgent(appConfig.agentCliEnv, 'amr');
      const context = readVelaControlApiContext(env, configuredEnv);
      if (!context) {
        res.status(401).json({ error: 'vela_control_key_required' });
        return;
      }
      proxyVelaMessageCenterRequest(req, res, context);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/integrations/vela/login', async (req, res) => {
    // Resolve a request-owned correlation id before any config or spawn work.
    // A pre-spawn failure must never inherit the previous login's snapshot.
    const requestAuthAttemptId = parseVelaAuthAttemptId(req.body) ?? randomUUID();
    const requestAuthRequestId = parseVelaAuthRequestId(req.body);
    const bodyHasRequestId = Boolean(
      req.body
      && typeof req.body === 'object'
      && !Array.isArray(req.body)
      && Object.prototype.hasOwnProperty.call(req.body, 'authRequestId'),
    );
    if (bodyHasRequestId && !requestAuthRequestId) {
      res.status(400).json({ error: 'invalid_auth_request_id' });
      return;
    }
    try {
      const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
      const configuredEnv = agentCliEnvForAgent(appConfig.agentCliEnv, 'amr');
      const analyticsContext = readAnalyticsContext(req);
      const attribution = parseVelaLoginAttribution(req.body);
      const correlationEnv = pluginLoginCorrelationEnv({
        body: req.body,
        analyticsContext,
        metricsEnabled: appConfig.telemetry?.metrics === true,
      });
      let loginAttribution = attribution;
      if (attribution) {
        if (analyticsContext && appConfig.telemetry?.metrics === true) {
          loginAttribution = { ...attribution, odDeviceId: analyticsContext.deviceId };
        } else {
          const withoutDeviceId = { ...attribution };
          delete withoutDeviceId.odDeviceId;
          loginAttribution = withoutDeviceId;
        }
      }
      // Start device authorization over a direct connection first. The
      // daemon-local IPv4 proxy (added in #4210 for hosts whose direct
      // amr-api.open-design.ai edge path is broken, #3726) re-originates the
      // request through the daemon. Behind a corporate transparent proxy that
      // hijacks amr-api.open-design.ai onto an internal gateway (e.g.
      // 飞连/CorpLink → 30.x), that extra hop makes the upstream lose the
      // client IP and reject device authorization with
      // "502: Invalid IP address: undefined", even though the direct path
      // resolves fine. So only fall back to the proxy when the direct child
      // actually terminates before activation (including after this request
      // returns) — never merely because it is slow, already activated, or a
      // login is already in flight.
      const spawned = await spawnVelaLoginWithFallback({
        authAttemptId: requestAuthAttemptId,
        authRequestId: requestAuthRequestId,
        configuredEnv,
        attribution: loginAttribution,
        correlationEnv,
        proxyApiUrl: velaApiProxyBaseUrl(req, getPublicBaseUrl),
        // Block until the direct attempt reaches device-auth steady state or
        // exits/errors before it. If it remains alive beyond this grace, the
        // attempt supervisor keeps watching after this route returns and owns
        // a single non-overlapping proxy retry on a later pre-activation exit.
        waitForActivation: true,
      });
      const snapshot = readVelaLoginAttemptSnapshot();
      res.status(202).json({
        ...spawned,
        ...(snapshot.authAttemptId === requestAuthAttemptId ? snapshot : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = /already running/i.test(message) ? 409 : 500;
      const snapshot = readVelaLoginAttemptSnapshot();
      // 409 intentionally joins the already-running attempt so concurrent UI
      // initiators can reconcile to its canonical id. Every other failure only
      // exposes state created for this request; config/read failures before
      // beginVelaLoginAttempt therefore cannot contaminate analytics.
      const responseSnapshot = status === 409
        || snapshot.authAttemptId === requestAuthAttemptId
        ? snapshot
        : {};
      res.status(status).json({
        error: message,
        ...responseSnapshot,
      });
    }
  });

  app.post('/api/integrations/vela/login/cancel', (req, res) => {
    try {
      const bodyHasAttemptId = Boolean(
        req.body
        && typeof req.body === 'object'
        && !Array.isArray(req.body)
        && Object.prototype.hasOwnProperty.call(req.body, 'authAttemptId'),
      );
      const authAttemptId = parseVelaAuthAttemptId(req.body);
      const bodyHasRequestId = Boolean(
        req.body
        && typeof req.body === 'object'
        && !Array.isArray(req.body)
        && Object.prototype.hasOwnProperty.call(req.body, 'authRequestId'),
      );
      const authRequestId = parseVelaAuthRequestId(req.body);
      if (
        (bodyHasAttemptId && !authAttemptId)
        || (bodyHasRequestId && !authRequestId)
        || (bodyHasAttemptId && bodyHasRequestId)
      ) {
        res.status(400).json({ error: 'invalid_auth_attempt_id' });
        return;
      }
      // No body remains a compatibility path for older web clients. New
      // callers always target the attempt they observed so a delayed cancel
      // can never terminate a newer login.
      res.json(cancelVelaLogin(
        authAttemptId ?? undefined,
        authRequestId ?? undefined,
      ));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/integrations/vela/analytics-entry', async (req, res) => {
    const payload = parseAmrEntryAnalyticsPayload(req.body);
    if (!payload) {
      res.status(400).json({ error: 'invalid_amr_entry_analytics' });
      return;
    }
    const analyticsContext = readAnalyticsContext(req);
    if (!analyticsContext) {
      res.status(202).json({ mirrored: false });
      return;
    }
    const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
    if (appConfig.telemetry?.metrics !== true) {
      res.status(202).json({ mirrored: false });
      return;
    }
    const result = await mirrorAmrEntryAnalytics(payload, {
      analyticsContext,
      env,
    });
    res.status(202).json(result);
  });

  app.post('/api/integrations/vela/analytics-profile', async (req, res) => {
    const payload = parseAmrOnboardingProfileAnalyticsPayload(req.body);
    if (!payload) {
      res.status(400).json({ error: 'invalid_amr_profile_analytics' });
      return;
    }
    const analyticsContext = readAnalyticsContext(req);
    if (!analyticsContext) {
      res.status(202).json({ mirrored: false });
      return;
    }
    const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
    if (appConfig.telemetry?.metrics !== true) {
      res.status(202).json({ mirrored: false });
      return;
    }
    const canonicalPayload = { ...payload, odDeviceId: analyticsContext.deviceId };
    const result = await mirrorAmrOnboardingProfileAnalytics(canonicalPayload, {
      analyticsContext,
      env,
    });
    res.status(202).json(result);
  });

  app.post('/api/integrations/vela/logout', async (_req, res) => {
    try {
      const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
      const configuredEnv = agentCliEnvForAgent(appConfig.agentCliEnv, 'amr');
      forgetVelaLogin(mergeVelaEnv(env, configuredEnv));
      // Drop any cached plan/balance so the next login can't surface this
      // (now signed-out) account's billing data.
      clearAllVelaLiveAccounts();
      clearVelaWalletSnapshotCache();
      delete env.VELA_RUNTIME_KEY;
      delete env.VELA_LINK_URL;
      const agentCliEnv = { ...(appConfig.agentCliEnv ?? {}) };
      const amrEnv = { ...(agentCliEnv.amr ?? {}) };
      delete amrEnv.VELA_RUNTIME_KEY;
      delete amrEnv.VELA_LINK_URL;
      if (Object.keys(amrEnv).length > 0) {
        agentCliEnv.amr = amrEnv;
      } else {
        delete agentCliEnv.amr;
      }
      await writeAppConfig(RUNTIME_DATA_DIR, { agentCliEnv });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
}
