/**
 * Copy the daemon's closed-token failure classification into analytics props.
 *
 * `publishProjectFilePublic`, `unpublishProjectFilePublic` and
 * `deployProjectFile` attach what the daemon sent — its `failure` object and,
 * for publish, its raw error code — to the error they throw. This reads them
 * back through the contract validators, so only known tokens and bounded
 * numbers reach PostHog. Existing props such as `error_code` are untouched;
 * these only add resolution to a failed attempt.
 */

import {
  CLIENT_REQUEST_ID_HEADER,
  normalizeUpstreamCode,
  parseApiFailureDetail,
  type ApiFailureDetail,
} from '@open-design/contracts';
import type { TrackingFailureDetailProps } from '@open-design/contracts/analytics';

export interface DaemonFailureFields {
  failure?: ApiFailureDetail;
  daemonErrorCode?: string;
}

/** Attach validated daemon failure fields to an error about to be thrown. */
export function withDaemonFailure<E extends Error>(
  error: E,
  fields: { failure?: unknown; daemonErrorCode?: unknown },
): E & DaemonFailureFields {
  const failure = parseApiFailureDetail(fields.failure);
  const daemonErrorCode = normalizeUpstreamCode(fields.daemonErrorCode);
  return Object.assign(error, {
    ...(failure ? { failure } : {}),
    ...(daemonErrorCode ? { daemonErrorCode } : {}),
  });
}

export function failureDetailProps(error: unknown): TrackingFailureDetailProps {
  const failure = parseApiFailureDetail((error as DaemonFailureFields | null)?.failure);
  if (!failure) return {};
  return {
    failed_stage: failure.stage,
    failure_reason: failure.reason,
    ...(failure.upstreamStatus !== undefined ? { upstream_status: failure.upstreamStatus } : {}),
    ...(failure.upstreamCode !== undefined ? { upstream_error_code: failure.upstreamCode } : {}),
  };
}

export function daemonErrorCodeProp(error: unknown): { daemon_error_code?: string } {
  const code = normalizeUpstreamCode((error as DaemonFailureFields | null)?.daemonErrorCode);
  return code ? { daemon_error_code: code } : {};
}

/**
 * Send the attempt's analytics request id (`analytics.newRequestId()`) to the
 * daemon, which writes it into its failure log line.
 */
export function clientRequestIdHeaders(requestId: string | undefined): Record<string, string> {
  return requestId ? { [CLIENT_REQUEST_ID_HEADER]: requestId } : {};
}
