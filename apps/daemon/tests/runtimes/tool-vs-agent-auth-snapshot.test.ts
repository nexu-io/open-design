import { describe, expect, it } from 'vitest';

import {
  OWN_AGENT_COMMAND_NAMES,
  classifyAgentServiceFailure,
  reportsToolPrincipalAuthFailure,
} from '../../src/runtimes/auth.js';
import { SHIPPED_AGENT_DEFS } from '../../src/runtimes/registry.js';
import { classifyAmrAccountFailure } from '../../src/integrations/vela-errors.js';
import {
  GENERIC_ACP_FAILURE_CODE,
  withAcpServiceFailureCode,
} from '../../src/runtimes/acp-service-failure.js';
import { classifyRunFailure } from '../../src/run-failure-classification.js';

// A frozen landing table for the AUTHENTICATION family, split by whose
// credential actually failed.
//
// Same shape and same purpose as `tests/acp-service-failure.test.ts` and
// `tests/runtimes/balance-vs-rate-limit-snapshot.test.ts`: every `*Before`
// value below was MEASURED against this build before anything was changed, so a
// later edit to `AGENT_AUTH_FAILURE_RE`, to `isAuthDetailText`, or to the tool
// attribution predicate cannot quietly move a failure from one card to another
// — the row goes red and names which one.
//
// It exists because the daemon's three auth classifiers answer ONE question
// each, and all three answer it about the same flat blob of text:
//
//   - `classifyAmrAccountFailure`   — "is the AMR Cloud sign-in broken?"
//   - `classifyAgentServiceFailure` — "is this agent's model-service credential
//                                     broken?" (its `AGENT_AUTH_REQUIRED` is
//                                     what becomes the SSE `error.code`)
//   - `classifyRunFailure`          — the verdict telemetry and the retry policy
//                                     read.
//
// The blob is not a clean channel. `collectFailureText`
// (`run-failure-classification.ts:177`) folds `stderr` events into the corpus
// (:188), and the ACP bridge folds whatever the agent wrote into its JSON-RPC
// error frame — which, for opencode-family runtimes, includes the agent's own
// report that a TOOL it ran failed. So a `gh`, `npm`, `curl` or MCP credential
// arrives at these classifiers wearing the same auth vocabulary as the agent's
// own, and every one of them used to answer "sign in".
//
// The two axes are deliberately separate, exactly as in the sibling tables:
//   - `serviceCode` / `acpCode` — the code axis the web resolves a card from.
//   - `verdict`                 — `category/detail/r=retryable/user_action`.

interface Row {
  id: string;
  /** Real upstream text. Provenance in the comment above the row when not obvious. */
  text: string;
  /** `classifyAmrAccountFailure(text)?.code` — unchanged by this work on every row. */
  amrCode: string | null;
  /** `classifyAgentServiceFailure(text)` BEFORE this change. Documentation, and asserted below. */
  serviceCodeBefore: string | null;
  /** `classifyAgentServiceFailure(text)` now. */
  serviceCode: string | null;
  /** `error.code` the ACP bridge stamps on a generic frame, BEFORE this change. */
  acpCodeBefore: string;
  /** …and now. */
  acpCode: string;
  /** The run classifier's verdict BEFORE this change. */
  verdictBefore: string;
  /** …and now. */
  verdict: string;
}

const ROWS: Row[] = [
  // ---- T: the credential belongs to a TOOL the agent ran ----
  //
  // Every row here reports a credential the daemon cannot reach: signing in to
  // the agent, or to AMR Cloud, changes none of them. Landing them on `auth`
  // put an "Open Design 尚未登录 / Sign in" card in front of the user
  // (`apps/web/src/runtime/amr-guidance.ts` — `AGENT_AUTH_REQUIRED` is aliased
  // onto the AMR sign-in card for a hosted run, and onto S02「本地 agent 没登录」
  // for every other agent), so the fix the card offered was guaranteed not to
  // work. That is the product ruling this table encodes:「工具输出肯定不算吧?」
  { id: 'T1 npm not logged in to registry', text: 'npm ERR! code ENEEDAUTH\nnpm ERR! you are not logged in to this registry', amrCode: null, serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: null, acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_EXECUTION_FAILED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'tool_error/tool_error/r=false/none' },
  { id: 'T2 gh not authenticated', text: 'gh: not authenticated. run gh auth login', amrCode: null, serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: null, acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_EXECUTION_FAILED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'tool_error/tool_error/r=false/none' },
  { id: 'T3 curl 401 authentication required', text: 'curl: (22) The requested URL returned error: 401 authentication required', amrCode: null, serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: null, acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_EXECUTION_FAILED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'tool_error/tool_error/r=false/none' },
  { id: 'T4 figma mcp oauth expired', text: 'your OAuth token has expired for the Figma MCP server', amrCode: null, serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: null, acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_EXECUTION_FAILED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'tool_error/tool_error/r=false/none' },
  // `acp-service-failure.test.ts` row D1, verbatim. The row this work overturns.
  { id: 'T5 acp tool bash 401 (D1)', text: 'json-rpc id 4: opencode event stream: tool bash failed: curl: HTTP 401 Unauthorized from https://api.example.com/v1/things', amrCode: null, serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: null, acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_EXECUTION_FAILED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'tool_error/tool_error/r=false/none' },
  // vela's own per-user MCP OAuth code (bifrost `mcp/agent.go:333`). Already
  // landed `tool_error` before this change — it carries no auth VOCABULARY, only
  // a code — which is why it is the reference landing the T rows now join.
  { id: 'T6 mcp_auth_required envelope', text: 'json-rpc id 4: opencode event stream: tool error: {"extra_fields":{"mcp_auth_required":{"kind":"oauth","authorize_url":"https://figma.com/oauth"}}}', amrCode: null, serviceCodeBefore: null, serviceCode: null, acpCodeBefore: 'AGENT_EXECUTION_FAILED', acpCode: 'AGENT_EXECUTION_FAILED', verdictBefore: 'tool_error/tool_error/r=false/none', verdict: 'tool_error/tool_error/r=false/none' },
  { id: 'T7 docker registry unauthorized', text: 'docker: unauthorized: authentication required', amrCode: null, serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: null, acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_EXECUTION_FAILED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'tool_error/tool_error/r=false/none' },
  { id: 'T8 psql password authentication failed', text: 'psql: error: connection to server failed: FATAL:  password authentication failed for user "app"', amrCode: null, serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: null, acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_EXECUTION_FAILED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'tool_error/tool_error/r=false/none' },
  { id: 'T9 tool_use_error envelope', text: 'tool_use_error: Bash command failed: gh api /user -> HTTP 401 Unauthorized', amrCode: null, serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: null, acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_EXECUTION_FAILED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'tool_error/tool_error/r=false/none' },
  // Known residue, recorded rather than fixed. bifrost
  // `mcp/credstore/per_user_oauth.go:76` composes this sentence per tool, but
  // ships it INSIDE the `mcp_auth_required` envelope (T6) — which is covered.
  // Standing alone it self-identifies nothing: no tool envelope, no program
  // prefix, and "for Figma" is prose. Nothing in the text says whose credential
  // it is, so no predicate can read it without guessing. It stays on `auth`.
  { id: 'T10 bifrost per-tool oauth prose (known residue)', text: 'Authentication required for Figma. Visit https://example.com/oauth to connect your account.', amrCode: null, serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: 'AGENT_AUTH_REQUIRED', acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_AUTH_REQUIRED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'auth/auth_required/r=false/login' },

  // ---- A: the credential belongs to the AGENT or to AMR Cloud ----
  //
  // The reverse guard, and the reason this table is longer than the change.
  // The cheapest way to "fix" the T rows is to tighten the auth vocabulary
  // until it stops matching them — which also stops it matching these, and a
  // genuinely signed-out user then gets no sign-in card at all. Every row below
  // is a shape that is actually evidenced upstream; each names where it comes
  // from. None of them may move.
  { id: 'A1 acp HTTP 401 id1', text: 'json-rpc id 1: HTTP 401 Unauthorized', amrCode: null, serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: 'AGENT_AUTH_REQUIRED', acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_AUTH_REQUIRED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'auth/auth_required/r=false/login' },
  { id: 'A2 acp Authentication required', text: 'json-rpc id 2: Authentication required', amrCode: null, serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: 'AGENT_AUTH_REQUIRED', acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_AUTH_REQUIRED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'auth/auth_required/r=false/login' },
  { id: 'A3 acp Internal error: 401', text: 'json-rpc id 2: Internal error: 401 Unauthorized', amrCode: null, serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: 'AGENT_AUTH_REQUIRED', acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_AUTH_REQUIRED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'auth/auth_required/r=false/login' },
  // vela `apps/cli` surfaces a 401 body through `client.ParseAPIError`.
  { id: 'A4 vela status 401 unauthenticated', text: 'API request failed with status 401: unauthenticated', amrCode: 'AMR_AUTH_REQUIRED', serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: 'AGENT_AUTH_REQUIRED', acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_AUTH_REQUIRED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'auth/auth_required/r=false/login' },
  { id: 'A5 vela bare unauthenticated code', text: '{"error":"unauthenticated"}', amrCode: 'AMR_AUTH_REQUIRED', serviceCodeBefore: null, serviceCode: null, acpCodeBefore: 'AGENT_EXECUTION_FAILED', acpCode: 'AGENT_EXECUTION_FAILED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'auth/auth_required/r=false/login' },
  // vela `apps/cli/internal/commands/control.go:92`.
  { id: 'A6 vela profile not logged in', text: 'profile "default" is not logged in; run `vela login`', amrCode: 'AMR_AUTH_REQUIRED', serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: 'AGENT_AUTH_REQUIRED', acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_AUTH_REQUIRED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'auth/auth_required/r=false/login' },
  { id: 'A7 vela session expired', text: 'Session expired. Please sign in again.', amrCode: 'AMR_AUTH_REQUIRED', serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: 'AGENT_AUTH_REQUIRED', acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_AUTH_REQUIRED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'auth/auth_required/r=false/login' },
  { id: 'A8 vela auth_required code', text: 'auth_required: please reconnect AMR Cloud', amrCode: 'AMR_AUTH_REQUIRED', serviceCodeBefore: null, serviceCode: null, acpCodeBefore: 'AGENT_EXECUTION_FAILED', acpCode: 'AGENT_EXECUTION_FAILED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'auth/auth_required/r=false/login' },
  // `acp-service-failure.test.ts` row A14. The `Error:` line-start here is the
  // single most load-bearing reverse case in this table: a program-name
  // predicate that forgot severity labels are not program names would read
  // `Error:` as a foreign speaker and drop a REAL model-service 401.
  { id: 'A9 AMR catalog + 401 invalid_api_key', text: 'json-rpc id 2: AMR model catalog is unavailable.\nError: list Link models: API request failed with status 401: invalid_api_key', amrCode: null, serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: 'AGENT_AUTH_REQUIRED', acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_AUTH_REQUIRED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'auth/auth_required/r=false/login' },
  { id: 'A10 claude invalid api key', text: 'Invalid API key · Please run /login', amrCode: null, serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: 'AGENT_AUTH_REQUIRED', acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_AUTH_REQUIRED', verdictBefore: 'auth/invalid_api_key/r=false/login', verdict: 'auth/invalid_api_key/r=false/login' },
  { id: 'A11 anthropic x-api-key', text: '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}', amrCode: null, serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: 'AGENT_AUTH_REQUIRED', acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_AUTH_REQUIRED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'auth/auth_required/r=false/login' },
  { id: 'A12 missing ANTHROPIC_API_KEY', text: 'missing environment variable: ANTHROPIC_API_KEY', amrCode: null, serviceCodeBefore: null, serviceCode: null, acpCodeBefore: 'AGENT_EXECUTION_FAILED', acpCode: 'AGENT_EXECUTION_FAILED', verdictBefore: 'auth/missing_api_key/r=false/login', verdict: 'auth/missing_api_key/r=false/login' },
  { id: 'A13 cursor-agent not logged in', text: 'Not logged in. Run `cursor-agent login` to authenticate.', amrCode: null, serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: 'AGENT_AUTH_REQUIRED', acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_AUTH_REQUIRED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'auth/auth_required/r=false/login' },
  // codex is the ONLY agent that reaches the generic classifier through
  // `probeAgentAuthStatus` (claude and cursor-agent are tailored), so its real
  // probe output — `tests/runtimes/auth-probe-4456.test.ts:165` and the fake CLI
  // in `tests/runtimes/registry-and-args.test.ts:610` — is pinned here.
  { id: 'A14 codex login status', text: 'Not logged in. Run `codex login`.', amrCode: null, serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: 'AGENT_AUTH_REQUIRED', acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_AUTH_REQUIRED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'auth/auth_required/r=false/login' },
  { id: 'A15 codex stream 401', text: 'stream error: unexpected status 401 Unauthorized', amrCode: null, serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: 'AGENT_AUTH_REQUIRED', acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_AUTH_REQUIRED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'auth/auth_required/r=false/login' },
  // The two rows a first, wrong cut of this predicate actually dropped, kept
  // here rather than only in `tests/runtimes/service-failure-classification.
  // test.ts` because they are the two ways the program-prefix shape fails.
  //
  // A18 is an AGENT wearing the tool shape: `dsh:` is DeepSeek Harness's own
  // bin (`defs/deepseek-harness.ts`), reporting its OWN model API key, in a
  // line that is indistinguishable from `gh: not authenticated` by position or
  // punctuation. It is why `OWN_AGENT_COMMAND_NAMES` exists.
  { id: 'A18 dsh MISSING_CREDENTIAL (agent wearing the tool shape)', text: 'dsh: MISSING_CREDENTIAL: llm-deepseek: no API key for provider route "deepseek-official"; export DEEPSEEK_API_KEY', amrCode: null, serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: 'AGENT_AUTH_REQUIRED', acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_AUTH_REQUIRED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'auth/auth_required/r=false/login' },
  // A19 is a STATUS REASON PHRASE wearing the tool shape. `Unauthorized:` reads
  // as `name:` but names the answer, not the answerer.
  { id: 'A19 Unauthorized: prefix is a label, not a speaker', text: 'Unauthorized: OAuth token has expired', amrCode: null, serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: 'AGENT_AUTH_REQUIRED', acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_AUTH_REQUIRED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'auth/auth_required/r=false/login' },
  // The contrast case for T4. The SAME sentence with the holder removed is the
  // agent's own token — which is exactly why the predicate has to read the
  // attribution the text supplies instead of the auth words it carries.
  { id: 'A16 oauth token expired, no holder named', text: 'your OAuth token has expired', amrCode: null, serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: 'AGENT_AUTH_REQUIRED', acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_AUTH_REQUIRED', verdictBefore: 'auth/auth_required/r=false/login', verdict: 'auth/auth_required/r=false/login' },
  { id: 'A17 credentials are missing', text: 'credentials are missing for this request', amrCode: null, serviceCodeBefore: 'AGENT_AUTH_REQUIRED', serviceCode: 'AGENT_AUTH_REQUIRED', acpCodeBefore: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_AUTH_REQUIRED', verdictBefore: 'auth/missing_api_key/r=false/login', verdict: 'auth/missing_api_key/r=false/login' },

  // ---- P: the PLATFORM gateway's own provider credential (R-053) ----
  // Fixed in the preceding change; pinned here so the two fixes cannot fight.
  { id: 'P1 upstream_provider_unauthenticated', text: 'API request failed with status 500: upstream_provider_unauthenticated', amrCode: null, serviceCodeBefore: 'UPSTREAM_UNAVAILABLE', serviceCode: 'UPSTREAM_UNAVAILABLE', acpCodeBefore: 'UPSTREAM_UNAVAILABLE', acpCode: 'UPSTREAM_UNAVAILABLE', verdictBefore: 'upstream_unavailable/upstream_5xx/r=false/none', verdict: 'upstream_unavailable/upstream_5xx/r=false/none' },
  { id: 'P2 upstream_provider_forbidden', text: 'json-rpc id 4: opencode event stream: [code=upstream_provider_forbidden] Upstream provider rejected access for the configured credentials.', amrCode: null, serviceCodeBefore: 'UPSTREAM_UNAVAILABLE', serviceCode: 'UPSTREAM_UNAVAILABLE', acpCodeBefore: 'UPSTREAM_UNAVAILABLE', acpCode: 'UPSTREAM_UNAVAILABLE', verdictBefore: 'upstream_unavailable/upstream_5xx/r=false/none', verdict: 'upstream_unavailable/upstream_5xx/r=false/none' },

  // ---- N: neighbours that carry a tool envelope but NOT a credential fault ----
  // `acp-service-failure.test.ts` row D2. Same `tool bash failed:` envelope as
  // T5, and it must stay `UPSTREAM_UNAVAILABLE`: the predicate answers "whose
  // credential", not "was a tool involved", so a tool that hit a 503 is still an
  // upstream outage.
  { id: 'N1 tool-run 503 (D2)', text: 'json-rpc id 4: opencode event stream: tool bash failed: upstream returned HTTP 503 Service Unavailable', amrCode: null, serviceCodeBefore: 'UPSTREAM_UNAVAILABLE', serviceCode: 'UPSTREAM_UNAVAILABLE', acpCodeBefore: 'UPSTREAM_UNAVAILABLE', acpCode: 'UPSTREAM_UNAVAILABLE', verdictBefore: 'upstream_unavailable/upstream_5xx/r=false/none', verdict: 'upstream_unavailable/upstream_5xx/r=false/none' },
  { id: 'N2 tool-run 429', text: 'json-rpc id 4: opencode event stream: tool bash failed: rate limit exceeded', amrCode: null, serviceCodeBefore: 'RATE_LIMITED', serviceCode: 'RATE_LIMITED', acpCodeBefore: 'RATE_LIMITED', acpCode: 'RATE_LIMITED', verdictBefore: 'rate_limit/rate_limit_429/r=false/none', verdict: 'rate_limit/rate_limit_429/r=false/none' },
];

/** The ACP bridge as one function, matching both sibling tables. */
function bridgeCode(text: string): string {
  const out = withAcpServiceFailureCode({
    message: text,
    error: { code: GENERIC_ACP_FAILURE_CODE, message: text, retryable: false },
  }) as { error?: Record<string, unknown> };
  return (out.error?.code as string | undefined) ?? GENERIC_ACP_FAILURE_CODE;
}

/**
 * The run classifier as it sees a real ACP fatal, matching both sibling tables:
 * the `runtime_close` diagnostic plus the error event whose `retryable` becomes
 * `retryableHint`, held at `false` on every row so the table measures the text.
 */
function verdict(text: string, code: string | null, agentId: string): string {
  const failure = classifyRunFailure({
    result: 'failed',
    status: { status: 'failed', error: text, errorCode: code },
    ...(code ? { errorCode: code } : {}),
    agentId,
    events: [
      { event: 'diagnostic', data: { type: 'runtime_close', rpc_close_reason: 'fatal_rpc_error' } },
      { event: 'error', data: { message: text, ...(code ? { code } : {}), retryable: false } },
    ],
  });
  return [
    failure?.failure_category,
    failure?.failure_detail,
    `r=${failure?.retryable}`,
    failure?.user_action,
  ].join('/');
}

describe('tool-vs-agent auth attribution landing table', () => {
  it.each(ROWS)('$id classifies to the recorded service code', (row) => {
    expect(classifyAgentServiceFailure(row.text)).toBe(row.serviceCode);
  });

  it.each(ROWS)('$id reaches the client under the recorded error code', (row) => {
    expect(bridgeCode(row.text)).toBe(row.acpCode);
  });

  it.each(ROWS)('$id lands on the recorded analysis verdict', (row) => {
    expect(verdict(row.text, row.acpCode, 'kimi')).toBe(row.verdict);
  });

  it.each(ROWS)('$id lands identically for the hosted agent', (row) => {
    // The classifier is agent-agnostic. If this ever diverges, the family
    // stopped being one problem and the rest of this table's reasoning fails.
    expect(verdict(row.text, row.acpCode, 'amr')).toBe(row.verdict);
  });

  it.each(ROWS)('$id keeps the AMR account verdict it already had', (row) => {
    // The preceding change fixed `classifyAmrAccountFailure`. This one must not
    // move any of it: the AMR column is identical before and after.
    expect(classifyAmrAccountFailure(row.text)?.code ?? null).toBe(row.amrCode);
  });

  it('changes exactly the rows this work set out to change', () => {
    const moved = ROWS.filter(
      (row) =>
        row.serviceCodeBefore !== row.serviceCode ||
        row.acpCodeBefore !== row.acpCode ||
        row.verdictBefore !== row.verdict,
    ).map((row) => row.id);
    expect(moved).toEqual([
      'T1 npm not logged in to registry',
      'T2 gh not authenticated',
      'T3 curl 401 authentication required',
      'T4 figma mcp oauth expired',
      'T5 acp tool bash 401 (D1)',
      'T7 docker registry unauthorized',
      'T8 psql password authentication failed',
      'T9 tool_use_error envelope',
    ]);
  });

  it('leaves every agent-owned sign-in failure on the sign-in card', () => {
    // The reverse guard, asserted as a set rather than row by row: tightening an
    // auth predicate fails by dropping the real thing, and the failure mode is
    // silent — the user simply never gets offered the sign-in that would work.
    for (const row of ROWS.filter((r) => r.id.startsWith('A'))) {
      expect(verdict(row.text, row.acpCode, 'amr')).toMatch(/^auth\//);
      expect(verdict(row.text, row.acpCode, 'amr')).toMatch(/\/login$/);
    }
  });

  it('recognises every agent CLI this build ships as one of our own speakers', () => {
    // The drift guard for `OWN_AGENT_COMMAND_NAMES`. It is a literal because
    // `registry.ts` imports every adapter and every adapter imports `auth.ts`,
    // so it cannot be derived at module load without a cycle. Deriving it HERE
    // costs nothing and makes the duplication safe: onboard an agent whose bin
    // is not listed and its own `bin: not authenticated` line starts reading as
    // a foreign tool, silently withdrawing the sign-in card from the users of
    // exactly that agent.
    const shipped = new Set<string>();
    for (const def of SHIPPED_AGENT_DEFS) {
      shipped.add(def.id.toLowerCase());
      const bin = (def as { bin?: unknown }).bin;
      if (typeof bin === 'string' && bin) shipped.add(bin.toLowerCase());
    }
    const missing = [...shipped].filter((name) => !OWN_AGENT_COMMAND_NAMES.has(name)).sort();
    expect(missing).toEqual([]);
  });

  it('records what the pre-change daemon emitted, so the diff stays auditable', () => {
    // The pre-change classifier, reconstructed the way `acp-service-failure.
    // test.ts` reconstructs its own `bridgeBefore`: today's classifier with the
    // attribution gate lifted. A row whose ONLY reason for not being
    // `AGENT_AUTH_REQUIRED` is that gate therefore reads back as the old answer,
    // and the `serviceCodeBefore` column stops being a claim in a PR body.
    const before = (text: string): string | null => {
      const code = classifyAgentServiceFailure(text);
      if (code) return code;
      return reportsToolPrincipalAuthFailure(text) ? 'AGENT_AUTH_REQUIRED' : null;
    };
    for (const row of ROWS) {
      expect(before(row.text)).toBe(row.serviceCodeBefore);
    }
  });
});
