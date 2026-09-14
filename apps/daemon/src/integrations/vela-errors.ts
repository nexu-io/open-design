export type AmrAccountErrorCode =
  | 'AMR_AUTH_REQUIRED'
  | 'AMR_INSUFFICIENT_BALANCE'
  | 'AMR_TIER_UPGRADE_REQUIRED';

export interface AmrAccountFailure {
  code: AmrAccountErrorCode;
  message: string;
  action: 'relogin' | 'recharge' | 'upgrade';
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

// `source=open_design` tags the console landing page_view so vela analytics can
// attribute the recharge visit to OpenDesign.
//
// The console dashboard, not a wallet page: balance and manual top-up were
// rehomed onto it (vela #1055) and the wallet route left the product's
// information architecture, so this link must not send a user there.
export const DEFAULT_AMR_RECHARGE_URL =
  'https://open-design.ai/amr/dashboard?source=open_design';

const AMR_AUTH_REQUIRED_MESSAGE =
  'AMR sign-in is required. Sign in to AMR Cloud again, then retry this run.';

const AMR_INSUFFICIENT_BALANCE_MESSAGE =
  `AMR Cloud reported insufficient balance for this model. Top up your AMR balance at ${DEFAULT_AMR_RECHARGE_URL}, then retry this run.`;

const AMR_TIER_UPGRADE_REQUIRED_MESSAGE =
  'Your current AMR plan does not include this model or request type. Upgrade your AMR plan, or switch to an available model and retry.';

const AMR_TIER_REQUEST_KIND_NOT_ENTITLED_MESSAGE =
  'Your current AMR plan does not include this request type yet. Upgrade your AMR plan, or switch to a supported model and retry.';

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

/**
 * `session` as the English noun, not as the head of an identifier.
 *
 * `/ - _ . :` are treated as word characters here, so `session/new`,
 * `session/load`, `sessionId` and `session_token_ttl` read as single names and
 * do not satisfy the noun. Spelling the boundary this way states which sense of
 * the word is meant instead of listing the protocol names that must not count —
 * the next ACP method or config key needs no amendment here.
 */
const AUTH_SESSION_NOUN = String.raw`session(?![\w./:-]*[\w])`;

/**
 * The two English word orders in which a report says a sign-in session is no
 * longer usable: adjective-first (`invalid session`) and subject-first
 * (`session has expired`, `session is no longer valid`).
 */
const INVALID_AUTH_SESSION_PATTERN = new RegExp(
  String.raw`\b(?:invalid|expired|revoked)\s+${AUTH_SESSION_NOUN}`
    + String.raw`|\b${AUTH_SESSION_NOUN}\s+(?:(?:has|have|is|are|was|were)\s+)?`
    + String.raw`(?:expired|invalid|revoked|no longer valid)\b`,
  'i',
);

/**
 * True when `value` reports that the caller's **sign-in session** is invalid or
 * expired — the one state a relogin fixes.
 *
 * The word `session` heads two unrelated nouns in this product: the account's
 * sign-in session, and the ACP method/field family (`session/new`,
 * `session/load`, `sessionId`). A bare `includes('invalid session')` cannot
 * tell them apart, so an agent that answers `session/new` with an unparseable
 * frame — `invalid session/new response: …`, a defect in the agent's own build
 * — was reported to the user as `auth / auth_required / user_action: login`.
 * Requiring the credential noun to be the whole word keeps the account sense
 * and drops the protocol sense.
 */
function reportsInvalidAuthSession(value: string): boolean {
  return INVALID_AUTH_SESSION_PATTERN.test(value);
}

/**
 * A vela error code as a whole code, not as the tail of a longer one.
 *
 * `_ - .` are treated as part of the code here, so a code that merely ENDS with
 * one of these names is a different code and does not satisfy the match. That
 * is the whole distinction R-053 turns on: `upstream_provider_unauthenticated`
 * (the gateway's credentials) and `unauthenticated` (the caller's) are two
 * codes, and `mcp_auth_required` (a per-user MCP tool's OAuth) and
 * `auth_required` (the AMR account's) are two more. Spelling the boundary this
 * way says the codes are read as codes, so the next `*_unauthenticated` vela
 * adds needs no amendment here.
 *
 * `storage/amr-terminal-report-outbox.ts:293` already reads `unauthenticated`
 * this way — as an exact envelope code — when vela hands it one structurally.
 */
const VELA_AUTH_CODE_PATTERN = /(?<![\w.-])(?:auth_required|unauthenticated)(?![\w.-])/;

function reportsVelaAuthCode(value: string): boolean {
  return VELA_AUTH_CODE_PATTERN.test(value);
}

/**
 * `not logged in` said about the AMR/vela account specifically.
 *
 * vela's CLI refuses to run with `profile %q is not logged in; run \`vela
 * login\`` (`apps/cli/internal/commands/control.go:92`) — the phrase and the
 * account it belongs to are in the same breath. Everything else that prints
 * this phrase into a run's failure text is some other principal's sign-in:
 * `npm ERR! you are not logged in to this registry`, `gh: not authenticated`,
 * "not logged into Antigravity". This classifier's answer names AMR Cloud in
 * its message and offers a relogin to it, so it may only be reached by a report
 * that names AMR too. Line scope, not whole-text scope, so an unrelated `amr`
 * elsewhere in a long stderr tail cannot vouch for a foreign sign-in line.
 */
const NOT_LOGGED_IN_PATTERN = /\bnot logged[ -]?in\b/;
const VELA_ACCOUNT_MENTION_PATTERN = /\b(?:vela|amr)\b/;

function reportsVelaSignInMissing(value: string): boolean {
  return value
    .split('\n')
    .some((line) => NOT_LOGGED_IN_PATTERN.test(line) && VELA_ACCOUNT_MENTION_PATTERN.test(line));
}

/**
 * vela's link gateway rewrites an upstream 401/403 into an HTTP 500 under its
 * own code — `upstream_provider_unauthenticated` /
 * `upstream_provider_forbidden`
 * (`services/link/internal/handlers/openai.go:2074`,
 * `normalizeUpstreamAuthFailure`) — and pairs it with "Upstream provider
 * credentials are missing or invalid."
 *
 * The credentials named are the PLATFORM's, configured in the gateway. The
 * caller holds none of them and no sign-in reaches them, so this is a service
 * outage (catalogue R-053) and must never be answered with a sign-in prompt.
 * Exported because the two agent-agnostic classifiers that read the same
 * sentence — `runtimes/auth.ts` and `run-failure-classification.ts` — have to
 * agree with this one; a self-identifying code outranks a guess read off the
 * prose it travels with.
 */
const VELA_PLATFORM_PROVIDER_CREDENTIAL_CODE_PATTERN =
  /(?<![\w.-])upstream_provider_(?:unauthenticated|forbidden)(?![\w.-])/i;

export function reportsPlatformProviderCredentialFault(text: string): boolean {
  return VELA_PLATFORM_PROVIDER_CREDENTIAL_CODE_PATTERN.test(String(text || ''));
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

  if (code === 'tier_model_not_entitled') {
    return {
      code: 'AMR_TIER_UPGRADE_REQUIRED',
      message: AMR_TIER_UPGRADE_REQUIRED_MESSAGE,
      action: 'upgrade',
    };
  }

  if (code === 'tier_request_kind_not_entitled') {
    return {
      code: 'AMR_TIER_UPGRADE_REQUIRED',
      message: AMR_TIER_REQUEST_KIND_NOT_ENTITLED_MESSAGE,
      action: 'upgrade',
    };
  }

  if (code === 'auth_required' || accountAction === 'relogin') {
    return {
      code: 'AMR_AUTH_REQUIRED',
      message: AMR_AUTH_REQUIRED_MESSAGE,
      action: 'relogin',
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

  if (value.includes('tier_model_not_entitled')) {
    return {
      code: 'AMR_TIER_UPGRADE_REQUIRED',
      message: AMR_TIER_UPGRADE_REQUIRED_MESSAGE,
      action: 'upgrade',
    };
  }

  if (value.includes('tier_request_kind_not_entitled')) {
    return {
      code: 'AMR_TIER_UPGRADE_REQUIRED',
      message: AMR_TIER_REQUEST_KIND_NOT_ENTITLED_MESSAGE,
      action: 'upgrade',
    };
  }

  // This branch's answer is not "some credential failed" — it is "YOUR AMR
  // Cloud sign-in failed; sign in to AMR Cloud again", and the paths it feeds
  // (`agent-protocol/acp/updates.ts:143,:170`, `server.ts:15411,:15937`) put
  // that sentence in front of the user. A run's failure text does not support
  // that claim on its own: `collectFailureText`
  // (`run-failure-classification.ts:177`) folds every `stderr` event into the
  // corpus (:188), so `gh`, `npm`, `curl` and MCP output are read here too. So
  // each alternative below has to identify the AMR credential, not merely
  // mention signing in. The bare substrings this replaced could not, and the
  // synonyms among them (`login missing`, `sign-in-again`, `not authenticated`,
  // `expired token`, …) matched nothing any upstream sends in the first place.
  //
  // Generic auth prose is not lost by leaving: `classifyAgentServiceFailure`
  // (`runtimes/auth.ts:323`) still reads it, and for an AMR run the web
  // resolves its `AGENT_AUTH_REQUIRED` to the same "Sign-in required" card
  // (`apps/web/src/runtime/amr-guidance.ts:1505`). Only the AMR-specific claim
  // stops being made without AMR-specific evidence.
  if (
    reportsVelaAuthCode(value) ||
    reportsVelaSignInMissing(value) ||
    reportsInvalidAuthSession(value)
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
