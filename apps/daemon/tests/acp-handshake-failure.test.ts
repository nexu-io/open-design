import { describe, expect, it } from 'vitest';

import {
  ACP_CLI_SESSION_REFUSED_CODE,
  acpRpcErrorId,
  isAcpCliSessionRefusalText,
  isAcpHandshakeRpcErrorText,
  withAcpHandshakeFailureGuidance,
} from '../src/runtimes/acp-handshake-failure.js';
import { classifyRunFailure } from '../src/run-failure-classification.js';
import { decideSafeRunRetry } from '../src/run-retry-policy.js';

function classify(errorCode: string | null, error: string) {
  return classifyRunFailure({
    result: 'failed',
    status: { status: 'failed', error, errorCode },
    ...(errorCode ? { errorCode } : {}),
    agentId: 'kimi',
  });
}

/**
 * The same classification with the `runtime_close` diagnostic an ACP fatal
 * really carries.
 *
 * `deriveRpcCloseReason` in server.ts records `fatal_rpc_error` whenever the
 * host tears the child down after a protocol failure, so every ACP-fatal run
 * reaching the classifier has this event in its stream. Omitting it — as the
 * bare `classify` helper does — hides the branch that decides whether the
 * failure keeps its retry, which is exactly what the readiness-exit regression
 * turned on.
 */
function classifyWithAcpFatalClose(errorCode: string, error: string) {
  return classifyRunFailure({
    result: 'failed',
    status: { status: 'failed', error, errorCode },
    errorCode,
    agentId: 'kimi',
    events: [
      { event: 'diagnostic', data: { type: 'runtime_close', rpc_close_reason: 'fatal_rpc_error' } },
    ],
  });
}

function retryDecisionFor(error: string) {
  const failure = classify('AGENT_EXECUTION_FAILED', error);
  return decideSafeRunRetry({
    result: 'failed',
    attemptCount: 0,
    failure: {
      ...(failure?.failure_category ? { failure_category: failure.failure_category } : {}),
      ...(failure?.failure_detail ? { failure_detail: failure.failure_detail } : {}),
      ...(failure?.failure_stage ? { failure_stage: failure.failure_stage } : {}),
      ...(failure ? { retryable: failure.retryable } : {}),
    },
    sideEffects: {},
    random: () => 0,
  });
}

describe('acpRpcErrorId', () => {
  it('reads the request id out of an ACP JSON-RPC error line', () => {
    expect(acpRpcErrorId('json-rpc id 2: Internal error')).toBe(2);
    expect(acpRpcErrorId('json-rpc id 11: Internal error')).toBe(11);
    expect(acpRpcErrorId('ACP session exited before completion (code=1, signal=none)')).toBeNull();
    expect(acpRpcErrorId('')).toBeNull();
  });

  it('treats only the two handshake requests as handshake failures', () => {
    // session.ts numbers `initialize` 1 and `session/new` / `session/load` 2;
    // model selection and `session/prompt` take 3 and up.
    expect(isAcpHandshakeRpcErrorText('json-rpc id 1: Internal error')).toBe(true);
    expect(isAcpHandshakeRpcErrorText('json-rpc id 2: Internal error')).toBe(true);
    expect(isAcpHandshakeRpcErrorText('json-rpc id 3: Internal error')).toBe(false);
    expect(isAcpHandshakeRpcErrorText('json-rpc id 12: Internal error')).toBe(false);
    expect(isAcpHandshakeRpcErrorText('thread/start failed')).toBe(false);
  });
});

describe('withAcpHandshakeFailureGuidance', () => {
  const RAW = 'json-rpc id 2: Internal error';

  it('names the failure with a code and structured identity instead of a sentence', () => {
    const payload = withAcpHandshakeFailureGuidance(
      { message: RAW },
      { agentName: 'Kimi CLI' },
    ) as {
      message: string;
      error: { code: string; message: string; retryable: boolean; details: Record<string, unknown> };
    };

    // A code crosses the daemon/web boundary; an English paragraph does not.
    // The web maps this code to localized copy (see amr-guidance.ts), so the
    // identity the copy interpolates has to travel as data, not as prose.
    expect(payload.error.code).toBe(ACP_CLI_SESSION_REFUSED_CODE);
    expect(payload.error.details).toMatchObject({
      kind: 'agent_cli',
      action: 'update_cli',
      agent: 'Kimi CLI',
    });
    // No CLI build is reported. Naming the version this run started with needs
    // a pre-spawn `--version` read, which this failure deliberately does not
    // buy — the copy says "the installed version" and stays true without it.
    expect(payload.error.details).not.toHaveProperty('agentCliVersion');
    // A CLI build that refuses `session/new` refuses it again; the payload says so.
    expect(payload.error.retryable).toBe(false);
  });

  it('leaves the agent line verbatim on both message surfaces', () => {
    const payload = withAcpHandshakeFailureGuidance(
      { message: RAW, error: { code: 'AGENT_EXECUTION_FAILED', message: RAW } },
      { agentName: 'Kimi CLI' },
    ) as { message: string; error: { message: string } };

    // `run.error` is read from `error.message ?? message` and is BOTH the
    // classifier's input and the text the card shows under 「查看错误详情」.
    // Appending a `Details:` restatement made the card print it twice.
    expect(payload.message).toBe(RAW);
    expect(payload.error.message).toBe(RAW);
    expect(JSON.stringify(payload)).not.toMatch(/Details:/i);
    expect(JSON.stringify(payload)).not.toMatch(/refused to start a session/i);
  });

  it('degrades cleanly when the agent name was never resolved', () => {
    const payload = withAcpHandshakeFailureGuidance({ message: RAW }) as {
      error: { details: Record<string, unknown> };
    };
    expect(payload.error.details).toMatchObject({ kind: 'agent_cli', action: 'update_cli' });
    expect(payload.error.details).not.toHaveProperty('agent');
    expect(payload.error.details).not.toHaveProperty('agentCliVersion');
    expect(JSON.stringify(payload)).not.toContain('undefined');
    expect(JSON.stringify(payload)).not.toContain('null');
  });

  it('keeps the agent\'s own error data alongside the identity it adds', () => {
    const payload = withAcpHandshakeFailureGuidance(
      {
        message: RAW,
        error: { code: 'AGENT_EXECUTION_FAILED', message: RAW, details: { retryable: true } },
      },
      { agentName: 'Kimi CLI' },
    ) as { error: { details: Record<string, unknown> } };
    expect(payload.error.details).toMatchObject({
      retryable: true,
      kind: 'agent_cli',
      agent: 'Kimi CLI',
    });
  });

  it('keeps the raw line readable by the classifier', () => {
    const payload = withAcpHandshakeFailureGuidance({ message: RAW }) as {
      error: { message: string };
    };
    // Same text, same classification: naming the failure with a code must not
    // move it off `agent_protocol_error` / `session_init`.
    expect(
      classify(ACP_CLI_SESSION_REFUSED_CODE, payload.error.message),
    ).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'agent_protocol_error',
      failure_stage: 'session_init',
      user_action: 'install_cli',
    });
  });

  it('leaves every non-refusal payload untouched by identity', () => {
    for (const raw of [
      'json-rpc id 4: Internal error',
      'ACP session exited before completion (code=1, signal=none)',
    ]) {
      const payload = withAcpHandshakeFailureGuidance(
        { message: raw },
        { agentName: 'Kimi CLI' },
      );
      expect(payload).toEqual({ message: raw });
    }
  });
});

describe('ACP handshake rejection classification', () => {
  it('attributes a handshake JSON-RPC error to session_init and asks for a CLI fix', () => {
    expect(classify('AGENT_EXECUTION_FAILED', 'json-rpc id 2: Internal error')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'agent_protocol_error',
      failure_stage: 'session_init',
      user_action: 'install_cli',
    });
  });

  it('leaves a prompt-time protocol error on child_close', () => {
    expect(classify('AGENT_EXECUTION_FAILED', 'json-rpc id 4: Internal error')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'agent_protocol_error',
      failure_stage: 'child_close',
      user_action: 'retry',
    });
  });
});

describe('ACP handshake rejection retry policy', () => {
  it('does not retry a handshake rejection — the same CLI refuses again', () => {
    const decision = retryDecisionFor('json-rpc id 2: Internal error');
    expect(decision.shouldRetry).toBe(false);
    // Classification already marks the handshake rejection non-retryable, so
    // that is the reason recorded end to end.
    expect(decision).toMatchObject({ retrySuppressedReason: 'not_retryable' });
  });

  it('suppresses on the stage even when the agent claims the error is retryable', () => {
    // Second layer: `rpcErrorRetryable(details)` lets an agent mark its own
    // JSON-RPC error retryable. The policy must still refuse a handshake-stage
    // protocol error, otherwise a CLI that lies about retryability re-creates
    // the endless-retry loop this fix removes.
    const decision = decideSafeRunRetry({
      result: 'failed',
      attemptCount: 0,
      failure: {
        failure_category: 'process_exit',
        failure_detail: 'agent_protocol_error',
        failure_stage: 'session_init',
        retryable: true,
      },
      random: () => 0,
    });
    expect(decision.shouldRetry).toBe(false);
    expect(decision).toMatchObject({ retrySuppressedReason: 'unsafe_failure_stage' });
  });

  it('still retries protocol errors that are not the handshake', () => {
    expect(retryDecisionFor('json-rpc id 4: Internal error').shouldRetry).toBe(true);
    expect(
      retryDecisionFor('ACP session exited before completion (code=1, signal=none)').shouldRetry,
    ).toBe(true);
  });

  it('keeps every other transient process-exit detail retryable', () => {
    for (const failure_detail of [
      'qoder_stop_sequence',
      'session_resume_expired',
      'stream_error',
      'fatal_rpc_error',
    ] as const) {
      expect(
        decideSafeRunRetry({
          result: 'failed',
          attemptCount: 0,
          failure: {
            failure_category: 'process_exit',
            failure_detail,
            failure_stage: 'session_init',
            retryable: true,
          },
          random: () => 0,
        }).shouldRetry,
      ).toBe(true);
    }
  });
});

// Found by running a real Kimi CLI in an unauthenticated state, not by reading
// the code: the CLI answers `initialize`, then rejects `session/new` with
// `json-rpc id 2: Authentication required`. Because the handshake reading keyed
// on the JSON-RPC id alone, that user was told to update or reinstall a CLI
// that was working fine — the one thing they needed to do was sign in.
//
// Everything in this block is a handshake-numbered failure. What separates
// these from the CLI-refusal shape above is not *when* they happened but
// *why*: each names a cause with its own remedy.
describe('handshake failures that name their own remedy', () => {
  const AUTH_REQUIRED = 'json-rpc id 2: Authentication required';
  const UNAUTHORIZED = 'json-rpc id 1: HTTP 401 Unauthorized';
  const RATE_LIMITED = 'json-rpc id 2: rate limit exceeded';
  const NO_BALANCE = 'json-rpc id 2: insufficient balance';
  const UPSTREAM_DOWN = 'json-rpc id 2: HTTP 503 Service Unavailable';
  const REMEDIED = [AUTH_REQUIRED, UNAUTHORIZED, RATE_LIMITED, NO_BALANCE, UPSTREAM_DOWN];

  it.each(REMEDIED)('is still recognised as handshake-stage: %s', (raw) => {
    // The id question and the cause question are separate. These all happened
    // inside the handshake; none of them is the CLI refusing on its own.
    expect(isAcpHandshakeRpcErrorText(raw)).toBe(true);
    expect(isAcpCliSessionRefusalText(raw)).toBe(false);
  });

  it.each(REMEDIED)('leaves the agent error intact: %s', (raw) => {
    const payload = withAcpHandshakeFailureGuidance(
      { message: raw, error: { code: 'AGENT_EXECUTION_FAILED', message: raw } },
      { agentName: 'Kimi CLI' },
    ) as { message: string; error: { message: string } };
    expect(payload.message).toBe(raw);
    expect(payload.error.message).toBe(raw);
  });

  it.each(REMEDIED)('never files it as a CLI-version refusal: %s', (raw) => {
    // The whole card hangs off the code now, so a wrong code here would tell a
    // signed-out / throttled user to change their perfectly good CLI build.
    expect(withAcpHandshakeFailureGuidance({ message: raw })).toEqual({ message: raw });
  });

  it('files an unauthenticated handshake under auth rather than install_cli', () => {
    expect(classify('AGENT_EXECUTION_FAILED', AUTH_REQUIRED)).toMatchObject({
      failure_category: 'auth',
      user_action: 'login',
    });
    // …including when the CLI wraps the reason in a JSON-RPC `Internal error`
    // envelope, which is the shape `isAgentProtocolErrorText` matches. Before,
    // the envelope won and the run was filed as a CLI-install problem.
    expect(
      classify('AGENT_EXECUTION_FAILED', 'json-rpc id 2: Internal error: 401 Unauthorized'),
    ).toMatchObject({
      failure_category: 'auth',
      user_action: 'login',
    });
  });

  it('files a throttled handshake under rate_limit rather than install_cli', () => {
    expect(
      classify('AGENT_EXECUTION_FAILED', 'json-rpc id 2: Internal error: 429 rate limit exceeded'),
    ).toMatchObject({ failure_category: 'rate_limit' });
  });

  it('files the remaining named causes under the category that owns them', () => {
    expect(classify('AGENT_EXECUTION_FAILED', UNAUTHORIZED)).toMatchObject({
      failure_category: 'auth',
      user_action: 'login',
    });
    expect(classify('AGENT_EXECUTION_FAILED', RATE_LIMITED)).toMatchObject({
      failure_category: 'rate_limit',
    });
    expect(classify('AGENT_EXECUTION_FAILED', NO_BALANCE)).toMatchObject({
      failure_category: 'insufficient_balance',
    });
    expect(classify('AGENT_EXECUTION_FAILED', UPSTREAM_DOWN)).toMatchObject({
      failure_category: 'upstream_unavailable',
    });
  });

  it('does not retry a signed-out handshake either', () => {
    // Suppressed as an auth failure rather than as a handshake rejection —
    // a different, more accurate reason for the same outcome. Re-running while
    // still signed out would reproduce it just as reliably.
    const decision = retryDecisionFor(AUTH_REQUIRED);
    expect(decision.shouldRetry).toBe(false);
    expect(decision).toMatchObject({ retrySuppressedReason: 'non_retryable_category' });
  });

  it('still answers a bare CLI refusal with the upgrade guidance', () => {
    // A CLI that answered `initialize` and then rejected the session with a
    // bare protocol error, or with a method it does not implement, has told us
    // nothing except that this build cannot do it. That is the case the
    // upgrade copy was written for, and it is unchanged.
    for (const raw of [
      'json-rpc id 1: Internal error',
      'json-rpc id 2: Internal error',
      'json-rpc id 2: Method not found',
      'json-rpc id 2: Invalid params',
    ]) {
      expect(isAcpCliSessionRefusalText(raw)).toBe(true);
    }
    // …and a post-session error is still none of this module's business.
    expect(isAcpCliSessionRefusalText('json-rpc id 4: Internal error')).toBe(false);
    expect(isAcpHandshakeRpcErrorText('json-rpc id 4: Internal error')).toBe(false);

    const payload = withAcpHandshakeFailureGuidance(
      { message: 'json-rpc id 2: Internal error' },
      { agentName: 'Kimi CLI' },
    ) as { message: string; error: { code: string } };
    expect(payload.error.code).toBe(ACP_CLI_SESSION_REFUSED_CODE);
    expect(payload.message).toBe('json-rpc id 2: Internal error');
    expect(
      classify('AGENT_EXECUTION_FAILED', 'json-rpc id 2: Internal error'),
    ).toMatchObject({
      failure_category: 'process_exit',
      failure_stage: 'session_init',
      user_action: 'install_cli',
    });
  });
});

// The wording of a JSON-RPC rejection is the agent's choice, not a signal. A
// CLI build that cannot open a session says so as `Internal error`, as `Method
// not found`, or as `Invalid params` depending on which layer refused — and
// every one of them means the same thing: this build answered `initialize` and
// then would not start a session.
//
// These run through the event shape a real ACP failure produces, because that
// is where the wording used to decide the outcome: `server.ts` emits a
// `runtime_close` diagnostic carrying `rpc_close_reason: 'fatal_rpc_error'`
// before classifying, and that close reason is enough to promote an unclaimed
// failure to a retryable `fatal_rpc_error` on `child_close`.
describe('handshake rejections the agent did not word as "Internal error"', () => {
  const REFUSALS = [
    'json-rpc id 1: Internal error',
    'json-rpc id 2: Internal error',
    'json-rpc id 1: Method not found',
    'json-rpc id 2: Method not found',
    'json-rpc id 2: Invalid params',
    'json-rpc id 2: Server error',
  ];

  /** The events a real ACP handshake failure leaves behind before classification. */
  function acpCloseEvents(error: string, retryable?: boolean) {
    return [
      {
        event: 'error',
        data: {
          error: {
            code: 'AGENT_EXECUTION_FAILED',
            message: error,
            ...(retryable === undefined ? {} : { retryable }),
          },
        },
      },
      {
        event: 'diagnostic',
        data: {
          type: 'runtime_close',
          rpc_close_reason: 'fatal_rpc_error',
          status: 'failed',
        },
      },
    ];
  }

  function classifyAcpClose(errorCode: string, error: string, retryable?: boolean) {
    return classifyRunFailure({
      result: 'failed',
      status: { status: 'failed', error, errorCode },
      errorCode,
      agentId: 'kimi',
      events: acpCloseEvents(error, retryable),
    });
  }

  function retryFor(errorCode: string, error: string, retryable?: boolean) {
    const failure = classifyAcpClose(errorCode, error, retryable);
    return decideSafeRunRetry({
      result: 'failed',
      attemptCount: 0,
      failure: failure
        ? {
            failure_category: failure.failure_category,
            failure_detail: failure.failure_detail,
            failure_stage: failure.failure_stage,
            retryable: failure.retryable,
          }
        : {},
      sideEffects: {},
      random: () => 0,
    });
  }

  it.each(REFUSALS)('files it as a handshake-stage CLI refusal: %s', (raw) => {
    expect(classifyAcpClose('AGENT_EXECUTION_FAILED', raw)).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'agent_protocol_error',
      failure_stage: 'session_init',
      retryable: false,
      user_action: 'install_cli',
    });
  });

  it.each(REFUSALS)('reaches the same verdict once the code is stamped: %s', (raw) => {
    // By the time the run is classified, the ACP payload rewrite has already
    // replaced the error code with `AGENT_CLI_SESSION_REFUSED`. The verdict
    // must not depend on which of the two codes classification happens to see,
    // or the run lands in the `unknown` bucket and stops being triageable.
    expect(classifyAcpClose(ACP_CLI_SESSION_REFUSED_CODE, raw)).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'agent_protocol_error',
      failure_stage: 'session_init',
      retryable: false,
      user_action: 'install_cli',
    });
  });

  it.each(REFUSALS)('refuses to re-run it, even when the CLI calls it transient: %s', (raw) => {
    expect(retryFor('AGENT_EXECUTION_FAILED', raw).shouldRetry).toBe(false);
    expect(retryFor('AGENT_EXECUTION_FAILED', raw, true).shouldRetry).toBe(false);
    expect(retryFor(ACP_CLI_SESSION_REFUSED_CODE, raw, true).shouldRetry).toBe(false);
  });

  // The guard the fix must not trade away: ids 3 and up belong to model
  // selection and `session/prompt`, so a session already existed and the
  // failure stays the transient, retryable protocol error it has always been.
  it.each([
    'json-rpc id 3: Internal error',
    'json-rpc id 3: Method not found',
    'json-rpc id 4: Invalid params',
    'json-rpc id 12: Internal error',
  ])('leaves a post-session protocol error transient: %s', (raw) => {
    const failure = classifyAcpClose('AGENT_EXECUTION_FAILED', raw);
    expect(failure?.failure_stage).not.toBe('session_init');
    expect(failure?.user_action).not.toBe('install_cli');
    expect(failure?.retryable).toBe(true);
    expect(retryFor('AGENT_EXECUTION_FAILED', raw).shouldRetry).toBe(true);
  });
});

// A handshake failure that the run classifier already recognises has a remedy
// of its own, and that remedy is the one the user must follow. Reading only the
// three `classifyAgentServiceFailure` classes left every other recognised cause
// — prompt size above all — looking like an unexplained CLI refusal, so a user
// whose content was too long was told their CLI version was incompatible.
describe('handshake failures the run classifier already has a remedy for', () => {
  const ALREADY_REMEDIED: ReadonlyArray<readonly [string, string, string]> = [
    [
      'json-rpc id 2: [code=request_too_large] request body exceeds configured limit',
      'prompt_too_large',
      'reduce_context',
    ],
    [
      'json-rpc id 2: prompt is too long: 210000 tokens > 200000 maximum',
      'prompt_too_large',
      'reduce_context',
    ],
    ['json-rpc id 2: Authentication required', 'auth', 'login'],
    ['json-rpc id 2: rate limit exceeded', 'rate_limit', 'retry'],
  ];

  it.each(ALREADY_REMEDIED)(
    'does not read %s as an unexplained CLI refusal',
    (raw, category) => {
      // Precedence, not a second signature list: whatever `classifyRunFailure`
      // can already name, the ACP rewrite must leave alone.
      expect(classify('AGENT_EXECUTION_FAILED', raw)).toMatchObject({
        failure_category: category,
      });
      expect(isAcpCliSessionRefusalText(raw)).toBe(false);
    },
  );

  it.each(ALREADY_REMEDIED)(
    'ships %s to the client under its own remedy, not the CLI upgrade copy',
    (raw) => {
      // The predicate and the classifier must not prescribe two different
      // fixes for one failure: the card would say "update your CLI" while the
      // telemetry says "shorten the prompt".
      expect(withAcpHandshakeFailureGuidance({ message: raw })).toEqual({ message: raw });
      const payload = withAcpHandshakeFailureGuidance(
        { message: raw, error: { code: 'AGENT_EXECUTION_FAILED', message: raw } },
        { agentName: 'Kimi CLI' },
      ) as { error: { code: string; details?: Record<string, unknown> } };
      expect(payload.error.code).not.toBe(ACP_CLI_SESSION_REFUSED_CODE);
      expect(payload.error.details?.action).not.toBe('update_cli');
    },
  );

  it('keeps the user action the classifier assigns', () => {
    for (const [raw, , action] of ALREADY_REMEDIED) {
      expect(classify('AGENT_EXECUTION_FAILED', raw)?.user_action).toBe(action);
    }
  });

  // A handshake-numbered frame carrying an OS-level crash banner reports a
  // child that DIED; the JSON-RPC envelope is only how the corpse arrived. The
  // remedy is the crash's (ship a compatible runtime), never "change your CLI
  // version". Sampled from a real AMR failure on Windows.
  it('leaves a crashed child to the crash reading, not the refusal reading', () => {
    const CRASHED =
      'json-rpc id 2: start opencode server: opencode exited before readiness: exit status 0xc0000409';
    expect(isAcpHandshakeRpcErrorText(CRASHED)).toBe(true);
    expect(isAcpCliSessionRefusalText(CRASHED)).toBe(false);
    expect(classify('AGENT_SIGNAL_SIGTERM', CRASHED)).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'process_crashed',
      user_action: 'none',
    });
    expect(withAcpHandshakeFailureGuidance({ message: CRASHED })).toEqual({ message: CRASHED });
  });

  // The same AMR wrapper text WITHOUT a crash banner, which is the common case:
  // vela's bundled OpenCode simply exited before it answered a health check (a
  // port collision, an OOM kill, a half-written config). vela reports that from
  // inside `session/new`, so the frame is handshake-numbered — but the agent CLI
  // refused nothing, and its build is not the variable. This shape was a
  // retryable `fatal_rpc_error` before the refusal guidance existed, and both
  // halves of the misfire matter: the user is told to replace a healthy CLI,
  // and the automatic retry that actually recovers a startup race is withdrawn.
  it('leaves a bundled runtime that never started to the startup reading', () => {
    const NEVER_READY =
      'json-rpc id 2: start opencode server: opencode exited before readiness: exit status 3';
    expect(isAcpHandshakeRpcErrorText(NEVER_READY)).toBe(true);
    expect(isAcpCliSessionRefusalText(NEVER_READY)).toBe(false);
    expect(classifyWithAcpFatalClose('AGENT_EXECUTION_FAILED', NEVER_READY)).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'fatal_rpc_error',
      retryable: true,
      user_action: 'retry',
    });
    expect(withAcpHandshakeFailureGuidance({ message: NEVER_READY })).toEqual({
      message: NEVER_READY,
    });
  });

  // The wrapper's other startup shapes, from the same two vela call sites
  // (`acp_runtime.go` newSession/loadSession). None of them is a statement
  // about the agent CLI's own build, and none is deterministic — so the
  // invariant asserted here is the one that matters to the user, not the
  // bucket: keep the retry, never prescribe a CLI change. Which bucket each
  // lands in is a different question, and an earlier branch that recognises a
  // more specific cause (a readiness wait that timed out is a `timeout`) is
  // free to claim it.
  it.each([
    'json-rpc id 2: start opencode server: opencode readiness timed out for http://127.0.0.1:51423',
    'json-rpc id 2: start opencode server: allocate localhost port: bind: address already in use',
    'json-rpc id 2: opencode exited before readiness',
  ])('does not read %s as an unexplained CLI refusal', (raw) => {
    expect(isAcpHandshakeRpcErrorText(raw)).toBe(true);
    expect(isAcpCliSessionRefusalText(raw)).toBe(false);
    const failure = classifyWithAcpFatalClose('AGENT_EXECUTION_FAILED', raw);
    expect(failure).toMatchObject({ retryable: true });
    expect(failure?.user_action).not.toBe('install_cli');
    expect(failure?.failure_stage).not.toBe('session_init');
  });
});
