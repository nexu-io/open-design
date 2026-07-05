/** @module langfuse-trace/config/sink-config
 * Resolves telemetry delivery configuration from environment variables and derives the
 * delivery state from user consent preferences plus sink presence.
 * Imports from core/ only; has no knowledge of payload shape or transport mechanics.
 */
import type { TelemetryPrefs } from '../../app-config.js';
import {
  DEFAULT_BASE_URL,
  DEFAULT_FETCH_RETRIES,
  DEFAULT_FETCH_TIMEOUT_MS,
  parseNonNegativeInt,
  parsePositiveInt,
} from '../core/index.js';
import type {
  LangfuseConfig,
  LangfuseDeliveryState,
  ReportRunOpts,
  TelemetrySinkConfig,
} from '../core/index.js';

/**
 * Reads direct Langfuse credentials from env and constructs a ready-to-use auth header.
 * Returns null when either LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY is absent,
 * keeping call sites free of credential-presence guards.
 * @param env - Process environment map; defaults to process.env for production use.
 * @returns A populated {@link LangfuseConfig} or null when credentials are incomplete.
 */
export function readLangfuseConfig(
  env: NodeJS.ProcessEnv = process.env,
): LangfuseConfig | null {
  const publicKey = env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = env.LANGFUSE_SECRET_KEY?.trim();
  if (!publicKey || !secretKey) return null;
  const baseUrl = (env.LANGFUSE_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(
    /\/+$/,
    '',
  );
  const authHeader =
    'Basic ' +
    Buffer.from(`${publicKey}:${secretKey}`, 'utf8').toString('base64');
  return {
    authHeader,
    baseUrl,
    timeoutMs: parsePositiveInt(
      env.LANGFUSE_TIMEOUT_MS,
      DEFAULT_FETCH_TIMEOUT_MS,
    ),
    retries: parseNonNegativeInt(env.LANGFUSE_RETRIES, DEFAULT_FETCH_RETRIES),
  };
}

/**
 * Resolve telemetry delivery in release-safe order: hosted relay first,
 * direct Langfuse credentials second for local smoke tests, disabled last.
 */
export function readTelemetrySinkConfig(
  env: NodeJS.ProcessEnv = process.env,
): TelemetrySinkConfig | null {
  const relayUrl = env.OPEN_DESIGN_TELEMETRY_RELAY_URL?.trim();
  if (relayUrl) {
    return {
      kind: 'relay',
      relayUrl: relayUrl.replace(/\/+$/, ''),
      timeoutMs: parsePositiveInt(
        env.OPEN_DESIGN_TELEMETRY_TIMEOUT_MS ?? env.LANGFUSE_TIMEOUT_MS,
        DEFAULT_FETCH_TIMEOUT_MS,
      ),
      retries: parseNonNegativeInt(
        env.OPEN_DESIGN_TELEMETRY_RETRIES ?? env.LANGFUSE_RETRIES,
        DEFAULT_FETCH_RETRIES,
      ),
    };
  }

  const config = readLangfuseConfig(env);
  return config == null ? null : { kind: 'langfuse', ...config };
}

/**
 * Maps user consent preferences and sink presence to a {@link LangfuseDeliveryState}.
 * Both metrics AND content consent must be true and a sink must be configured before
 * status advances to `queued`; any missing condition produces `not_expected` with a
 * specific drop reason so callers can record exactly why delivery was skipped.
 * @param prefs - User telemetry consent preferences from app config.
 * @param sink - Resolved sink config, or null when no sink is configured.
 * @returns The delivery state to attach to the run record.
 */
export function deriveLangfuseDeliveryState(
  prefs: TelemetryPrefs,
  sink: TelemetrySinkConfig | null,
): LangfuseDeliveryState {
  if (prefs.metrics !== true) {
    return {
      langfuse_expected: false,
      langfuse_delivery_status: 'not_expected',
      langfuse_drop_reason: 'metrics_consent_off',
    };
  }
  if (prefs.content !== true) {
    return {
      langfuse_expected: false,
      langfuse_delivery_status: 'not_expected',
      langfuse_drop_reason: 'content_consent_off',
    };
  }
  if (!sink) {
    return {
      langfuse_expected: false,
      langfuse_delivery_status: 'not_expected',
      langfuse_drop_reason: 'missing_sink_config',
    };
  }
  return {
    langfuse_expected: true,
    langfuse_delivery_status: 'queued',
  };
}

/**
 * @internal
 * Coerces a bare {@link LangfuseConfig} to the unified {@link TelemetrySinkConfig} shape
 * by inserting `kind: 'langfuse'`. Lets callers that already hold a `TelemetrySinkConfig`
 * pass through unchanged so all downstream code sees one consistent union type.
 * @param config - Either a typed sink config or a raw Langfuse credential object.
 * @returns A `TelemetrySinkConfig` with `kind` set.
 */
export function normalizeTelemetrySinkConfig(
  config: TelemetrySinkConfig | LangfuseConfig,
): TelemetrySinkConfig {
  if ('kind' in config) return config;
  return { kind: 'langfuse', ...config };
}

/**
 * @internal
 * Resolves the effective sink from {@link ReportRunOpts}: undefined → read from env,
 * explicit null → disabled (returns null), any other value → normalize to sink config.
 * Centralises the three-way override pattern used by both report entrypoints.
 * @param opts - Run-level reporting options, typically passed through from callers.
 * @returns The resolved sink config, or null when delivery is explicitly or implicitly disabled.
 */
export function resolveReportConfig(
  opts: ReportRunOpts,
): TelemetrySinkConfig | null {
  if (opts.config === undefined) return readTelemetrySinkConfig();
  if (opts.config == null) return null;
  return normalizeTelemetrySinkConfig(opts.config);
}
