// amr_auth_result single-flight contract. One sign-in attempt is observed
// by several pollers at once (the initiating surface plus every mounted
// AmrLoginPill woken by AMR_LOGIN_STATUS_EVENT), and each reports the
// outcome it sees. These tests pin the begin/resolve gate in
// analytics/amr-auth.ts: exactly one amr_auth_result per attempt, first
// terminal outcome wins, attribution carried from the amr_entry click.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  confirmAmrAuthTracking,
  createAmrAuthAttemptId,
  observeAmrAuthTracking,
  reconcileAmrAuthAttemptId,
  resolveAmrAuthTracking,
} from '../src/analytics/amr-auth';
import { cancelVelaLogin, startVelaLogin } from '../src/providers/daemon';

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
    vi.mocked(setAnalyticsUserId).mockClear();
    vi.mocked(setAnalyticsPersonProperties).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates an RFC4122 v4 id with getRandomValues when randomUUID is unavailable', () => {
    const authAttemptId = createAmrAuthAttemptId({
      getRandomValues(values) {
        values.fill(0);
        return values;
      },
    });
    expect(authAttemptId).toBe('00000000-0000-4000-8000-000000000000');
    expect(createAmrAuthAttemptId(null)).toBeNull();
  });

  it('waits for the daemon id before emitting a confirmed browser start', () => {
    vi.stubGlobal('crypto', undefined);
    const provisionalId = beginAmrAuthTracking(attribution, Date.now());
    expect(provisionalId).toMatch(/^pending-amr-auth-/);
    expect(track).not.toHaveBeenCalled();

    const canonicalId = '936da01f-9abd-4d9d-80c7-02af85c822a8';
    expect(reconcileAmrAuthAttemptId(provisionalId, canonicalId)).toBe(canonicalId);
    confirmAmrAuthTracking(track, canonicalId);

    expect(track).toHaveBeenCalledTimes(1);
    expect(track.mock.calls[0]).toEqual([
      'amr_auth_stage',
      expect.objectContaining({
        auth_attempt_id: canonicalId,
        stage: 'attempt_started',
        stage_source: 'web',
      }),
      { insertId: `amr-auth-stage:${canonicalId}:web-start` },
    ]);
    resolveAmrAuthTracking(() => undefined, 'cancelled', undefined, {
      authAttemptId: canonicalId,
    });
  });

  it('uses the pending no-WebCrypto request id to start and cancel safely', async () => {
    vi.stubGlobal('crypto', undefined);
    const authRequestId = beginAmrAuthTracking(null);
    expect(authRequestId).toMatch(/^pending-amr-auth-[a-z0-9]+-[a-z0-9]+$/);
    const canonicalId = '936da01f-9abd-4d9d-80c7-02af85c822a8';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: async () => ({ authAttemptId: canonicalId }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ canceled: true }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await startVelaLogin(null, null, authRequestId);
    await cancelVelaLogin(authRequestId);

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      authRequestId,
    });
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({
      authRequestId,
    });
    resolveAmrAuthTracking(() => undefined, 'cancelled', undefined, {
      authAttemptId: authRequestId,
    });
  });

  it('fires one amr_auth_result with attribution on success', () => {
    const authAttemptId = beginAmrAuthTracking(attribution, Date.now() - 1500);
    resolveAmrAuthTracking(track, 'success', undefined, { authAttemptId });
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

  it('correlates and deduplicates daemon stages into the terminal result', () => {
    const authAttemptId = beginAmrAuthTracking(attribution, Date.now() - 1000);
    expect(authAttemptId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    confirmAmrAuthTracking(track, authAttemptId);
    observeAmrAuthTracking(track, {
      authAttemptId,
      authRoute: 'proxy',
      fallbackUsed: true,
      authStages: [
        {
          sequence: 1,
          stage: 'attempt_started',
          result: 'started',
          source: 'daemon',
          occurredAt: new Date().toISOString(),
          route: 'direct',
        },
        {
          sequence: 2,
          stage: 'device_auth_create_result',
          result: 'failed',
          source: 'daemon',
          occurredAt: new Date().toISOString(),
          route: 'direct',
          errorKind: 'network_error',
        },
        {
          sequence: 3,
          stage: 'activation_ready',
          result: 'success',
          source: 'daemon',
          occurredAt: new Date().toISOString(),
          route: 'proxy',
        },
      ],
    }, authAttemptId);
    // A concurrent poller sees the same snapshot; no duplicate stages.
    observeAmrAuthTracking(track, {
      authAttemptId,
      authRoute: 'proxy',
      fallbackUsed: true,
      authStages: [
        {
          sequence: 3,
          stage: 'activation_ready',
          result: 'success',
          source: 'daemon',
          occurredAt: new Date().toISOString(),
          route: 'proxy',
        },
      ],
    }, authAttemptId);
    resolveAmrAuthTracking(track, 'success', undefined, { authAttemptId });

    const stages = track.mock.calls.filter(([event]) => event === 'amr_auth_stage');
    // confirm() emits web attempt_started; the daemon duplicate is suppressed.
    expect(stages).toHaveLength(3);
    expect(stages.at(-1)?.[1]).toMatchObject({
      auth_attempt_id: authAttemptId,
      stage: 'activation_ready',
      stage_result: 'success',
      stage_source: 'daemon',
      network_path: 'proxy',
      fallback_used: true,
    });
    const terminal = track.mock.calls.find(([event]) => event === 'amr_auth_result');
    expect(terminal?.[1]).toMatchObject({
      auth_attempt_id: authAttemptId,
      last_stage: 'activation_ready',
      last_stage_result: 'success',
      network_path: 'proxy',
      fallback_used: true,
    });
    expect(terminal?.[2]).toEqual({ insertId: `amr-auth-result:${authAttemptId}` });
  });

  it('joins a concurrent 409 without an orphan start or attribution overwrite', () => {
    const firstId = beginAmrAuthTracking(attribution, Date.now() - 500);
    const joiningAttribution: AmrEntryAttribution = {
      ...attribution,
      entryId: 'od-amr-joining-entry',
      sourceDetail: 'settings_amr_authorize',
    };
    const provisionalJoiningId = beginAmrAuthTracking(joiningAttribution);
    expect(provisionalJoiningId).not.toBe(firstId);
    expect(track).not.toHaveBeenCalled();

    const joinedId = reconcileAmrAuthAttemptId(
      provisionalJoiningId,
      firstId,
      { joinedExisting: true },
    );
    expect(joinedId).toBe(firstId);
    confirmAmrAuthTracking(track, joinedId, { joinedExisting: true });
    observeAmrAuthTracking(track, {
      authAttemptId: joinedId,
      authRoute: 'direct',
      fallbackUsed: false,
      authStages: [{
        sequence: 1,
        stage: 'attempt_started',
        result: 'started',
        source: 'daemon',
        occurredAt: new Date().toISOString(),
        route: 'direct',
      }],
    }, joinedId);
    // The original 202 can arrive after the joining surface's 409. It must not
    // add a second start row after the daemon snapshot has already won.
    confirmAmrAuthTracking(track, firstId);
    resolveAmrAuthTracking(track, 'success', undefined, { authAttemptId: joinedId });

    expect(track.mock.calls).toHaveLength(2);
    for (const [, props] of track.mock.calls) {
      expect(props).toMatchObject({
        auth_attempt_id: firstId,
        entry_id: attribution.entryId,
        source_detail: attribution.sourceDetail,
      });
      expect(props).not.toMatchObject({ entry_id: joiningAttribution.entryId });
      expect(JSON.stringify(props)).not.toContain(provisionalJoiningId);
    }
  });

  it('restores the no-WebCrypto owner when 409 arrives before its 202', () => {
    vi.stubGlobal('crypto', undefined);
    const ownerProvisionalId = beginAmrAuthTracking(attribution, Date.now() - 500);
    const joiningAttribution: AmrEntryAttribution = {
      ...attribution,
      entryId: 'od-amr-pending-joiner',
      sourceDetail: 'settings_amr_authorize',
    };
    const joiningProvisionalId = beginAmrAuthTracking(joiningAttribution);
    const canonicalId = '936da01f-9abd-4d9d-80c7-02af85c822a8';

    const joinedId = reconcileAmrAuthAttemptId(
      joiningProvisionalId,
      canonicalId,
      { joinedExisting: true },
    );
    confirmAmrAuthTracking(track, joinedId, { joinedExisting: true });
    const daemonSnapshot = {
      authAttemptId: canonicalId,
      authRoute: 'direct' as const,
      fallbackUsed: false,
      authStages: [{
        sequence: 1,
        stage: 'attempt_started' as const,
        result: 'started' as const,
        source: 'daemon' as const,
        occurredAt: new Date().toISOString(),
        route: 'direct' as const,
      }],
    };
    observeAmrAuthTracking(track, daemonSnapshot, joinedId);
    expect(track).not.toHaveBeenCalled();

    const ownerId = reconcileAmrAuthAttemptId(
      ownerProvisionalId,
      canonicalId,
      { joinedExisting: false },
    );
    expect(ownerId).toBe(canonicalId);
    confirmAmrAuthTracking(track, ownerId);
    observeAmrAuthTracking(track, daemonSnapshot, ownerId);
    resolveAmrAuthTracking(track, 'success', undefined, { authAttemptId: ownerId });

    expect(track.mock.calls).toHaveLength(2);
    for (const [, props] of track.mock.calls) {
      expect(props).toMatchObject({
        auth_attempt_id: canonicalId,
        entry_id: attribution.entryId,
        source_detail: attribution.sourceDetail,
      });
      expect(JSON.stringify(props)).not.toContain(joiningAttribution.entryId);
      expect(JSON.stringify(props)).not.toContain(joiningProvisionalId);
    }
  });

  it('does not let a stale poller settle the next auth attempt', () => {
    const staleAttemptId = beginAmrAuthTracking(attribution);
    const currentAttemptId = beginAmrAuthTracking(null);
    resolveAmrAuthTracking(track, 'failed', 'login_stopped', {
      authAttemptId: staleAttemptId,
    });
    expect(track).not.toHaveBeenCalled();
    resolveAmrAuthTracking(track, 'failed', 'spawn_failed', {
      authAttemptId: currentAttemptId,
    });
    expect(track).toHaveBeenCalledTimes(1);
    expect(track.mock.calls[0]?.[1]).toMatchObject({
      auth_attempt_id: currentAttemptId,
      error_code: 'spawn_failed',
    });
  });

  it('ignores later resolves for the same attempt (concurrent pollers)', () => {
    const authAttemptId = beginAmrAuthTracking(attribution);
    resolveAmrAuthTracking(track, 'success', undefined, { authAttemptId });
    resolveAmrAuthTracking(track, 'failed', 'login_stopped', { authAttemptId });
    resolveAmrAuthTracking(track, 'cancelled', undefined, { authAttemptId });
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when nothing is armed', () => {
    resolveAmrAuthTracking(track, 'success', undefined, {
      authAttemptId: crypto.randomUUID(),
    });
    expect(track).not.toHaveBeenCalled();
  });

  it('falls back to the settings page when login starts without attribution', () => {
    const authAttemptId = beginAmrAuthTracking(null);
    resolveAmrAuthTracking(track, 'timeout', 'login_timeout', { authAttemptId });
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
    const authAttemptId = beginAmrAuthTracking(attribution);
    resolveAmrAuthTracking(track, 'success', undefined, {
      authAttemptId,
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

  it('does not let a late poller mutate analytics identity after resolution', () => {
    const authAttemptId = beginAmrAuthTracking(attribution);
    resolveAmrAuthTracking(track, 'success', undefined, { authAttemptId });
    // A second poller settles on the same signed-in state after the gate
    // closed: no duplicate event, but the id registration must not be lost.
    resolveAmrAuthTracking(track, 'success', undefined, {
      authAttemptId,
      signedInUserId: 'usr_amr_42',
    });
    expect(track).toHaveBeenCalledTimes(1);
    expect(vi.mocked(setAnalyticsUserId)).not.toHaveBeenCalled();
  });

  it('does not touch the registered user id on failure paths', () => {
    const authAttemptId = beginAmrAuthTracking(attribution);
    resolveAmrAuthTracking(track, 'failed', 'login_stopped', { authAttemptId });
    expect(vi.mocked(setAnalyticsUserId)).not.toHaveBeenCalled();
  });

  it('lets a new attempt supersede a stale armed one', () => {
    beginAmrAuthTracking(attribution);
    const authAttemptId = beginAmrAuthTracking(null);
    resolveAmrAuthTracking(track, 'failed', 'spawn_failed', { authAttemptId });
    expect(track).toHaveBeenCalledTimes(1);
    const [, props] = track.mock.calls[0] as [string, Record<string, unknown>];
    expect(props).toMatchObject({ page_name: 'settings', result: 'failed' });
  });
});
