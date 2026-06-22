import path from 'node:path';
import type { Express, RequestHandler } from 'express';
import { readCurrentAppVersionInfo } from '../app-version.js';
import { getCritiqueMetrics, register } from '../metrics/index.js';
import { readConformanceHistory } from '../critique/conformance-history.js';
import { evaluateRollout } from '../critique/ratchet.js';
import { parseRolloutPhase } from '../critique/rollout.js';

export interface RegisterDaemonRoutesDeps {
  db: any;
  paths: {
    RUNTIME_DATA_DIR: string;
  };
  http: {
    requireLocalDaemonRequest: RequestHandler;
    sendApiError: (...args: any[]) => any;
  };
  host: string;
  getResolvedPort: () => number;
  getDaemonShuttingDown: () => boolean;
  sandboxRuntime: {
    enabled: boolean;
    roots?: unknown;
  };
  env: NodeJS.ProcessEnv;
}

export function registerDaemonRoutes(app: Express, deps: RegisterDaemonRoutesDeps): void {
  const { db, env, host, http, paths, sandboxRuntime } = deps;
  const { requireLocalDaemonRequest, sendApiError } = http;

  app.get('/api/daemon/status', async (_req, res) => {
    const versionInfo = await readCurrentAppVersionInfo();
    res.json({
      ok: true,
      version: versionInfo.version,
      bindHost: host,
      port: deps.getResolvedPort(),
      dataDir: paths.RUNTIME_DATA_DIR,
      mediaConfigDir: env.OD_MEDIA_CONFIG_DIR ?? null,
      sandboxMode: sandboxRuntime.enabled,
      sandbox: sandboxRuntime.enabled
        ? { enabled: true, roots: sandboxRuntime.roots }
        : { enabled: false },
      pid: process.pid,
      shuttingDown: deps.getDaemonShuttingDown(),
      installedPlugins: (() => {
        try {
          return (db.prepare('SELECT COUNT(*) AS n FROM installed_plugins').get())?.n ?? 0;
        } catch {
          return 0;
        }
      })(),
    });
  });

  app.get('/api/daemon/db', async (_req, res) => {
    try {
      const { inspectSqliteDatabase } = await import('../storage/db-inspect.js');
      const file = path.join(paths.RUNTIME_DATA_DIR, 'app.sqlite');
      const report = await inspectSqliteDatabase({ db, file });
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/agents/:agentId/oauth-launch', requireLocalDaemonRequest, async (req, res) => {
    const agentId = req.params.agentId;
    if (agentId !== 'antigravity') {
      return res.status(400).json({
        ok: false,
        error: `oauth-launch is only supported for antigravity, got ${agentId}`,
      });
    }
    try {
      const { launchAgentInSystemTerminal } = await import('../runtimes/terminal-launch.js');
      const result = await launchAgentInSystemTerminal('agy');
      if (result.ok) {
        return res.json({ ok: true, platform: result.platform, via: result.via });
      }
      return res.status(500).json({
        ok: false,
        platform: result.platform,
        error: result.reason,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: String(err),
      });
    }
  });

  app.post('/api/daemon/db/verify', requireLocalDaemonRequest, async (req, res) => {
    try {
      const { verifySqliteIntegrity } = await import('../storage/db-inspect.js');
      const quick = String(req.query.quick ?? '').toLowerCase();
      const report = verifySqliteIntegrity({ db, quick: quick === '1' || quick === 'true' });
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/daemon/db/vacuum', requireLocalDaemonRequest, async (_req, res) => {
    try {
      const { inspectSqliteDatabase } = await import('../storage/db-inspect.js');
      const file = path.join(paths.RUNTIME_DATA_DIR, 'app.sqlite');
      const before = await inspectSqliteDatabase({ db, file });
      const startedAt = Date.now();
      db.exec('VACUUM');
      const elapsedMs = Date.now() - startedAt;
      const after = await inspectSqliteDatabase({ db, file });
      res.json({
        ok: true,
        beforeBytes: before.sizeBytes,
        afterBytes:  after.sizeBytes,
        reclaimedBytes: Math.max(0, before.sizeBytes - after.sizeBytes),
        elapsedMs,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/daemon/shutdown', requireLocalDaemonRequest, (_req, res) => {
    res.status(202).json({ ok: true, scheduled: true });
    setImmediate(() => {
      try {
        process.emit('SIGTERM');
      } catch {
        // Best-effort; if the listener was removed the kernel SIGTERM fallback remains.
      }
    });
  });

  if (env.OD_METRICS_ENDPOINT !== 'disabled') {
    app.get('/api/metrics', async (_req, res) => {
      res.setHeader('Content-Type', register.contentType);
      res.send(await getCritiqueMetrics());
    });
  }

  const parsePositiveInt = (raw: unknown, fallback: number): number => {
    if (typeof raw !== 'string' || raw.length === 0) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };
  const parseRate = (raw: unknown, fallback: number): number => {
    if (typeof raw !== 'string' || raw.length === 0) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
  };
  app.get('/api/critique/conformance', async (req, res) => {
    try {
      const windowDays = parsePositiveInt(req.query.windowDays, 14);
      const shippedThreshold = parseRate(req.query.shippedThreshold, 0.90);
      const cleanParseThreshold = parseRate(req.query.cleanParseThreshold, 0.95);
      const history = await readConformanceHistory(paths.RUNTIME_DATA_DIR, windowDays);
      const decision = evaluateRollout({
        current: parseRolloutPhase(env.OD_CRITIQUE_ROLLOUT_PHASE),
        history,
        windowDays,
        shippedThreshold,
        cleanParseThreshold,
      });
      res.json({ window: { days: windowDays, history }, decision });
    } catch (err) {
      sendApiError(res, 500, 'INTERNAL_ERROR', err instanceof Error ? err.message : String(err));
    }
  });
}
