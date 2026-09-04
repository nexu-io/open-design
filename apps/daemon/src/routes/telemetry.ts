import express, { type Express } from 'express';
import { SIDECAR_DEFAULTS } from '@open-design/sidecar-proto';
import { randomUUID } from 'node:crypto';
import {
  type McpAnalyticsEventRequest,
  type McpAnalyticsContextResponse,
  type ObservabilityEventRequest,
} from '@open-design/contracts/analytics';
import {
  createAnalyticsService,
  readAnalyticsContext,
  readPublicConfigResponse,
} from '../analytics.js';
import type { AnalyticsContext } from '../analytics.js';
import type { readAppConfig, writeAppConfig } from '../app-config.js';
import { readCurrentAppVersionInfo, UNKNOWN_APP_VERSION } from '../app-version.js';
import { reportRunFeedbackFromDaemon } from '../langfuse-bridge.js';
import { observePendingInstallerApplyAttempts } from '../migration/index.js';
import {
  OPEN_DESIGN_PLUGIN_ID,
} from '../mcp-observability.js';

export interface DaemonTelemetry {
  analyticsService: ReturnType<typeof createAnalyticsService>;
  disposeFatalHandlers: () => void;
  getCachedAppVersion: () => any;
  resolveAppVersion: () => Promise<any>;
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
  namespace?: string;
  readAppConfig: typeof readAppConfig;
  writeAppConfig: typeof writeAppConfig;
}

export function resolveInstallerObservationNamespace(namespace: string | undefined): string {
  return namespace ?? SIDECAR_DEFAULTS.namespace;
}

export async function resolveMcpAnalyticsContext(
  deps: RegisterTelemetryRoutesDeps,
): Promise<McpAnalyticsContextResponse> {
  const disabled: McpAnalyticsContextResponse = {
    enabled: false,
    deviceId: null,
    locale: 'en',
  };
  try {
    let appCfg = await deps.readAppConfig(deps.dataDir);
    if (appCfg.telemetry?.metrics !== true) return disabled;
    let installationId =
      typeof appCfg.installationId === 'string' && appCfg.installationId
        ? appCfg.installationId
        : null;
    if (!installationId) {
      installationId = randomUUID();
      appCfg = await deps.writeAppConfig(deps.dataDir, { installationId });
      installationId =
        typeof appCfg.installationId === 'string' && appCfg.installationId
          ? appCfg.installationId
          : null;
    }
    return {
      enabled: installationId !== null,
      deviceId: installationId,
      locale: 'en',
    };
  } catch {
    return disabled;
  }
}

/**
 * Treat analytics headers as correlation hints, never as identity authority.
 * The accepted device id must be the installation id currently stored under
 * the daemon's resolved data root, and metrics consent must still be enabled.
 */
export async function resolveTrustedMcpEventContext(
  deps: RegisterTelemetryRoutesDeps,
  context: AnalyticsContext | null,
): Promise<AnalyticsContext | null> {
  if (!context || context.clientType !== 'external_mcp') return null;
  try {
    const appCfg = await deps.readAppConfig(deps.dataDir);
    const installationId =
      typeof appCfg.installationId === 'string' && appCfg.installationId
        ? appCfg.installationId
        : null;
    if (
      appCfg.telemetry?.metrics !== true
      || !installationId
      || context.deviceId !== installationId
    ) {
      return null;
    }
    return context;
  } catch {
    return null;
  }
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

  // Local stdio MCP needs the same anonymous install identity as the web UI,
  // including on a headless-first launch. This endpoint never returns the
  // PostHog key and never creates a plugin-specific identity. Explicit
  // telemetry opt-out is authoritative and yields no identity.
  app.post('/api/analytics/mcp/context', express.json({ limit: '1kb' }), async (_req, res) => {
    res.json(await resolveMcpAnalyticsContext(deps));
  });

  app.post('/api/analytics/mcp/event', express.json({ limit: '16kb' }), async (req, res) => {
    const body = (req.body ?? {}) as Partial<McpAnalyticsEventRequest>;
    const allowedEvents = new Set([
      'mcp_session_initialized',
      'mcp_tool_started',
      'mcp_tool_finished',
    ]);
    if (typeof body.event !== 'string' || !allowedEvents.has(body.event)) {
      res.status(400).json({ error: 'invalid MCP analytics event' });
      return;
    }
    if (
      typeof body.eventId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
        .test(body.eventId)
    ) {
      res.status(400).json({ error: 'invalid MCP analytics event id' });
      return;
    }
    const occurredAt =
      typeof body.occurredAt === 'string' ? new Date(body.occurredAt) : null;
    if (!occurredAt || !Number.isFinite(occurredAt.getTime())) {
      res.status(400).json({ error: 'invalid MCP analytics event time' });
      return;
    }
    const eventAgeMs = Date.now() - occurredAt.getTime();
    if (
      eventAgeMs < -5 * 60 * 1000
      || eventAgeMs > 24 * 60 * 60 * 1000
    ) {
      res.status(400).json({ error: 'MCP analytics event time is out of range' });
      return;
    }
    const context = await resolveTrustedMcpEventContext(
      deps,
      readAnalyticsContext(req),
    );
    if (!context) {
      res.status(400).json({ error: 'missing external MCP analytics context' });
      return;
    }
    let validatedProperties: Record<string, string | number | boolean>;
    try {
      validatedProperties = validateMcpAnalyticsEventProperties(
        body.event as McpAnalyticsEventRequest['event'],
        body.properties,
      );
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error
          ? error.message
          : 'invalid MCP analytics properties',
      });
      return;
    }
    const properties = {
      ...validatedProperties,
      occurred_at: occurredAt.toISOString(),
    };
    await analyticsService.capture({
      eventName: body.event,
      context,
      appVersion: cachedAppVersion?.version ?? UNKNOWN_APP_VERSION,
      properties,
      insertId: body.eventId,
    });
    res.json({ ok: true });
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
      appVersion: cachedAppVersion?.version ?? UNKNOWN_APP_VERSION,
      properties,
    });
    res.json({ ok: true });
  });

  const disposeFatalHandlers = installFatalTelemetryHandlers({
    analyticsService,
    getAppVersion: () => cachedAppVersion,
  });

  const appVersionPromise = (async () => {
    try {
      cachedAppVersion = await readCurrentAppVersionInfo();
      void observePendingInstallerApplyAttempts({
        analytics: analyticsService,
        appVersion: cachedAppVersion.version,
        currentChannel: cachedAppVersion.channel,
        currentVersion: cachedAppVersion.version,
        dataRoot: dataDir,
        logger: console,
        namespace: resolveInstallerObservationNamespace(deps.namespace),
      }).catch(() => {
        // Update-apply telemetry must not delay daemon version readiness.
      });
      return cachedAppVersion;
    } catch {
      // Telemetry is best-effort; appVersion is omitted when unavailable.
      return null;
    }
  })();

  return {
    analyticsService,
    disposeFatalHandlers,
    getCachedAppVersion: () => cachedAppVersion,
    resolveAppVersion: () => appVersionPromise,
    reportFeedback: (req) =>
      reportRunFeedbackFromDaemon({
        dataDir,
        ...req,
      }),
  };
}

const MCP_ANALYTICS_PROPERTY_KEYS = new Set([
  'mcp_session_id',
  'host_product',
  'external_plugin_id',
  'external_plugin_version',
  'distribution_mechanism',
  'publisher_class',
  'attribution_quality',
  'plugin_workflow_id',
  'tool_name',
  'tool_attempt_id',
  'attempt_number',
  'result',
  'duration_ms',
  'error_code',
  'failure_stage',
  'failure_source',
  'failure_category',
  'retryable',
  'user_action',
  'run_id',
  'project_id',
  'logical_request_digest',
  'logical_request_digest_version',
  'delivery_kind',
  'delivery_result',
  'deliverable_validation',
  'poll_state',
  'poll_attempt_count',
  'correlation_status',
  'artifact_type',
  'skipped_file_count',
  'truncated',
]);

const MCP_HOST_PRODUCTS = new Set([
  'codex_desktop',
  'codex_cli',
  'codex_unknown',
  'claude_code',
  'unknown',
]);
const MCP_ATTRIBUTION_QUALITIES = new Set([
  'self_reported',
  'session_correlated',
]);
const MCP_RESULTS = new Set(['success', 'failed', 'cancelled', 'blocked']);
const MCP_FAILURE_STAGES = new Set([
  'brief',
  'auth',
  'project',
  'bootstrap',
  'mcp_initialize',
  'run_accept',
  'runtime_preflight',
  'generation',
  'recharge_wait',
  'artifact_validation',
  'delivery',
  'finalize',
]);
const MCP_FAILURE_SOURCES = new Set([
  'codex_host',
  'local_mcp',
  'open_design_daemon',
  'runtime_cli',
  'vela_api',
  'model_provider',
  'artifact_store',
  'preview_delivery',
  'unknown',
]);
const MCP_FAILURE_CATEGORIES = new Set([
  'invalid_request',
  'availability',
  'invalid_output',
  'auth',
  'upstream',
  'unknown',
]);
const MCP_DELIVERY_KINDS = new Set([
  'preview_studio_reference',
  'artifact_context_bundle',
]);
const MCP_DELIVERY_RESULTS = new Set(['complete', 'partial', 'failed']);
const MCP_POLL_STATES = new Set(['non_terminal', 'terminal']);
const MCP_CORRELATION_STATUSES = new Set([
  'matched',
  'missing_workflow',
  'project_mismatch',
  'run_mismatch',
  'unknown',
]);
const MCP_DISTRIBUTION_MECHANISMS = new Set([
  'git_marketplace',
  'local_repo',
  'manual',
  'unknown',
]);
const MCP_PUBLISHER_CLASSES = new Set([
  'open_design_first_party',
  'third_party',
  'unknown',
]);
const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UUID_OR_ULID_PATTERN =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9A-HJKMNP-TV-Z]{26})$/iu;
const BOUNDED_TOKEN_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/u;
const ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,64}$/u;
const SEMVER_PATTERN = /^[0-9]+(?:\.[0-9]+){2}(?:-[0-9A-Za-z.-]+)?$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;

function invalidMcpAnalytics(message: string): never {
  throw new Error(`invalid MCP analytics properties: ${message}`);
}

function requireMcpString(
  properties: Record<string, string | number | boolean>,
  key: string,
  pattern: RegExp = BOUNDED_TOKEN_PATTERN,
): string {
  const value = properties[key];
  if (typeof value !== 'string' || !pattern.test(value)) {
    invalidMcpAnalytics(`${key} is invalid`);
  }
  return value;
}

function requireMcpEnum(
  properties: Record<string, string | number | boolean>,
  key: string,
  values: Set<string>,
): string {
  const value = properties[key];
  if (typeof value !== 'string' || !values.has(value)) {
    invalidMcpAnalytics(`${key} is invalid`);
  }
  return value;
}

function validateOptionalMcpEnum(
  properties: Record<string, string | number | boolean>,
  key: string,
  values: Set<string>,
): void {
  if (properties[key] === undefined) return;
  requireMcpEnum(properties, key, values);
}

function validateOptionalNonNegativeInteger(
  properties: Record<string, string | number | boolean>,
  key: string,
  { minimum = 0, maximum = 1_000_000 } = {},
): void {
  const value = properties[key];
  if (value === undefined) return;
  if (
    typeof value !== 'number'
    || !Number.isInteger(value)
    || value < minimum
    || value > maximum
  ) {
    invalidMcpAnalytics(`${key} is invalid`);
  }
}

export function validateMcpAnalyticsEventProperties(
  event: McpAnalyticsEventRequest['event'],
  raw: unknown,
): Record<string, string | number | boolean> {
  const properties = sanitizeMcpAnalyticsProperties(raw);
  requireMcpString(properties, 'mcp_session_id', CANONICAL_UUID_PATTERN);
  requireMcpEnum(properties, 'host_product', MCP_HOST_PRODUCTS);
  validateOptionalMcpEnum(
    properties,
    'attribution_quality',
    MCP_ATTRIBUTION_QUALITIES,
  );
  validateOptionalMcpEnum(
    properties,
    'distribution_mechanism',
    MCP_DISTRIBUTION_MECHANISMS,
  );
  validateOptionalMcpEnum(
    properties,
    'publisher_class',
    MCP_PUBLISHER_CLASSES,
  );
  if (properties.external_plugin_id !== undefined) {
    if (properties.external_plugin_id !== OPEN_DESIGN_PLUGIN_ID) {
      invalidMcpAnalytics('external_plugin_id is invalid');
    }
    if (properties.external_plugin_version !== undefined) {
      requireMcpString(
        properties,
        'external_plugin_version',
        SEMVER_PATTERN,
      );
    }
    requireMcpEnum(
      properties,
      'attribution_quality',
      MCP_ATTRIBUTION_QUALITIES,
    );
  }
  if (properties.plugin_workflow_id !== undefined) {
    requireMcpString(
      properties,
      'plugin_workflow_id',
      UUID_OR_ULID_PATTERN,
    );
  }
  const hasDigest = properties.logical_request_digest !== undefined;
  const hasDigestVersion =
    properties.logical_request_digest_version !== undefined;
  if (hasDigest !== hasDigestVersion) {
    invalidMcpAnalytics('logical request digest fields must be paired');
  }
  if (hasDigest) {
    requireMcpString(
      properties,
      'logical_request_digest',
      DIGEST_PATTERN,
    );
    if (properties.logical_request_digest_version !== 1) {
      invalidMcpAnalytics('logical_request_digest_version is invalid');
    }
  }
  if (event === 'mcp_session_initialized') return properties;

  requireMcpString(properties, 'tool_name');
  requireMcpString(properties, 'tool_attempt_id', CANONICAL_UUID_PATTERN);
  validateOptionalNonNegativeInteger(properties, 'attempt_number', {
    minimum: 1,
  });
  if (properties.attempt_number === undefined) {
    invalidMcpAnalytics('attempt_number is required');
  }
  if (event === 'mcp_tool_started') return properties;

  requireMcpEnum(properties, 'result', MCP_RESULTS);
  const durationMs = properties.duration_ms;
  if (
    typeof durationMs !== 'number'
    || !Number.isFinite(durationMs)
    || durationMs < 0
    || durationMs > 24 * 60 * 60 * 1000
  ) {
    invalidMcpAnalytics('duration_ms is invalid');
  }
  if (properties.error_code !== undefined) {
    requireMcpString(properties, 'error_code', ERROR_CODE_PATTERN);
  }
  validateOptionalMcpEnum(properties, 'failure_stage', MCP_FAILURE_STAGES);
  validateOptionalMcpEnum(properties, 'failure_source', MCP_FAILURE_SOURCES);
  validateOptionalMcpEnum(
    properties,
    'failure_category',
    MCP_FAILURE_CATEGORIES,
  );
  validateOptionalMcpEnum(properties, 'delivery_kind', MCP_DELIVERY_KINDS);
  validateOptionalMcpEnum(properties, 'delivery_result', MCP_DELIVERY_RESULTS);
  validateOptionalMcpEnum(properties, 'poll_state', MCP_POLL_STATES);
  validateOptionalMcpEnum(
    properties,
    'correlation_status',
    MCP_CORRELATION_STATUSES,
  );
  validateOptionalNonNegativeInteger(properties, 'poll_attempt_count', {
    minimum: 1,
  });
  validateOptionalNonNegativeInteger(properties, 'skipped_file_count');
  if (properties.user_action !== undefined) {
    requireMcpString(properties, 'user_action');
  }
  return properties;
}

export function sanitizeMcpAnalyticsProperties(
  raw: unknown,
): Record<string, string | number | boolean> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!MCP_ANALYTICS_PROPERTY_KEYS.has(key)) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed && trimmed.length <= 256) out[key] = trimmed;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value;
    } else if (typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return out;
}

function installFatalTelemetryHandlers({
  analyticsService,
  getAppVersion,
}: {
  analyticsService: ReturnType<typeof createAnalyticsService>;
  getAppVersion: () => any;
}): () => void {
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
          appVersion: getAppVersion()?.version ?? UNKNOWN_APP_VERSION,
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
  const onUncaughtException = (error: Error) => {
    triggerFatalShutdown('daemon_uncaught_exception', {
      error_message: error?.message ?? String(error),
      error_name: error?.name ?? 'Error',
      error_stack: typeof error?.stack === 'string' ? error.stack.slice(0, 8192) : undefined,
    });
  };
  const onUnhandledRejection = (reason: unknown) => {
    const asError = reason instanceof Error ? reason : null;
    triggerFatalShutdown('daemon_unhandled_rejection', {
      error_message: asError?.message ?? (typeof reason === 'string' ? reason : String(reason)),
      error_name: asError?.name ?? 'NonErrorRejection',
      error_stack: typeof asError?.stack === 'string' ? asError.stack.slice(0, 8192) : undefined,
    });
  };
  process.on('uncaughtException', onUncaughtException);
  process.on('unhandledRejection', onUnhandledRejection);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    process.off('uncaughtException', onUncaughtException);
    process.off('unhandledRejection', onUnhandledRejection);
  };
}
