import { describe, expect, it } from 'vitest';

import { withAcpHandshakeFailureGuidance } from '../src/runtimes/acp-handshake-failure.js';
import {
  GENERIC_ACP_FAILURE_CODE,
  withAcpServiceFailureCode,
} from '../src/runtimes/acp-service-failure.js';
import { classifyRunFailure } from '../src/run-failure-classification.js';

// A frozen landing table for the ACP/JSON-RPC failure path.
//
// This exists because naming a failure class changes where existing failures
// land, and the nine `streamFormat: 'acp-json-rpc'` runtimes (amr, vibe, devin,
// hermes, kilo, kimi, kiro, trae-cli, reasonix) cover a lot of ground. Every
// row below was MEASURED against the pre-change daemon first (`codeBefore`) and
// then against the post-change daemon (`code`), so a future edit to the
// classifier or to `withAcpServiceFailureCode` cannot quietly move a failure
// from one card to another: the row goes red and names which one.
//
// Every text is real — taken from `run-failure-classification.test.ts`,
// `acp-handshake-failure.test.ts`, `specs/current/run-error-catalog.md`, or, for
// H1, verbatim from a user's packaged `0.21.2-beta.1` screenshot.
//
// The two axes this table pins are deliberately separate:
//   - `code`      — the SSE `error.code` the ACP bridge emits. This is the axis
//                   the change moves, and the one the web resolves a card from.
//   - `category` / `detail` / `retryable` / `userAction` — the run classifier's
//                   verdict, which telemetry and the retry policy read. The
//                   change moved NONE of these: every row's analysis verdict is
//                   identical before and after, because the classifier already
//                   recognised each of these strings. All the change did was
//                   stop the code axis from disagreeing with it.

/**
 * The line a user read on packaged `0.21.2-beta.1`, verbatim. The
 * `(event=session.error, session=…)` tail is vela's own
 * (`openCodeEventStreamPromptErrorMessage`); the `json-rpc id 4: ` prefix is the
 * daemon's `rpcErrorMessage`.
 */
const RAW_UPSTREAM_OVERLOADED =
  'json-rpc id 4: opencode event stream: {"id":"evt_079e7523a001q84xvEDieo4RPa",'
  + '"properties":{"error":{"data":{"message":"\\"[code=upstream_error] Our servers are '
  + 'currently overloaded. Please try again later.\\""},"name":"UnknownError"},'
  + '"sessionID":"ses_f86193cfdffevgdF9Hpf8QQcGF"},"type":"session.error"}'
  + ' (event=session.error, session=ses_f86193cfdffevgdF9Hpf8QQcGF)';

interface Row {
  id: string;
  text: string;
  /**
   * How `fail()` shapes this failure today. `structured` is the JSON-RPC error
   * branch (`AGENT_EXECUTION_FAILED` + retryable + details); `bare` is every
   * other `fail()` call site, which emits `{ message }` with NO error object at
   * all — and therefore, before this change, no error code whatsoever.
   */
  shape: 'bare' | 'structured';
  /** `error.retryable` as `fail()` set it. Must survive unchanged. */
  payloadRetryable?: boolean;
  /** `error.code` the ACP bridge emitted BEFORE this change. Documentation, and asserted below. */
  codeBefore: string | null;
  /** `error.code` the ACP bridge emits now. */
  code: string | null;
  category: string;
  detail: string;
  retryable: boolean;
  userAction: string;
}

const ROWS: Row[] = [
  // ---- headline: the observed 0.21.2-beta.1 overload ----
  { id: 'H1 upstream_overloaded(real)', text: RAW_UPSTREAM_OVERLOADED, shape: 'structured', payloadRetryable: true, codeBefore: 'AGENT_EXECUTION_FAILED', code: 'UPSTREAM_UNAVAILABLE', category: 'upstream_unavailable', detail: 'upstream_5xx', retryable: true, userAction: 'retry' },

  // ---- handshake stage (id 1/2) ----
  { id: 'A1 bare Internal error id2', text: 'json-rpc id 2: Internal error', shape: 'structured', codeBefore: 'AGENT_CLI_SESSION_REFUSED', code: 'AGENT_CLI_SESSION_REFUSED', category: 'process_exit', detail: 'agent_protocol_error', retryable: false, userAction: 'install_cli' },
  { id: 'A2 Method not found id2', text: 'json-rpc id 2: Method not found', shape: 'structured', codeBefore: 'AGENT_CLI_SESSION_REFUSED', code: 'AGENT_CLI_SESSION_REFUSED', category: 'process_exit', detail: 'agent_protocol_error', retryable: false, userAction: 'install_cli' },
  { id: 'A3 Authentication required', text: 'json-rpc id 2: Authentication required', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_AUTH_REQUIRED', category: 'auth', detail: 'auth_required', retryable: false, userAction: 'login' },
  { id: 'A4 HTTP 401 Unauthorized id1', text: 'json-rpc id 1: HTTP 401 Unauthorized', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_AUTH_REQUIRED', category: 'auth', detail: 'auth_required', retryable: false, userAction: 'login' },
  { id: 'A5 rate limit exceeded', text: 'json-rpc id 2: rate limit exceeded', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'RATE_LIMITED', category: 'rate_limit', detail: 'rate_limit_429', retryable: false, userAction: 'none' },
  { id: 'A6 insufficient balance', text: 'json-rpc id 2: insufficient balance', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'RATE_LIMITED', category: 'insufficient_balance', detail: 'amr_insufficient_balance', retryable: false, userAction: 'recharge' },
  { id: 'A7 HTTP 503 Service Unavailable', text: 'json-rpc id 2: HTTP 503 Service Unavailable', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'UPSTREAM_UNAVAILABLE', category: 'upstream_unavailable', detail: 'upstream_5xx', retryable: false, userAction: 'none' },
  { id: 'A8 Internal error: 401 Unauthorized', text: 'json-rpc id 2: Internal error: 401 Unauthorized', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_AUTH_REQUIRED', category: 'auth', detail: 'auth_required', retryable: false, userAction: 'login' },
  { id: 'A9 Internal error: 429 rate limit', text: 'json-rpc id 2: Internal error: 429 rate limit exceeded', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'RATE_LIMITED', category: 'rate_limit', detail: 'rate_limit_429', retryable: false, userAction: 'none' },
  { id: 'A10 opencode never ready', text: 'json-rpc id 2: start opencode server: opencode exited before readiness: exit status 3', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'process_exit', detail: 'fatal_rpc_error', retryable: false, userAction: 'none' },
  { id: 'A11 cpu unsupported', text: 'json-rpc id 2: start opencode server: opencode exited before readiness: exit status 0xc0000409', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'process_exit', detail: 'fatal_rpc_error', retryable: false, userAction: 'none' },
  { id: 'A12 AMR catalog unavailable', text: 'json-rpc id 2: AMR model catalog is unavailable.', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'upstream_unavailable', detail: 'provider_routing_error', retryable: false, userAction: 'none' },
  { id: 'A13 AMR catalog TEMPORARILY unavailable', text: 'json-rpc id 2: AMR model catalog is temporarily unavailable. Please retry.', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'UPSTREAM_UNAVAILABLE', category: 'upstream_unavailable', detail: 'provider_routing_error', retryable: false, userAction: 'none' },
  { id: 'A14 AMR catalog + 401', text: ['json-rpc id 2: AMR model catalog is unavailable.', 'Error: list Link models: API request failed with status 401: invalid_api_key'].join('\n'), shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_AUTH_REQUIRED', category: 'auth', detail: 'auth_required', retryable: false, userAction: 'login' },

  // ---- post-session (id 3/4) ----
  { id: 'B1 upstream_error stream idle timeout', text: 'json-rpc id 4: opencode event stream: {"type":"session.error","properties":{"error":{"data":{"message":"\\"[code=upstream_error] stream idle timeout: no data received within configured window\\""}}}}', shape: 'structured', payloadRetryable: true, codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'upstream_unavailable', detail: 'stream_disconnected', retryable: true, userAction: 'retry' },
  { id: 'B2 http2 body closed', text: 'json-rpc id 4: opencode event stream: opencode session error: {"sessionID":"ses_17838b40effecRNQTUFyauY0zL","error":{"name":"UnknownError","data":{"message":"\\"[code=upstream_error] Error reading stream: http2: response body closed\\""}}}', shape: 'structured', payloadRetryable: true, codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'upstream_unavailable', detail: 'stream_disconnected', retryable: true, userAction: 'retry' },
  { id: 'B3 socket closed unexpectedly', text: 'json-rpc id 4: Cannot connect to API: The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'upstream_unavailable', detail: 'stream_disconnected', retryable: false, userAction: 'none' },
  { id: 'B4 connection reset', text: 'json-rpc id 4: Connection reset by server', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'upstream_unavailable', detail: 'stream_disconnected', retryable: false, userAction: 'none' },
  { id: 'B5 APIError 404', text: 'json-rpc id 4: opencode event stream: opencode session error: {"sessionID":"ses_16a081173ffeQy9mUJTmYowj5p","error":{"name":"APIError","data":{"message":"Not Found","statusCode":404,"isRetryable":false,"responseBody":"<html><head><title>404 Not Found</title></head>"}}}', shape: 'structured', payloadRetryable: false, codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'upstream_unavailable', detail: 'upstream_client_error', retryable: false, userAction: 'none' },
  { id: 'B6 APIError 400', text: 'json-rpc id 4: opencode event stream: opencode session error: {"error":{"name":"APIError","data":{"message":"Bad Request","statusCode":400,"isRetryable":false,"responseBody":"<html><head><title>400 Bad Request</title></head>"}}}', shape: 'structured', payloadRetryable: false, codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'upstream_unavailable', detail: 'upstream_client_error', retryable: false, userAction: 'none' },
  { id: 'B7 request_too_large', text: 'json-rpc id 4: opencode event stream: {"properties":{"error":{"data":{"message":"[code=request_too_large] request body exceeds configured limit"}}}}', shape: 'structured', payloadRetryable: false, codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'prompt_too_large', detail: 'request_too_large', retryable: false, userAction: 'reduce_context' },
  { id: 'B8 permission not found HTTP 404', text: 'json-rpc id 4: opencode event stream: reply opencode permission: opencode POST /session/ses_17891e641ffe507UiYkoj7Qb5w/permissions/per_e876f835100166WeTqK11P7ZvV returned HTTP 404: {"_tag":"PermissionNotFoundError","requestID":"per_e876f835100166WeTqK11P7ZvV","message":"Permission request not found: per_e876f835100166WeTqK11P7ZvV"}', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'process_exit', detail: 'permission_request_not_found', retryable: false, userAction: 'none' },
  { id: 'B9 set_model not available', text: 'json-rpc id 3: session/set_model modelId is not available', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'process_exit', detail: 'fatal_rpc_error', retryable: false, userAction: 'none' },
  { id: 'B10 OpenCode session failed Not Found', text: 'json-rpc id 3: OpenCode session failed: Not Found', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'process_exit', detail: 'fatal_rpc_error', retryable: false, userAction: 'none' },
  { id: 'B11 prompt timed out 30m', text: 'json-rpc id 4: opencode prompt timed out after 30m0s', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'timeout', detail: 'timeout', retryable: false, userAction: 'none' },
  { id: 'B12 ACP input line too large', text: 'json-rpc id 4: failed to parse request: ACP input line exceeds maximum size (1048576 bytes)', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'process_exit', detail: 'acp_frame_too_large', retryable: false, userAction: 'none' },
  { id: 'B13 untagged enum InputParam', text: 'json-rpc id 4: opencode event stream: data did not match any variant of untagged enum InputParam', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'upstream_unavailable', detail: 'upstream_client_error', retryable: false, userAction: 'none' },
  { id: 'B14 Invalid Responses API request', text: 'json-rpc id 4: opencode event stream: Invalid Responses API request', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'upstream_unavailable', detail: 'upstream_client_error', retryable: false, userAction: 'none' },
  { id: 'B15 404 page not found', text: 'json-rpc id 4: opencode event stream: opencode session error: Not Found: 404 page not found', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'upstream_unavailable', detail: 'upstream_client_error', retryable: false, userAction: 'none' },
  { id: 'B16 SSE token too long', text: 'json-rpc id 4: opencode event stream: read opencode SSE: bufio.Scanner: token too long', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'process_exit', detail: 'fatal_rpc_error', retryable: false, userAction: 'none' },

  // ---- non-RPC fail() sites: bare {message}, no error object ----
  { id: 'C1 stage timeout', text: 'ACP response timed out after 600000ms', shape: 'bare', codeBefore: null, code: null, category: 'timeout', detail: 'timeout', retryable: true, userAction: 'retry' },
  { id: 'C2 session exited', text: 'ACP session exited before completion (code=1, signal=none)', shape: 'bare', codeBefore: null, code: null, category: 'process_exit', detail: 'agent_protocol_error', retryable: true, userAction: 'retry' },
  { id: 'C3 stdin write failed', text: 'stdin write failed: write EPIPE', shape: 'bare', codeBefore: null, code: null, category: 'unknown', detail: 'unknown', retryable: false, userAction: 'none' },
  { id: 'C4 child spawn error', text: 'spawn kimi ENOENT', shape: 'bare', codeBefore: null, code: null, category: 'process_exit', detail: 'cli_not_installed', retryable: false, userAction: 'install_cli' },
  // This row used to read `auth / auth_required / login`, and that verdict was
  // a substring collision rather than a reading of the failure: the daemon's own
  // `invalid session/new response: …` line contains `invalid session`, which
  // `classifyAmrAccountFailure` accepted as "the AMR sign-in session is
  // invalid". The agent answering `session/new` with an unparseable frame is a
  // defect in the agent's build, and no sign-in changes it — so the card told
  // the user to log in for something logging in cannot fix. The classifier now
  // requires the credential noun to be the whole word (`vela-errors.ts`
  // `reportsInvalidAuthSession`), and this text stops being an account failure.
  // It lands `unknown` because nothing else names it yet; naming ACP protocol
  // violations is catalogue work, not part of un-mislabelling this one.
  { id: 'C5 invalid session/new', text: 'invalid session/new response: {"jsonrpc":"2.0","id":2,"result":{}}', shape: 'bare', codeBefore: null, code: null, category: 'unknown', detail: 'unknown', retryable: false, userAction: 'none' },
// ---- adversarial: text whose service-signature may not be the real cause ----
  // D1 is the row that group header was written about, and it was frozen
  // KNOWINGLY on the wrong answer. The change that added this table moved its
  // code axis onto `AGENT_AUTH_REQUIRED` along with every other 401, on the
  // explicit ground that it was aligning the code axis to a verdict the
  // classifier already gave ("分析轴 44 条一条没动 … 这是在向已评审的既有行为
  // 对齐,不是新增一类错判"). That was a deliberate refusal to re-litigate what
  // the `auth` verdict MEANT — reasonable for a change whose whole claim was
  // that it moved one axis only, and the reason the row reads `auth /
  // auth_required / login` here rather than being called a defect.
  //
  // The product ruling of 2026-09-07 re-litigates it:「工具输出肯定不算吧?」 —
  // a credential a TOOL reported cannot be answered with "sign in". The
  // curl-inside-bash 401 above is the user's own endpoint, reached from a shell
  // command the agent ran; the sign-in card the old verdict produced offers a
  // login to Open Design, which does not touch it. Alignment was the right call
  // for that change and is the wrong resting place: an accurate code pointing at
  // an inaccurate card is still an inaccurate card.
  //
  // `runtimes/auth.ts` `reportsToolPrincipalAuthFailure` now reads the
  // attribution the line carries (`tool bash failed:`, and `curl:` naming its
  // own speaker) instead of the auth vocabulary it travels with, so the row
  // returns to `codeBefore` on the code axis — the ACP alignment simply no
  // longer has an auth class to align to — and lands `tool_error`, which is
  // where this family's one self-identifying member (`mcp_auth_required`)
  // already went. D2 below is the control: same `tool bash failed:` envelope,
  // no credential, still `UPSTREAM_UNAVAILABLE`.
  { id: 'D1 tool-run 401 from user code', text: 'json-rpc id 4: opencode event stream: tool bash failed: curl: HTTP 401 Unauthorized from https://api.example.com/v1/things', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'tool_error', detail: 'tool_error', retryable: false, userAction: 'none' },
  { id: 'D2 tool-run 503 from user code', text: 'json-rpc id 4: opencode event stream: tool bash failed: upstream returned HTTP 503 Service Unavailable', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'UPSTREAM_UNAVAILABLE', category: 'upstream_unavailable', detail: 'upstream_5xx', retryable: false, userAction: 'none' },
  { id: 'D3 internal server error text', text: 'json-rpc id 4: opencode event stream: opencode session error: {"error":{"name":"APIError","data":{"message":"Internal Server Error","statusCode":500,"isRetryable":true}}}', shape: 'structured', payloadRetryable: true, codeBefore: 'AGENT_EXECUTION_FAILED', code: 'UPSTREAM_UNAVAILABLE', category: 'upstream_unavailable', detail: 'upstream_5xx', retryable: true, userAction: 'retry' },
  { id: 'D4 exit code 401 noise', text: 'json-rpc id 2: start opencode server: opencode exited before readiness: exit code 401', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'process_exit', detail: 'fatal_rpc_error', retryable: false, userAction: 'none' },
  { id: 'D5 line 502 noise', text: 'json-rpc id 4: opencode event stream: parse error at line 502', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'process_exit', detail: 'fatal_rpc_error', retryable: false, userAction: 'none' },
  { id: 'D6 session limit reached', text: 'json-rpc id 4: session limit reached for this workspace', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'RATE_LIMITED', category: 'rate_limit', detail: 'hard_quota', retryable: false, userAction: 'none' },
  { id: 'D7 amr insufficient wallet balance', text: 'json-rpc id 4: opencode event stream: insufficient wallet balance', shape: 'structured', codeBefore: 'AGENT_EXECUTION_FAILED', code: 'AGENT_EXECUTION_FAILED', category: 'insufficient_balance', detail: 'amr_insufficient_balance', retryable: false, userAction: 'recharge' },
  { id: 'D8 provider overloaded 529', text: 'json-rpc id 4: opencode event stream: {"properties":{"error":{"data":{"message":"[code=upstream_error] 529 overloaded_error: Overloaded"}}}}', shape: 'structured', payloadRetryable: true, codeBefore: 'AGENT_EXECUTION_FAILED', code: 'UPSTREAM_UNAVAILABLE', category: 'upstream_unavailable', detail: 'upstream_5xx', retryable: true, userAction: 'retry' },

  // ---- R-053: the platform's own provider credentials, not the user's ----
  // `run-error-catalog.md:215` recorded this as mislanded and it stayed that
  // way: vela's link gateway rewrites an upstream 401/403 into an HTTP 500
  // carrying its OWN code (`services/link/internal/handlers/openai.go:2074`,
  // `normalizeUpstreamAuthFailure`), and three separate classifiers each read
  // it as the caller being signed out — `classifyAmrAccountFailure` off
  // `unauthenticated`, `classifyAgentServiceFailure` and `isAuthDetailText`
  // off "credentials are missing". The user was shown "Sign-in required" for a
  // credential they do not hold and cannot fix.
  { id: 'E1 upstream_provider_unauthenticated (R-053)', text: 'json-rpc id 4: opencode event stream: {"properties":{"error":{"data":{"message":"\\"[code=upstream_provider_unauthenticated] Upstream provider credentials are missing or invalid.\\""}}}}', shape: 'structured', payloadRetryable: false, codeBefore: 'AGENT_EXECUTION_FAILED', code: 'UPSTREAM_UNAVAILABLE', category: 'upstream_unavailable', detail: 'upstream_5xx', retryable: false, userAction: 'none' },
  { id: 'E2 upstream_provider_unauthenticated bare', text: 'API request failed with status 500: upstream_provider_unauthenticated', shape: 'structured', payloadRetryable: false, codeBefore: 'AGENT_EXECUTION_FAILED', code: 'UPSTREAM_UNAVAILABLE', category: 'upstream_unavailable', detail: 'upstream_5xx', retryable: false, userAction: 'none' },
  // The sibling code from the same vela switch (upstream 403). It never
  // reached the auth branch — it landed `process_exit / fatal_rpc_error`, an
  // opaque "Task failed" — so naming it here moves it onto the same service
  // card rather than un-mislabelling it.
  { id: 'E3 upstream_provider_forbidden', text: 'json-rpc id 4: opencode event stream: [code=upstream_provider_forbidden] Upstream provider rejected access for the configured credentials.', shape: 'structured', payloadRetryable: false, codeBefore: 'AGENT_EXECUTION_FAILED', code: 'UPSTREAM_UNAVAILABLE', category: 'upstream_unavailable', detail: 'upstream_5xx', retryable: false, userAction: 'none' },
];

/** The ACP `send('error', …)` bridge in server.ts, as one function. */
function bridge(row: Row): { message?: unknown; error?: Record<string, unknown> } {
  const payload = row.shape === 'bare'
    ? { message: row.text }
    : {
      message: row.text,
      error: {
        code: GENERIC_ACP_FAILURE_CODE,
        message: row.text,
        retryable: row.payloadRetryable ?? false,
      },
    };
  return withAcpServiceFailureCode(
    withAcpHandshakeFailureGuidance(payload, { agentName: 'Kimi CLI' }),
  ) as { message?: unknown; error?: Record<string, unknown> };
}

/** Today's bridge with the service classification removed — the pre-change daemon. */
function bridgeBefore(row: Row): { message?: unknown; error?: Record<string, unknown> } {
  const payload = row.shape === 'bare'
    ? { message: row.text }
    : {
      message: row.text,
      error: {
        code: GENERIC_ACP_FAILURE_CODE,
        message: row.text,
        retryable: row.payloadRetryable ?? false,
      },
    };
  return withAcpHandshakeFailureGuidance(payload, { agentName: 'Kimi CLI' }) as {
    message?: unknown;
    error?: Record<string, unknown>;
  };
}

/**
 * The run classifier as it sees a real ACP fatal: the `runtime_close`
 * diagnostic server.ts records for every ACP protocol teardown, plus the error
 * event whose `retryable` becomes `retryableHint`.
 */
function classify(row: Row, code: string | null) {
  // `fail()` writes `retryable: options.retryable ?? false` on every structured
  // frame and omits the field entirely on a bare one. `retryableHint` is read
  // off the recorded error event, so the distinction has to be reproduced here
  // or the table measures a hint the daemon never sends.
  const payloadRetryable = row.shape === 'structured'
    ? (row.payloadRetryable ?? false)
    : undefined;
  return classifyRunFailure({
    result: 'failed',
    status: { status: 'failed', error: row.text, errorCode: code },
    ...(code ? { errorCode: code } : {}),
    agentId: 'amr',
    events: [
      { event: 'diagnostic', data: { type: 'runtime_close', rpc_close_reason: 'fatal_rpc_error' } },
      {
        event: 'error',
        data: {
          message: row.text,
          ...(code ? { code } : {}),
          ...(payloadRetryable === undefined ? {} : { retryable: payloadRetryable }),
        },
      },
    ],
  });
}

describe('ACP failure landing table', () => {
  it.each(ROWS)('$id emits the recorded code', (row) => {
    const code = bridge(row).error?.code ?? null;
    expect(code).toBe(row.code);
  });

  it.each(ROWS)('$id lands on the recorded analysis verdict', (row) => {
    const failure = classify(row, row.code);
    expect({
      category: failure?.failure_category,
      detail: failure?.failure_detail,
      retryable: failure?.retryable,
      userAction: failure?.user_action,
    }).toEqual({
      category: row.category,
      detail: row.detail,
      retryable: row.retryable,
      userAction: row.userAction,
    });
  });

  // The load-bearing claim of the whole change: the code axis moved, the
  // analysis axis did not. If a future edit makes a row's verdict depend on the
  // code, this catches it as a behavior change rather than a refactor.
  it.each(ROWS)('$id classifies identically under the old and new code', (row) => {
    const before = classify(row, row.codeBefore);
    const after = classify(row, row.code);
    const strip = (f: ReturnType<typeof classifyRunFailure>) => {
      const { evidence_level: _evidence, ...rest } = (f ?? {}) as Record<string, unknown>;
      return rest;
    };
    // `evidence_level` is the one exception, and it moves for a structural
    // reason rather than a lucky one. `run-failure-classification.ts` already
    // carried dedicated structured-code branches for `AGENT_AUTH_REQUIRED`
    // (~:996), `RATE_LIMITED` (~:1258) and `UPSTREAM_UNAVAILABLE` (~:1269);
    // they were simply unreachable from the ACP path, because the code they key
    // on never arrived. Each was written to return the same verdict as the
    // text-matching branch it shadows and to differ only in `evidenceLevel` —
    // which is the field recording HOW the daemon knows, so it is exactly the
    // field that should move when the daemon stops guessing from text. Every
    // other field is identical, which is what makes this a classification fix
    // and not a behavior change.
    expect(strip(after)).toEqual(strip(before));
  });

  it('records what the pre-change daemon emitted, so the diff stays auditable', () => {
    for (const row of ROWS) {
      expect(bridgeBefore(row).error?.code ?? null).toBe(row.codeBefore);
    }
  });

  it('changes exactly the rows this work set out to change', () => {
    const moved = ROWS.filter((row) => row.codeBefore !== row.code).map((row) => row.id);
    expect(moved).toEqual([
      'H1 upstream_overloaded(real)',
      'A3 Authentication required',
      'A4 HTTP 401 Unauthorized id1',
      'A5 rate limit exceeded',
      'A6 insufficient balance',
      'A7 HTTP 503 Service Unavailable',
      'A8 Internal error: 401 Unauthorized',
      'A9 Internal error: 429 rate limit',
      'A13 AMR catalog TEMPORARILY unavailable',
      'A14 AMR catalog + 401',
      // D1 has LEFT this list. It moved onto `AGENT_AUTH_REQUIRED` when this
      // table was written and has moved back off it: the credential it reports
      // belongs to the curl the agent ran, so there is no auth class for the ACP
      // alignment to align to. See the row for the full reasoning.
      'D2 tool-run 503 from user code',
      'D3 internal server error text',
      'D6 session limit reached',
      'D8 provider overloaded 529',
      // R-053 and its sibling. These three move because the service classifier
      // now reads vela's `upstream_provider_*` codes as what they say they are
      // — the gateway's own credentials — instead of letting the sentence they
      // travel with ("credentials are missing or invalid") be read as the
      // caller's.
      'E1 upstream_provider_unauthenticated (R-053)',
      'E2 upstream_provider_unauthenticated bare',
      'E3 upstream_provider_forbidden',
    ]);
  });

  // Nothing in the record moves. The classification is a second opinion written
  // beside the agent's line, never over it.
  it.each(ROWS)('$id keeps the agent line and retryability verbatim', (row) => {
    const before = bridgeBefore(row);
    const after = bridge(row);
    const readMessage = (frame: { message?: unknown; error?: Record<string, unknown> }) => {
      const nested = frame.error?.message;
      return typeof nested === 'string' && nested.trim() ? nested : frame.message;
    };
    expect(readMessage(after)).toBe(readMessage(before));
    expect(after.error?.retryable).toBe(before.error?.retryable);
    expect(after.error?.details).toEqual(before.error?.details);
  });
});

describe('withAcpServiceFailureCode', () => {
  it('returns the payload by reference when no class applies', () => {
    // The normal case. Most ACP failures are ordinary process failures, and the
    // path has to degrade to exactly today's behavior rather than inventing a
    // code or throwing.
    for (const payload of [
      { message: 'json-rpc id 4: opencode prompt timed out after 30m0s' },
      {
        message: 'json-rpc id 2: Invalid params',
        error: { code: GENERIC_ACP_FAILURE_CODE, message: 'json-rpc id 2: Invalid params' },
      },
    ]) {
      expect(withAcpServiceFailureCode(payload)).toBe(payload);
    }
  });

  it('never overwrites a code some layer already chose', () => {
    // Text that WOULD classify as an upstream outage, under codes that were
    // decided with more evidence than a text match. Each must survive intact:
    // AMR's model/account promotions and the handshake verdict all key their
    // whole card off these.
    const message = 'json-rpc id 3: the model is currently overloaded';
    for (const code of [
      'AMR_MODEL_UNAVAILABLE',
      'ROLE_MARKER_HALLUCINATION',
      'AMR_INSUFFICIENT_BALANCE',
      'AGENT_CLI_SESSION_REFUSED',
    ]) {
      const payload = { message, error: { code, message, retryable: false } };
      expect(withAcpServiceFailureCode(payload)).toBe(payload);
    }
  });

  it('gives a bare frame an error object without disturbing the message', () => {
    // `fail()` emits `{ message }` with no error object on every non-JSON-RPC
    // call site, which is why a signed-out CLI used to arrive with NO code at
    // all — not even the generic one. `run.error` must read the same afterwards;
    // only `run.errorCode` gains a value.
    const message = 'invalid session/new response: {"error":"HTTP 503 Service Unavailable"}';
    const result = withAcpServiceFailureCode({ message }) as {
      message?: unknown;
      error?: Record<string, unknown>;
    };
    expect(result.error?.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(result.error?.message).toBe(message);
    expect(result.message).toBe(message);
    // Absent, not fabricated: `fail()` had no retryability to report here, and
    // inventing one would feed `retryableHint` a value nobody measured.
    expect(result.error).not.toHaveProperty('retryable');
  });

  it('reads the agent structured error data as well as its message', () => {
    // Some ACP runtimes put the provider sentence in `error.data` rather than in
    // the JSON-RPC message — `inferRpcErrorRetryable` reads both for the same
    // reason.
    const message = 'json-rpc id 4: session/prompt failed';
    const result = withAcpServiceFailureCode({
      message,
      error: {
        code: GENERIC_ACP_FAILURE_CODE,
        message,
        retryable: true,
        details: { providerMessage: 'Bad gateway' },
      },
    }) as { error?: Record<string, unknown> };
    expect(result.error?.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(result.error?.retryable).toBe(true);
    expect(result.error?.details).toEqual({ providerMessage: 'Bad gateway' });
  });

  it('survives a details payload that cannot be serialized', () => {
    // A cycle must not turn a failure report into a second failure.
    const details: Record<string, unknown> = { kind: 'x' };
    details.self = details;
    const message = 'json-rpc id 4: HTTP 503 Service Unavailable';
    const result = withAcpServiceFailureCode({
      message,
      error: { code: GENERIC_ACP_FAILURE_CODE, message, retryable: true, details },
    }) as { error?: Record<string, unknown> };
    expect(result.error?.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('passes through anything that is not an error frame', () => {
    for (const value of [null, undefined, 'text', 42, []]) {
      expect(withAcpServiceFailureCode(value)).toBe(value);
    }
    // An empty message names nothing.
    const blank = { message: '   ' };
    expect(withAcpServiceFailureCode(blank)).toBe(blank);
  });
});
