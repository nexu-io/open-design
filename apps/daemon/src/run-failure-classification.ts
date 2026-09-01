import type {
  TrackingRunCancelOrigin,
  TrackingRunFailureCategory,
  TrackingRunFailureDetail,
  TrackingRunFailureDomain,
  TrackingRunFailureMechanism,
  TrackingRunFailureStage,
  TrackingRunFailureUserAction,
  TrackingRunEvidenceLevel,
  TrackingRunAdmissionStatus,
  TrackingRunAdmissionPhase,
  TrackingRunPolicyReason,
  TrackingRunRepairOwner,
  TrackingRunTerminalTrigger,
} from '@open-design/contracts/analytics';
import {
  isMembershipConcurrencyLimitFailure,
  isModelWindowLimitFailure,
} from '@open-design/contracts';

import { classifyAmrAccountFailure } from './integrations/vela-errors.js';
import { runFailureEvidence } from './services/run-failure-evidence.js';
import { summarizeRunToolProgress } from './run-diagnostics.js';
import { isAcpHandshakeRpcErrorText } from './runtimes/acp-handshake-id.js';
import { classifyAgentServiceFailure } from './runtimes/auth.js';
import type { RunResult, RunStatusForAnalytics } from './run-result.js';
import type { RunAdmissionEvidence } from './runtimes/run-lifecycle-analytics.js';

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
  cancelOrigin?: TrackingRunCancelOrigin | null;
  terminalTrigger?: TrackingRunTerminalTrigger | null;
  events?: RunEventForFailureClassification[];
  admissionEvidence?: RunAdmissionEvidence | undefined;
}

export interface RunFailureClassification {
  failure_category: TrackingRunFailureCategory;
  failure_detail: TrackingRunFailureDetail;
  failure_stage: TrackingRunFailureStage;
  failure_mechanism?: TrackingRunFailureMechanism;
  failure_domain?: TrackingRunFailureDomain;
  evidence_level?: TrackingRunEvidenceLevel;
  repair_owner?: TrackingRunRepairOwner;
  admission_status?: TrackingRunAdmissionStatus;
  admission_phase?: TrackingRunAdmissionPhase;
  policy_reason?: TrackingRunPolicyReason;
  classifier_version?: 'run-failure-v2' | 'run-failure-v3';
  retryable: boolean;
  user_action: TrackingRunFailureUserAction;
  /** Distinguishes an explicit user stop from lifecycle-driven cancellation. */
  cancel_origin?: TrackingRunCancelOrigin;
  /** Lifecycle or watchdog mechanism that forced the terminal state. */
  terminal_trigger?: TrackingRunTerminalTrigger;
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

/**
 * Automatic retries reuse one durable run and append another `start` event.
 * Failure telemetry must describe the terminal attempt, not stale provider,
 * tool, or phase evidence left behind by an earlier retry attempt.
 */
function terminalAttemptEvents(
  events: RunEventForFailureClassification[] | undefined,
): RunEventForFailureClassification[] {
  const records = events ?? [];
  for (let i = records.length - 1; i >= 0; i -= 1) {
    if (records[i]?.event === 'start') return records.slice(i);
  }
  return records;
}

function inferFailureStageFromEvents(
  events: RunEventForFailureClassification[] | undefined,
  fallback: TrackingRunFailureStage,
): TrackingRunFailureStage {
  let sawFirstToken = false;
  let sawArtifact = false;
  const toolProgress = summarizeRunToolProgress(events);

  for (const rec of events ?? []) {
    if (rec.event === 'live_artifact') sawArtifact = true;
    if (rec.event !== 'agent') continue;
    const data = rec.data && typeof rec.data === 'object'
      ? rec.data as Record<string, unknown>
      : {};
    if (data.type === 'text_delta' || data.type === 'thinking_delta') {
      sawFirstToken = true;
    }
    if (data.type === 'artifact' || data.type === 'live_artifact') {
      sawArtifact = true;
    }
  }

  if (sawArtifact) return 'artifact_write';
  if (toolProgress.hasOutstandingTool) return 'tool_outstanding';
  if (toolProgress.toolCallSeen) return 'post_tool_resume';
  if (sawFirstToken) return 'child_close';
  return fallback;
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
  // Standalone `\bquota\b` is intentionally absent: advisory phrases such as
  // "checking quota" in the daemon's own empty-output fallback message would
  // otherwise match, misclassifying a retryable empty_output run as a
  // non-retryable hard quota exhaustion.  Specific exhaustion phrases are
  // listed below instead.
  //
  // `quota reached` covers Antigravity's upstream log line:
  //   RESOURCE_EXHAUSTED (code 429): Individual quota reached.
  // `RESOURCE_EXHAUSTED` catches the same log when the phrase portion is
  // truncated or arrives separately — it is the gRPC status code that
  // Antigravity uses exclusively for per-model quota exhaustion.
  return /\b(session limit|usage limit|limit reached|quota exceeded|quota reached|exceeded your current quota|billing (?:hard )?limit|insufficient[ _-]?(?:quota|credit|credits|funds)|out of credits|no payment method|requires more credits|can only afford)\b|DAILY_LIMIT_EXCEEDED|RESOURCE_EXHAUSTED|用户额度不足|额度不足|预扣费额度失败/i
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
  return /\b(?:your )?workspace is out of credits\b|\badd credits to continue\b|\bask your workspace owner to refill\b|\bno payment method\b|\brequires more credits\b/i
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
    /\bError loading config\.toml:[\s\S]*\bduplicate key\b/i.test(text) ||
    /\bBYOK OpenCode requires a provider, API key, and model for this run\b/i.test(text) ||
    /\bBYOK_PROVIDER_REQUIRED\b/i.test(text) ||
    /\bEACCES: permission denied, mkdir\b[\s\S]*\.config[\\/]+opencode\b/i.test(text);
}

function isCliNotInstalledText(text: string): boolean {
  // Also covers the agent binary being absent at its resolved path:
  //   - Windows shell "'node' is not recognized as an internal or external command"
  //   - Node "Error: spawn <path> ENOENT" (the executable file does not exist —
  //     distinct from spawn EPERM/EBADF/ENOEXEC where the file exists but can't run)
  // Both currently leak into the opaque execution_failed bucket (#3408 P1).
  return /\b(?:Codex CLI was not found|Missing optional dependency|Cannot find module|not installed|not on PATH|cannot find the (?:path|file) specified|system cannot find the (?:path|file) specified|is not recognized as an internal or external command|\bspawn\b[^\n]*\bENOENT\b)|�ڲ����ⲿ����|�Ҳ���ָ����·��|�޷�ִ��ָ���ĳ���|ϵͳ�Ҳ���ָ����·����|ϵͳ�޷�ִ��ָ���ĳ���/i
    .test(text);
}

function isBundledBinaryMissingText(text: string): boolean {
  return /\bbundled (?:OpenCode|agent) binary (?:is )?missing\b/i.test(text);
}

function clientEnvironmentFailureDetail(text: string): TrackingRunFailureDetail | null {
  if (/\b(Windows Application Control|AppLocker)\b/i.test(text)) return 'host_policy_block';
  if (/\b(SQLite|WAL).*(?:I\/O|readonly|locked|corrupt|failed)\b/i.test(text)) return 'local_storage_failure';
  if (/\b(certificate|CERT_|self[- ]signed|unable to verify)\b/i.test(text)) return 'certificate_failure';
  if (/\b(unsupported proxy protocol|proxy configuration)\b/i.test(text)) return 'proxy_configuration';
  if (/\b(ECONNREFUSED|ENETUNREACH|network unreachable|local connection failed)\b/i.test(text)) return 'network_configuration';
  return null;
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

function isAcpFrameTooLargeText(text: string): boolean {
  return /\bACP input line exceeds maximum size\b/i.test(text);
}

function isFabricatedRoleMarkerText(text: string): boolean {
  return /\bmodel emitted fabricated role marker\b/i.test(text);
}

function isPermissionRequestNotFoundText(text: string): boolean {
  return /\b(PermissionNotFoundError|Permission request not found|permissions\/per_[A-Za-z0-9_-]+\s+returned\s+HTTP\s+404)\b/i
    .test(text);
}

function isAuthDetailText(text: string): boolean {
  return /\b(refresh token|access token could not be refreshed|stale local profile|different or stale local profile|credentials from a different local environment|missing environment variable: `?[A-Z0-9_]*(?:API_)?KEY`?|api key.*(?:missing|invalid)|invalid api key|credentials? (?:are )?missing|not logged in|Authentication required|carry the api (?:secret )?key|No auth type is selected|set an Auth method|organization has disabled .* subscription access)\b/i
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

function promptTooLargeDetail(text: string): TrackingRunFailureDetail | null {
  if (
    /\b(?:Payload Too Large|Request Entity Too Large|request entity too large|request body exceeds configured limit)\b/i.test(text) ||
    /\[code=request_too_large\]/i.test(text)
  ) {
    return 'request_too_large';
  }
  // `prefill context too large` is the local-runtime (MLX) shape of the same
  // "the prompt does not fit" failure that currently leaks into execution_failed.
  // Claude Code's terminal result uses the distinct literal `Prompt is too
  // long`; keep it here as a fallback for persisted or legacy failures that
  // do not carry the structured AGENT_PROMPT_TOO_LARGE code.
  if (
    /\b(context window|context size (?:has been )?exceeded|prompt too large|prompt is too long|request_too_large|maximum context|too many tokens|input.*too large|request (?:body )?exceeds configured limit|output token maximum|maximum output tokens|CLAUDE_CODE_MAX_OUTPUT_TOKENS|exceeds the safe size|composed prompt exceeds|prompt token count .* exceeds|maximum context length|context too large|prefill context too large|reduce the length of (?:the )?(?:messages|input prompt)|request \(\d+ tokens\) exceeds the available context size|n_keep:\s*\d+\s*>=\s*n_ctx)\b/i.test(text)
  ) {
    return 'prompt_too_large';
  }
  return null;
}

function clientRequestFailureDetail(text: string): TrackingRunFailureDetail | null {
  if (
    /\bsource\.media_type\b[\s\S]*\bInvalid enum value\b[\s\S]*\bapplication\/pdf\b/i.test(text) ||
    /\bapplication\/pdf\b[\s\S]*\bexpected\b[\s\S]*\bimage\/(?:jpeg|png|gif|webp)\b/i.test(text)
  ) {
    return 'attachment_media_type_unsupported';
  }
  if (
    /\bfunction_declarations\[\d+\]\.name\b[\s\S]*\bInvalid function name\b/i.test(text)
  ) {
    return 'tool_schema_invalid';
  }
  if (/\bFailed to tokenize (?:the )?prompt\b/i.test(text)) {
    return 'prompt_tokenization_failed';
  }
  if (
    /["']?status["']?\s*:\s*404\b[\s\S]*\bFunction\s+["'][^"']+["']\s+Not found for account\b/i.test(text) ||
    /\bFunction\s+["'][^"']+["']\s+Not found for account\b[\s\S]*["']?status["']?\s*:\s*404\b/i.test(text)
  ) {
    return 'provider_resource_not_found';
  }
  return null;
}

function isUpstreamDetailText(text: string): boolean {
  return isUpstreamClientErrorText(text) ||
    /\b(stream disconnected before completion|(?:stream|upstream) idle timeout|no data received within configured window|response\.completed|Transport error: network error|Upstream request failed|websocket closed|socket connection was closed unexpectedly|tls handshake eof|Connection reset by (?:peer|server)|TLS close_notify|Broken pipe|remote host|远程主机强迫关闭|No route to host|Connection refused|ConnectionRefused|error sending request|Provider returned error|high demand|model is at capacity|selected model is at capacity|temporarily unavailable|upstream_error|http2: response body closed|peer closed connection|incomplete chunked read|Client network socket disconnected before secure TLS connection|Connection failed repeatedly|lost its connection to (?:the Anthropic API|the configured custom Anthropic endpoint)|Server error mid-response|empty or malformed response|Unexpected server error|Streaming response failed|Failed to process error response|AMR model catalog is (?:temporarily )?unavailable)\b/i
      .test(text);
}

function isUpstreamClientErrorText(text: string): boolean {
  return /\b(statusCode[\"']?\s*:\s*(?:400|403|404)|400 Bad Request|403 Forbidden|404 Not Found|404 page not found|Not Found:\s*(?:404 page not found|Not Found)|NotFoundError|OpenAIException - \{\"detail\":\"Not Found\"\}|API Error:\s*(?:400|403)\b|Invalid Responses API request|Country, region, or territory not supported|gateway or proxy|validation error|literal_error|Invalid input|Type validation failed|data did not match any variant of untagged enum InputParam)\b/i
    .test(text);
}

// OpenCode providers do not consistently preserve HTTP status metadata. Some
// return only a bare "Not Found" (or an equivalent provider JSON body), which
// previously fell through to the retryable stream_error close reason. Keep the
// broad bare-text shapes scoped to BYOK OpenCode so an unrelated agent's local
// resource/session miss is not reclassified as an upstream provider response.
function isByokOpenCodeProviderNotFoundText(
  agentId: string | null | undefined,
  text: string,
): boolean {
  if (agentId !== 'byok-opencode') return false;

  return /(?:^|\n)\s*(?:Not Found|Resource not found|The requested resource was not found)\s*(?=\n|$)/i
    .test(text) ||
    /\b(?:404(?:\s+(?:page|route))?\s+not found|resource_not_found_error|the requested resource was not found|Not Found:\s*Not support|NotFoundError)\b/i
      .test(text) ||
    /\bopencode (?:session error|event stream):[^\n]*\bNot Found\s*(?=$|\n)/im
      .test(text) ||
    /\"(?:detail|message)\"\s*:\s*\"Not Found\"/i.test(text) ||
    /\bstatusCode[\"']?\s*:\s*404\b/i.test(text);
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
  if (/\b(unsupported model\b|model .*not supported|not supported model\b|requested model is not supported|supported api model names|not supported when using codex)\b/i.test(text)) {
    return 'model_not_supported';
  }
  if (/\b(model (?:is )?(?:unavailable|not available|unsupported|not found)|selected model is not available|not have access|no access|model .*not found|no healthy deployments|model .*not in (?:the )?allowed list)\b/i.test(text)) {
    return 'model_not_found';
  }
  return null;
}

function wasBlockedByModelCapabilityPreflight(
  events: RunEventForFailureClassification[] | undefined,
): boolean {
  return (events ?? []).some((event) => {
    if (event.event !== 'diagnostic' || !event.data || typeof event.data !== 'object') {
      return false;
    }
    const data = event.data as Record<string, unknown>;
    return (
      data.type === 'model_capability_preflight' &&
      data.status === 'incompatible'
    );
  });
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
  if (/\bmissing environment variable: `?[A-Z0-9_]*(?:API_)?KEY`?|api key.*missing|credentials? (?:are )?missing\b/i
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
  if (/\b(stream disconnected before completion|(?:stream|upstream) idle timeout|no data received within configured window|response\.completed|websocket closed|socket connection was closed unexpectedly|connection reset|ConnectionRefused|tls handshake eof|tls close_notify|broken pipe|peer closed connection|remote host|远程主机强迫关闭|http2: response body closed|incomplete chunked read|Client network socket disconnected before secure TLS connection|Connection failed repeatedly|lost its connection to (?:the Anthropic API|the configured custom Anthropic endpoint)|Server error mid-response|empty or malformed response|Streaming response failed)\b/i
    .test(text)) {
    return 'stream_disconnected';
  }
  if (isUpstreamClientErrorText(text)) return 'upstream_client_error';
  if (/\b(?:http|status|error|response)(?:[ _-]?code)?[\s:=#-]*5\d\d\b|\b5\d\d\s+(?:bad gateway|service unavailable|internal server error|gateway timeout)|\b(5xx|bad gateway|gateway timeout|internal server error|service unavailable|upstream[ _-](?:error|unavailable)|provider (?:error|unavailable)|overloaded|Unexpected server error|Failed to process error response)\b/i
    .test(text)) {
    return 'upstream_5xx';
  }
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
  if (isProcessCrashText(text)) {
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
  if (isProcessCrashText(text)) return 'process_crashed';
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

function isProcessCrashText(text: string): boolean {
  return /\bBun v\d+\.\d+\.\d+\b[\s\S]*\b(oh no: Bun has crashed|panic\(|Illegal instruction|Segmentation fault)\b/i
    .test(text) ||
    /\b(?:exit status )?0xc0000409\b/i
    .test(text);
}

/**
 * True when the failure text is an agent CLI reporting that a runtime IT
 * manages failed to start — not a statement about the CLI's own build.
 *
 * vela wraps every bundled-OpenCode startup failure this way before answering
 * `session/new` / `session/load` (`acp_runtime.go`: `start opencode server:
 * %v`, over `opencode_process.go`'s `opencode exited before readiness`), so the
 * text arrives inside a handshake-numbered JSON-RPC frame while describing a
 * CHILD OF THE CLI that never came up: a port collision, an OOM kill, a
 * half-written config, a binary the release package is missing.
 *
 * The distinction the classifier needs from this is which variable the user can
 * move. An agent CLI that answered `initialize` and then refused to open a
 * session with no reason has only its own build left to blame; a CLI that
 * reports its managed runtime never became ready has named the moving part
 * itself, and pointing that user at the CLI version sends them after a fix that
 * cannot apply. These startups are also the transient half of the pair — a port
 * race clears on the next attempt — which is the retry the refusal reading
 * withdraws.
 *
 * @param text - Failure text as surfaced by the ACP session (`rpcErrorMessage`).
 */
function isManagedRuntimeStartupFailureText(text: string): boolean {
  return /\bstart opencode server\b|\bopencode exited before readiness\b/i.test(text);
}

// The child binary executed an instruction this CPU does not implement — in
// practice a Bun-compiled agent (bundled opencode) built for AVX2 running on a
// CPU without it (Intel Atom/Celeron/Pentium N-series through 2021, and
// AVX-but-not-AVX2 Sandy/Ivy Bridge cores). Matched only on signals that
// prove the unsupported-CPU case:
// - `no_avx2`: the CPU-feature line Bun's crash banner prints on such
//   machines. Unconditional — the feature line itself is the proof.
// - Windows STATUS_ILLEGAL_INSTRUCTION (hex 0xC000001D or Go/Node's decimal
//   exit-status rendering 3221225501), but ONLY inside vela's bundled-opencode
//   startup wrapper text (`isManagedRuntimeStartupFailureText`). The raw status
//   code is a generic Windows SIGILL that any agent binary could die with for
//   unrelated reasons; every bannerless production trace carries the vela
//   wrapper, so the gate costs no recall.
// A bare "Illegal instruction" line is deliberately NOT matched: any
// unrelated SIGILL (a runtime bug on an AVX2-capable machine) would then be
// mislabeled as a processor limitation and lose its retry. The same binary on
// the same CPU fails deterministically, so cpu_unsupported must never be
// auto-retried.
function isCpuUnsupportedCrashText(text: string): boolean {
  if (/\bno_avx2\b/i.test(text)) return true;
  return (
    /0xc000001d|\b3221225501\b/i.test(text) &&
    isManagedRuntimeStartupFailureText(text)
  );
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
  if (!failure?.retryable) return false;
  if (
    failure.failure_category === 'upstream_unavailable' &&
    (
      failure.failure_detail === 'stream_disconnected' ||
      failure.failure_detail === 'upstream_5xx' ||
      failure.failure_detail === 'network_error' ||
      failure.failure_detail === 'provider_high_demand' ||
      failure.failure_detail === 'provider_routing_error'
    )
  ) {
    return true;
  }
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
  options: {
    structuredProviderEvidence?: boolean;
    evidenceLevel?: TrackingRunEvidenceLevel;
  } = {},
): RunFailureClassification {
  const policy = [
    'hard_quota',
    'model_window_limit',
    'membership_concurrency_limit',
    'workspace_credits_exhausted',
    'amr_insufficient_balance',
    'amr_tier_upgrade_required',
  ].includes(failure_detail) || failure_category === 'entitlement_required';
  const localModel = [
    'cli_version_incompatible',
    'local_model_not_loaded',
  ].includes(failure_detail);
  const clientRequest = [
    'attachment_media_type_unsupported',
    'tool_schema_invalid',
    'prompt_tokenization_failed',
    'provider_resource_not_found',
  ].includes(failure_detail);
  const transport = !options.structuredProviderEvidence && [
    'stream_disconnected',
    'network_error',
  ].includes(failure_detail);
  const provider = (failure_category === 'model_unavailable' && !localModel)
    || (failure_category === 'upstream_unavailable' && !transport && !clientRequest)
    || (failure_category === 'rate_limit' && !policy);
  const environment = [
    'auth_required', 'stale_profile', 'refresh_token_reused', 'missing_api_key',
    'invalid_api_key', 'cli_not_installed', 'git_bash_missing',
    'agent_config_invalid', 'cpu_unsupported', 'host_policy_block',
    'local_storage_failure', 'certificate_failure', 'proxy_configuration',
    'network_configuration',
  ].includes(failure_detail) || localModel;
  const product = [
    'agent_protocol_error', 'acp_frame_too_large', 'bundled_binary_missing', 'empty_output', 'fabricated_role_marker',
    'permission_request_not_found', 'plugin_artifact_missing',
  ].includes(failure_detail) || clientRequest || failure_category === 'prompt_too_large';
  const failure_mechanism: TrackingRunFailureMechanism = policy
    ? 'policy_rejection'
    : provider
      ? 'provider_rejection'
      : transport
        ? 'transport_failure'
      : failure_detail === 'acp_frame_too_large'
        ? 'frame_too_large'
        : failure_detail === 'agent_protocol_error'
          ? 'protocol_violation'
        : failure_category === 'empty_output'
          ? 'empty_completion'
          : failure_category === 'timeout'
            ? failure_detail === 'inactivity_timeout'
              ? 'stream_idle_timeout'
              : failure_stage === 'post_tool_resume'
                ? 'post_tool_resume_timeout'
                : 'acp_response_deadline'
          : failure_category === 'tool_error'
              ? 'tool_execution_failure'
              : failure_detail === 'interrupted'
                ? 'unknown'
              : failure_category === 'process_exit'
                ? 'child_exit'
                : 'unknown';
  const failure_domain: TrackingRunFailureDomain = policy
    ? 'policy_admission'
    : provider
      ? 'provider_control_plane'
      : transport
        ? 'cross_boundary'
      : environment
        ? 'client_environment'
        : product
          ? 'client_product'
          : failure_category === 'timeout' || failure_category === 'process_exit'
            ? 'cross_boundary'
            : 'unknown';
  const inferredEvidenceLevel: TrackingRunEvidenceLevel = failure_detail === 'membership_concurrency_limit'
    ? 'structured_code'
    : failure_detail === 'interrupted'
      ? 'lifecycle_signal'
    : transport
      ? 'legacy_text'
    : provider
      ? options.structuredProviderEvidence ? 'structured_code' : 'legacy_text'
      : failure_detail === 'agent_protocol_error' || failure_detail === 'acp_frame_too_large'
        ? 'protocol_error'
        : failure_category === 'timeout'
          ? 'lifecycle_signal'
            : failure_detail === 'bundled_binary_missing' || environment
              ? 'stderr_fallback'
              : ['fatal_rpc_error', 'stream_error', 'exit_nonzero'].includes(failure_detail)
            ? 'close_reason'
            : failure_detail === 'unknown'
              ? 'unknown'
              : 'legacy_text';
  const evidence_level = options.evidenceLevel ?? inferredEvidenceLevel;
  const repair_owner: TrackingRunRepairOwner = failure_domain === 'policy_admission'
    ? 'policy_owner'
    : failure_domain === 'provider_control_plane'
      ? 'provider_owner'
      : failure_domain === 'client_environment'
        ? 'client_environment'
        : failure_domain === 'client_product'
          ? 'open_design'
          : failure_domain === 'cross_boundary'
            ? 'shared_boundary'
            : 'unknown';
  return {
    failure_category,
    failure_detail,
    failure_stage,
    failure_mechanism,
    failure_domain,
    evidence_level,
    repair_owner,
    admission_status: 'unknown',
    classifier_version: 'run-failure-v3',
    retryable,
    user_action,
  };
}

function classifyRunFailureBase(
  input: RunFailureClassificationInput,
): RunFailureClassification | undefined {
  if (input.result === 'success') return undefined;
  const events = terminalAttemptEvents(input.events);
  if (input.result === 'cancelled') {
    const cancelOrigin = input.cancelOrigin ?? 'unknown';
    return {
      // Preserve the legacy category/detail for dashboard compatibility.
      // `cancel_origin` is the authoritative SLO eligibility signal.
      failure_category: 'user_cancel',
      failure_detail: 'user_cancelled',
      failure_stage: inferFailureStageFromEvents(events, 'first_token_wait'),
      retryable: false,
      user_action: 'none',
      cancel_origin: cancelOrigin,
      terminal_trigger: cancelOrigin,
    };
  }

  const errorCode = normalizeCode(input.errorCode ?? input.status.errorCode);
  const text = collectFailureText({ ...input, events });
  const retryableHint = latestRetryable(events);
  // Compute once; used both for the early empty_output guard below and for the
  // fatal_rpc_error promotion later in this function.
  const runtimeCloseReason = readRuntimeCloseReason(events);
  const amrFailure = classifyAmrAccountFailure(text);
  const byokOpenCodeProviderNotFound = isByokOpenCodeProviderNotFoundText(
    input.agentId,
    text,
  );

  if (errorCode === 'DAEMON_RESTARTED') {
    return classification(
      'process_exit',
      'interrupted',
      'finalize',
      true,
      'retry',
    );
  }

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
      errorCode === 'AMR_INSUFFICIENT_BALANCE'
        ? { evidenceLevel: 'structured_code' }
        : {},
    );
  }

  if (
    errorCode === 'AMR_TIER_UPGRADE_REQUIRED' ||
    amrFailure?.code === 'AMR_TIER_UPGRADE_REQUIRED'
  ) {
    return classification(
      'entitlement_required',
      'amr_tier_upgrade_required',
      'session_init',
      false,
      'upgrade',
      errorCode === 'AMR_TIER_UPGRADE_REQUIRED'
        ? { evidenceLevel: 'structured_code' }
        : {},
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
      [
        'AMR_AUTH_REQUIRED',
        'AGENT_AUTH_REQUIRED',
        'UNAUTHORIZED',
      ].includes(errorCode ?? '')
        ? { evidenceLevel: 'structured_code' }
        : {},
    );
  }

  const promptSizeDetail = promptTooLargeDetail(text);
  if (errorCode === 'AGENT_PROMPT_TOO_LARGE' || promptSizeDetail) {
    return classification(
      'prompt_too_large',
      promptSizeDetail ?? 'prompt_too_large',
      'prompt_send',
      false,
      'reduce_context',
      errorCode === 'AGENT_PROMPT_TOO_LARGE'
        ? { evidenceLevel: 'structured_code' }
        : {},
    );
  }

  const modelDetail = errorCode === 'AMR_MODEL_UNAVAILABLE'
    ? 'model_not_found'
    : modelUnavailableDetail(text);
  if (modelDetail) {
    return classification(
      'model_unavailable',
      modelDetail,
      modelDetail === 'cli_version_incompatible' &&
        wasBlockedByModelCapabilityPreflight(events)
        ? 'preflight'
        : 'model_select',
      false,
      'switch_model',
      { structuredProviderEvidence: errorCode === 'AMR_MODEL_UNAVAILABLE' },
    );
  }

  const clientRequestDetail = clientRequestFailureDetail(text);
  if (clientRequestDetail) {
    return classification(
      'upstream_unavailable',
      clientRequestDetail,
      'prompt_send',
      false,
      'none',
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

  if (isBundledBinaryMissingText(text)) {
    return classification(
      'process_exit',
      'bundled_binary_missing',
      'spawn',
      false,
      'none',
    );
  }

  const serviceFailure = classifyAgentServiceFailure(text);
  const environmentDetail = clientEnvironmentFailureDetail(text);
  const hasStructuredServiceCode = [
    'RATE_LIMITED',
    'UPSTREAM_UNAVAILABLE',
    'AGENT_CONNECTION_DROPPED',
  ].includes(errorCode ?? '');
  if (environmentDetail && !hasStructuredServiceCode) {
    return classification(
      'process_exit',
      environmentDetail,
      'spawn',
      false,
      'none',
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

  if (isAcpFrameTooLargeText(text)) {
    return classification(
      'process_exit',
      'acp_frame_too_large',
      inferFailureStageFromEvents(events, 'child_close'),
      false,
      'none',
    );
  }

  // A protocol failure from AFTER the handshake: a session existed, so the run
  // may simply have hit a bad moment and the old transient treatment stands.
  // Handshake-numbered frames (ids 1 and 2) are deliberately NOT claimed here
  // — the wording an agent chooses for its rejection (`Internal error`,
  // `Method not found`, `Invalid params`) is not a signal, and matching on it
  // made the verdict depend on which layer of the CLI happened to refuse.
  // Those fall through every cause branch below and are answered once, at
  // `isAcpHandshakeRpcErrorText` further down.
  if (isAgentProtocolErrorText(text) && !isAcpHandshakeRpcErrorText(text)) {
    return classification(
      'process_exit',
      processExitDetail(errorCode, text),
      'child_close',
      retryableHint ?? true,
      retryableHint === false ? 'none' : 'retry',
    );
  }

  if (serviceFailure === 'AGENT_AUTH_REQUIRED' || isAuthDetailText(text)) {
    return classification(
      'auth',
      authDetail(text),
      'session_init',
      false,
      'login',
    );
  }

  // Vela reports a full membership concurrency policy through an ACP fatal
  // envelope. Claim the named policy limit before fatal close promotion. Even
  // when the envelope says retryable, an immediate automatic replay only hits
  // the same occupied slots, so leave retry to the user after the reset time.
  if (input.agentId === 'amr' && isMembershipConcurrencyLimitFailure(text)) {
    return classification(
      'rate_limit',
      'membership_concurrency_limit',
      'session_init',
      false,
      'none',
    );
  }

  if (errorCode === 'RATE_LIMITED' || serviceFailure === 'RATE_LIMITED' || isHardQuotaText(text) || isRateLimitText(text)) {
    // Checked BEFORE the hard-quota reading: vela phrases its rolling per-model
    // window as "…usage limit…", which `isHardQuotaText` matches, so without
    // this branch a self-resetting window is reported as an exhausted quota —
    // non-retryable, and counted against reliability as a real failure.
    if (isModelWindowLimitFailure(text)) {
      return classification(
        'rate_limit',
        'model_window_limit',
        'session_init',
        true,
        'retry',
      );
    }
    const hardQuota = isHardQuotaText(text);
    const workspaceCredits = isWorkspaceCreditsText(text);
    const retryable = hardQuota ? false : (retryableHint ?? true);
    return classification(
      'rate_limit',
      workspaceCredits
        ? 'workspace_credits_exhausted'
        : hardQuota
          ? 'hard_quota'
          : 'rate_limit_429',
      'session_init',
      retryable,
      retryable ? 'retry' : workspaceCredits ? 'recharge' : 'none',
      { structuredProviderEvidence: errorCode === 'RATE_LIMITED' },
    );
  }

  if (
    errorCode === 'UPSTREAM_UNAVAILABLE' ||
    errorCode === 'AGENT_CONNECTION_DROPPED' ||
    serviceFailure === 'UPSTREAM_UNAVAILABLE' ||
    isUpstreamDetailText(text) ||
    byokOpenCodeProviderNotFound
  ) {
    const structuredProviderEvidence =
      errorCode === 'UPSTREAM_UNAVAILABLE' ||
      errorCode === 'AGENT_CONNECTION_DROPPED';
    const upstreamClientError =
      byokOpenCodeProviderNotFound || isUpstreamClientErrorText(text);
    // A provider/SDK 4xx or request-shape rejection will deterministically fail
    // again with the same payload. Do not let a coarse SDK isRetryable=true hint
    // override the text-level client-error evidence.
    const retryable = upstreamClientError ? false : retryableHint ?? true;
    return classification(
      'upstream_unavailable',
      upstreamClientError ? 'upstream_client_error' : upstreamDetail(text),
      inferFailureStageFromEvents(events, 'first_token_wait'),
      retryable,
      retryable ? 'retry' : 'none',
      { structuredProviderEvidence },
    );
  }

  // Prefer the structured rpc_close_reason=empty_output signal over text
  // heuristics — but only after RATE_LIMITED, UPSTREAM_UNAVAILABLE, and other
  // structured-code branches above have had a chance to claim the run. A child
  // that exits cleanly after a provider rate-limit rejection may still carry
  // rpc_close_reason=empty_output; the structured error code is the authoritative
  // signal in that case, not the close reason.
  if (runtimeCloseReason === 'empty_output') {
    return classification(
      'empty_output',
      'empty_output',
      inferFailureStageFromEvents(events, 'first_token_wait'),
      retryableHint ?? true,
      'retry',
    );
  }

  if (isEmptyOutputText(text)) {
    return classification(
      'empty_output',
      'empty_output',
      inferFailureStageFromEvents(events, 'first_token_wait'),
      retryableHint ?? true,
      'retry',
    );
  }

  if (isTimeoutText(text) || errorCode === 'TIMEOUT') {
    const retryable = retryableHint ?? true;
    const inactivityTimeout = /inactivity|stalled|hung|no new output|without emitting any new output/i.test(text);
    // `attachAcpSession`'s stage watchdog fails the turn with
    // `ACP <stage> timed out after <n>ms` and then kills the child, so the run
    // surfaces the child's exit code instead of a stall code. Without this
    // trigger the terminal reads as a bare AGENT_EXIT_130 — indistinguishable
    // from a user interrupt, which is how the 2026-07-28 AMR stall got
    // attributed to the wrong watchdog and the wrong 15-minute window.
    const acpStageTimeout = /\bACP\b[^\n]*timed out after \d+\s*ms/i.test(text);
    const terminalTrigger: TrackingRunTerminalTrigger | undefined =
      /without emitting a first output/i.test(text)
        ? 'first_output_deadline'
        : inactivityTimeout
          ? 'inactivity_watchdog'
          : acpStageTimeout
            ? 'acp_stage_timeout'
            : undefined;
    return {
      ...classification(
        'timeout',
        inactivityTimeout ? 'inactivity_timeout' : 'timeout',
        inferFailureStageFromEvents(events, 'first_token_wait'),
        retryable,
        retryable ? 'retry' : 'none',
      ),
      ...(terminalTrigger ? { terminal_trigger: terminalTrigger } : {}),
    };
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

  // Must be checked BEFORE the fatal_rpc_error close-reason promotion below:
  // when the bundled agent binary dies of an illegal instruction before
  // readiness, vela surfaces an ACP fatal and the close reason alone would
  // classify this as a retryable fatal_rpc_error — but the retry re-runs the
  // same binary on the same CPU and deterministically fails again.
  if (isCpuUnsupportedCrashText(text)) {
    return classification(
      'process_exit',
      'cpu_unsupported',
      inferFailureStageFromEvents(events, 'session_init'),
      false,
      'none',
    );
  }

  // Last word on an ACP handshake rejection, and deliberately the last: every
  // branch above has already had its chance to name a cause, so reaching here
  // means the agent CLI answered `initialize`, refused `session/new` /
  // `session/load`, and gave no reason the daemon recognises. Its build is then
  // the only variable left — file it at `session_init`, which is the stage the
  // retry policy refuses to re-run, and point the user at the CLI rather than
  // at the model or the stream.
  //
  // Placing this AFTER the cause branches is what makes the precedence a fact
  // rather than a promise: a signed-out CLI is filed under auth, a throttled
  // one under rate_limit, an over-long prompt under prompt_too_large, and only
  // an unexplained refusal reaches this line. `isAcpCliSessionRefusalText` is
  // this same reading, exposed so the ACP payload rewrite prescribes exactly
  // what the telemetry records.
  //
  // The deferrals are not about wording. Both are texts where the handshake
  // frame is the ENVELOPE rather than the evidence — something other than the
  // agent CLI's own build failed, and the CLI merely carried the report:
  //
  // - An OS-level crash banner (a Bun panic, a Windows
  //   STATUS_ILLEGAL_INSTRUCTION from the bundled opencode) describes a child
  //   that DIED; `signalInterruptClassification` below owns that reading, the
  //   same reason `isCpuUnsupportedCrashText` is checked above.
  // - A managed runtime that never became ready describes a child that never
  //   STARTED. AMR is the population this reaches — vela reports its bundled
  //   OpenCode's startup failures from inside `session/new` — and a startup
  //   race is exactly the shape the fatal_rpc_error path below recovers by
  //   retrying. Filing it here would tell that user to replace a healthy CLI
  //   and take the recovery away at the same time.
  if (
    isAcpHandshakeRpcErrorText(text)
    && !isProcessCrashText(text)
    && !isManagedRuntimeStartupFailureText(text)
  ) {
    return classification(
      'process_exit',
      'agent_protocol_error',
      'session_init',
      false,
      'install_cli',
    );
  }

  // ACP fatal paths ask the host to terminate the child after the protocol
  // failure. The resulting exit/signal is therefore cleanup, not the cause.
  // Prefer the runtime_close reason once specific text classifiers above have
  // had a chance to claim auth, quota, upstream, prompt-size, and other known
  // failures. Unlike stream_error, fatal_rpc_error may have no structured SSE
  // error code at all, so it must also refine signal/unknown/exit fallbacks.
  if (
    runtimeCloseReason === 'fatal_rpc_error' &&
    (
      errorCode === 'AGENT_EXECUTION_FAILED' ||
      errorCode === 'AGENT_TERMINATED_UNKNOWN' ||
      errorCode.startsWith('AGENT_SIGNAL_') ||
      errorCode.startsWith('AGENT_EXIT_')
    )
  ) {
    const retryable = retryableHint ?? true;
    return classification(
      'process_exit',
      'fatal_rpc_error',
      inferFailureStageFromEvents(events, 'child_close'),
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
    const refinedDetail = baseDetail === 'execution_failed' ? executionFailedDetail(events) : baseDetail;
    const defaultRetryable =
      refinedDetail === 'stream_error' ||
      refinedDetail === 'fatal_rpc_error';
    return classification(
      'process_exit',
      // Only the generic AGENT_EXECUTION_FAILED catch-all is refined; the
      // specific exit_code / terminated_unknown labels already carry meaning.
      refinedDetail,
      inferFailureStageFromEvents(events, 'child_close'),
      retryableHint ?? defaultRetryable,
      (retryableHint ?? defaultRetryable) ? 'retry' : 'none',
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

/**
 * The error code the text-only probe below classifies under: the generic
 * "the agent failed and said this" code, so the verdict is decided by the text
 * and nothing else.
 */
const TEXT_ONLY_PROBE_ERROR_CODE = 'AGENT_EXECUTION_FAILED';

/**
 * True when this failure text reads as an ACP handshake rejection the agent CLI
 * gave no reason for — the one shape "this CLI build cannot start a session;
 * change it, then retry" actually answers, because the build is the only
 * variable left.
 *
 * Answered by running the classifier itself rather than by a second signature
 * list, so the prescription the user reads and the bucket the run is filed
 * under are the same decision. A handshake failure that names a cause the
 * classifier recognises — signed out, throttled, out of balance, upstream down,
 * prompt too long — is claimed by that cause's branch and reported false here,
 * so the user is sent after the fix that actually applies.
 *
 * @param text - Failure text as surfaced by the ACP session (`rpcErrorMessage`).
 */
export function isAcpCliSessionRefusalText(text: string | null | undefined): boolean {
  if (typeof text !== 'string' || !isAcpHandshakeRpcErrorText(text)) return false;
  const failure = classifyRunFailureBase({
    result: 'failed',
    status: { status: 'failed', error: text },
    errorCode: TEXT_ONLY_PROBE_ERROR_CODE,
  });
  return failure?.failure_detail === 'agent_protocol_error'
    && failure.failure_stage === 'session_init';
}

export function classifyRunFailure(
  input: RunFailureClassificationInput,
): RunFailureClassification | undefined {
  const failure = classifyRunFailureBase(input);
  if (!failure) return failure;
  if (input.result === 'cancelled') {
    return { ...failure, ...(input.terminalTrigger ? { terminal_trigger: input.terminalTrigger } : {}) };
  }
  const terminalTrigger = input.terminalTrigger ?? failure.terminal_trigger;
  const failureText = collectFailureText({
    ...input,
    events: terminalAttemptEvents(input.events),
  });
  const failureMechanism = failure.failure_category === 'timeout'
    ? /(?:readiness|ready) deadline[^\n]*(?:timed out|timeout|expired|failed)|(?:readiness failed|failed to become ready|did not become ready|never became ready)/i.test(failureText)
      ? 'startup_readiness_timeout'
      : terminalTrigger === 'first_output_deadline'
        ? 'first_output_deadline'
        : terminalTrigger === 'acp_stage_timeout'
          ? failure.failure_stage === 'post_tool_resume'
            ? 'post_tool_resume_timeout'
            : failure.failure_stage === 'tool_execution' || failure.failure_stage === 'tool_outstanding'
              ? 'tool_execution_failure'
              : 'acp_response_deadline'
          : terminalTrigger === 'inactivity_watchdog'
            ? 'stream_idle_timeout'
            : failure.failure_mechanism
    : failure.failure_mechanism;
  // A retry or manual resume can fail in preflight before appending its next start. The new
  // causal fields must not reuse the preceding attempt in that interval;
  // legacy classification/retry behavior intentionally remains unchanged.
  let evidenceEvents = terminalAttemptEvents(input.events);
  let pendingRetry = -1;
  for (let index = evidenceEvents.length - 1; index >= 0; index -= 1) {
    if (evidenceEvents[index]?.event === 'run_retry_attempted'
      || evidenceEvents[index]?.event === 'run_resume_attempted') {
      pendingRetry = index;
      break;
    }
  }
  if (pendingRetry >= 0) evidenceEvents = evidenceEvents.slice(pendingRetry + 1);
  const evidenceFailure = pendingRetry >= 0
    ? classifyRunFailureBase({ ...input, events: evidenceEvents }) ?? failure
    : failure;
  return {
    ...failure,
    ...(failureMechanism ? { failure_mechanism: failureMechanism } : {}),
    ...(pendingRetry >= 0 ? {
      failure_mechanism: evidenceFailure.failure_mechanism,
      failure_domain: evidenceFailure.failure_domain,
      evidence_level: evidenceFailure.evidence_level,
      repair_owner: evidenceFailure.repair_owner,
    } : {}),
    ...runFailureEvidence(input, evidenceFailure, evidenceEvents),
    ...(terminalTrigger ? { terminal_trigger: terminalTrigger } : {}),
  };
}
