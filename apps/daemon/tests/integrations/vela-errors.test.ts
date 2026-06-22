import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AMR_RECHARGE_URL,
  amrAccountFailureDetails,
  classifyAmrAccountFailure,
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
