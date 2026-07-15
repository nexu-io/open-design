import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AMR_RECHARGE_URL,
  amrAccountFailureDetails,
  classifyAmrAccountFailure,
  classifyAmrAccountFailureDetails,
  classifyAmrAccountFailureSignal,
} from '../../src/integrations/vela-errors.js';

describe('AMR account failure classification', () => {
  it('classifies insufficient_balance JSON-RPC failures as rechargeable AMR balance errors', () => {
    const failure = classifyAmrAccountFailure(
      'JSON-RPC error -32000: {"code":"insufficient_balance","message":"insufficient balance"}',
    );

    expect(failure).toMatchObject({
      code: 'AMR_INSUFFICIENT_BALANCE',
      action: 'recharge',
      actionUrl: DEFAULT_AMR_RECHARGE_URL,
    });
    expect(failure?.message).toContain(DEFAULT_AMR_RECHARGE_URL);
    expect(amrAccountFailureDetails(failure!)).toEqual({
      kind: 'amr_account',
      action: 'recharge',
      actionUrl: DEFAULT_AMR_RECHARGE_URL,
    });
  });

  it('classifies structured Vela ACP insufficient-balance details without relying on message text', () => {
    const failure = classifyAmrAccountFailureDetails({
      kind: 'opencode_prompt_error',
      runtime: 'opencode',
      phase: 'event_stream',
      code: 'insufficient_balance',
      accountAction: 'recharge',
      openCodeSessionId: 'ses_test',
    });

    expect(failure).toMatchObject({
      code: 'AMR_INSUFFICIENT_BALANCE',
      action: 'recharge',
      actionUrl: DEFAULT_AMR_RECHARGE_URL,
    });
  });

  it('classifies structured Vela ACP recharge actions even when code is absent', () => {
    const failure = classifyAmrAccountFailureDetails({
      kind: 'opencode_prompt_error',
      accountAction: 'recharge',
    });

    expect(failure).toMatchObject({
      code: 'AMR_INSUFFICIENT_BALANCE',
      action: 'recharge',
    });
  });

  it('classifies structured tier_model_not_entitled details as an upgrade-required AMR error', () => {
    const failure = classifyAmrAccountFailureDetails({
      kind: 'opencode_prompt_error',
      code: 'tier_model_not_entitled',
    });

    expect(failure).toMatchObject({
      code: 'AMR_TIER_UPGRADE_REQUIRED',
      action: 'upgrade',
    });
    expect(failure?.message).toContain('does not include this model');
  });

  it('classifies structured tier_request_kind_not_entitled details as an upgrade-required AMR error', () => {
    const failure = classifyAmrAccountFailureDetails({
      kind: 'opencode_prompt_error',
      code: 'tier_request_kind_not_entitled',
    });

    expect(failure).toMatchObject({
      code: 'AMR_TIER_UPGRADE_REQUIRED',
      action: 'upgrade',
    });
    expect(failure?.message).toContain('request type');
  });

  it('classifies structured Vela ACP auth-required details without relying on message text', () => {
    const failure = classifyAmrAccountFailureDetails({
      kind: 'opencode_prompt_error',
      runtime: 'opencode',
      phase: 'event_stream',
      code: 'auth_required',
      accountAction: 'relogin',
      openCodeSessionId: 'ses_test',
    });

    expect(failure).toMatchObject({
      code: 'AMR_AUTH_REQUIRED',
      action: 'relogin',
    });
  });

  it('classifies structured Vela ACP relogin actions even when code is absent', () => {
    const failure = classifyAmrAccountFailureDetails({
      kind: 'opencode_prompt_error',
      accountAction: 'relogin',
    });

    expect(failure).toMatchObject({
      code: 'AMR_AUTH_REQUIRED',
      action: 'relogin',
    });
  });

  it('classifies structured auth-required details through the signal path when the protocol message is generic', () => {
    const failure = classifyAmrAccountFailureSignal({
      details: {
        kind: 'opencode_prompt_error',
        code: 'auth_required',
        accountAction: 'relogin',
      },
      message: 'json-rpc id 3: Internal error',
      stderrTail: '',
    });

    expect(failure).toMatchObject({
      code: 'AMR_AUTH_REQUIRED',
      action: 'relogin',
    });
  });

  it('does not classify unrelated structured ACP details as AMR balance errors', () => {
    expect(classifyAmrAccountFailureDetails({
      kind: 'opencode_prompt_error',
      code: 'model_unavailable',
      accountAction: 'choose_model',
    })).toBeNull();
    expect(classifyAmrAccountFailureDetails(null)).toBeNull();
  });

  it('classifies AMR account failures through the unified structured-first signal path', () => {
    const failure = classifyAmrAccountFailureSignal({
      details: {
        kind: 'opencode_prompt_error',
        code: 'insufficient_balance',
        accountAction: 'recharge',
      },
      message: 'json-rpc id 4: request failed',
      stderrTail: '',
    });

    expect(failure).toMatchObject({
      code: 'AMR_INSUFFICIENT_BALANCE',
      action: 'recharge',
    });
  });

  it('uses stderr only as the final AMR account failure fallback', () => {
    const failure = classifyAmrAccountFailureSignal({
      message: 'json-rpc id 4: request failed',
      errorMessage: 'request failed',
      errorCode: 'AGENT_EXECUTION_FAILED',
      stdoutTail: '',
      stderrTail: 'opencode_event_stream_failure: [code=insufficient_balance] insufficient wallet balance',
    });

    expect(failure).toMatchObject({
      code: 'AMR_INSUFFICIENT_BALANCE',
      action: 'recharge',
    });
  });

  it('does not use stderr when structured or protocol text already classifies the failure', () => {
    const failure = classifyAmrAccountFailureSignal({
      message: 'invalid session for AMR profile',
      stderrTail: 'opencode_event_stream_failure: [code=insufficient_balance] insufficient wallet balance',
    });

    expect(failure).toMatchObject({
      code: 'AMR_AUTH_REQUIRED',
      action: 'relogin',
    });
  });

  it('classifies raw tier entitlement error codes into user-friendly upgrade copy', () => {
    expect(
      classifyAmrAccountFailure(
        'HTTP 403 [code=tier_model_not_entitled] model access denied for current tier',
      ),
    ).toMatchObject({
      code: 'AMR_TIER_UPGRADE_REQUIRED',
      action: 'upgrade',
    });

    expect(
      classifyAmrAccountFailure(
        'HTTP 403 [code=tier_request_kind_not_entitled] image generation is not allowed for current tier',
      ),
    ).toMatchObject({
      code: 'AMR_TIER_UPGRADE_REQUIRED',
      action: 'upgrade',
    });
  });

  it('classifies 429 wallet balance payloads as AMR balance errors', () => {
    const failure = classifyAmrAccountFailure(
      'HTTP 429 Too Many Requests: quota exceeded because wallet balance is empty',
    );

    expect(failure).toMatchObject({
      code: 'AMR_INSUFFICIENT_BALANCE',
      action: 'recharge',
    });
  });

  it('classifies common AMR billing text variants as rechargeable balance errors', () => {
    for (const text of [
      'not enough credits to run this model',
      'not enough balance for the selected model',
      'insufficient funds in AMR wallet',
      'balance too low for this request',
      'billing balance is below the minimum required amount',
    ]) {
      expect(classifyAmrAccountFailure(text)).toMatchObject({
        code: 'AMR_INSUFFICIENT_BALANCE',
        action: 'recharge',
        actionUrl: DEFAULT_AMR_RECHARGE_URL,
      });
    }
  });

  it('classifies the Chinese vela pre-charge (额度预扣) failure as a rechargeable balance error', () => {
    // Real production text sampled from Langfuse (#3408 P1): vela reports the
    // wallet pre-charge failure in Chinese, which previously leaked into the
    // opaque execution_failed bucket instead of insufficient_balance.
    const failure = classifyAmrAccountFailure(
      '预扣费额度失败, 用户[141283]剩余额度: 💰0.040000, 需要预扣费额度: 💰0.060000 (request id: Babc)',
    );
    expect(failure).toMatchObject({
      code: 'AMR_INSUFFICIENT_BALANCE',
      action: 'recharge',
      actionUrl: DEFAULT_AMR_RECHARGE_URL,
    });
  });

  it('classifies Chinese balance/quota shortfall variants as AMR balance errors', () => {
    for (const text of ['余额不足，请充值后重试', '账户额度不足']) {
      expect(classifyAmrAccountFailure(text)).toMatchObject({
        code: 'AMR_INSUFFICIENT_BALANCE',
        action: 'recharge',
      });
    }
  });

  it('does not classify non-billing throttling as AMR balance errors', () => {
    expect(classifyAmrAccountFailure('HTTP 429 rate limit reached')).toBeNull();
    expect(classifyAmrAccountFailure('quota exceeded')).toBeNull();
    expect(classifyAmrAccountFailure('temporary wallet balance lookup outage')).toBeNull();
  });

  it('classifies expired token, invalid session, and missing login text as AMR auth errors', () => {
    for (const text of [
      'Your token has expired. Please sign in again.',
      'invalid session for AMR profile',
      'login missing for runtime account',
      'authentication required',
      'auth_required: please reconnect AMR Cloud',
      'signin required before calling session/prompt',
      'not logged in to Vela runtime',
      'unauthenticated request to link',
    ]) {
      expect(classifyAmrAccountFailure(text)).toMatchObject({
        code: 'AMR_AUTH_REQUIRED',
        action: 'relogin',
      });
    }
  });

  it('does not classify unrelated ACP failures as AMR account failures', () => {
    expect(classifyAmrAccountFailure('session/prompt failed: model returned malformed output')).toBeNull();
  });

  it('does not tell env-auth users to relogin for bad API key failures', () => {
    expect(classifyAmrAccountFailure('OpenRouter returned invalid api key')).toBeNull();
    expect(classifyAmrAccountFailure('provider error: forbidden_api_key')).toBeNull();
  });
});
