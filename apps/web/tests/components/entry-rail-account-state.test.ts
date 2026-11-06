import { describe, expect, it } from 'vitest';

import {
  resolveEntryRailAccountFooterState,
  requiresAmrReauthentication,
} from '../../src/components/entry-rail-account-state';
import type { WorkspaceContextState } from '../../src/collab/useWorkspaceContext';

const SIGNED_IN_CONTEXT = {
  workspaceId: 'workspace-1',
} as WorkspaceContextState['context'];

describe('resolveEntryRailAccountFooterState', () => {
  it('keeps the resolved account row when a workspace context exists', () => {
    expect(resolveEntryRailAccountFooterState({
      context: SIGNED_IN_CONTEXT,
      loading: false,
      failure: 'unavailable',
    }, true)).toBe('hidden');
  });

  it('shows the neutral syncing state while the workspace identity is loading', () => {
    expect(resolveEntryRailAccountFooterState({
      context: null,
      loading: true,
    }, null)).toBe('syncing');
  });

  it.each([true, null] as const)(
    'shows automatic recovery during an outage when local login is %s',
    (amrLoggedIn) => {
      expect(resolveEntryRailAccountFooterState({
        context: null,
        loading: false,
        failure: 'unavailable',
      }, amrLoggedIn)).toBe('recovering');
    },
  );

  it('still offers sign-in during an outage after an explicit local logout', () => {
    expect(resolveEntryRailAccountFooterState({
      context: null,
      loading: false,
      failure: 'unavailable',
    }, false)).toBe('sign-in');
  });

  it('offers the existing sign-in card when authoritative auth has expired', () => {
    expect(resolveEntryRailAccountFooterState({
      context: null,
      loading: false,
      failure: 'reauth-required',
    }, true, 'reauth_required')).toBe('sign-in');
  });

  it('does not keep a stale cached account row above the sign-in card after auth expires', () => {
    expect(resolveEntryRailAccountFooterState({
      context: SIGNED_IN_CONTEXT,
      loading: false,
      failure: 'reauth-required',
    }, true, 'reauth_required')).toBe('sign-in');
  });

  it('accepts the next successful null response as authoritative sign-out', () => {
    expect(resolveEntryRailAccountFooterState({
      context: null,
      loading: false,
    }, true)).toBe('sign-in');
  });

  it('preserves the legacy unsupported-daemon behavior', () => {
    expect(resolveEntryRailAccountFooterState({
      context: null,
      loading: false,
      failure: 'unsupported',
    }, true)).toBe('sign-in');
  });
});

describe('requiresAmrReauthentication', () => {
  it('requires reauthentication when workspace authority detects expiry before status polling', () => {
    expect(requiresAmrReauthentication('authenticated', 'reauth-required')).toBe(true);
  });
});
