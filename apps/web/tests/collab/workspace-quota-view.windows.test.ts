import { describe, expect, it } from 'vitest';
import type { WorkspaceBillingResponse, WorkspaceBillingSnapshot } from '@open-design/contracts';
import { workspaceQuotaView, type WorkspaceQuotaView } from '../../src/collab/workspace-quota-view';
import { workspaceContextFixture } from '../helpers/workspace-context';

const context = workspaceContextFixture({
  workspaceId: 'workspace-a',
  workspaceMemberId: 'member-a',
  role: 'owner',
  planId: 'team_go',
});

function snapshot(overrides: Record<string, unknown> = {}): WorkspaceBillingSnapshot {
  return {
    schemaVersion: 1,
    workspaceId: context.workspaceId,
    workspaceMemberId: context.workspaceMemberId,
    billingScopeVersion: 2,
    billing: { billingState: 'active', planId: 'team_go' },
    wallet: { balanceUsd: '7', expiresAt: null, updatedAt: null },
    revisions: { billing: 'b1', wallet: 'w1' },
    ...overrides,
  } as WorkspaceBillingSnapshot;
}

function response(workspaceSnapshot: WorkspaceBillingSnapshot | null): WorkspaceBillingResponse {
  return {
    summary: null,
    workspaceBalance: {
      workspaceId: context.workspaceId,
      workspaceMemberId: context.workspaceMemberId,
      balanceUsd: '7',
      billingScopeVersion: 2,
      expiresAt: null,
      updatedAt: null,
    },
    workspaceSnapshot,
  };
}

function view(workspaceSnapshot: WorkspaceBillingSnapshot | null, tier = 'team_go'): WorkspaceQuotaView {
  return workspaceQuotaView({ context, response: response(workspaceSnapshot), tier });
}

function wireWindow(overrides: Record<string, unknown> = {}) {
  return {
    kind: '5h',
    windowStart: null,
    resetsAt: null,
    remainingCredits: '40',
    limitCredits: '100',
    ...overrides,
  };
}

describe('workspace design plan window mapping', () => {
  it('uses a matching personal workspace snapshot instead of an account tier', () => {
    const personal = workspaceContextFixture({ ...context, workspaceType: 'personal', planId: null, billingState: undefined });
    const freeSnapshot = snapshot({ billing: { billingState: 'free', planId: 'free' }, designPlanWindows: [] });
    expect(workspaceQuotaView({ context: personal, response: response(freeSnapshot), tier: 'go' }).tier).toBe('free');
    expect(workspaceQuotaView({ context: personal, response: response(snapshot({ designPlanWindows: [wireWindow()] })), tier: 'free' }).windows)
      .toEqual([{ durationSeconds: 18_000, remainingPercent: 40, resetsAt: null }]);
  });

  it('maps Go and Plus windows in ascending duration order', () => {
    expect(view(snapshot({ designPlanWindows: [
      wireWindow({ kind: '7d', remainingCredits: '1', limitCredits: '3', resetsAt: '2026-10-22T00:00:00Z' }),
      wireWindow({ kind: '5h', remainingCredits: '40', limitCredits: '100', resetsAt: '2026-10-21T20:00:00Z' }),
    ] })).windows).toEqual([
      { durationSeconds: 18_000, remainingPercent: 40, resetsAt: '2026-10-21T20:00:00Z' },
      { durationSeconds: 604_800, remainingPercent: 33, resetsAt: '2026-10-22T00:00:00Z' },
    ]);
    expect(view(snapshot({ designPlanWindows: [
      wireWindow({ kind: '7d', remainingCredits: '75', limitCredits: '100' }),
    ], billing: { billingState: 'active', planId: 'team_plus' } }), 'team_plus').windows).toEqual([
      { durationSeconds: 604_800, remainingPercent: 75, resetsAt: null },
    ]);
  });

  it('keeps absent, null, and out-of-scope snapshots unavailable', () => {
    expect(view(snapshot()).windows).toBeNull();
    expect(view(null).windows).toBeNull();
    expect(workspaceQuotaView({
      context,
      response: response(snapshot({ workspaceMemberId: 'member-b', designPlanWindows: [wireWindow()] })),
      tier: 'team_go',
    }).windows).toBeNull();
  });

  it.each([
    ['an object field', { designPlanWindows: { kind: '5h' } }],
    ['a string field', { designPlanWindows: '5h' }],
    ['a null field', { designPlanWindows: null }],
    ['an empty array', { designPlanWindows: [] }],
    ['an unknown kind', { designPlanWindows: [wireWindow({ kind: '1d' })] }],
    ['numeric credits', { designPlanWindows: [wireWindow({ remainingCredits: 1 })] }],
    ['numeric limit', { designPlanWindows: [wireWindow({ limitCredits: 100 })] }],
    ['negative credits', { designPlanWindows: [wireWindow({ remainingCredits: '-1' })] }],
    ['negative limit', { designPlanWindows: [wireWindow({ limitCredits: '-1' })] }],
    ['fractional credits', { designPlanWindows: [wireWindow({ remainingCredits: '1.5' })] }],
    ['fractional limit', { designPlanWindows: [wireWindow({ limitCredits: '1.5' })] }],
    ['leading zero credits', { designPlanWindows: [wireWindow({ remainingCredits: '01' })] }],
    ['leading zero limit', { designPlanWindows: [wireWindow({ limitCredits: '010' })] }],
    ['empty credits', { designPlanWindows: [wireWindow({ remainingCredits: '' })] }],
    ['empty limit', { designPlanWindows: [wireWindow({ limitCredits: '' })] }],
    ['a zero limit', { designPlanWindows: [wireWindow({ limitCredits: '0' })] }],
    ['remaining greater than limit', { designPlanWindows: [wireWindow({ remainingCredits: '101' })] }],
    ['a numeric reset', { designPlanWindows: [wireWindow({ resetsAt: 42 })] }],
    ['a numeric window start', { designPlanWindows: [wireWindow({ windowStart: 42 })] }],
    ['a repeated kind', { designPlanWindows: [wireWindow(), wireWindow()] }],
    ['a valid window followed by an invalid one', { designPlanWindows: [wireWindow(), wireWindow({ kind: '1d' })] }],
  ])('fails closed for %s', (_name, overrides) => {
    expect(view(snapshot(overrides)).windows).toBeNull();
  });

  it('converts durations and preserves reset timestamps while normalizing an empty reset', () => {
    expect(view(snapshot({ designPlanWindows: [
      wireWindow({ kind: '7d', resetsAt: '' }),
      wireWindow({ kind: '5h', resetsAt: null }),
    ] })).windows).toEqual([
      { durationSeconds: 18_000, remainingPercent: 40, resetsAt: null },
      { durationSeconds: 604_800, remainingPercent: 40, resetsAt: null },
    ]);
  });

  it.each([
    ['zero remaining', '0', '100', 0],
    ['all remaining', '100', '100', 100],
    ['three quarters remaining', '75', '100', 75],
    ['one third remaining', '1', '3', 33],
    ['two thirds remaining', '2', '3', 67],
    ['rounds 99.5 percent remaining up', '199', '200', 100],
    ['rounds 0.5 percent remaining up', '1', '200', 1],
    ['retains the specified 201-credit rounding', '1', '201', 0],
    ['rounds 99.8 percent remaining up', '499', '500', 100],
    ['rounds a very large exact half up without Number precision loss', '199000000000000000000', '200000000000000000000', 100],
    ['keeps precision above Number.MAX_SAFE_INTEGER', '9007199254740993', '18014398509481986', 50],
  ])('calculates remaining percentage for %s', (_name, remainingCredits, limitCredits, expected) => {
    expect(view(snapshot({ designPlanWindows: [wireWindow({ remainingCredits, limitCredits })] })).windows)
      .toEqual([{ durationSeconds: 18_000, remainingPercent: expected, resetsAt: null, ...(remainingCredits === '0' ? { exhausted: true } : {}) }]);
  });

  it('does not mark a positive remainder exhausted when it rounds to 0%', () => {
    const window = view(snapshot({ designPlanWindows: [wireWindow({ remainingCredits: '1', limitCredits: '100000000000000000000' })] })).windows?.[0];
    expect(window?.remainingPercent).toBe(0);
    expect(window).not.toHaveProperty('exhausted');
  });

  it('does not change other view fields when the additive field is present', () => {
    const absent = view(snapshot());
    const present = view(snapshot({ designPlanWindows: [wireWindow()] }));
    expect({ ...present, windows: null }).toEqual(absent);
  });

  it.each(['team_go', 'team_plus'])('treats an explicit empty array as unavailable for %s', tier => {
    const billing = { billingState: 'active', planId: tier };
    const withoutField = view(snapshot({ billing }), tier);
    const withEmptyField = view(snapshot({ billing, designPlanWindows: [] }), tier);
    expect(withEmptyField.windows).toBeNull();
    expect(withEmptyField).toEqual(withoutField);
  });
});
