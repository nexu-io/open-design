import type { Express, Request, Response } from 'express';
import dns from 'node:dns';
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
  cancelVelaLogin,
  forgetVelaLogin,
  mergeVelaEnv,
  mirrorAmrEntryAnalytics,
  mirrorAmrOnboardingProfileAnalytics,
  parseAmrEntryAnalyticsPayload,
  parseAmrOnboardingProfileAnalyticsPayload,
  applyVelaLiveAccount,
  clearAllVelaLiveAccounts,
  parseVelaLoginAttribution,
  peekVelaLiveAccount,
  readVelaCredentialRevision,
  readVelaLoginStatus,
  setVelaLiveAccount,
  shouldRefreshVelaLiveAccount,
  velaLiveAccountCacheKey,
  spawnVelaLogin,
  type VelaLiveAccount,
} from '../integrations/vela.js';
import {
  clearVelaWalletSnapshotCache,
  velaWalletSnapshotReader,
} from '../integrations/vela-wallet.js';
import { amrModelLoadingCache } from '../runtimes/amr-model-cache.js';
import {
  fetchVelaBillingSummary,
  fetchVelaPresetModels,
  fetchVelaRemoteModelsWithRetry,
} from '../runtimes/defs/amr.js';

const AMR_API_PROXY_PREFIX = '/api/integrations/vela/api-proxy';
const AMR_API_UPSTREAM_ORIGIN = 'https://amr-api.open-design.ai';

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

function proxyAmrApiRequest(req: Request, res: Response): void {
  const suffix = req.originalUrl.slice(AMR_API_PROXY_PREFIX.length);
  if (!suffix.startsWith('/api/v1/')) {
    res.status(404).json({ error: 'unknown_amr_api_proxy_path' });
    return;
  }
  const target = new URL(suffix, AMR_API_UPSTREAM_ORIGIN);
  const body = velaProxyRequestBody(req);
  const streamBody = shouldStreamVelaProxyRequest(req, body);
  const headers: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (
      lower === 'host' ||
      lower === 'connection' ||
      lower === 'transfer-encoding'
    ) {
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
      for (const [key, value] of Object.entries(upstreamRes.headers)) {
        if (value !== undefined) res.setHeader(key, value);
      }
      upstreamRes.pipe(res);
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
  if (body) upstream.write(body);
  if (streamBody) {
    req.pipe(upstream);
  } else {
    upstream.end();
  }
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
    const cacheKey = JSON.stringify({
      launchPath,
      home: spawnEnv.HOME ?? spawnEnv.USERPROFILE ?? '',
      openDesignAmrProfile: spawnEnv.OPEN_DESIGN_AMR_PROFILE ?? '',
      velaProfile: spawnEnv.VELA_PROFILE ?? '',
      velaLinkUrl: spawnEnv.VELA_LINK_URL ?? '',
      velaRuntimeKey: spawnEnv.VELA_RUNTIME_KEY ?? '',
      velaOpencodeBin: spawnEnv.VELA_OPENCODE_BIN ?? '',
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
  function fetchVelaLiveAccountSingleFlight(
    accountCacheKey: string,
    probe: AmrModelProbe,
  ): Promise<VelaLiveAccount | null> {
    const existing = inFlightVelaAccountFetches.get(accountCacheKey);
    if (existing) return existing;
    const pending = (async () => {
      amrModelLoadingCache.warm(probe.cacheKey, () =>
        fetchVelaRemoteModelsWithRetry(probe.launchPath, probe.env),
      );
      const account = await fetchVelaBillingSummary(probe.launchPath, probe.env);
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
      const status = readVelaLoginStatus(mergeVelaEnv(env, configuredEnv));
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
        if (!cachedAccount) {
          // Cold cache (or a fetch already in flight): BLOCK on the single-flight
          // billing fetch so the first open already carries plan/balance. The
          // consumers (settings card, inline switcher, avatar) read /status once
          // and do not re-poll, so returning config-only here would hide the
          // fields until the user refocuses. On failure the helper resolves null
          // and the refresh throttle becomes a short negative cache/backoff, so
          // repeated menu/focus polls degrade to config-only instead of each
          // awaiting the same optional billing probe.
          const liveAccount =
            inFlightVelaAccountFetches.has(accountCacheKey) ||
            shouldRefreshVelaLiveAccount(accountCacheKey)
              ? await fetchVelaLiveAccountSingleFlight(accountCacheKey, probe)
              : null;
          applyVelaLiveAccount(status, liveAccount);
        } else {
          // Warm cache: serve it immediately; refresh in the background for the
          // next poll once the TTL has lapsed.
          applyVelaLiveAccount(status, cachedAccount);
          if (shouldRefreshVelaLiveAccount(accountCacheKey)) {
            void fetchVelaLiveAccountSingleFlight(accountCacheKey, probe).catch(() => {});
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
      res.json(snapshot);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.all('/api/integrations/vela/api-proxy/*splat', proxyAmrApiRequest);

  app.post('/api/integrations/vela/login', async (req, res) => {
    try {
      const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
      const configuredEnv = agentCliEnvForAgent(appConfig.agentCliEnv, 'amr');
      const analyticsContext = readAnalyticsContext(req);
      const attribution = parseVelaLoginAttribution(req.body);
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
      // resolves fine. So only fall back to the proxy when the direct attempt
      // fails to start — never when a login is already in flight.
      let spawned;
      try {
        spawned = await spawnVelaLogin({
          configuredEnv,
          attribution: loginAttribution,
          // Block until the direct attempt reaches device-auth steady state or
          // exits/errors before it, so a direct failure that arrives AFTER the
          // 250ms startup grace (the common shape on a broken edge path) still
          // falls through to the proxy retry below instead of returning 202.
          waitForActivation: true,
        });
      } catch (directErr) {
        const directMessage =
          directErr instanceof Error ? directErr.message : String(directErr);
        if (/already running/i.test(directMessage)) throw directErr;
        spawned = await spawnVelaLogin({
          configuredEnv,
          attribution: loginAttribution,
          defaultApiUrl: velaApiProxyBaseUrl(req, getPublicBaseUrl),
          waitForActivation: true,
        });
      }
      res.status(202).json(spawned);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = /already running/i.test(message) ? 409 : 500;
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/integrations/vela/login/cancel', (_req, res) => {
    try {
      res.json(cancelVelaLogin());
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
