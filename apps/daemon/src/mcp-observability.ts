import { createHash } from 'node:crypto';

import type {
  AnalyticsAttributionQuality,
  AnalyticsDistributionMechanism,
  AnalyticsEntrySurface,
  AnalyticsHostProduct,
  AnalyticsPublisherClass,
} from '@open-design/contracts/analytics';

export const OPEN_DESIGN_PLUGIN_ID = 'open-design';
export const PLUGIN_TELEMETRY_SCHEMA_VERSION = 3;
const MIN_PLUGIN_GENERATION_SLO_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_PLUGIN_GENERATION_SLO_WINDOW_MS = 45 * 60 * 1000;
const MAX_PLUGIN_GENERATION_SLO_WINDOW_MS = 24 * 60 * 60 * 1000;
const PLUGIN_GENERATION_TERMINAL_BUFFER_MS = 60 * 1000;

export interface ExternalPluginContext {
  id: typeof OPEN_DESIGN_PLUGIN_ID;
  version: string;
  distributionMechanism: AnalyticsDistributionMechanism;
  publisherClass: AnalyticsPublisherClass;
}

export interface ExternalPluginRunAnalyticsHints {
  entrySurface: AnalyticsEntrySurface;
  hostProduct: AnalyticsHostProduct;
  externalPluginId: typeof OPEN_DESIGN_PLUGIN_ID;
  externalPluginVersion: string;
  distributionMechanism: AnalyticsDistributionMechanism;
  publisherClass: AnalyticsPublisherClass;
  attributionQuality: AnalyticsAttributionQuality;
  pluginWorkflowId: string;
  logicalRequestDigest: string;
  logicalRequestDigestVersion: 1;
  briefState: 'confirmed' | 'skipped' | 'not_applicable';
}

interface PluginAnalyticsContextLike {
  deviceId?: unknown;
  sessionId?: unknown;
  clientType?: unknown;
  locale?: unknown;
  requestId?: unknown;
  entrySurface?: unknown;
  hostProduct?: unknown;
  externalPluginId?: unknown;
  externalPluginVersion?: unknown;
  distributionMechanism?: unknown;
  publisherClass?: unknown;
  attributionQuality?: unknown;
  mcpSessionId?: unknown;
}

const ALLOWED_CONTEXT_KEYS = new Set([
  'id',
  'version',
  'distributionMechanism',
  'publisherClass',
]);
const ALLOWED_DISTRIBUTION = new Set<AnalyticsDistributionMechanism>([
  'git_marketplace',
  'local_repo',
  'manual',
  'unknown',
]);
const ALLOWED_PUBLISHER = new Set<AnalyticsPublisherClass>([
  'open_design_first_party',
  'third_party',
  'unknown',
]);
const ALLOWED_HOST_PRODUCT = new Set<AnalyticsHostProduct>([
  'codex_desktop',
  'codex_cli',
  'codex_unknown',
  'claude_code',
  'unknown',
]);
const EXTERNAL_PLUGIN_RUN_HINT_KEYS = new Set([
  'entrySurface',
  'hostProduct',
  'externalPluginId',
  'externalPluginVersion',
  'distributionMechanism',
  'publisherClass',
  'attributionQuality',
  'pluginWorkflowId',
  'logicalRequestDigest',
  'logicalRequestDigestVersion',
  'briefState',
]);
const EXTERNAL_PLUGIN_RUN_RESERVED_KEY =
  /^(?:entrySurface|hostProduct|externalPlugin|distributionMechanism|publisherClass|attributionQuality|pluginWorkflow|logicalRequest|generationSlo)/u;
const VERSION_PATTERN = /^[0-9]+(?:\.[0-9]+){2}(?:-[0-9A-Za-z.-]+)?$/u;
const WORKFLOW_ID_PATTERN =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9A-HJKMNP-TV-Z]{26})$/iu;

export function pluginContractError(message: string): Error {
  const error = new Error(`PLUGIN_CONTRACT_REJECTED: ${message}`);
  Object.assign(error, { code: 'PLUGIN_CONTRACT_REJECTED' });
  return error;
}

export function validateExternalPluginContext(
  value: unknown,
): ExternalPluginContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw pluginContractError('externalPluginContext must be an object');
  }
  const input = value as Record<string, unknown>;
  const extra = Object.keys(input).filter((key) => !ALLOWED_CONTEXT_KEYS.has(key));
  if (extra.length > 0) {
    throw pluginContractError(`unsupported externalPluginContext field: ${extra[0]}`);
  }
  if (input.id !== OPEN_DESIGN_PLUGIN_ID) {
    throw pluginContractError(
      `id must be ${OPEN_DESIGN_PLUGIN_ID}`,
    );
  }
  if (
    typeof input.version !== 'string'
    || !VERSION_PATTERN.test(input.version)
    || input.version.length > 64
  ) {
    throw pluginContractError('version must be a bounded semver string');
  }
  if (
    typeof input.distributionMechanism !== 'string'
    || !ALLOWED_DISTRIBUTION.has(
      input.distributionMechanism as AnalyticsDistributionMechanism,
    )
  ) {
    throw pluginContractError('distributionMechanism is invalid');
  }
  if (
    typeof input.publisherClass !== 'string'
    || !ALLOWED_PUBLISHER.has(input.publisherClass as AnalyticsPublisherClass)
  ) {
    throw pluginContractError('publisherClass is invalid');
  }
  return {
    id: OPEN_DESIGN_PLUGIN_ID,
    version: input.version,
    distributionMechanism:
      input.distributionMechanism as AnalyticsDistributionMechanism,
    publisherClass: input.publisherClass as AnalyticsPublisherClass,
  };
}

export function validatePluginWorkflowId(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length > 64
    || !WORKFLOW_ID_PATTERN.test(value)
  ) {
    throw pluginContractError(
      'pluginWorkflowId must be a canonical UUID or ULID',
    );
  }
  return value;
}

export function mapMcpHostProduct(
  clientInfo: { name?: unknown; version?: unknown } | null | undefined,
): AnalyticsHostProduct {
  const name =
    typeof clientInfo?.name === 'string'
      ? clientInfo.name.trim().toLowerCase()
      : '';
  if (name.includes('claude')) return 'claude_code';
  if (name.includes('codex')) return 'codex_unknown';
  return 'unknown';
}

export function logicalPluginRequestDigest(requestId: string): {
  version: 1;
  digest: string;
} {
  return {
    version: 1,
    digest: createHash('sha256')
      .update(`od-plugin-logical-request:v1:${requestId}`)
      .digest('hex'),
  };
}

export function normalizeExternalPluginRunAnalyticsHints(
  value: unknown,
  input: {
    clientRequestId: unknown;
    analyticsContext: PluginAnalyticsContextLike | null | undefined;
  },
): ExternalPluginRunAnalyticsHints {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw pluginContractError('analyticsHints must be an object');
  }
  const hints = value as Record<string, unknown>;
  for (const key of Object.keys(hints)) {
    if (
      EXTERNAL_PLUGIN_RUN_RESERVED_KEY.test(key)
      && !EXTERNAL_PLUGIN_RUN_HINT_KEYS.has(key)
    ) {
      throw pluginContractError(`unsupported external plugin analytics field: ${key}`);
    }
  }
  if (hints.entrySurface !== 'external_mcp') {
    throw pluginContractError('entrySurface must be external_mcp');
  }
  if (
    typeof hints.hostProduct !== 'string'
    || !ALLOWED_HOST_PRODUCT.has(hints.hostProduct as AnalyticsHostProduct)
  ) {
    throw pluginContractError('hostProduct is invalid');
  }
  const context = validateExternalPluginContext({
    id: hints.externalPluginId,
    version: hints.externalPluginVersion,
    distributionMechanism: hints.distributionMechanism,
    publisherClass: hints.publisherClass,
  });
  if (
    hints.attributionQuality !== undefined
    && hints.attributionQuality !== 'self_reported'
    && hints.attributionQuality !== 'session_correlated'
  ) {
    throw pluginContractError('attributionQuality is invalid');
  }
  const pluginWorkflowId = validatePluginWorkflowId(hints.pluginWorkflowId);
  if (
    hints.briefState !== 'confirmed'
    && hints.briefState !== 'skipped'
    && hints.briefState !== 'not_applicable'
  ) {
    throw pluginContractError('briefState is invalid');
  }
  if (
    typeof input.clientRequestId !== 'string'
    || input.clientRequestId.length === 0
  ) {
    throw pluginContractError('clientRequestId is required for plugin runs');
  }
  const expectedLogical = logicalPluginRequestDigest(input.clientRequestId);
  if (
    hints.logicalRequestDigestVersion !== expectedLogical.version
    || hints.logicalRequestDigest !== expectedLogical.digest
  ) {
    throw pluginContractError(
      'logical request digest does not match clientRequestId',
    );
  }
  const analyticsContext = input.analyticsContext;
  const sessionCorrelated =
    analyticsContext?.clientType === 'external_mcp'
    && analyticsContext.entrySurface === 'external_mcp'
    && analyticsContext.hostProduct === hints.hostProduct
    && analyticsContext.externalPluginId === context.id
    && analyticsContext.externalPluginVersion === context.version
    && analyticsContext.distributionMechanism === context.distributionMechanism
    && analyticsContext.publisherClass === context.publisherClass;
  return {
    entrySurface: 'external_mcp',
    hostProduct: hints.hostProduct as AnalyticsHostProduct,
    externalPluginId: context.id,
    externalPluginVersion: context.version,
    distributionMechanism: context.distributionMechanism,
    publisherClass: context.publisherClass,
    attributionQuality: sessionCorrelated
      ? 'session_correlated'
      : 'self_reported',
    pluginWorkflowId,
    logicalRequestDigest: expectedLogical.digest,
    logicalRequestDigestVersion: expectedLogical.version,
    briefState: hints.briefState,
  };
}

export function resolvePluginGenerationSloWindowMs(input: {
  inactivityTimeoutMs: number;
  configuredValue?: string | undefined;
}): number {
  const configured = Number(input.configuredValue);
  const requested = Number.isFinite(configured)
    ? Math.floor(configured)
    : DEFAULT_PLUGIN_GENERATION_SLO_WINDOW_MS;
  const boundedRequested = Math.min(
    MAX_PLUGIN_GENERATION_SLO_WINDOW_MS,
    Math.max(MIN_PLUGIN_GENERATION_SLO_WINDOW_MS, requested),
  );
  const runtimeFloor = Math.min(
    MAX_PLUGIN_GENERATION_SLO_WINDOW_MS,
    Math.max(
      MIN_PLUGIN_GENERATION_SLO_WINDOW_MS,
      Math.floor(input.inactivityTimeoutMs) + PLUGIN_GENERATION_TERMINAL_BUFFER_MS,
    ),
  );
  return Math.max(boundedRequested, runtimeFloor);
}
