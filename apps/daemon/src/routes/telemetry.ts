import express, { type Express } from 'express';
import { SIDECAR_DEFAULTS, SIDECAR_ENV } from '@open-design/sidecar-proto';
import { type ObservabilityEventRequest } from '@open-design/contracts/analytics';
import {
  createAnalyticsService,
  readPublicConfigResponse,
} from '../analytics.js';
import type { readAppConfig } from '../app-config.js';
import { readCurrentAppVersionInfo } from '../app-version.js';
import { reportRunFeedbackFromDaemon } from '../langfuse-bridge.js';
import { observePendingInstallerApplyAttempts } from '../update-apply-observations.js';

export interface DaemonTelemetry {
  analyticsService: ReturnType<typeof createAnalyticsService>;
  getCachedAppVersion: () => any;
  reportFeedback: (req: {
    runId: string;
    rating: 'positive' | 'negative';
    reasonCodes: string[];
    hasCustomReason: boolean;
    customReason: string;
    scoreMetadata?: Record<string, unknown>;
  }) => ReturnType<typeof reportRunFeedbackFromDaemon>;
}

export interface RegisterTelemetryRoutesDeps {
  dataDir: string;
  readAppConfig: typeof readAppConfig;
}

export function registerTelemetryRoutes(app: Express, deps: RegisterTelemetryRoutesDeps): DaemonTelemetry {
  const { dataDir } = deps;
  const analyticsService = createAnalyticsService({ dataDir });
  let cachedAppVersion: any = null;

  // PostHog runtime config.
  //
  // - `enabled` reflects ONLY the user's consent toggle (Privacy -> "Share
  //   usage data"). When false, posthog-js's full autocapture/$pageview/
  //   $autocapture pipeline must stay off.
  // - `key` and `host` are populated whenever the server has a build-time
  //   POSTHOG_KEY, regardless of consent, so safety/error tracking can run.
  // - Without a build-time key, every telemetry client remains a no-op.
  app.get('/api/analytics/config', async (_req, res) => {
    const baseline = readPublicConfigResponse();
    if (!baseline.enabled) {
      res.json(baseline);
      return;
    }
    try {
      const appCfg = await deps.readAppConfig(dataDir);
      const consentGranted = appCfg.telemetry?.metrics === true;
      const installationId =
        typeof appCfg.installationId === 'string' && appCfg.installationId
          ? appCfg.installationId
          : null;
      res.json({
        enabled: consentGranted,
        env: baseline.env,
        key: baseline.key,
        host: baseline.host,
        installationId,
      });
    } catch {
      res.json({
        enabled: false,
        env: baseline.env,
        key: baseline.key,
        host: baseline.host,
        installationId: null,
      });
    }
  });

  app.post('/api/observability/event', express.json({ limit: '64kb' }), (req, res) => {
    const body = (req.body ?? {}) as Partial<ObservabilityEventRequest>;
    const eventName = typeof body.event === 'string' ? body.event.trim() : '';
    if (!eventName) {
      res.status(400).json({ error: 'missing or invalid `event` field' });
      return;
    }
    const properties =
      body.properties != null && typeof body.properties === 'object' && !Array.isArray(body.properties)
        ? (body.properties as Record<string, unknown>)
        : {};
    analyticsService.captureSafety({
      eventName,
      appVersion: cachedAppVersion?.version ?? '0.0.0',
      properties,
    });
    res.json({ ok: true });
  });

  installFatalTelemetryHandlers({
    analyticsService,
    getAppVersion: () => cachedAppVersion,
  });

  void (async () => {
    try {
      cachedAppVersion = await readCurrentAppVersionInfo();
      await observePendingInstallerApplyAttempts({
        analytics: analyticsService,
        appVersion: cachedAppVersion.version,
        currentChannel: cachedAppVersion.channel,
        currentVersion: cachedAppVersion.version,
        dataRoot: dataDir,
        logger: console,
        namespace: process.env[SIDECAR_ENV.NAMESPACE] ?? SIDECAR_DEFAULTS.namespace,
      });
    } catch {
      // Telemetry is best-effort; appVersion is omitted when unavailable.
    }
  })();

  return {
    analyticsService,
    getCachedAppVersion: () => cachedAppVersion,
    reportFeedback: (req) =>
      reportRunFeedbackFromDaemon({
        dataDir,
        ...req,
      }),
  };
}

function installFatalTelemetryHandlers({
  analyticsService,
  getAppVersion,
}: {
  analyticsService: ReturnType<typeof createAnalyticsService>;
  getAppVersion: () => any;
}): void {
  const FATAL_FLUSH_TIMEOUT_MS = 1000;
  let fatalShuttingDown = false;
  const triggerFatalShutdown = (
    eventName: string,
    properties: Record<string, unknown>,
  ): void => {
    if (fatalShuttingDown) return;
    fatalShuttingDown = true;
    const flushSequence = (async () => {
      try {
        await analyticsService.captureSafety({
          eventName,
          appVersion: getAppVersion()?.version ?? '0.0.0',
          properties,
        });
      } catch {
        // capture must never block the exit path
      }
      await analyticsService.shutdown();
    })();
    void Promise.race([
      flushSequence,
      new Promise<void>((resolve) => {
        const handle = setTimeout(resolve, FATAL_FLUSH_TIMEOUT_MS);
        handle.unref?.();
      }),
    ]).finally(() => {
      process.exitCode = 1;
      process.exit(1);
    });
  };
  process.on('uncaughtException', (error) => {
    triggerFatalShutdown('daemon_uncaught_exception', {
      error_message: error?.message ?? String(error),
      error_name: error?.name ?? 'Error',
      error_stack: typeof error?.stack === 'string' ? error.stack.slice(0, 8192) : undefined,
    });
  });
  process.on('unhandledRejection', (reason) => {
    const asError = reason instanceof Error ? reason : null;
    triggerFatalShutdown('daemon_unhandled_rejection', {
      error_message: asError?.message ?? (typeof reason === 'string' ? reason : String(reason)),
      error_name: asError?.name ?? 'NonErrorRejection',
      error_stack: typeof asError?.stack === 'string' ? asError.stack.slice(0, 8192) : undefined,
    });
  });
}
