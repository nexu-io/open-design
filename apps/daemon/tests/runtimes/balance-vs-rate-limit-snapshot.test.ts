import { describe, expect, it } from 'vitest';

import { classifyAgentServiceFailure } from '../../src/runtimes/auth.js';
import {
  GENERIC_ACP_FAILURE_CODE,
  withAcpServiceFailureCode,
} from '../../src/runtimes/acp-service-failure.js';
import { classifyRunFailure } from '../../src/run-failure-classification.js';

// A frozen landing table for the balance / quota / rate-limit family.
//
// Same shape and same purpose as `tests/acp-service-failure.test.ts`: every
// value below was MEASURED against this build before anything was changed, so a
// later edit to `AGENT_RATE_FAILURE_RE`, to `containsInsufficientBalanceSignal`,
// or to the run classifier cannot quietly move a failure from one card to
// another — the row goes red and names which one.
//
// It exists because the product ruling on this family («余额不足怎么能是限流
// 呢») is a statement about ONE of two axes, and the two disagree today:
//
//   - `serviceCode` — what `classifyAgentServiceFailure` returns. This is the
//     axis that becomes the SSE `error.code` on all three paths that ask it
//     (the ACP bridge, the json-event-stream `stream_error` handler, and the
//     Claude stream handler), and it is the axis the web resolves a card from.
//   - `category` / `detail` / `userAction` — the run classifier's verdict,
//     which telemetry and the retry policy read.
//
// Rows where the two contradict each other are enumerated in
// `AXES_CONTRADICT` below and asserted as a set, so the fix's blast radius is
// the diff of that list rather than a claim in a PR body.
//
// The classifier is agent-agnostic, so this table is not an ACP table: the same
// `serviceCode` reaches Claude Code, codex, deepseek and the nine
// `streamFormat: 'acp-json-rpc'` runtimes alike. `verdictAmr` is pinned beside
// `verdictByok` for exactly that reason — every row is identical across the
// two, which is the evidence that this is a classifier-level fact and not an
// AMR-specific one.

interface Row {
  id: string;
  /** Real upstream text. Provenance in the trailing comment where it is not obvious. */
  text: string;
  /** `classifyAgentServiceFailure(text)` on this build. */
  serviceCode: string | null;
  /** `error.code` the ACP bridge stamps on a generic `AGENT_EXECUTION_FAILED` frame. */
  acpCode: string;
  /** The run classifier's verdict for a BYOK agent, as `category/detail/retryable/user_action`. */
  verdictByok: string;
  /** The same verdict for the hosted agent. Pinned to show it does not differ. */
  verdictAmr: string;
}

const ROWS: Row[] = [
  // ---- balance: the family the product ruling is about ----
  // Provenance: `acp-service-failure.test.ts` row A6.
  { id: 'BAL1 insufficient balance', text: 'json-rpc id 2: insufficient balance', serviceCode: 'RATE_LIMITED', acpCode: 'RATE_LIMITED', verdictByok: 'insufficient_balance/amr_insufficient_balance/r=false/recharge', verdictAmr: 'insufficient_balance/amr_insufficient_balance/r=false/recharge' },
  // DeepSeek's API returns exactly this string (HTTP 402) when the account is empty.
  { id: 'BAL2 deepseek Insufficient Balance', text: 'Insufficient Balance', serviceCode: 'RATE_LIMITED', acpCode: 'RATE_LIMITED', verdictByok: 'insufficient_balance/amr_insufficient_balance/r=false/recharge', verdictAmr: 'insufficient_balance/amr_insufficient_balance/r=false/recharge' },
  // Provenance: `acp-service-failure.test.ts` row D7.
  { id: 'BAL3 insufficient wallet balance', text: 'json-rpc id 4: opencode event stream: insufficient wallet balance', serviceCode: null, acpCode: 'AGENT_EXECUTION_FAILED', verdictByok: 'insufficient_balance/amr_insufficient_balance/r=false/recharge', verdictAmr: 'insufficient_balance/amr_insufficient_balance/r=false/recharge' },
  // Anthropic's own out-of-credit message. The WORST row in this table: the
  // literal `credit balance is too low` is spelled out inside
  // `AGENT_RATE_FAILURE_RE`, so the code axis calls it a rate limit — and the
  // balance matcher in `integrations/vela-errors.ts` misses it (it carries
  // `balance too low`, not `balance is too low`), so the verdict axis calls it
  // a rate limit too. Both axes agree, and both are wrong.
  { id: 'BAL4 anthropic credit balance too low', text: 'API Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}', serviceCode: 'RATE_LIMITED', acpCode: 'RATE_LIMITED', verdictByok: 'rate_limit/rate_limit_429/r=false/none', verdictAmr: 'rate_limit/rate_limit_429/r=false/none' },
  { id: 'BAL5 insufficient_balance code', text: '{"error":{"code":"insufficient_balance","message":"account has no funds"}}', serviceCode: 'RATE_LIMITED', acpCode: 'RATE_LIMITED', verdictByok: 'insufficient_balance/amr_insufficient_balance/r=false/recharge', verdictAmr: 'insufficient_balance/amr_insufficient_balance/r=false/recharge' },
  // vela returns the wallet failure in Chinese.
  { id: 'BAL6 zh yuebuzu', text: 'json-rpc id 4: 余额不足,请充值后重试', serviceCode: null, acpCode: 'AGENT_EXECUTION_FAILED', verdictByok: 'insufficient_balance/amr_insufficient_balance/r=false/recharge', verdictAmr: 'insufficient_balance/amr_insufficient_balance/r=false/recharge' },
  { id: 'BAL7 zh prepay fail', text: 'json-rpc id 4: 预扣费额度失败', serviceCode: null, acpCode: 'AGENT_EXECUTION_FAILED', verdictByok: 'insufficient_balance/amr_insufficient_balance/r=false/recharge', verdictAmr: 'insufficient_balance/amr_insufficient_balance/r=false/recharge' },
  { id: 'BAL8 insufficient credits', text: 'insufficient credits for this request', serviceCode: null, acpCode: 'AGENT_EXECUTION_FAILED', verdictByok: 'insufficient_balance/amr_insufficient_balance/r=false/recharge', verdictAmr: 'insufficient_balance/amr_insufficient_balance/r=false/recharge' },
  { id: 'BAL9 insufficient funds', text: 'insufficient funds in account', serviceCode: 'RATE_LIMITED', acpCode: 'RATE_LIMITED', verdictByok: 'insufficient_balance/amr_insufficient_balance/r=false/recharge', verdictAmr: 'insufficient_balance/amr_insufficient_balance/r=false/recharge' },
  { id: 'BAL10 not enough balance', text: 'not enough balance to complete this request', serviceCode: null, acpCode: 'AGENT_EXECUTION_FAILED', verdictByok: 'insufficient_balance/amr_insufficient_balance/r=false/recharge', verdictAmr: 'insufficient_balance/amr_insufficient_balance/r=false/recharge' },
  { id: 'BAL11 balance too low', text: 'account balance too low', serviceCode: null, acpCode: 'AGENT_EXECUTION_FAILED', verdictByok: 'insufficient_balance/amr_insufficient_balance/r=false/recharge', verdictAmr: 'insufficient_balance/amr_insufficient_balance/r=false/recharge' },
  // 402 is the HTTP status the whole family travels under, and nothing in the
  // daemon reads it. Recorded as a known gap, not as a target of this table.
  { id: 'BAL12 402 payment required', text: 'HTTP 402 Payment Required', serviceCode: null, acpCode: 'AGENT_EXECUTION_FAILED', verdictByok: 'process_exit/fatal_rpc_error/r=false/none', verdictAmr: 'process_exit/fatal_rpc_error/r=false/none' },
  // OpenAI's `insufficient_quota`. A spend problem worded as a quota problem —
  // the reason the two families were merged into one regex in the first place.
  { id: 'BAL13 openai insufficient_quota', text: 'You exceeded your current quota, please check your plan and billing details. (insufficient_quota)', serviceCode: 'RATE_LIMITED', acpCode: 'RATE_LIMITED', verdictByok: 'insufficient_balance/amr_insufficient_balance/r=false/recharge', verdictAmr: 'insufficient_balance/amr_insufficient_balance/r=false/recharge' },
  // A spend cap the user set, not an empty wallet: `hard_quota` is right here.
  { id: 'BAL14 billing hard limit', text: 'Billing hard limit has been reached', serviceCode: 'RATE_LIMITED', acpCode: 'RATE_LIMITED', verdictByok: 'rate_limit/hard_quota/r=false/none', verdictAmr: 'rate_limit/hard_quota/r=false/none' },
  { id: 'BAL15 workspace out of credits', text: 'Your workspace is out of credits. Add credits to continue.', serviceCode: null, acpCode: 'AGENT_EXECUTION_FAILED', verdictByok: 'rate_limit/workspace_credits_exhausted/r=false/recharge', verdictAmr: 'rate_limit/workspace_credits_exhausted/r=false/recharge' },
  { id: 'BAL16 zh edu buzu', text: 'json-rpc id 4: 用户额度不足', serviceCode: null, acpCode: 'AGENT_EXECUTION_FAILED', verdictByok: 'insufficient_balance/amr_insufficient_balance/r=false/recharge', verdictAmr: 'insufficient_balance/amr_insufficient_balance/r=false/recharge' },

  // ---- rate limit: the reverse cases. None of these may move. ----
  // Provenance: `acp-service-failure.test.ts` row A5.
  { id: 'RATE1 rate limit exceeded', text: 'json-rpc id 2: rate limit exceeded', serviceCode: 'RATE_LIMITED', acpCode: 'RATE_LIMITED', verdictByok: 'rate_limit/rate_limit_429/r=false/none', verdictAmr: 'rate_limit/rate_limit_429/r=false/none' },
  { id: 'RATE2 http 429', text: 'HTTP 429 Too Many Requests', serviceCode: 'RATE_LIMITED', acpCode: 'RATE_LIMITED', verdictByok: 'rate_limit/rate_limit_429/r=false/none', verdictAmr: 'rate_limit/rate_limit_429/r=false/none' },
  { id: 'RATE3 status code 429', text: 'status code 429', serviceCode: 'RATE_LIMITED', acpCode: 'RATE_LIMITED', verdictByok: 'rate_limit/rate_limit_429/r=false/none', verdictAmr: 'rate_limit/rate_limit_429/r=false/none' },
  { id: 'RATE4 too many requests', text: 'too many requests, please slow down', serviceCode: 'RATE_LIMITED', acpCode: 'RATE_LIMITED', verdictByok: 'rate_limit/rate_limit_429/r=false/none', verdictAmr: 'rate_limit/rate_limit_429/r=false/none' },
  // Provenance: `acp-service-failure.test.ts` row D6.
  { id: 'RATE5 session limit reached', text: 'json-rpc id 4: session limit reached for this workspace', serviceCode: 'RATE_LIMITED', acpCode: 'RATE_LIMITED', verdictByok: 'rate_limit/hard_quota/r=false/none', verdictAmr: 'rate_limit/hard_quota/r=false/none' },
  { id: 'RATE6 claude usage limit', text: 'Claude usage limit reached. Your limit will reset at 5pm.', serviceCode: 'RATE_LIMITED', acpCode: 'RATE_LIMITED', verdictByok: 'rate_limit/hard_quota/r=false/none', verdictAmr: 'rate_limit/hard_quota/r=false/none' },
  { id: 'RATE7 antigravity resource exhausted', text: 'RESOURCE_EXHAUSTED (code 429): Individual quota reached.', serviceCode: 'RATE_LIMITED', acpCode: 'RATE_LIMITED', verdictByok: 'rate_limit/hard_quota/r=false/none', verdictAmr: 'rate_limit/hard_quota/r=false/none' },
  // The code axis is English-only; the verdict axis reads Chinese. A second,
  // pre-existing disagreement in the same family — recorded, not fixed here.
  { id: 'RATE8 zh sulv xianzhi', text: '速率限制:请控制请求频率', serviceCode: null, acpCode: 'AGENT_EXECUTION_FAILED', verdictByok: 'rate_limit/rate_limit_429/r=false/none', verdictAmr: 'rate_limit/rate_limit_429/r=false/none' },

  // ---- neighbours that must not be disturbed ----
  { id: 'AUTH1 http 401', text: 'json-rpc id 1: HTTP 401 Unauthorized', serviceCode: 'AGENT_AUTH_REQUIRED', acpCode: 'AGENT_AUTH_REQUIRED', verdictByok: 'auth/auth_required/r=false/login', verdictAmr: 'auth/auth_required/r=false/login' },
  { id: 'UP1 http 503', text: 'json-rpc id 2: HTTP 503 Service Unavailable', serviceCode: 'UPSTREAM_UNAVAILABLE', acpCode: 'UPSTREAM_UNAVAILABLE', verdictByok: 'upstream_unavailable/upstream_5xx/r=false/none', verdictAmr: 'upstream_unavailable/upstream_5xx/r=false/none' },

  // ---- noise: numbers that look like statuses but are not ----
  { id: 'NOISE1 exit code 429', text: 'json-rpc id 2: start opencode server: opencode exited before readiness: exit code 429', serviceCode: null, acpCode: 'AGENT_EXECUTION_FAILED', verdictByok: 'process_exit/fatal_rpc_error/r=false/none', verdictAmr: 'process_exit/fatal_rpc_error/r=false/none' },
  { id: 'NOISE2 line 402', text: 'json-rpc id 4: opencode event stream: parse error at line 402', serviceCode: null, acpCode: 'AGENT_EXECUTION_FAILED', verdictByok: 'process_exit/fatal_rpc_error/r=false/none', verdictAmr: 'process_exit/fatal_rpc_error/r=false/none' },
];

/**
 * Rows whose two axes contradict each other today: the run classifier reads the
 * text as a spend problem and prescribes `recharge`, while the code the client
 * receives says the user was throttled. This is the set the product ruling
 * names, expressed as data.
 *
 * BAL4 is deliberately NOT here. Its axes agree — on the wrong answer — so it
 * is a different defect with a different fix, and enumerating it here would
 * make this list mean two things at once.
 */
const AXES_CONTRADICT = [
  'BAL1 insufficient balance',
  'BAL2 deepseek Insufficient Balance',
  'BAL5 insufficient_balance code',
  'BAL9 insufficient funds',
  'BAL13 openai insufficient_quota',
];

/** The ACP bridge as one function, matching `acp-service-failure.test.ts`. */
function bridgeCode(text: string): string {
  const out = withAcpServiceFailureCode({
    message: text,
    error: { code: GENERIC_ACP_FAILURE_CODE, message: text, retryable: false },
  }) as { error?: Record<string, unknown> };
  return (out.error?.code as string | undefined) ?? GENERIC_ACP_FAILURE_CODE;
}

/**
 * The run classifier as it sees a real fatal: the `runtime_close` diagnostic
 * server.ts records for a protocol teardown, plus the error event whose
 * `retryable` becomes `retryableHint`. `retryable: false` is held constant
 * across every row so the table measures the text, not the hint.
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

describe('balance vs rate-limit landing table', () => {
  it.each(ROWS)('$id classifies to the recorded service code', (row) => {
    expect(classifyAgentServiceFailure(row.text)).toBe(row.serviceCode);
  });

  it.each(ROWS)('$id reaches the client under the recorded error code', (row) => {
    expect(bridgeCode(row.text)).toBe(row.acpCode);
  });

  it.each(ROWS)('$id lands on the recorded analysis verdict', (row) => {
    expect(verdict(row.text, row.acpCode, 'kimi')).toBe(row.verdictByok);
  });

  it.each(ROWS)('$id lands identically for the hosted agent', (row) => {
    // The classifier is agent-agnostic. If this ever diverges, the family stopped
    // being one problem and the rest of this table's reasoning no longer holds.
    expect(verdict(row.text, row.acpCode, 'amr')).toBe(row.verdictAmr);
  });

  it('names exactly the rows whose two axes contradict each other', () => {
    const contradicting = ROWS.filter((row) => {
      const prescribesRecharge = row.verdictByok.endsWith('/recharge');
      return prescribesRecharge && row.acpCode === 'RATE_LIMITED';
    }).map((row) => row.id);
    expect(contradicting).toEqual(AXES_CONTRADICT);
  });

  it('keeps every genuine throttle on RATE_LIMITED', () => {
    // The reverse guard. A fix for the balance family that drags a real 429 out
    // of `RATE_LIMITED` with it fails here rather than in production.
    const throttles = ROWS.filter((row) => row.id.startsWith('RATE') && row.serviceCode !== null);
    expect(throttles.map((row) => row.id)).toEqual([
      'RATE1 rate limit exceeded',
      'RATE2 http 429',
      'RATE3 status code 429',
      'RATE4 too many requests',
      'RATE5 session limit reached',
      'RATE6 claude usage limit',
      'RATE7 antigravity resource exhausted',
    ]);
    for (const row of throttles) {
      expect(classifyAgentServiceFailure(row.text)).toBe('RATE_LIMITED');
    }
  });

  it('records the one row where both axes agree on the wrong answer', () => {
    // Anthropic's out-of-credit sentence. Called out separately because it is
    // the only row a balance fix confined to the code axis would NOT repair:
    // `integrations/vela-errors.ts` has to learn the phrasing too.
    const row = ROWS.find((r) => r.id === 'BAL4 anthropic credit balance too low');
    expect(row?.serviceCode).toBe('RATE_LIMITED');
    expect(row?.verdictByok).toBe('rate_limit/rate_limit_429/r=false/none');
  });
});
