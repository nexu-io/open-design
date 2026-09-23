import {
  normalizeUpstreamCode,
  normalizeUpstreamStatus,
  type ApiFailureDetail,
  type ApiFailureStage,
} from '@open-design/contracts';
import { velaCommandStderr } from '../integrations/vela-command.js';

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
