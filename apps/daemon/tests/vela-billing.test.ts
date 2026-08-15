import { describe, expect, it } from 'vitest';
import {
  VelaWorkspaceBillingSnapshotUnsupportedError,
  fetchBillingCheckoutUrl,
  fetchVelaBillingCatalog,
  fetchVelaBillingSummary,
  fetchVelaWorkspaceBillingProjection,
  fetchVelaWorkspaceBalance,
  isVelaWorkspaceAuthorizationError,
  parseBillingCatalog,
  parseBillingSummary,
  parseWorkspaceBillingSnapshot,
  parseWorkspaceWalletBalance,
} from '../src/integrations/vela-billing.js';

// A representative `vela billing summary --format json` payload.
const SAMPLE = JSON.stringify({
  balanceUsd: '1.2500',
  creditsPerUsd: 10000,
  balances: { subscriptionCredits: '5000', rechargeCredits: '7500', totalAvailableCredits: '12500' },
  membershipTier: 'team',
  billingInterval: 'monthly',
  subscriptionStatus: 'active',
  availableActions: ['subscription_checkout', 'billing_portal'],
});

const CATALOG_SAMPLE = JSON.stringify({
  workspaceId: 'ws_team',
  billingInterval: 'monthly',
  plans: [
    {
      planId: 'team_plus',
      seatUnitAmountCents: 3900,
      currency: 'usd',
      minSeats: 1,
      status: 'active',
    },
  ],
});

const WORKSPACE_BALANCE_SAMPLE = JSON.stringify({
  balanceUsd: '7.8900',
  expiresAt: null,
  updatedAt: '2026-07-26T12:00:00Z',
  billingScopeVersion: 2,
  workspaceId: 'ws_team',
  workspaceMemberId: 'member_team',
});

const WORKSPACE_SNAPSHOT_SAMPLE = JSON.stringify({
  schemaVersion: 1,
  workspaceId: 'ws_team',
  workspaceMemberId: 'member_team',
  billingScopeVersion: 2,
  billing: {
    billingState: 'active',
    planId: 'team_plus',
  },
  wallet: {
    balanceUsd: '7.8900',
    expiresAt: null,
    updatedAt: '2026-07-26T12:00:00Z',
  },
  revisions: {
    billing: 'billing-rev-1',
    wallet: 'wallet-rev-1',
  },
  revisionClocks: {
    billing: { epoch: 'billing-epoch-a', counter: '12' },
    wallet: { epoch: 'wallet-epoch-a', counter: '34' },
  },
});

describe('vela billing 收口', () => {
  // Acceptance #112: B splits the wallet into a subscription grant bucket and
  // a top-up bucket (`balances.subscriptionCredits` / `balances.rechargeCredits`,
  // summing to `totalAvailableCredits`). The mapper kept only the total, so the
  // menu's 附加积分 row had no field to read and could only ever print 0.
  it('maps the vela billing summary JSON, including BOTH credit buckets', () => {
    expect(parseBillingSummary(SAMPLE)).toEqual({
      workspaceId: null,
      membershipTier: 'team',
      totalAvailableCredits: 12500,
      subscriptionCredits: 5000,
      rechargeCredits: 7500,
      balanceUsd: '1.2500',
      subscriptionStatus: 'active',
      availableActions: ['subscription_checkout', 'billing_portal'],
      workspaceBalance: null,
    });
  });

  it('returns null on empty or malformed output (clean "no summary")', () => {
    expect(parseBillingSummary('')).toBeNull();
    expect(parseBillingSummary('not json')).toBeNull();
  });

  it('degrades to null when the CLI throws — no billing session', async () => {
    const out = await fetchVelaBillingSummary({
      run: async () => {
        throw new Error('no vela session');
      },
    });
    expect(out).toBeNull();
  });

  it('drives the injected runner and maps its output', async () => {
    const seen: string[][] = [];
    const out = await fetchVelaBillingSummary({
      run: async (args) => {
        seen.push(args);
        return SAMPLE;
      },
    });
    expect(out?.membershipTier).toBe('team');
    expect(out?.totalAvailableCredits).toBe(12500);
    expect(out?.rechargeCredits).toBe(7500);
    expect(out?.availableActions).toContain('billing_portal');
    expect(out?.workspaceId).toBeNull();
    expect(seen).toEqual([['summary', '--format', 'json']]);
  });

  it('fetches one explicit workspace balance and preserves backend scope identity', async () => {
    const seen: string[][] = [];
    const out = await fetchVelaWorkspaceBalance('ws_team', {
      run: async (args) => {
        seen.push(args);
        return WORKSPACE_BALANCE_SAMPLE;
      },
    });
    expect(out).toEqual({
      balanceUsd: '7.8900',
      expiresAt: null,
      updatedAt: '2026-07-26T12:00:00Z',
      billingScopeVersion: 2,
      workspaceId: 'ws_team',
      workspaceMemberId: 'member_team',
    });
    expect(seen).toEqual([
      ['workspace-balance', '--workspace-id', 'ws_team', '--format', 'json'],
    ]);
  });

  it('rejects an unscoped or foreign workspace balance instead of self-stamping it', () => {
    expect(parseWorkspaceWalletBalance(JSON.stringify({ balanceUsd: '7.89' }), 'ws_team')).toBeNull();
    expect(
      parseWorkspaceWalletBalance(
        JSON.stringify({
          balanceUsd: '7.89',
          billingScopeVersion: 2,
          workspaceId: 'ws_other',
          workspaceMemberId: 'member_other',
        }),
        'ws_team',
      ),
    ).toBeNull();
  });

  it('maps one authoritative workspace billing snapshot without changing its scope', () => {
    expect(parseWorkspaceBillingSnapshot(WORKSPACE_SNAPSHOT_SAMPLE, 'ws_team')).toEqual({
      schemaVersion: 1,
      workspaceId: 'ws_team',
      workspaceMemberId: 'member_team',
      billingScopeVersion: 2,
      billing: {
        billingState: 'active',
        planId: 'team_plus',
      },
      wallet: {
        balanceUsd: '7.8900',
        expiresAt: null,
        updatedAt: '2026-07-26T12:00:00Z',
      },
      revisions: {
        billing: 'billing-rev-1',
        wallet: 'wallet-rev-1',
      },
      revisionClocks: {
        billing: { epoch: 'billing-epoch-a', counter: '12' },
        wallet: { epoch: 'wallet-epoch-a', counter: '34' },
      },
    });
    expect(parseWorkspaceBillingSnapshot(WORKSPACE_SNAPSHOT_SAMPLE, 'ws_other')).toBeNull();
    expect(
      parseWorkspaceBillingSnapshot(
        JSON.stringify({
          ...JSON.parse(WORKSPACE_SNAPSHOT_SAMPLE),
          billing: { billingState: 'mystery', planId: 'team_plus' },
        }),
        'ws_team',
      ),
    ).toBeNull();
  });

  it('drops malformed additive revision clocks without rejecting the legacy snapshot', () => {
    const raw = JSON.parse(WORKSPACE_SNAPSHOT_SAMPLE);
    raw.revisionClocks = {
      billing: { epoch: 'billing-epoch-a', counter: '-1' },
      wallet: { epoch: '', counter: '34' },
    };

    const parsed = parseWorkspaceBillingSnapshot(JSON.stringify(raw), 'ws_team');
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty('revisionClocks');
    expect(parsed?.revisions).toEqual({
      billing: 'billing-rev-1',
      wallet: 'wallet-rev-1',
    });
  });

  it('uses the additive workspace snapshot command when the CLI supports it', async () => {
    const seen: string[][] = [];
    const out = await fetchVelaWorkspaceBillingProjection('ws_team', {
      run: async (args) => {
        seen.push(args);
        return WORKSPACE_SNAPSHOT_SAMPLE;
      },
    });

    expect(seen).toEqual([
      ['workspace-snapshot', '--workspace-id', 'ws_team', '--format', 'json'],
    ]);
    expect(out.snapshot?.billing.planId).toBe('team_plus');
    expect(out.workspaceBalance).toMatchObject({
      workspaceId: 'ws_team',
      workspaceMemberId: 'member_team',
      balanceUsd: '7.8900',
    });
  });

  it('falls back to the legacy balance command only for typed unsupported CLIs', async () => {
    const seen: string[][] = [];
    const out = await fetchVelaWorkspaceBillingProjection('ws_team', {
      run: async (args) => {
        seen.push(args);
        if (args[0] === 'workspace-snapshot') {
          throw new VelaWorkspaceBillingSnapshotUnsupportedError();
        }
        return WORKSPACE_BALANCE_SAMPLE;
      },
    });

    expect(seen).toEqual([
      ['workspace-snapshot', '--workspace-id', 'ws_team', '--format', 'json'],
      ['workspace-balance', '--workspace-id', 'ws_team', '--format', 'json'],
    ]);
    expect(out.snapshot).toBeNull();
    expect(out.workspaceBalance?.balanceUsd).toBe('7.8900');
  });

  it('falls back when the installed old CLI rejects the new snapshot flags', async () => {
    const seen: string[][] = [];
    const out = await fetchVelaWorkspaceBillingProjection('ws_team', {
      run: async (args) => {
        seen.push(args);
        if (args[0] === 'workspace-snapshot') {
          throw new Error('unknown flag: --workspace-id');
        }
        return WORKSPACE_BALANCE_SAMPLE;
      },
    });

    expect(seen).toEqual([
      ['workspace-snapshot', '--workspace-id', 'ws_team', '--format', 'json'],
      ['workspace-balance', '--workspace-id', 'ws_team', '--format', 'json'],
    ]);
    expect(out.snapshot).toBeNull();
    expect(out.workspaceBalance?.balanceUsd).toBe('7.8900');
  });

  it('does not turn an auth/network snapshot failure into a successful empty balance', async () => {
    await expect(
      fetchVelaWorkspaceBillingProjection('ws_team', {
        run: async () => {
          throw new Error('control key expired');
        },
      }),
    ).rejects.toThrow('control key expired');
  });

  it('recognizes old and new CLI authorization envelopes without classifying timeouts', () => {
    expect(
      isVelaWorkspaceAuthorizationError(
        new Error(
          'fetch workspace billing snapshot: API request failed with status 403: workspace_not_authorized',
        ),
      ),
    ).toBe(true);
    expect(
      isVelaWorkspaceAuthorizationError(
        Object.assign(new Error('denied'), { code: 'auth_required' }),
      ),
    ).toBe(true);
    expect(isVelaWorkspaceAuthorizationError(new Error('request timed out'))).toBe(false);
  });

  it('maps the vela team billing catalog JSON into client catalog data', () => {
    expect(parseBillingCatalog(CATALOG_SAMPLE)).toEqual({
      workspaceId: 'ws_team',
      billingInterval: 'monthly',
      plans: [
        {
          planId: 'team_plus',
          seatUnitAmountCents: 3900,
          currency: 'usd',
          minSeats: 1,
          status: 'active',
        },
      ],
    });
    expect(parseBillingCatalog('not json')).toBeNull();
  });

  it('fetches team billing catalog through the vela CLI workspace route', async () => {
    const seen: string[][] = [];
    const out = await fetchVelaBillingCatalog('ws_team', {
      run: async (args) => {
        seen.push(args);
        return CATALOG_SAMPLE;
      },
    });
    expect(out?.plans[0]?.planId).toBe('team_plus');
    expect(seen).toEqual([
      ['team-catalog', '--workspace-id', 'ws_team', '--format', 'json'],
    ]);
  });

  it('starts checkout with workspace and selected team plan through the vela CLI', async () => {
    const seen: string[][] = [];
    const url = await fetchBillingCheckoutUrl({
      workspaceId: 'ws_team',
      planId: 'team_pro',
      seats: 4,
      run: async (args) => {
        seen.push(args);
        return JSON.stringify({
          checkoutSessionId: 'cs_team',
          checkoutUrl: 'https://checkout.stripe.test/cs_team',
        });
      },
    });
    expect(url).toBe('https://checkout.stripe.test/cs_team');
    expect(seen).toEqual([
      [
        'checkout',
        '--workspace-id',
        'ws_team',
        '--plan-id',
        'team_pro',
        '--seats',
        '4',
        '--format',
        'json',
      ],
    ]);
  });
});
