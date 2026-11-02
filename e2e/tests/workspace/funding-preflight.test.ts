import { describe, expect, it } from 'vitest';
import type { WorkspaceBillingResponse } from '@open-design/contracts';
import { requireScopedFundingPreflight } from '../../lib/playwright/workspace-funding-preflight.ts';

const expected = { workspaceId: 'funding-a', workspaceMemberId: 'member-a', modelId: 'model-a' };
function response(): WorkspaceBillingResponse {
  return {
    summary: null,
    workspaceBalance: { workspaceId: expected.workspaceId, workspaceMemberId: expected.workspaceMemberId, billingScopeVersion: 2, balanceUsd: '0', expiresAt: null, updatedAt: null },
    preflight: {
      ...expected, schemaVersion: 1, generatedAt: new Date().toISOString(),
      balanceUsd: '0', modelCovered: false, funding: 'gateway', fundingCheck: 'insufficient',
      codingPlan: { workspaceId: expected.workspaceId, generatedAt: new Date().toISOString(),
        eligible: false, tier: null, windows: [] },
    },
  };
}

describe('scoped funding UI precondition contract', () => {
  it('accepts the formal v1 preflight and v2 wallet without an invented billingMode field', () => {
    const body = response();
    expect(requireScopedFundingPreflight(body, expected)).toBe(body.preflight);
  });
  it.each(['workspaceId', 'workspaceMemberId', 'modelId'] as const)('rejects a preflight for a different %s even when legacy billingMode says shared', (key) => {
    const body = response();
    Object.assign(body.preflight!, { billingMode: 'shared', [key]: 'other' });
    expect(() => requireScopedFundingPreflight(body, expected)).toThrow('workspace/member/model');
  });
  it.each(['workspaceId', 'workspaceMemberId'] as const)('rejects a v2 wallet for a different %s', (key) => {
    const body = response();
    Object.assign(body.preflight!, { billingMode: 'shared' });
    body.workspaceBalance![key] = 'other';
    expect(() => requireScopedFundingPreflight(body, expected)).toThrow('v2 wallet');
  });
  it('rejects an absent workspace wallet instead of borrowing account balance', () => {
    const body = response();
    body.workspaceBalance = null;
    expect(() => requireScopedFundingPreflight(body, expected)).toThrow('v2 wallet');
  });
  it('rejects unsupported wallet and preflight schema versions', () => {
    const wallet = response();
    Object.assign(wallet.workspaceBalance!, { billingScopeVersion: 1 });
    expect(() => requireScopedFundingPreflight(wallet, expected)).toThrow('v2 wallet');
    const preflight = response();
    Object.assign(preflight.preflight!, { schemaVersion: 2 });
    expect(() => requireScopedFundingPreflight(preflight, expected)).toThrow('workspace/member/model');
  });
  it('rejects another workspace Design Plan instead of borrowing its quota', () => {
    const body = response();
    body.preflight!.codingPlan.workspaceId = 'funding-b';
    expect(() => requireScopedFundingPreflight(body, expected)).toThrow('v2 wallet');
  });
  it('rejects an absent preflight instead of manufacturing a funded Given', () => {
    expect(() => requireScopedFundingPreflight({ ...response(), preflight: null }, expected)).toThrow();
  });
});
