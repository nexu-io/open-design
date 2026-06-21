// Daemon-side AMR analytics regression pins, from PR #4042 review
// (Siri-Ray, 2026-06-10):
//
// 1. Settings-backed env config (VELA_RUNTIME_KEY/VELA_LINK_URL via
//    agentCliEnv.amr) must count as AMR-authorized for the run-event
//    configure_type derivation — the status route and run launcher merge
//    that env, so analytics dropping it would report signed-in users as
//    'none' and preserve the undercount the PR fixes.
// 2. Signed-in runs must stamp the AMR account id as `user_id` so daemon
//    run_created/run_finished stay joinable against the AMR project's
//    `app_user_id`.

import { describe, expect, it } from 'vitest';
import { deriveConfigureGlobals } from '@open-design/contracts/analytics';
import {
  readVelaLoginStatus,
  type VelaLoginStatus,
} from '../src/integrations/vela.js';
import { amrUserIdForRunAnalytics } from '../src/run-analytics-observability.js';

const ENV_AUTH: Record<string, string> = {
  VELA_RUNTIME_KEY: 'rk-test',
  VELA_LINK_URL: 'https://amr.example/link',
};

function fileAuthStatus(userId: string | null): VelaLoginStatus {
  return {
    loggedIn: true,
    loginInFlight: false,
    profile: 'default',
    user: userId ? { id: userId, email: 'user@example.com' } : null,
    configPath: '/tmp/amr-config.json',
  };
}

describe('configured-env AMR auth feeds run-event analytics', () => {
  it('treats Settings-backed VELA env credentials as signed in', () => {
    const status = readVelaLoginStatus({}, ENV_AUTH);
    expect(status.loggedIn).toBe(true);
  });

  it('derives configure_type amr from env-configured auth with no real CLI', () => {
    const status = readVelaLoginStatus({}, ENV_AUTH);
    expect(
      deriveConfigureGlobals({
        mode: 'daemon',
        agentId: 'amr',
        agents: [{ id: 'amr', available: true }],
        amrAuthorized: status.loggedIn,
      }),
    ).toMatchObject({ configure_type: 'amr' });
  });

});

describe('amrUserIdForRunAnalytics', () => {
  it('stamps user_id for a signed-in file-backed profile', () => {
    expect(amrUserIdForRunAnalytics(fileAuthStatus('usr_amr_123'))).toEqual({
      user_id: 'usr_amr_123',
    });
  });

  it('returns no stamp for env-configured auth (authorized but no profile)', () => {
    const status = readVelaLoginStatus({}, ENV_AUTH);
    expect(status.user).toBeNull();
    expect(amrUserIdForRunAnalytics(status)).toEqual({});
  });

  it('returns no stamp when signed out or status is unreadable', () => {
    expect(
      amrUserIdForRunAnalytics({
        loggedIn: false,
        loginInFlight: false,
        profile: 'default',
        user: null,
        configPath: '/tmp/amr-config.json',
      }),
    ).toEqual({});
    expect(amrUserIdForRunAnalytics(null)).toEqual({});
  });

  it('ignores a blank profile id rather than emitting an empty user_id', () => {
    expect(amrUserIdForRunAnalytics(fileAuthStatus(null))).toEqual({});
  });
});
