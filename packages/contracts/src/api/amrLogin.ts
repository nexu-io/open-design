// Shared DTO for a classified AMR (vela) sign-in failure. The daemon classifies
// a login failure (from a `/login` spawn error or an observed login-process
// exit) into one of these stable codes plus a recovery hint; the web UI and the
// `od` CLI both map the code to localized "reason + what to do next" copy so a
// failed onboarding sign-in stops dead-ending on a generic "Sign-in failed."
//
// This is the source of truth for the code/recovery vocabulary. Keep the daemon
// (classification) and the surfaces (rendering) pinned to this union so a new
// failure bucket is added in exactly one place.

export type AmrLoginFailureCode =
  // The vela binary could not be resolved (missing / not installed).
  | 'AMR_LOGIN_BINARY_MISSING'
  // The local login process could not be started (permission, EACCES/ENOENT,
  // failed spawn) — distinct from a network failure that happens after launch.
  | 'AMR_LOGIN_SPAWN_FAILED'
  // The login request could not reach the auth service (DNS/TLS/connection).
  | 'AMR_LOGIN_NETWORK'
  // A corporate transparent proxy / VPN rejected device authorization (the
  // classic "502: Invalid IP address: undefined" shape behind 飞连/CorpLink).
  | 'AMR_LOGIN_PROXY_BLOCKED'
  // Device authorization started but was never completed in time (5-min poll).
  | 'AMR_LOGIN_TIMEOUT'
  // The login process exited before completing sign-in (browser closed, auth
  // denied, or a mid-flow crash) without a clearer network/binary signal.
  | 'AMR_LOGIN_INTERRUPTED'
  // vela could not auto-open the browser; the user can still finish via the
  // surfaced activation URL. Recoverable in-flight, not a dead end.
  | 'AMR_LOGIN_BROWSER_OPEN_FAILED'
  // Anything the classifier could not pin to a more specific bucket.
  | 'AMR_LOGIN_UNKNOWN';

// The primary next step a surface should offer for a given failure code.
//   - retry:       re-run the same sign-in (transient / environment issue).
//   - reauth:      start a fresh sign-in (the previous attempt ended; e.g.
//                  timed out or was interrupted).
//   - manual-link: open the surfaced activation URL to finish sign-in.
//   - reinstall:   the login component is missing; restart / reinstall.
//   - view-doc:    point the user at troubleshooting documentation.
export type AmrLoginRecoveryAction =
  | 'retry'
  | 'reauth'
  | 'manual-link'
  | 'reinstall'
  | 'view-doc';

export interface AmrLoginFailure {
  code: AmrLoginFailureCode;
  recovery: AmrLoginRecoveryAction;
  // Optional raw daemon/CLI text (trimmed/bounded) for a collapsible
  // "technical details" line. Never the primary message shown to the user.
  detail?: string;
}

export const AMR_LOGIN_FAILURE_CODES: readonly AmrLoginFailureCode[] = [
  'AMR_LOGIN_BINARY_MISSING',
  'AMR_LOGIN_SPAWN_FAILED',
  'AMR_LOGIN_NETWORK',
  'AMR_LOGIN_PROXY_BLOCKED',
  'AMR_LOGIN_TIMEOUT',
  'AMR_LOGIN_INTERRUPTED',
  'AMR_LOGIN_BROWSER_OPEN_FAILED',
  'AMR_LOGIN_UNKNOWN',
] as const;
