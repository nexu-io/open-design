import {
  normalizeUpstreamCode,
  normalizeUpstreamStatus,
  type ApiFailureDetail,
  type ApiFailureReason,
  type ApiFailureStage,
} from '@open-design/contracts';
import { velaCommandStderr } from '../integrations/vela-command.js';

type VelaFailure = Omit<ApiFailureDetail, 'stage'>;
class SafeVelaCommandError extends Error {
  constructor(message: string, readonly failure: VelaFailure) { super(message); }
}

/** Carry only classified tokens through privacy boundaries. Never retain the
 * child error, cause, argv, paths, stdout or stderr in the replacement error.
 * Callers may override the reason only when a local phase proves it.
 */
export function safeVelaCommandError(
  message: 'VELA_PINNED_COMMAND_FAILED' | 'PUBLIC_SHARE_PUBLISH_FAILED',
  error: unknown,
  reason?: ApiFailureReason,
): Error {
  const { stage: _stage, ...failure } = classifyVelaCommandFailure('snapshot', error);
  return new SafeVelaCommandError(message, reason ? { reason } : failure);
}

/**
 * Classify a rejected `vela resource …` command into closed tokens.
 *
 * The rules follow the Vela CLI's own output contract (stable from vela-cli
 * 0.0.33 through 0.1.3): a failed command exits 1 and prints one
 * `Error: <err>` line on stderr, where an API rejection reads
 * `API request failed with status <N>[: <code>]`. Daemon-side terminations
 * (timeout, abort, missing binary) are recognised from `runVelaCommand`'s own
 * errors. Anything else is `unknown` — this never guesses.
 */
export function classifyVelaCommandFailure(
  stage: ApiFailureStage,
  error: unknown,
): ApiFailureDetail {
  if (error instanceof SafeVelaCommandError) return { stage, ...error.failure };
  const code = typeof error === 'object' && error !== null
    ? (error as { code?: unknown }).code
    : undefined;
  const message = error instanceof Error ? error.message : '';
  if (code === 'ETIMEDOUT' || message.startsWith('vela command timed out')) {
    return { stage, reason: 'timeout' };
  }
  if (code === 'ABORT_ERR' || message === 'vela command aborted') {
    return { stage, reason: 'aborted' };
  }
  if (message.startsWith('vela binary not found') || (code === 'ENOENT' && !velaCommandStderr(error))) {
    return { stage, reason: 'cli_missing' };
  }
  const stderr = velaCommandStderr(error);
  // Vela's --json errors carry errorCode/status separately from the diagnostic
  // text. Parse only that envelope; do not extract arbitrary fields from bodies.
  let envelope: { status?: unknown; errorCode?: unknown } | undefined;
  try {
    const value: unknown = JSON.parse(stderr.trim());
    if (value && typeof value === 'object' && !Array.isArray(value) && 'error' in value
      && typeof value.error === 'string') {
      envelope = { status: 'status' in value ? value.status : undefined,
        errorCode: 'errorCode' in value ? value.errorCode : undefined };
    }
  } catch { /* Legacy Vela prints a plain-text Error line. */ }
  const status = normalizeUpstreamStatus(envelope?.status);
  if (status !== undefined) {
    const upstreamCode = normalizeUpstreamCode(envelope?.errorCode);
    return { stage, reason: 'upstream_http', upstreamStatus: status,
      ...(upstreamCode !== undefined ? { upstreamCode } : {}) };
  }
  const api = /API request failed with status (\d{3})(?:: ([^\s]+))?/.exec(stderr);
  if (api) {
    const upstreamStatus = normalizeUpstreamStatus(Number(api[1]));
    const upstreamCode = normalizeUpstreamCode(api[2]);
    return {
      stage,
      reason: 'upstream_http',
      ...(upstreamStatus !== undefined ? { upstreamStatus } : {}),
      ...(upstreamCode !== undefined ? { upstreamCode } : {}),
    };
  }
  if (/(upload|download) blob (to|from) object store/.test(stderr)) {
    return { stage, reason: 'object_store' };
  }
  if (/run `vela login`/.test(stderr)) {
    return { stage, reason: 'not_signed_in' };
  }
  if (/i\/o timeout|no such host|connection refused|connection reset|context deadline exceeded|TLS handshake timeout|network is unreachable/.test(stderr)) {
    return { stage, reason: 'network' };
  }
  return { stage, reason: 'unknown' };
}

export type PublicShareBootstrapStage =
  | 'bootstrap' | 'bootstrap_content_preflight' | 'bootstrap_directory_preflight'
  | 'bootstrap_root_push' | 'bootstrap_root_version' | 'bootstrap_catalog_upsert' | 'bootstrap_catalog_readback';

export type PublicShareDiagnosticStage =
  | PublicShareBootstrapStage
  | 'remote_state' | 'resume_guard' | 'resume_command' | 'resume_record' | 'resume_prepare';

/** Bounded share lifecycle failures only: never include command output, identities or URLs. */
export function logPublicShareDiagnostic(entry: {
  operation: 'state_read' | 'resume' | 'bootstrap';
  stage: PublicShareDiagnosticStage;
  status: number;
  errorCode: string;
  requestId: string | undefined;
  startedAt: number;
  staleFallback?: boolean;
  failure?: Pick<ApiFailureDetail, 'reason' | 'upstreamStatus'>;
}): void {
  console.warn('[od] public share diagnostic', JSON.stringify({
    operation: entry.operation, stage: entry.stage, status: entry.status, errorCode: entry.errorCode,
    ...(entry.requestId ? { requestId: entry.requestId } : {}),
    ...(entry.staleFallback !== undefined ? { staleFallback: entry.staleFallback } : {}),
    ...(entry.failure ? { reason: entry.failure.reason,
      ...(entry.failure.upstreamStatus !== undefined ? { upstreamStatus: entry.failure.upstreamStatus } : {}) } : {}),
    durationMs: Math.max(0, Date.now() - entry.startedAt),
  }));
}

/**
 * One structured, text-free line per failed publish/unpublish, next to the
 * existing free-form warning. It lands in the daemon log, which automatic
 * diagnostics bundles already include, and carries the client's request id so
 * a bundle can be matched to its `artifact_publish_result` event.
 */
export function logPublicFileFailure(entry: {
  action: 'publish' | 'unpublish';
  errorCode: string;
  failure: ApiFailureDetail;
  requestId: string | undefined;
  startedAt: number;
}): void {
  console.warn('[od] public file publication failure', JSON.stringify({
    action: entry.action,
    errorCode: entry.errorCode,
    ...entry.failure,
    ...(entry.requestId ? { requestId: entry.requestId } : {}),
    durationMs: Math.max(0, Date.now() - entry.startedAt),
  }));
}
