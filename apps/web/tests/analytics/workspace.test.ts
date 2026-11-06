import { describe, expect, it } from 'vitest';

import {
  countBucket,
  stableAnalyticsErrorCode,
  stableAnalyticsRequestErrorCode,
  workspaceAnalyticsDimensions,
} from '../../src/analytics/workspace';
import { workspaceContextFixture } from '../helpers/workspace-context';

describe('workspace analytics dimensions', () => {
  it('emits stable Workspace dimensions without names or member identity', () => {
    const context = workspaceContextFixture({
      workspaceId: 'workspace-team',
      workspaceMemberId: 'member-private',
      workspaceType: 'team',
      role: 'admin',
      displayName: 'Private Workspace Name',
    });

    const dimensions = workspaceAnalyticsDimensions(context);

    expect(dimensions).toMatchObject({
      workspace_key: 'workspace-team',
      workspace_type: 'team',
      workspace_role: 'admin',
      $groups: { workspace: 'workspace-team' },
    });
    expect(dimensions).not.toHaveProperty('workspaceMemberId');
    expect(dimensions).not.toHaveProperty('displayName');
  });

  it('uses bounded buckets and stable error classes', () => {
    expect([0, 1, 2, 5, 6, 10, 11].map(countBucket)).toEqual([
      '0',
      '1',
      '2_5',
      '2_5',
      '6_10',
      '6_10',
      '11_plus',
    ]);
    expect(stableAnalyticsErrorCode(403)).toBe('forbidden');
    expect(stableAnalyticsErrorCode(503)).toBe('server_error');
    expect(stableAnalyticsErrorCode()).toBe('network_error');
    expect(stableAnalyticsRequestErrorCode({ code: 'network_error' })).toBe('network_error');
    expect(stableAnalyticsRequestErrorCode({ code: 'WORKSPACE_AUTHORITY_UNAVAILABLE', status: 503 }))
      .toBe('WORKSPACE_AUTHORITY_UNAVAILABLE');
    expect(stableAnalyticsRequestErrorCode({ status: 404 })).toBe('not_found');
    expect(stableAnalyticsRequestErrorCode({ code: 'bad code / project-name' }))
      .toBe('request_failed');
    expect(stableAnalyticsRequestErrorCode({ code: 'UPSTREAM_abc123', status: 503 }))
      .toBe('server_error');
  });

  it('does not treat unresolved seat state as available', () => {
    const context = workspaceContextFixture({
      workspaceId: 'workspace-loading',
      workspaceMemberId: 'member-loading',
    });
    delete (context as Partial<typeof context>).seatSummary;

    expect(workspaceAnalyticsDimensions(context).seat_state).toBe('unknown');
  });

  it('treats the directory-only zero-seat sentinel as unknown', () => {
    const context = workspaceContextFixture({
      workspaceId: 'workspace-directory',
      workspaceMemberId: 'member-directory',
      seatSummary: {
        seatLimit: 0,
        usedSeats: 0,
        availableSeats: 0,
        isSeatFull: true,
      },
    });

    expect(workspaceAnalyticsDimensions(context).seat_state).toBe('unknown');
  });
});
