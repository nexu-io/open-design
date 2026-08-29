import { describe, expect, it } from 'vitest';

import { isAmrSessionAuthenticated } from '../../src/components/amrLoginPolling';

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
