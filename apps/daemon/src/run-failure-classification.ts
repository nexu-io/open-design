import type {
  TrackingRunFailureCategory,
  TrackingRunFailureDetail,
  TrackingRunFailureStage,
  TrackingRunFailureUserAction,
} from '@open-design/contracts/analytics';

import { classifyAmrAccountFailure } from './integrations/vela-errors.js';
import { classifyAgentServiceFailure } from './runtimes/auth.js';
import type { RunResult, RunStatusForAnalytics } from './run-result.js';

export interface RunEventForFailureClassification {
  event: string;
  data: unknown;
}

export interface RunFailureClassificationInput {
  result: RunResult;
  status: RunStatusForAnalytics & {
    error?: string | null;
  };
  errorCode?: string;
  agentId?: string | null;
  events?: RunEventForFailureClassification[];
}

export interface RunFailureClassification {
  failure_category: TrackingRunFailureCategory;
  failure_detail: TrackingRunFailureDetail;
  failure_stage: TrackingRunFailureStage;
  retryable: boolean;
  user_action: TrackingRunFailureUserAction;
}

function normalizeCode(value: string | undefined | null): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readBool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function eventErrorText(data: unknown): string[] {
  const payload = data && typeof data === 'object'
    ? data as Record<string, unknown>
    : {};
  const nested = payload.error && typeof payload.error === 'object'
    ? payload.error as Record<string, unknown>
    : {};
  const nestedData = nested.data && typeof nested.data === 'object'
    ? nested.data as Record<string, unknown>
    : {};
  return [
    readString(payload.message),
    readString(payload.code),
    readString(nested.message),
    readString(nested.code),
    readString(nestedData.message),
    typeof nestedData.statusCode === 'number' ? `statusCode:${nestedData.statusCode}` : undefined,
  ].filter((value): value is string => Boolean(value));
}

function eventStderrText(data: unknown): string[] {
  if (typeof data === 'string' && data.trim()) return [data.trim()];
  const payload = data && typeof data === 'object'
    ? data as Record<string, unknown>
    : {};
  return [
    readString(payload.chunk),
    readString(payload.text),
  ].filter((value): value is string => Boolean(value));
}

function latestRetryable(
  events: RunEventForFailureClassification[] = [],
): boolean | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const data = events[i]?.data;
    const payload = data && typeof data === 'object'
      ? data as Record<string, unknown>
      : {};
    const nested = payload.error && typeof payload.error === 'object'
      ? payload.error as Record<string, unknown>
      : {};
    const nestedData = nested.data && typeof nested.data === 'object'
      ? nested.data as Record<string, unknown>
      : {};
    const retryable =
      readBool(payload.retryable) ??
      readBool(nested.retryable) ??
      readBool(nestedData.isRetryable);
    if (retryable !== undefined) return retryable;
  }
  return undefined;
}

function collectFailureText(input: RunFailureClassificationInput): string {
  const parts: string[] = [];
  const statusError = readString(input.status.error);
  if (statusError) parts.push(statusError);
  const code = normalizeCode(input.errorCode ?? input.status.errorCode);
  if (code) parts.push(code);
  const events = input.events ?? [];
  for (let i = events.length - 1; i >= 0 && parts.length < 24; i -= 1) {
    const rec = events[i]!;
    if (rec.event === 'error' || rec.event === 'agent') {
      parts.push(...eventErrorText(rec.data));
    } else if (rec.event === 'stderr') {
      parts.push(...eventStderrText(rec.data));
    }
  }
  return parts.join('\n');
}

function isHardQuotaText(text: string): boolean {
  return /\b(session limit|usage limit|limit reached|quota|billing (?:hard )?limit|insufficient[ _-]?(?:quota|credit|credits|funds)|exceeded your current quota|out of credits)\b/i
    .test(text);
}

// A transient, retryable rate limit (distinct from a hard quota). vela/upstream
// returns this in Chinese ("速率限制" / "请求频率"), which the English-only
// quota check above misses, so it currently leaks into execution_failed.
function isRateLimitText(text: string): boolean {
  return /(速率限制|控制请求频率|请求(?:过于)?频繁|rate[ _-]?limit|too many requests)/i
    .test(text);
}

function isWorkspaceCreditsText(text: string): boolean {
  return /\b(?:your )?workspace is out of credits\b|\badd credits to continue\b|\bask your workspace owner to refill\b/i
    .test(text);
}

function isTimeoutText(text: string): boolean {
  return /\b(timed?\s*out|timeout|inactivity|stalled|hung|no new output|without emitting any new output)\b/i
    .test(text);
}

function isEmptyOutputText(text: string): boolean {
  return /\b(empty response|empty output|without producing any output|no visible output|returned an empty response)\b/i
    .test(text);
}

function isToolErrorText(text: string): boolean {
  if (isPluginArtifactMissingText(text)) return true;
  return /\b(tool|mcp|connector|plugin)\b/i.test(text) &&
    /\b(error|failed|failure)\b/i.test(text);
}

function isPluginArtifactMissingText(text: string): boolean {
  return /\bPlugin authoring ended before generating the required generated-plugin artifacts\b/i
    .test(text);
}

function isAgentConfigInvalidText(text: string): boolean {
  return /\bError loading config\.toml: unknown variant\b/i.test(text) ||
    /\bunknown variant [`'"][^`'"]+[`'"], expected\b[\s\S]*\bin `service_tier`/i.test(text) ||
    /\bdefault_permissions requires a `?\[permissions\]`? table\b/i.test(text) ||
    /\bdefault_permissions refers to undefined profile\b/i.test(text) ||
    /\bError loading config\.toml:[\s\S]*\bduplicate key\b/i.test(text);
}

function isCliNotInstalledText(text: string): boolean {
  // Also covers the agent binary being absent at its resolved path:
  //   - Windows shell "'node' is not recognized as an internal or external command"
  //   - Node "Error: spawn <path> ENOENT" (the executable file does not exist —
  //     distinct from spawn EPERM/EBADF/ENOEXEC where the file exists but can't run)
  // Both currently leak into the opaque execution_failed bucket (#3408 P1).
  return /\bnot installed|not on PATH|cannot find the path specified|system cannot find the path specified|is not recognized as an internal or external command|\bspawn\b[^\n]*\bENOENT\b/i
    .test(text);
}

function isGitBashMissingText(text: string): boolean {
  return /\bClaude Code on Windows requires git-bash\b|\bCLAUDE_CODE_GIT_BASH_PATH\b|\bgit-bash\b/i
    .test(text);
}

function isSpawnFailureText(text: string): boolean {
  return /\bspawn failed: spawn\b/i.test(text);
}

function isAgentProtocolErrorText(text: string): boolean {
  return /\bjson-rpc id \d+: Internal error\b/i.test(text) ||
    /\bACP session exited before completion\b/i.test(text) ||
    /\bQoder run failed: (?:stop_sequence|end_turn)\b/i.test(text) ||
    /\bthread\/start failed\b/i.test(text) ||
    /\bfailed to parse request\b/i.test(text);
}

function isFabricatedRoleMarkerText(text: string): boolean {
  return /\bmodel emitted fabricated role marker\b/i.test(text);
}

function isPermissionRequestNotFoundText(text: string): boolean {
  return /\b(PermissionNotFoundError|Permission request not found|permissions\/per_[A-Za-z0-9_-]+\s+returned\s+HTTP\s+404)\b/i
    .test(text);
}

function isAuthDetailText(text: string): boolean {
  return /\b(refresh token|access token could not be refreshed|stale local profile|different or stale local profile|credentials from a different local environment|missing environment variable: `?[A-Z0-9_]*API_KEY`?|api key.*(?:missing|invalid)|invalid api key|credentials? (?:are )?missing|not logged in|Authentication required|carry the api (?:secret )?key)\b/i
    .test(text);
}

// A resume target that no longer exists. Matches both the daemon's own
// surfaced message and the Claude CLI's raw "session not found" shapes.
function isSessionResumeExpiredText(text: string): boolean {
  // Tightly anchored to Claude's actual resume-miss shapes. The session-id form
  // requires the id token immediately before "not found" so it cannot bridge an
  // unrelated "session …" and a far-away "404 Not Found" (e.g. opencode 4xx).
  return /\bsession could not be resumed\b/i.test(text) ||
    /\bno conversation found with session id\b/i.test(text) ||
    /\bno session found\b/i.test(text) ||
    /\bsession [\w-]+ not found\b/i.test(text);
}

function isPromptTooLargeText(text: string): boolean {
  // `prefill context too large` is the local-runtime (MLX) shape of the same
  // "the prompt does not fit" failure that currently leaks into execution_failed.
  return /\b(context window|prompt too large|maximum context|too many tokens|input.*too large|exceeds the safe size|composed prompt exceeds|prompt token count .* exceeds|maximum context length|context too large|prefill context too large|reduce the length of (?:the )?(?:messages|input prompt))\b/i
    .test(text);
}

function isUpstreamDetailText(text: string): boolean {
  return /\b(stream disconnected before completion|response\.completed|Transport error: network error|Upstream request failed|websocket closed|socket connection was closed unexpectedly|tls handshake eof|Connection reset by (?:peer|server)|TLS close_notify|Broken pipe|remote host|远程主机强迫关闭|No route to host|Connection refused|error sending request|Provider returned error|high demand|model is at capacity|selected model is at capacity|temporarily unavailable|upstream_error|http2: response body closed|AMR model catalog is (?:temporarily )?unavailable|statusCode[\"']?\s*:\s*(?:400|404)|400 Bad Request|404 Not Found)\b/i
    .test(text);
}

function isUpstreamClientErrorText(text: string): boolean {
  return /\b(statusCode[\"']?\s*:\s*(?:400|404)|400 Bad Request|404 Not Found)\b/i
    .test(text);
}

function modelUnavailableDetail(text: string): TrackingRunFailureDetail | null {
  if (/\brequires a newer version of codex\b|\bunknown option [`'"]?--[\w-]+[`'"]?\b/i.test(text)) {
    return 'cli_version_incompatible';
  }
  if (/\bmodel is disabled\b/i.test(text)) return 'model_disabled';
  // A local model server (e.g. LM Studio, reached via opencode's own provider
  // config) is up but has no model loaded. Not a model we picked wrong — the
  // user must load a model in the local app first (`lms load`). User-action,
  // not an engine bug, so it should not sit in the opaque execution_failed
  // bucket. (#3408 P1)
  if (/\bno models loaded\b|\blms load\b/i.test(text)) return 'local_model_not_loaded';
  if (/\b(no endpoints found that support tool use|provider routing)\b/i.test(text)) {
    return 'provider_routing_error';
  }
  if (/\b(model .*not supported|requested model is not supported|supported api model names|not supported when using codex)\b/i.test(text)) {
    return 'model_not_supported';
  }
  if (/\b(model (?:is )?(?:unavailable|not available|unsupported|not found)|selected model is not available|not have access|no access|model .*not found|no healthy deployments|model .*not in (?:the )?allowed list)\b/i.test(text)) {
    return 'model_not_found';
  }
  return null;
}

function authDetail(text: string): TrackingRunFailureDetail {
  if (/\brefresh token (?:was )?(?:already used|expired|invalid)|access token could not be refreshed\b/i
    .test(text)) {
    return 'refresh_token_reused';
  }
  if (/\b(stale local profile|different or stale local profile|stale or expired auth state|stale.*credential|stale.*profile)\b/i
    .test(text)) {
    return 'stale_profile';
  }
  if (/\bcredentials from a different local environment\b/i.test(text)) {
    return 'stale_profile';
  }
  if (/\binvalid api key|api key.*invalid\b/i.test(text)) {
    return 'invalid_api_key';
  }
  if (/\bmissing environment variable: `?[A-Z0-9_]*API_KEY`?|api key.*missing|credentials? (?:are )?missing\b/i
    .test(text)) {
    return 'missing_api_key';
  }
  return 'auth_required';
}

function upstreamDetail(text: string): TrackingRunFailureDetail {
  if (/\b(AMR model catalog is (?:temporarily )?unavailable|no endpoints found that support tool use|provider routing)\b/i.test(text)) {
    return 'provider_routing_error';
  }
  if (/\bhigh demand|temporary errors|model is at capacity|selected model is at capacity\b/i.test(text)) return 'provider_high_demand';
  if (/\b(stream disconnected before completion|response\.completed|websocket closed|socket connection was closed unexpectedly|connection reset|tls handshake eof|tls close_notify|broken pipe|peer closed connection|remote host|远程主机强迫关闭|http2: response body closed)\b/i
    .test(text)) {
    return 'stream_disconnected';
  }
  if (/\b(?:http|status|error|response)(?:[ _-]?code)?[\s:=#-]*5\d\d\b|\b5\d\d\s+(?:bad gateway|service unavailable|internal server error|gateway timeout)|\b(5xx|bad gateway|gateway timeout|internal server error|service unavailable|upstream[ _-](?:error|unavailable)|provider (?:error|unavailable)|overloaded)\b/i
    .test(text)) {
    return 'upstream_5xx';
  }
  if (isUpstreamClientErrorText(text)) return 'upstream_client_error';
  return 'network_error';
}

// Signals that mean the agent process aborted abnormally (segfault, abort,
// illegal instruction, trap, bus error). Distinct from SIGKILL (OOM / forced
// kill) and SIGTERM (graceful shutdown / cancel). None of these are timeouts.
const PROCESS_CRASH_SIGNALS = new Set([
  'SIGSEGV',
  'SIGABRT',
  'SIGILL',
  'SIGTRAP',
  'SIGBUS',
]);

// Classifies a run that died from an OS signal or an interrupt exit code
// (130 = 128 + SIGINT). Returns null when the failure is not signal/interrupt
// shaped so the caller can fall through to the generic exit-code bucket.
//
// Earlier classifier branches already claim the cases where the failure text
// carries richer meaning than the bare signal: an inactivity-driven SIGTERM is
// caught by the timeout branch above, and a SIGINT/exit-130 whose text names a
// stream disconnect is caught by the upstream branch. By the time control
// reaches here a signal is the strongest evidence we have, so map it to a
// non-retryable process_exit instead of laundering it into a retryable timeout.
function signalInterruptClassification(
  errorCode: string,
  text: string,
  retryableHint: boolean | undefined,
): RunFailureClassification | null {
  const isInterruptExit = errorCode === 'AGENT_EXIT_130';
  const signal = errorCode.startsWith('AGENT_SIGNAL_')
    ? errorCode.slice('AGENT_SIGNAL_'.length)
    : '';
  if (!signal && !isInterruptExit) return null;

  if (signal === 'SIGKILL') {
    return classification('process_exit', 'signal_killed', 'child_close', false, 'none');
  }
  if (PROCESS_CRASH_SIGNALS.has(signal)) {
    return classification('process_exit', 'process_crashed', 'child_close', false, 'none');
  }
  if (signal === 'SIGINT' || isInterruptExit) {
    // Defensive: the upstream branch above already claims disconnect text, but
    // re-check so a reordering can never silently bury a cancelled stream.
    if (isUpstreamDetailText(text)) {
      return classification(
        'upstream_unavailable',
        upstreamDetail(text),
        'first_token_wait',
        retryableHint ?? true,
        'retry',
      );
    }
    return classification('process_exit', 'interrupted', 'child_close', false, 'none');
  }
  // SIGTERM (graceful shutdown / cancel) and any other signal. Inactivity-driven
  // SIGTERMs were already claimed by the timeout branch above, so reaching here
  // means there is no timeout evidence: treat as a non-retryable termination.
  return classification('process_exit', 'terminated_unknown', 'child_close', false, 'none');
}

function toolErrorDetail(text: string): TrackingRunFailureDetail {
  if (isPluginArtifactMissingText(text)) return 'plugin_artifact_missing';
  return 'tool_error';
}

function processExitDetail(
  errorCode: string,
  text: string,
): TrackingRunFailureDetail {
  if (isCliNotInstalledText(text) || errorCode === 'AGENT_UNAVAILABLE') {
    return 'cli_not_installed';
  }
  if (isGitBashMissingText(text)) {
    return 'git_bash_missing';
  }
  if (/\bspawn failed: spawn ENOEXEC\b/i.test(text)) return 'spawn_enoexec';
  if (/\bspawn failed: spawn EBADF\b/i.test(text)) return 'spawn_ebadf';
  if (/\bspawn failed: spawn EPERM\b/i.test(text)) return 'spawn_eperm';
  if (isSpawnFailureText(text)) return 'spawn_failed';
  if (/\bstdin: write EOF\b/i.test(text)) return 'stdin_write_eof';
  if (isAgentConfigInvalidText(text)) return 'agent_config_invalid';
  if (isFabricatedRoleMarkerText(text)) return 'fabricated_role_marker';
  if (/\bQoder run failed: stop_sequence\b/i.test(text)) {
    return 'qoder_stop_sequence';
  }
  if (isAgentProtocolErrorText(text)) {
    return 'agent_protocol_error';
  }
  if (errorCode.startsWith('AGENT_EXIT_')) return 'exit_code';
  if (errorCode === 'AGENT_TERMINATED_UNKNOWN') return 'terminated_unknown';
  if (errorCode === 'AGENT_EXECUTION_FAILED') return 'execution_failed';
  return 'unknown';
}

// The daemon emits a `runtime_close` diagnostic into the run's event stream at
// finalize time (see `deriveRpcCloseReason` in server.ts) carrying the mechanism
// that ended the child as `rpc_close_reason`. When the agent-level error code is
// the generic `AGENT_EXECUTION_FAILED` and no text pattern matched, this close
// reason is the only remaining signal that distinguishes a mid-stream agent
// error from a bare non-zero exit from an ACP fatal — so we surface it instead
// of collapsing all three into one opaque `execution_failed` bucket.
function readRuntimeCloseReason(
  events: RunEventForFailureClassification[] = [],
): string | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const rec = events[i];
    if (!rec || rec.event !== 'diagnostic') continue;
    const data = rec.data && typeof rec.data === 'object'
      ? rec.data as Record<string, unknown>
      : null;
    if (data?.type === 'runtime_close' && typeof data.rpc_close_reason === 'string') {
      return data.rpc_close_reason;
    }
  }
  return null;
}

// Promote the opaque `execution_failed` detail to the specific close reason when
// one of the three currently-unclassified shapes is present. Every other reason
// (and a missing diagnostic) keeps the opaque label so the bucket never silently
// absorbs a reason we haven't reasoned about.
function executionFailedDetail(
  events: RunEventForFailureClassification[] | undefined,
): TrackingRunFailureDetail {
  switch (readRuntimeCloseReason(events)) {
    case 'stream_error':
      return 'stream_error';
    case 'exit_nonzero':
      return 'exit_nonzero';
    case 'fatal_rpc_error':
      return 'fatal_rpc_error';
    default:
      return 'execution_failed';
  }
}

/**
 * Whether a terminal failure can be recovered by RESUMING the agent's existing
 * CLI session (continue from where it left off) rather than restarting from
 * scratch. True only for transient mid-stream interruptions — an upstream drop
 * or an inactivity timeout — where any work already committed to the session is
 * worth continuing. Deliberately excludes process crashes, OOM kills,
 * auth/balance/prompt-size and any other non-transient cause: resuming those
 * would just reproduce the failure. The caller additionally gates on the
 * runtime actually supporting CLI session resume and on holding a session id.
 */
export function isResumableFailure(
  failure: RunFailureClassification | undefined,
): boolean {
  if (!failure) return false;
  if (failure.failure_category === 'upstream_unavailable') return true;
  if (
    failure.failure_category === 'timeout' &&
    failure.failure_detail === 'inactivity_timeout'
  ) {
    return true;
  }
  return false;
}

function classification(
  failure_category: TrackingRunFailureCategory,
  failure_detail: TrackingRunFailureDetail,
  failure_stage: TrackingRunFailureStage,
  retryable: boolean,
  user_action: TrackingRunFailureUserAction,
): RunFailureClassification {
  return {
    failure_category,
    failure_detail,
    failure_stage,
    retryable,
    user_action,
  };
}

export function classifyRunFailure(
  input: RunFailureClassificationInput,
): RunFailureClassification | undefined {
  if (input.result === 'success') return undefined;
  if (input.result === 'cancelled') {
    return classification('user_cancel', 'user_cancelled', 'finalize', false, 'none');
  }

  const errorCode = normalizeCode(input.errorCode ?? input.status.errorCode);
  const text = collectFailureText(input);
  const retryableHint = latestRetryable(input.events);
  const amrFailure = classifyAmrAccountFailure(text);

  if (
    errorCode === 'AMR_INSUFFICIENT_BALANCE' ||
    amrFailure?.code === 'AMR_INSUFFICIENT_BALANCE'
  ) {
    return classification(
      'insufficient_balance',
      'amr_insufficient_balance',
      'session_init',
      false,
      'recharge',
    );
  }

  if (
    errorCode === 'AMR_AUTH_REQUIRED' ||
    errorCode === 'AGENT_AUTH_REQUIRED' ||
    errorCode === 'UNAUTHORIZED' ||
    amrFailure?.code === 'AMR_AUTH_REQUIRED'
  ) {
    return classification(
      'auth',
      authDetail(text),
      'session_init',
      false,
      'login',
    );
  }

  if (errorCode === 'AGENT_PROMPT_TOO_LARGE' || isPromptTooLargeText(text)) {
    return classification(
      'prompt_too_large',
      'prompt_too_large',
      'prompt_send',
      false,
      'reduce_context',
    );
  }

  const modelDetail = errorCode === 'AMR_MODEL_UNAVAILABLE'
    ? 'model_not_found'
    : modelUnavailableDetail(text);
  if (modelDetail) {
    return classification(
      'model_unavailable',
      modelDetail,
      'model_select',
      false,
      'switch_model',
    );
  }

  // A `--resume <id>` whose stored session no longer resolves (Claude's 30-day
  // cleanupPeriodDays prune, a CLAUDE_CONFIG_DIR change, a cwd/worktree change,
  // or a prior run killed before the session was flushed). The daemon already
  // clears the stale id so the next turn starts fresh — this is a recoverable
  // session-lifecycle failure, not an opaque engine crash, so name it and mark
  // it retryable instead of letting it sit in execution_failed. (#3408 P1)
  if (isSessionResumeExpiredText(text)) {
    return classification(
      'process_exit',
      'session_resume_expired',
      'session_init',
      true,
      'retry',
    );
  }

  if (errorCode === 'AGENT_UNAVAILABLE') {
    return classification(
      'process_exit',
      'cli_not_installed',
      'spawn',
      false,
      'install_cli',
    );
  }

  if (isCliNotInstalledText(text)) {
    return classification(
      'process_exit',
      'cli_not_installed',
      'spawn',
      false,
      'install_cli',
    );
  }

  if (isGitBashMissingText(text)) {
    return classification(
      'process_exit',
      'git_bash_missing',
      'spawn',
      false,
      'install_cli',
    );
  }

  if (isAgentConfigInvalidText(text)) {
    return classification(
      'process_exit',
      'agent_config_invalid',
      'session_init',
      false,
      'fix_config',
    );
  }

  if (isSpawnFailureText(text)) {
    return classification(
      'process_exit',
      processExitDetail(errorCode, text),
      'spawn',
      false,
      'install_cli',
    );
  }

  if (isAgentProtocolErrorText(text)) {
    return classification(
      'process_exit',
      processExitDetail(errorCode, text),
      'child_close',
      retryableHint ?? true,
      retryableHint === false ? 'none' : 'retry',
    );
  }

  const serviceFailure = classifyAgentServiceFailure(text);
  if (serviceFailure === 'AGENT_AUTH_REQUIRED' || isAuthDetailText(text)) {
    return classification(
      'auth',
      authDetail(text),
      'session_init',
      false,
      'login',
    );
  }

  if (errorCode === 'RATE_LIMITED' || serviceFailure === 'RATE_LIMITED' || isHardQuotaText(text) || isRateLimitText(text)) {
    const retryable = retryableHint ?? !isHardQuotaText(text);
    return classification(
      'rate_limit',
      isWorkspaceCreditsText(text)
        ? 'workspace_credits_exhausted'
        : isHardQuotaText(text)
          ? 'hard_quota'
          : 'rate_limit_429',
      'session_init',
      retryable,
      retryable ? 'retry' : isWorkspaceCreditsText(text) ? 'recharge' : 'none',
    );
  }

  if (
    errorCode === 'UPSTREAM_UNAVAILABLE' ||
    serviceFailure === 'UPSTREAM_UNAVAILABLE' ||
    isUpstreamDetailText(text)
  ) {
    const retryable = retryableHint ?? !isUpstreamClientErrorText(text);
    return classification(
      'upstream_unavailable',
      upstreamDetail(text),
      'first_token_wait',
      retryable,
      retryable ? 'retry' : 'none',
    );
  }

  if (isEmptyOutputText(text)) {
    return classification(
      'empty_output',
      'empty_output',
      'first_token_wait',
      retryableHint ?? true,
      'retry',
    );
  }

  if (isTimeoutText(text) || errorCode === 'TIMEOUT') {
    const retryable = retryableHint ?? true;
    return classification(
      'timeout',
      /inactivity|stalled|hung|no new output|without emitting any new output/i.test(text)
        ? 'inactivity_timeout'
        : 'timeout',
      'first_token_wait',
      retryable,
      retryable ? 'retry' : 'none',
    );
  }

  if (isToolErrorText(text)) {
    const retryable = retryableHint ?? !isPluginArtifactMissingText(text);
    return classification(
      'tool_error',
      toolErrorDetail(text),
      isPluginArtifactMissingText(text) ? 'artifact_write' : 'tool_execution',
      retryable,
      retryable ? 'retry' : 'none',
    );
  }

  if (isFabricatedRoleMarkerText(text)) {
    const retryable = retryableHint ?? true;
    return classification(
      'process_exit',
      'fabricated_role_marker',
      'child_close',
      retryable,
      retryable ? 'retry' : 'none',
    );
  }

  if (isPermissionRequestNotFoundText(text)) {
    const retryable = retryableHint ?? true;
    return classification(
      'process_exit',
      'permission_request_not_found',
      'child_close',
      retryable,
      retryable ? 'retry' : 'none',
    );
  }

  const signalInterrupt = signalInterruptClassification(errorCode, text, retryableHint);
  if (signalInterrupt) return signalInterrupt;

  if (
    errorCode.startsWith('AGENT_EXIT_') ||
    errorCode === 'AGENT_TERMINATED_UNKNOWN' ||
    errorCode === 'AGENT_EXECUTION_FAILED'
  ) {
    const baseDetail = processExitDetail(errorCode, text);
    return classification(
      'process_exit',
      // Only the generic AGENT_EXECUTION_FAILED catch-all is refined; the
      // specific exit_code / terminated_unknown labels already carry meaning.
      baseDetail === 'execution_failed' ? executionFailedDetail(input.events) : baseDetail,
      'child_close',
      retryableHint ?? false,
      retryableHint ? 'retry' : 'none',
    );
  }

  return classification(
    'unknown',
    'unknown',
    'finalize',
    retryableHint ?? false,
    retryableHint ? 'retry' : 'none',
  );
}
