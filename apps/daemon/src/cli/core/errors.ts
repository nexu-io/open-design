// @ts-nocheck
/**
 * @module cli/core/errors
 */
export const RECOVERABLE_EXIT_CODES = {
  'daemon-not-running':       64,
  'plugin-not-found':         65,
  'snapshot-not-found':       65,
  'capabilities-required':    66,
  'missing-input':            67,
  'project-not-found':        68,
  'run-not-found':            69,
  'provider-not-configured':  70,
  'plugin-requires-daemon':   71,
  'snapshot-stale':           72,
  'genui-surface-awaiting':   73,
  'desktop-auth-pending':     74,
  'desktop-import-token-rejected': 75,
};

export function surfaceFetchError(err, daemonUrl) {
  const cause = err && typeof err === 'object' ? err.cause : null;
  const code =
    cause && typeof cause === 'object' && typeof cause.code === 'string'
      ? cause.code
      : null;
  const causeMsg =
    cause && typeof cause === 'object' && typeof cause.message === 'string'
      ? cause.message
      : '';
  let detail = err && err.message ? err.message : String(err);
  if (code) detail = `${code}${causeMsg ? ` — ${causeMsg}` : ''}`;
  else if (causeMsg) detail = causeMsg;
  console.error(`failed to reach daemon at ${daemonUrl}: ${detail}`);
  if (code === 'EPERM' || code === 'ENETUNREACH') {
    console.error(
      'hint: outbound connect was denied by a sandbox. If you launched ' +
        'this command from a code agent, check the agent\'s sandbox / ' +
        'network policy. The Open Design daemon itself is unaffected - it can be ' +
        'reached from a regular shell.',
    );
  }
}

// Plan §3.B1 / spec §12.4: CLI structured error helper. Maps a daemon
// HTTP error envelope (or a synthetic local error) to a stable exit
// code + a JSON envelope on stderr. Code agents read these to decide
// whether the failure is recoverable (re-grant capabilities, prompt
// the user, retry with --grant-caps, etc.).
export function exitWithStructuredError({ code, message, data }) {
  const exit = RECOVERABLE_EXIT_CODES[code] ?? 1;
  const envelope = { error: { code, message, data: data ?? {} } };
  process.stderr.write(JSON.stringify(envelope) + '\n');
  process.exit(exit);
}

// Map a daemon HTTP response into the exit-code envelope. Returns the
// parsed body (so the caller can keep going if it doesn't want to exit).
//
// Daemon error envelopes come in two shapes in practice:
//   { error: { code, message, ... } }  — newer routes using sendApiError
//   { error: '<message>' }             — older flat-string routes
//                                         (e.g. POST /api/templates at
//                                         routes/project/index.ts)
// Normalize so a flat-string body still surfaces its message to the
// structured envelope instead of collapsing to `HTTP <status>: `, which
// would drop the only diagnostic the daemon actually returned to a
// headless caller.
export async function structuredHttpFailure(resp, fallbackCode = 'daemon-not-running') {
  let raw = '';
  let parsed;
  try {
    raw = await resp.text();
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }
  const errorObj =
    typeof parsed?.error === 'string'
      ? { message: parsed.error }
      : parsed?.error;
  const errCode = normalizeRecoverableErrorCode(errorObj?.code, errorObj?.message);
  if (errCode) {
    exitWithStructuredError({
      code:    errCode,
      message: errorObj?.message ?? `HTTP ${resp.status}`,
      data:    structuredErrorData(errorObj),
    });
  }
  exitWithStructuredError({
    code:    fallbackCode,
    message: errorObj?.message ?? `HTTP ${resp.status}${raw ? `: ${raw}` : ''}`,
    data:    structuredErrorData(errorObj),
  });
}

function normalizeRecoverableErrorCode(code, message) {
  if (code === 'DESKTOP_AUTH_PENDING') return 'desktop-auth-pending';
  if (code === 'FORBIDDEN' && /desktop import token rejected/i.test(String(message ?? ''))) {
    return 'desktop-import-token-rejected';
  }
  return code;
}

function structuredErrorData(error) {
  if (!error || typeof error !== 'object') return undefined;
  const data = {};
  if ('data' in error && error.data !== undefined) Object.assign(data, error.data);
  if ('details' in error && error.details !== undefined) data.details = error.details;
  if (typeof error.retryable === 'boolean') data.retryable = error.retryable;
  return Object.keys(data).length > 0 ? data : undefined;
}
