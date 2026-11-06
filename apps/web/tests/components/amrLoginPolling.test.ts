import { describe, expect, it } from 'vitest';

import {
  AMR_DEVICE_AUTH_TTL_MS,
  AMR_LOGIN_TIMEOUT_MS,
  amrLoginPollOutcome,
  isAmrSessionAuthenticated,
} from '../../src/components/amrLoginPolling';
import type { VelaLoginStatus } from '../../src/providers/daemon';

describe('isAmrSessionAuthenticated', () => {
  it('does not treat credential presence as an authenticated session after authoritative expiry', () => {
    expect(isAmrSessionAuthenticated({
      loggedIn: true,
      sessionState: 'reauth_required',
      credentialRevision: 'revision-1',
      profile: 'prod',
      user: { id: 'user-1', email: 'user@example.com' },
      configPath: '/redacted/config.json',
    })).toBe(false);
  });

  it('keeps backward compatibility for authenticated daemons that predate sessionState', () => {
    expect(isAmrSessionAuthenticated({
      loggedIn: true,
      profile: 'prod',
      user: null,
      configPath: '/redacted/config.json',
    })).toBe(true);
  });
});

 it('distinguishes browser cancellation from failure, while completed login wins', () => {
  const status = { loggedIn: false, loginInFlight: false, loginError: 'login_cancelled', profile: 'prod', user: null, configPath: '/redacted/config.json' };
  expect(amrLoginPollOutcome(status, 0, 4000)).toBe('cancelled');
  expect(amrLoginPollOutcome({ ...status, loggedIn: true }, 0, 4000)).toBe('signed-in');
  expect(amrLoginPollOutcome({ ...status, loginError: 'login_failed' }, 0, 4000)).toBe('stopped');
});

describe('amrLoginPollOutcome timeout (OPEND-4588)', () => {
  it('keeps waiting while the 15-minute server request can still complete', () => {
    const startedAt = 0;
    const inFlight = { loggedIn: false, loginInFlight: true } as VelaLoginStatus;
    expect(amrLoginPollOutcome(inFlight, startedAt, 12 * 60 * 1000)).toBe('pending');
    expect(amrLoginPollOutcome(inFlight, startedAt, AMR_DEVICE_AUTH_TTL_MS)).toBe('pending');
    expect(amrLoginPollOutcome(inFlight, startedAt, AMR_LOGIN_TIMEOUT_MS)).toBe('timed-out');
  });
});
