import { describe, expect, it } from 'vitest';

import { cloudGateDecision, isCloudAgentUsableForAutoPick } from '../src/cloud-gate';

describe('cloudGateDecision', () => {
  const base = {
    usesOpenDesignCloud: false,
    amrLoggedIn: true as boolean | undefined,
    amrSessionState: 'active' as string | null,
    workspaceFailure: undefined as string | undefined,
    dismissed: false,
  };

  it('forces onboarding for workspace reauth until the user dismisses the gate', () => {
    expect(cloudGateDecision({ ...base, workspaceFailure: 'reauth-required' })).toBe(true);
    expect(cloudGateDecision({
      ...base, workspaceFailure: 'reauth-required', dismissed: true,
    })).toBe(false);
  });

  it('does not let a dismissal hide an active Cloud selection that needs reauth', () => {
    expect(cloudGateDecision({
      ...base,
      usesOpenDesignCloud: true,
      amrLoggedIn: true,
      amrSessionState: 'reauth_required',
      workspaceFailure: 'reauth-required',
      dismissed: true,
    })).toBe(true);
    expect(cloudGateDecision({
      ...base, usesOpenDesignCloud: true, amrLoggedIn: false, dismissed: true,
    })).toBe(true);
  });

  it('leaves unrelated states alone', () => {
    expect(cloudGateDecision({ ...base, workspaceFailure: 'unavailable' })).toBe(false);
    expect(cloudGateDecision({ ...base, workspaceFailure: 'unsupported' })).toBe(false);
    expect(cloudGateDecision(base)).toBe(false);
  });
});

describe('isCloudAgentUsableForAutoPick', () => {
  it('rejects signed-out and expired credentials', () => {
    expect(isCloudAgentUsableForAutoPick({ loggedIn: false })).toBe(false);
    expect(isCloudAgentUsableForAutoPick({ loggedIn: true, sessionState: 'reauth_required' })).toBe(false);
  });

  it('accepts an authenticated session and an unresolved status', () => {
    expect(isCloudAgentUsableForAutoPick({ loggedIn: true, sessionState: 'active' })).toBe(true);
    expect(isCloudAgentUsableForAutoPick(null)).toBe(true);
  });
});
