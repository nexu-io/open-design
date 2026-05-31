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
