import type {
  AmrLoginFailure,
  AmrLoginFailureCode,
  AmrLoginRecoveryAction,
} from '@open-design/contracts';

export type AmrAccountErrorCode = 'AMR_AUTH_REQUIRED' | 'AMR_INSUFFICIENT_BALANCE';

export interface AmrAccountFailure {
  code: AmrAccountErrorCode;
  message: string;
  action: 'relogin' | 'recharge';
  actionUrl?: string;
}

export interface AmrAccountFailureSignal {
  details?: unknown;
  message?: unknown;
  errorMessage?: unknown;
  errorCode?: unknown;
  stdoutTail?: unknown;
  stderrTail?: unknown;
}

// `source=open_design` tags the wallet landing page_view so vela analytics can
// attribute the recharge visit to Open Design.
export const DEFAULT_AMR_RECHARGE_URL =
  'https://open-design.ai/amr/wallet?source=open_design';

const AMR_AUTH_REQUIRED_MESSAGE =
  'AMR sign-in is required. Sign in to AMR Cloud again, then retry this run.';

const AMR_INSUFFICIENT_BALANCE_MESSAGE =
  `AMR Cloud reported insufficient balance for this model. Recharge your AMR wallet at ${DEFAULT_AMR_RECHARGE_URL}, then retry this run.`;

function normalizeFailureText(text: string): string {
  return String(text || '').toLowerCase();
}

function containsInsufficientBalanceSignal(value: string): boolean {
  if (
    value.includes('insufficient_balance') ||
    value.includes('insufficient balance') ||
    value.includes('insufficient wallet balance') ||
    value.includes('insufficient credits') ||
    value.includes('insufficient credit') ||
    value.includes('insufficient funds') ||
    value.includes('not enough balance') ||
    value.includes('not enough credits') ||
    value.includes('balance is empty') ||
    value.includes('balance too low') ||
    value.includes('billing balance') ||
    // vela returns the pre-charge (额度预扣) failure in Chinese when the wallet
    // cannot cover a model call; this currently leaks into execution_failed.
    value.includes('预扣费额度失败') ||
    value.includes('余额不足') ||
    value.includes('额度不足')
  ) {
    return true;
  }
  return value.includes('quota') && /\b(wallet|balance|credit|billing|funds?)\b/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function classifyAmrAccountFailureDetails(details: unknown): AmrAccountFailure | null {
  if (!isRecord(details)) return null;
  const code = typeof details.code === 'string' ? details.code.toLowerCase() : '';
  const accountAction =
    typeof details.accountAction === 'string' ? details.accountAction.toLowerCase() : '';

  if (code === 'insufficient_balance' || accountAction === 'recharge') {
    return {
      code: 'AMR_INSUFFICIENT_BALANCE',
      message: AMR_INSUFFICIENT_BALANCE_MESSAGE,
      action: 'recharge',
      actionUrl: DEFAULT_AMR_RECHARGE_URL,
    };
  }

  return null;
}

function stringPart(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function classifyAmrAccountFailureSignal(
  signal: AmrAccountFailureSignal,
): AmrAccountFailure | null {
  const structured = classifyAmrAccountFailureDetails(signal.details);
  if (structured) return structured;

  const primaryText = [
    stringPart(signal.message),
    stringPart(signal.errorMessage),
    stringPart(signal.errorCode),
    stringPart(signal.stdoutTail),
  ].join('\n');
  const primary = classifyAmrAccountFailure(primaryText);
  if (primary) return primary;

  // Stderr is intentionally last. Prefer ACP structured details and protocol
  // messages so AMR account errors are managed through one stable channel.
  return classifyAmrAccountFailure(stringPart(signal.stderrTail));
}

export function classifyAmrAccountFailure(text: string): AmrAccountFailure | null {
  const value = normalizeFailureText(text);
  if (!value.trim()) return null;

  if (containsInsufficientBalanceSignal(value)) {
    return {
      code: 'AMR_INSUFFICIENT_BALANCE',
      message: AMR_INSUFFICIENT_BALANCE_MESSAGE,
      action: 'recharge',
      actionUrl: DEFAULT_AMR_RECHARGE_URL,
    };
  }

  if (
    value.includes('auth_required') ||
    value.includes('authentication required') ||
    value.includes('not authenticated') ||
    value.includes('unauthenticated') ||
    value.includes('not logged in') ||
    value.includes('login missing') ||
    value.includes('sign in again') ||
    value.includes('sign-in required') ||
    value.includes('signin required') ||
    value.includes('token has expired') ||
    value.includes('expired token') ||
    value.includes('invalid session') ||
    value.includes('session expired')
  ) {
    return {
      code: 'AMR_AUTH_REQUIRED',
      message: AMR_AUTH_REQUIRED_MESSAGE,
      action: 'relogin',
    };
  }

  return null;
}

export function amrAccountFailureDetails(failure: AmrAccountFailure) {
  return {
    kind: 'amr_account',
    action: failure.action,
    ...(failure.actionUrl ? { actionUrl: failure.actionUrl } : {}),
  };
}

// ---------------------------------------------------------------------------
// AMR (vela) SIGN-IN failure classification
//
// Distinct from the account/run failures above: this covers the onboarding /
// Settings sign-in flow itself (issue #426). The daemon sees two failure
// shapes — a `/login` spawn error (thrown synchronously, carries a message) and
// a login-process exit observed while polling — and maps both onto the shared
// `AmrLoginFailure` code+recovery vocabulary so the UI/CLI can show a specific
// reason and a concrete next step instead of a generic "Sign-in failed."
// ---------------------------------------------------------------------------

export interface VelaLoginFailureSignal {
  // Thrown error message from spawnVelaLogin (surfaced through `/login`).
  message?: string;
  stderr?: string;
  stdout?: string;
  // Process exit metadata (for a login observed to exit while polling).
  exitCode?: number | null;
  signal?: string | null;
  // The login child was terminated by cancelVelaLogin (user cancel or a
  // frontend-driven timeout). Never surfaced as a scary failure.
  canceled?: boolean;
  // The frontend poll loop hit AMR_LOGIN_TIMEOUT_MS without completion. The
  // daemon does not own the timeout, but the CLI/classifier accept the hint so
  // both surfaces share one mapping.
  timedOut?: boolean;
  // vela warned it could not auto-open the browser (recoverable in-flight).
  browserOpenFailed?: boolean;
}

const RECOVERY_BY_CODE: Record<AmrLoginFailureCode, AmrLoginRecoveryAction> = {
  AMR_LOGIN_BINARY_MISSING: 'reinstall',
  AMR_LOGIN_SPAWN_FAILED: 'retry',
  AMR_LOGIN_NETWORK: 'retry',
  AMR_LOGIN_PROXY_BLOCKED: 'retry',
  AMR_LOGIN_TIMEOUT: 'reauth',
  AMR_LOGIN_INTERRUPTED: 'reauth',
  AMR_LOGIN_BROWSER_OPEN_FAILED: 'manual-link',
  AMR_LOGIN_UNKNOWN: 'retry',
};

function firstNonEmpty(...parts: Array<string | null | undefined>): string {
  for (const part of parts) {
    const trimmed = (part ?? '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function classifyVelaLoginFailureCode(
  signal: VelaLoginFailureSignal,
): AmrLoginFailureCode {
  if (signal.timedOut) return 'AMR_LOGIN_TIMEOUT';

  const text = normalizeFailureText(
    [signal.message, signal.stderr, signal.stdout].filter(Boolean).join('\n'),
  );

  // BROWSER_OPEN_FAILED maps to a `manual-link` recovery, which is only
  // actionable while the activation URL is still present in the status
  // response (i.e. the login is in flight). It is therefore driven ONLY by the
  // explicit `browserOpenFailed` flag a live caller sets — never inferred from
  // stderr text — so a finished login can never emit a manual-link action with
  // no URL behind it. resolveVelaLoginExitFailure drops the flag for exits.
  if (signal.browserOpenFailed) {
    return 'AMR_LOGIN_BROWSER_OPEN_FAILED';
  }

  if (text.includes('binary not found') || text.includes('vela binary')) {
    return 'AMR_LOGIN_BINARY_MISSING';
  }

  // Corporate transparent proxy (飞连/CorpLink → 30.x) makes the upstream lose
  // the client IP and reject device authorization with this exact shape.
  if (
    text.includes('invalid ip address') ||
    (text.includes('502') && text.includes('invalid ip'))
  ) {
    return 'AMR_LOGIN_PROXY_BLOCKED';
  }

  if (
    text.includes('enotfound') ||
    text.includes('econnrefused') ||
    text.includes('econnreset') ||
    text.includes('etimedout') ||
    text.includes('eai_again') ||
    text.includes('socket hang up') ||
    text.includes('network') ||
    text.includes('dns') ||
    text.includes('tls') ||
    text.includes('certificate') ||
    text.includes('502') ||
    text.includes('503') ||
    text.includes('504')
  ) {
    return 'AMR_LOGIN_NETWORK';
  }

  if (
    text.includes('failed to spawn') ||
    text.includes('failed to start') ||
    text.includes('eacces') ||
    text.includes('enoent') ||
    text.includes('permission denied')
  ) {
    return 'AMR_LOGIN_SPAWN_FAILED';
  }

  // A login that exited (non-zero / killed by a signal) without any of the
  // clearer signals above: the browser was closed, auth was denied, or the
  // process crashed mid-flow. "Interrupted" reads truthfully and the recovery
  // is a clean re-login.
  if (
    (typeof signal.exitCode === 'number' && signal.exitCode !== 0) ||
    (signal.signal != null && signal.signal !== '')
  ) {
    return 'AMR_LOGIN_INTERRUPTED';
  }

  return 'AMR_LOGIN_UNKNOWN';
}

// Classify a known sign-in failure into a stable code + recovery hint. Always
// returns a failure (callers use this when they already know the attempt
// failed, e.g. the `/login` route catch). The optional `detail` echoes the
// most informative raw text for a collapsible technical line.
export function classifyVelaLoginFailure(
  signal: VelaLoginFailureSignal,
): AmrLoginFailure {
  const code = classifyVelaLoginFailureCode(signal);
  const detail = firstNonEmpty(signal.message, signal.stderr, signal.stdout);
  return {
    code,
    recovery: RECOVERY_BY_CODE[code],
    ...(detail ? { detail } : {}),
  };
}

// Resolve a login-process EXIT into a surfaced failure, or null when the exit
// is not worth surfacing: a clean exit (code 0 — vela wrote the runtime key and
// sign-in succeeded) or a user/timeout-initiated cancel. Used by the status
// read so a benign cancel never renders as an error.
//
// A finished login has no live activation URL in the status response, so any
// stale `browserOpenFailed` from the in-flight capture is dropped here: the
// exit must classify by its real terminal cause (interrupted / network / …),
// never as BROWSER_OPEN_FAILED, whose `manual-link` recovery would point at a
// URL that is no longer surfaced.
export function resolveVelaLoginExitFailure(
  signal: VelaLoginFailureSignal,
): AmrLoginFailure | null {
  if (signal.canceled) return null;
  if (signal.exitCode === 0 && !signal.signal) return null;
  const { browserOpenFailed: _browserOpenFailed, ...exitSignal } = signal;
  return classifyVelaLoginFailure(exitSignal);
}
