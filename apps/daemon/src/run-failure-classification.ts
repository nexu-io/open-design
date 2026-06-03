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
  return [
    readString(payload.message),
    readString(payload.code),
    readString(nested.message),
    readString(nested.code),
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
    const retryable = readBool(payload.retryable) ?? readBool(nested.retryable);
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
  return /\b(session limit|usage limit|limit reached|quota|billing (?:hard )?limit|insufficient[ _-]?(?:quota|credit|funds)|exceeded your current quota)\b/i
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
  return /\b(tool|mcp|connector)\b/i.test(text) &&
    /\b(error|failed|failure)\b/i.test(text);
}

function isPermissionRequestNotFoundText(text: string): boolean {
  return /\b(PermissionNotFoundError|Permission request not found|permissions\/per_[A-Za-z0-9_-]+\s+returned\s+HTTP\s+404)\b/i
    .test(text);
}

function isAuthDetailText(text: string): boolean {
  return /\b(refresh token|access token could not be refreshed|stale local profile|different or stale local profile|missing environment variable: `?[A-Z0-9_]*API_KEY`?|api key.*missing|credentials? (?:are )?missing|not logged in)\b/i
    .test(text);
}

function isPromptTooLargeText(text: string): boolean {
  return /\b(context window|prompt too large|maximum context|too many tokens|input.*too large|exceeds the safe size|composed prompt exceeds|prompt token count .* exceeds|maximum context length|reduce the length of (?:the )?(?:messages|input prompt))\b/i
    .test(text);
}

function isUpstreamDetailText(text: string): boolean {
  return /\b(stream disconnected before completion|response\.completed|Transport error: network error|Upstream request failed|websocket closed|socket connection was closed unexpectedly|tls handshake eof|Connection reset by peer|TLS close_notify|Broken pipe|remote host|远程主机强迫关闭|No route to host|Connection refused|error sending request|Provider returned error|high demand|upstream_error|http2: response body closed)\b/i
    .test(text);
}

function modelUnavailableDetail(text: string): TrackingRunFailureDetail | null {
  if (/\brequires a newer version of codex\b/i.test(text)) {
    return 'cli_version_incompatible';
  }
  if (/\bmodel is disabled\b/i.test(text)) return 'model_disabled';
  if (/\b(no endpoints found that support tool use|provider routing)\b/i.test(text)) {
    return 'provider_routing_error';
  }
  if (/\b(model .*not supported|requested model is not supported|supported api model names|not supported when using codex)\b/i.test(text)) {
    return 'model_not_supported';
  }
  if (/\b(model (?:is )?(?:unavailable|not available|unsupported|not found)|selected model is not available|not have access|no access|model .*not found|no healthy deployments)\b/i.test(text)) {
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
  if (/\bmissing environment variable: `?[A-Z0-9_]*API_KEY`?|api key.*missing|credentials? (?:are )?missing\b/i
    .test(text)) {
    return 'missing_api_key';
  }
  return 'auth_required';
}

function upstreamDetail(text: string): TrackingRunFailureDetail {
  if (/\b(no endpoints found that support tool use|provider routing)\b/i.test(text)) {
    return 'provider_routing_error';
  }
  if (/\bhigh demand|temporary errors\b/i.test(text)) return 'provider_high_demand';
  if (/\b(stream disconnected before completion|response\.completed|websocket closed|socket connection was closed unexpectedly|connection reset|tls handshake eof|tls close_notify|broken pipe|peer closed connection|remote host|远程主机强迫关闭|http2: response body closed)\b/i
    .test(text)) {
    return 'stream_disconnected';
  }
  if (/\b(?:http|status|error|response)(?:[ _-]?code)?[\s:=#-]*5\d\d\b|\b5\d\d\s+(?:bad gateway|service unavailable|internal server error|gateway timeout)|\b(5xx|bad gateway|gateway timeout|internal server error|service unavailable|upstream[ _-](?:error|unavailable)|provider (?:error|unavailable)|overloaded)\b/i
    .test(text)) {
    return 'upstream_5xx';
  }
  return 'network_error';
}

function processExitDetail(
  errorCode: string,
  text: string,
): TrackingRunFailureDetail {
  if (/\bnot installed|not on PATH\b/i.test(text) || errorCode === 'AGENT_UNAVAILABLE') {
    return 'cli_not_installed';
  }
  if (/\bspawn failed: spawn ENOEXEC\b/i.test(text)) return 'spawn_enoexec';
  if (/\bspawn failed: spawn EBADF\b/i.test(text)) return 'spawn_ebadf';
  if (/\bspawn failed: spawn EPERM\b/i.test(text)) return 'spawn_eperm';
  if (/\bspawn failed: spawn\b/i.test(text)) return 'spawn_failed';
  if (/\bstdin: write EOF\b/i.test(text)) return 'stdin_write_eof';
  if (/\bjson-rpc id \d+: Internal error\b/i.test(text)) {
    return 'agent_protocol_error';
  }
  if (/\bQoder run failed: stop_sequence\b/i.test(text)) {
    return 'qoder_stop_sequence';
  }
  if (errorCode.startsWith('AGENT_EXIT_')) return 'exit_code';
  if (errorCode === 'AGENT_TERMINATED_UNKNOWN') return 'terminated_unknown';
  if (errorCode === 'AGENT_EXECUTION_FAILED') return 'execution_failed';
  return 'unknown';
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

  if (errorCode === 'AGENT_UNAVAILABLE') {
    return classification(
      'process_exit',
      'cli_not_installed',
      'spawn',
      false,
      'install_cli',
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

  if (errorCode === 'RATE_LIMITED' || serviceFailure === 'RATE_LIMITED') {
    const retryable = retryableHint ?? !isHardQuotaText(text);
    return classification(
      'rate_limit',
      isHardQuotaText(text) ? 'hard_quota' : 'rate_limit_429',
      'session_init',
      retryable,
      retryable ? 'retry' : 'none',
    );
  }

  if (
    errorCode === 'UPSTREAM_UNAVAILABLE' ||
    serviceFailure === 'UPSTREAM_UNAVAILABLE' ||
    isUpstreamDetailText(text)
  ) {
    return classification(
      'upstream_unavailable',
      upstreamDetail(text),
      'first_token_wait',
      retryableHint ?? true,
      'retry',
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

  if (
    isTimeoutText(text) ||
    errorCode === 'TIMEOUT' ||
    errorCode.startsWith('AGENT_SIGNAL_')
  ) {
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
    return classification(
      'tool_error',
      'tool_error',
      'tool_execution',
      retryableHint ?? false,
      retryableHint ? 'retry' : 'none',
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

  if (
    errorCode.startsWith('AGENT_EXIT_') ||
    errorCode === 'AGENT_TERMINATED_UNKNOWN' ||
    errorCode === 'AGENT_EXECUTION_FAILED'
  ) {
    return classification(
      'process_exit',
      processExitDetail(errorCode, text),
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
