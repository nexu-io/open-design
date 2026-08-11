/**
 * Classification for collab cloud-transport failures.
 *
 * The vela-cli transport surfaces upstream HTTP failures as a child-process
 * error whose message embeds the spawned command line plus the CLI's stderr
 * (`Command failed: …vela collab …\nError: API request failed with status
 * NNN: code`). Routes must not flatten that into an unconditional 502: an
 * upstream 401/403/404 is an authoritative rejection the web client should
 * see as such, while only genuine infrastructure failures stay 502/503. The
 * raw error (command line, stderr) belongs in the daemon log only — never in
 * an HTTP response body.
 */

export type CollabCloudErrorKind =
  | 'denied'
  | 'not_found'
  | 'timeout'
  | 'infrastructure';

export interface ClassifiedCollabCloudError {
  kind: CollabCloudErrorKind;
  /** HTTP status the daemon should answer with. */
  status: 403 | 404 | 502 | 503;
  /** Whether a client retry can plausibly change the outcome. */
  retryable: boolean;
  /** The upstream HTTP status parsed from the CLI error output, if any. */
  upstreamStatus: number | null;
}

const VELA_API_STATUS_PATTERN = /API request failed with status (\d{3})\b/;

/** Extract the upstream HTTP status from a vela CLI failure, if present. */
export function parseVelaApiStatus(error: unknown): number | null {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  const match = VELA_API_STATUS_PATTERN.exec(message);
  if (!match) return null;
  const status = Number(match[1]);
  return Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : null;
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return error.name === 'TimeoutError' || code === 'ETIMEDOUT';
}

export function classifyCollabCloudError(
  error: unknown,
): ClassifiedCollabCloudError {
  const upstreamStatus = parseVelaApiStatus(error);
  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return { kind: 'denied', status: 403, retryable: false, upstreamStatus };
  }
  if (upstreamStatus === 404) {
    return { kind: 'not_found', status: 404, retryable: false, upstreamStatus };
  }
  if (isTimeoutError(error)) {
    return { kind: 'timeout', status: 503, retryable: true, upstreamStatus };
  }
  return {
    kind: 'infrastructure',
    status: 502,
    retryable: true,
    upstreamStatus,
  };
}

/**
 * Raised in place of a cloud-transport call while a project's upstream is in
 * a failure cooldown (see the presence negative cache): the stored
 * classification is replayed without spawning another transport process.
 */
export class CollabCloudUpstreamBlockedError extends Error {
  constructor(readonly classified: ClassifiedCollabCloudError) {
    super('collab cloud upstream is cooling down after repeated failures');
    this.name = 'CollabCloudUpstreamBlockedError';
  }
}
