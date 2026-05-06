// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { mergeTokenRefresh } from '../src/google-auth.ts';

// PR #568 P2 fix #5: the OAuth `tokens` event listeners merge the
// refreshed payload onto the LIVE credentials, not the boot-time
// snapshot. These tests pin the merge semantics so a future refactor
// can't reintroduce the "stale snapshot clobbers rotation" bug.
describe('mergeTokenRefresh', () => {
  it('keeps long-lived fields when refresh only sends the changed access_token', () => {
    // Google sends partial payloads on refresh — typically just the
    // new access_token + expiry. The long-lived refresh_token must
    // survive.
    const live = {
      access_token: 'old-access',
      refresh_token: 'long-lived-refresh',
      expiry_date: 1_700_000_000_000,
      scope: 'slides drive',
      token_type: 'Bearer',
    };
    const refreshed = {
      access_token: 'new-access',
      expiry_date: 1_700_000_900_000,
    };
    const merged = mergeTokenRefresh(live, refreshed);

    expect(merged.access_token).toBe('new-access');
    expect(merged.expiry_date).toBe(1_700_000_900_000);
    expect(merged.refresh_token).toBe('long-lived-refresh');
    expect(merged.scope).toBe('slides drive');
    expect(merged.token_type).toBe('Bearer');
  });

  it('uses the live credentials, not a stale boot snapshot', () => {
    // Regression for the boot-snapshot-as-merge-base bug. If a
    // refresh listener was attached at boot and the credentials
    // were rotated later (e.g. user re-auth, scope change), the
    // next refresh must merge onto the rotated state, not the
    // boot snapshot — otherwise stale fields would clobber the
    // rotated values.
    const bootSnapshot = {
      access_token: 'boot-access',
      refresh_token: 'boot-refresh',
      scope: 'old-scope',
    };
    // Simulate a credential rotation that happened post-listener-
    // attach: the live credentials object now reflects new scope
    // and new refresh_token from a re-auth flow.
    const liveAfterRotation = {
      access_token: 'rotated-access',
      refresh_token: 'rotated-refresh',
      scope: 'new-scope-with-extras',
    };
    const refreshed = { access_token: 'next-access', expiry_date: 999 };

    // Correct behavior: merge onto the LIVE state — rotated_refresh
    // and new scope are preserved.
    const merged = mergeTokenRefresh(liveAfterRotation, refreshed);
    expect(merged.access_token).toBe('next-access');
    expect(merged.refresh_token).toBe('rotated-refresh');
    expect(merged.scope).toBe('new-scope-with-extras');
    expect(merged.expiry_date).toBe(999);

    // Sanity check the bug-shape: merging onto the boot snapshot
    // would overwrite the rotated refresh_token with the boot one.
    // This is what the old code did and what the fix prevents.
    const buggyMerge = { ...bootSnapshot, ...refreshed };
    expect(buggyMerge.refresh_token).toBe('boot-refresh');
    expect(buggyMerge.scope).toBe('old-scope');
  });

  it('overwrites with new values when both sides supply the same key', () => {
    const live = { access_token: 'old', expiry_date: 100 };
    const refreshed = { access_token: 'new', expiry_date: 200 };
    const merged = mergeTokenRefresh(live, refreshed);
    expect(merged).toEqual({ access_token: 'new', expiry_date: 200 });
  });

  it('handles a refresh payload that includes a rotated refresh_token', () => {
    // Google occasionally rotates refresh_tokens. When that happens,
    // newTokens contains a refresh_token field that should win over
    // the live one.
    const live = {
      access_token: 'old',
      refresh_token: 'old-refresh',
    };
    const refreshed = {
      access_token: 'new',
      refresh_token: 'rotated-refresh',
    };
    const merged = mergeTokenRefresh(live, refreshed);
    expect(merged.refresh_token).toBe('rotated-refresh');
  });

  it('does not mutate the input objects', () => {
    const live = { access_token: 'a', refresh_token: 'r' };
    const refreshed = { access_token: 'b' };
    const merged = mergeTokenRefresh(live, refreshed);
    expect(merged).not.toBe(live);
    expect(merged).not.toBe(refreshed);
    expect(live).toEqual({ access_token: 'a', refresh_token: 'r' });
    expect(refreshed).toEqual({ access_token: 'b' });
  });
});
