// Closed-token failure classification that the daemon attaches to a failed
// publish-public or deploy response as an optional `failure` field.
//
// It is purely additive: the response's existing `error` code, HTTP status
// and message are unchanged, so older clients and existing analytics keep
// their meaning. Every value is a fixed token or a bounded integer — never
// free text, a URL or a path — so a client may copy it into analytics as-is
// after `parseApiFailureDetail`.

/** Where in the operation the failure happened. */
export type ApiFailureStage =
  // publish-public: `vela resource push`, `vela resource snapshot`, local
  // publication record write, and `vela resource snapshot-redact` (unpublish).
  | 'push'
  | 'snapshot'
  | 'persist'
  | 'redact'
  // deploy: building the local file set vs. talking to the provider.
  | 'file_plan'
  | 'provider';

/** Why it failed, as far as the daemon can tell without guessing. */
export type ApiFailureReason =
  // Vela CLI outcomes (publish-public).
  | 'timeout'
  | 'aborted'
  | 'cli_missing'
  | 'not_signed_in'
  | 'upstream_http'
  | 'object_store'
  | 'network'
  | 'empty_response'
  // Deploy outcomes.
  | 'coded'
  | 'provider_rejected'
  | 'provider_token_invalid'
  | 'provider_unreachable'
  | 'local_file'
  // Shared fallbacks.
  | 'internal'
  | 'unknown';

export interface ApiFailureDetail {
  stage: ApiFailureStage;
  reason: ApiFailureReason;
  /** HTTP status returned by the upstream service (Vela API or deploy provider). */
  upstreamStatus?: number;
  /** Error code returned by the upstream service, e.g. Vela `user_banned`. */
  upstreamCode?: string;
}

export const API_FAILURE_STAGES: readonly ApiFailureStage[] = [
  'push', 'snapshot', 'persist', 'redact', 'file_plan', 'provider',
];

export const API_FAILURE_REASONS: readonly ApiFailureReason[] = [
  'timeout', 'aborted', 'cli_missing', 'not_signed_in', 'upstream_http',
  'object_store', 'network', 'empty_response', 'coded', 'provider_rejected',
  'provider_token_invalid', 'provider_unreachable', 'local_file', 'internal',
  'unknown',
];

const UPSTREAM_CODE_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;

/** Accept only a token-shaped upstream code; anything else is dropped. */
export function normalizeUpstreamCode(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value)) value = String(value);
  return typeof value === 'string' && UPSTREAM_CODE_PATTERN.test(value) ? value : undefined;
}

/** Accept only an HTTP status integer; anything else is dropped. */
export function normalizeUpstreamStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}

/**
 * Read an untrusted `failure` value. Returns undefined unless stage and reason
 * are known tokens; optional fields that fail validation are dropped.
 */
export function parseApiFailureDetail(value: unknown): ApiFailureDetail | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  if (!API_FAILURE_STAGES.includes(v.stage as ApiFailureStage)) return undefined;
  if (!API_FAILURE_REASONS.includes(v.reason as ApiFailureReason)) return undefined;
  const upstreamStatus = normalizeUpstreamStatus(v.upstreamStatus);
  const upstreamCode = normalizeUpstreamCode(v.upstreamCode);
  return {
    stage: v.stage as ApiFailureStage,
    reason: v.reason as ApiFailureReason,
    ...(upstreamStatus !== undefined ? { upstreamStatus } : {}),
    ...(upstreamCode !== undefined ? { upstreamCode } : {}),
  };
}

/**
 * Header a client may send with a publish-public or deploy request so the
 * daemon's failure log line and the client's analytics event share one id.
 * Observational only: the daemon never branches on it.
 */
export const CLIENT_REQUEST_ID_HEADER = 'x-od-request-id';

const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9_.:-]{8,128}$/;

/** Accept only a token-shaped request id; anything else is dropped. */
export function normalizeClientRequestId(value: unknown): string | undefined {
  return typeof value === 'string' && CLIENT_REQUEST_ID_PATTERN.test(value) ? value : undefined;
}
