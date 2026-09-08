import { describe, expect, it } from 'vitest';

import {
  inferRpcErrorRetryable,
  rpcErrorRetryable,
} from '../src/agent-protocol/acp/rpc.js';
import {
  classifyRunFailure,
  isResumableFailure,
} from '../src/run-failure-classification.js';

/**
 * Red spec: when opencode says a failure IS retryable, we must not record the
 * opposite.
 *
 * Real corpus (user diagnostics bundle, 2026-09-08, two independent runs —
 * `423140d1` 03:27 and `e9bea966` 04:03): opencode reported a closed upstream
 * socket AFTER exhausting its own three attempts, and said so in machine
 * readable form — `"isRetryable": true`. What the daemon persisted on the `end`
 * event was `upstream_unavailable / stream_disconnected` with
 * `retryable: false`, the opposite of what upstream stated.
 *
 * Why that costs the user something even though the error CARD for
 * `stream_disconnected` still draws a Retry button: `retryable` is what the
 * daemon's own recovery reads. `isResumableFailure` returns false the instant
 * it is false, so `run.resumable` never gets set and the Continue affordance
 * disappears; `decidePostToolResumeRecovery` requires `retryable === true`, so
 * the silent post-tool continuation never fires either. The most recoverable
 * failure there is got the treatment reserved for dead ends.
 *
 * Where the word was dropped: opencode's field is `isRetryable`, and vela hands
 * the whole `session.error` envelope over as a JSON STRING inside the ACP error
 * message rather than as `error.data`. `rpcErrorRetryable` read only
 * `data.retryable`; the classifier's `latestRetryable` reads
 * `error.data.isRetryable` and so never saw it either. With no verdict from
 * either reader, `fail()` fell back to its own default — `retryable: false` —
 * and that fabricated verdict is what the whole chain then believed.
 */

/**
 * Verbatim from the diagnostics bundle: opencode's `session.error` event as
 * vela forwards it, with the `json-rpc id N: ` prefix `rpcErrorMessage` adds.
 */
const RAW_SOCKET_CLOSED =
  'json-rpc id 4: opencode event stream: {"properties":{"error":{"name":"APIError",'
  + '"data":{"isRetryable":true,"message":"Cannot connect to API: The socket connection '
  + 'was closed unexpectedly. For more information, pass `verbose: true` in the second '
  + 'argument to fetch()","metadata":{"retryAttempts":"2","totalAttempts":"3",'
  + '"retryExhausted":"true","url":"https://amr-link.open-design.ai/v1/chat/completions"}}}},'
  + '"type":"session.error"}';

/**
 * The ACP bridge's retryability decision for a JSON-RPC error, exactly as
 * `session.ts` makes it: the structured field first, then the message/details
 * reader, and `undefined` when neither reached a verdict.
 */
function bridgeRetryable(message: string, data: unknown): boolean | undefined {
  return rpcErrorRetryable(data) ?? inferRpcErrorRetryable(message, data);
}

/**
 * The classifier as it sees a real ACP fatal: the `runtime_close` diagnostic
 * plus the error event `fail()` emitted, whose `retryable` becomes the hint.
 */
function classify(message: string, retryable: boolean | undefined) {
  // `fail()` stamps `options.retryable ?? false` on a frame that carries
  // details, so an undecided bridge still publishes `false`. Reproduced here
  // rather than assumed: it is the step that turned "we do not know" into "no".
  const stamped = retryable ?? false;
  return classifyRunFailure({
    result: 'failed',
    status: { status: 'failed', error: message, errorCode: null },
    agentId: 'amr',
    events: [
      { event: 'diagnostic', data: { type: 'runtime_close', rpc_close_reason: 'fatal_rpc_error' } },
      {
        event: 'error',
        data: {
          message,
          error: { code: 'AGENT_EXECUTION_FAILED', message, retryable: stamped },
        },
      },
    ],
  } as Parameters<typeof classifyRunFailure>[0]);
}

describe('an upstream that says "retryable" is recorded as retryable', () => {
  it('reads opencode\'s isRetryable out of the frame vela actually sends', () => {
    // Proof the fixture can see the defect: the word IS in the payload. If a
    // future rewording moves it, this line goes red before the verdict does.
    expect(RAW_SOCKET_CLOSED).toContain('"isRetryable":true');
    expect(bridgeRetryable(RAW_SOCKET_CLOSED, undefined)).toBe(true);
  });

  it('also reads it when vela forwards the field as structured error data', () => {
    // The other shape the same statement arrives in. `rpcErrorRetryable` knew
    // only the `retryable` spelling, so this half was dropped at the bridge.
    expect(bridgeRetryable('json-rpc id 4: upstream closed the connection', {
      isRetryable: true,
      message: 'The socket connection was closed unexpectedly',
    })).toBe(true);
  });

  it('lands the run as a retryable stream disconnect, and keeps Continue alive', () => {
    const failure = classify(
      RAW_SOCKET_CLOSED,
      bridgeRetryable(RAW_SOCKET_CLOSED, undefined),
    );

    expect(failure?.failure_category).toBe('upstream_unavailable');
    expect(failure?.failure_detail).toBe('stream_disconnected');
    expect(failure?.retryable).toBe(true);
    expect(failure?.user_action).toBe('retry');
    // The affordance the user actually lost: `run.resumable` is gated on this.
    expect(isResumableFailure(failure)).toBe(true);
  });
});

describe('the passthrough does not hand out retries nobody granted', () => {
  it('leaves an upstream that says NOT retryable alone', () => {
    // Same envelope, opposite word. Only `true` is read, and a 4xx is routed to
    // `upstream_client_error` regardless — a request the provider rejected on
    // shape re-fails identically.
    const raw =
      'json-rpc id 4: opencode event stream: opencode session error: '
      + '{"error":{"name":"APIError","data":{"message":"Not Found","statusCode":404,'
      + '"isRetryable":false,"responseBody":"<html><head><title>404 Not Found</title></head>"}}}';
    expect(bridgeRetryable(raw, undefined)).toBeUndefined();
    const failure = classify(raw, bridgeRetryable(raw, undefined));
    expect(failure?.failure_detail).toBe('upstream_client_error');
    expect(failure?.retryable).toBe(false);
    expect(failure?.user_action).toBe('none');
  });

  it('does not turn a rate limit into a retry', () => {
    // The class this must never leak into: a 429 that says nothing about its
    // own retryability keeps the verdict it has.
    const raw = 'json-rpc id 4: rate limit exceeded';
    expect(bridgeRetryable(raw, undefined)).toBeUndefined();
    const failure = classify(raw, bridgeRetryable(raw, undefined));
    expect(failure?.failure_category).toBe('rate_limit');
    expect(failure?.retryable).toBe(false);
    expect(failure?.user_action).toBe('none');
  });

  it('does not resurrect a spent balance or a suspended account', () => {
    for (const raw of [
      'json-rpc id 4: insufficient balance',
      'json-rpc id 4: your account has been suspended due to a risk-control review',
    ]) {
      const failure = classify(raw, bridgeRetryable(raw, undefined));
      expect(failure?.retryable).toBe(false);
      expect(failure?.user_action).not.toBe('retry');
    }
  });

  it('still refuses a request that is too large, even if upstream says retry', () => {
    // Precedence check: `request_too_large` is decided BEFORE the upstream's
    // own word, because the identical payload deterministically re-fails.
    const raw =
      'json-rpc id 4: [code=request_too_large] request body exceeds configured limit'
      + ' {"isRetryable":true}';
    expect(bridgeRetryable(raw, undefined)).toBe(false);
  });

  it('leaves provider_routing_error retryable, as production already reports it', () => {
    // The control from the same diagnostics bundle: run `43eed13f` (03:29)
    // classified `upstream_unavailable / provider_routing_error` with
    // `retryable: true`. Not every upstream failure was being judged dead, and
    // this one must stay exactly where it is.
    const raw = 'json-rpc id 4: AMR model catalog is temporarily unavailable. Please retry.';
    const failure = classify(raw, true);
    expect(failure?.failure_detail).toBe('provider_routing_error');
    expect(failure?.retryable).toBe(true);
    expect(failure?.user_action).toBe('retry');
  });
});
