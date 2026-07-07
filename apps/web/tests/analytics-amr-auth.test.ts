// amr_auth_result single-flight contract. One sign-in attempt is observed
// by several pollers at once (the initiating surface plus every mounted
// AmrLoginPill woken by AMR_LOGIN_STATUS_EVENT), and each reports the
// outcome it sees. These tests pin the begin/resolve gate in
// analytics/amr-auth.ts: exactly one amr_auth_result per attempt, first
// terminal outcome wins, attribution carried from the amr_entry click.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AmrEntryAttribution } from '@open-design/contracts/analytics';

// Spy on the analytics client so the user_id ordering contract is
// observable without a live PostHog instance.
vi.mock('../src/analytics/client', () => ({
  setAnalyticsUserId: vi.fn(),
  setAnalyticsPersonProperties: vi.fn(),
}));

import {
  setAnalyticsPersonProperties,
  setAnalyticsUserId,
} from '../src/analytics/client';
import {
  beginAmrAuthTracking,
  resolveAmrAuthTracking,
} from '../src/analytics/amr-auth';

const attribution: AmrEntryAttribution = {
  entryId: 'od-amr-test-entry',
  sourceProduct: 'open_design',
  sourceDetail: 'inline_model_switcher_amr_row',
  occurredAt: new Date().toISOString(),
};

describe('amr-auth single-flight tracking', () => {
  const track = vi.fn();

  beforeEach(() => {
    track.mockClear();
    // Drain any attempt a previous test left armed.
    resolveAmrAuthTracking(() => undefined, 'cancelled');
    vi.mocked(setAnalyticsUserId).mockClear();
    vi.mocked(setAnalyticsPersonProperties).mockClear();
  });

  it('fires one amr_auth_result with attribution on success', () => {
    beginAmrAuthTracking(attribution, Date.now() - 1500);
    resolveAmrAuthTracking(track, 'success');
    expect(track).toHaveBeenCalledTimes(1);
    const [event, props] = track.mock.calls[0] as [string, Record<string, unknown>];
    expect(event).toBe('amr_auth_result');
    expect(props).toMatchObject({
      page_name: 'chat_panel',
      area: 'amr_auth',
      result: 'success',
      entry_id: 'od-amr-test-entry',
      source_detail: 'inline_model_switcher_amr_row',
    });
    expect(props.duration_ms).toBeGreaterThanOrEqual(1500);
    expect(props).not.toHaveProperty('error_code');
  });

  it('ignores later resolves for the same attempt (concurrent pollers)', () => {
    beginAmrAuthTracking(attribution);
    resolveAmrAuthTracking(track, 'success');
    resolveAmrAuthTracking(track, 'failed', 'login_stopped');
    resolveAmrAuthTracking(track, 'cancelled');
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when nothing is armed', () => {
    resolveAmrAuthTracking(track, 'success');
    expect(track).not.toHaveBeenCalled();
  });

  it('falls back to the settings page when login starts without attribution', () => {
    beginAmrAuthTracking(null);
    resolveAmrAuthTracking(track, 'timeout', 'login_timeout');
    const [, props] = track.mock.calls[0] as [string, Record<string, unknown>];
    expect(props).toMatchObject({
      page_name: 'settings',
      result: 'timeout',
      error_code: 'login_timeout',
    });
    expect(props).not.toHaveProperty('entry_id');
    expect(props).not.toHaveProperty('source_detail');
  });

  // PR #4042 review (Siri-Ray, round 2): the success capture used to run
  // before the AMR account id reached the analytics client, so the first
  // amr_auth_result(success) row lacked the cross-project join key.
  it('registers the signed-in user id BEFORE emitting the success row', () => {
    beginAmrAuthTracking(attribution);
    resolveAmrAuthTracking(track, 'success', undefined, {
      signedInUserId: 'usr_amr_42',
    });
    const setUserMock = vi.mocked(setAnalyticsUserId);
    const setPersonMock = vi.mocked(setAnalyticsPersonProperties);
    expect(setUserMock).toHaveBeenCalledWith('usr_amr_42');
    expect(setPersonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        od_app_user_id: 'usr_amr_42',
        od_source_bound_at: expect.any(String),
      }),
    );
    expect(track).toHaveBeenCalledTimes(1);
    expect(setUserMock.mock.invocationCallOrder[0]).toBeLessThan(
      track.mock.invocationCallOrder[0] ?? Number.NEGATIVE_INFINITY,
    );
  });

  it('still registers the user id when a concurrent poller already resolved', () => {
    beginAmrAuthTracking(attribution);
    resolveAmrAuthTracking(track, 'success');
    // A second poller settles on the same signed-in state after the gate
    // closed: no duplicate event, but the id registration must not be lost.
    resolveAmrAuthTracking(track, 'success', undefined, {
      signedInUserId: 'usr_amr_42',
    });
    expect(track).toHaveBeenCalledTimes(1);
    expect(vi.mocked(setAnalyticsUserId)).toHaveBeenCalledWith('usr_amr_42');
  });

  it('does not touch the registered user id on failure paths', () => {
    beginAmrAuthTracking(attribution);
    resolveAmrAuthTracking(track, 'failed', 'login_stopped');
    expect(vi.mocked(setAnalyticsUserId)).not.toHaveBeenCalled();
  });

  it('lets a new attempt supersede a stale armed one', () => {
    beginAmrAuthTracking(attribution);
    beginAmrAuthTracking(null);
    resolveAmrAuthTracking(track, 'failed', 'spawn_failed');
    expect(track).toHaveBeenCalledTimes(1);
    const [, props] = track.mock.calls[0] as [string, Record<string, unknown>];
    expect(props).toMatchObject({ page_name: 'settings', result: 'failed' });
  });
});
