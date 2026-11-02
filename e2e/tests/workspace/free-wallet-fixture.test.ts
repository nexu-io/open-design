import { describe, expect, it } from 'vitest';
import { assertFreeWalletProof, type FreeWalletProof } from '@/playwright/workspace-free-wallet-fixture';
import { fundingHeaders, type FundingFixture } from '@/playwright/workspace-funding-fixture';

function given() {
  const fixture = { upstream: { amrSha: 'a'.repeat(40) }, freeWallet: {} } as FundingFixture;
  const proof: FreeWalletProof = { amrSha: 'a'.repeat(40), wallets: {} as FreeWalletProof['wallets'] };
  for (const alias of ['retained', 'giftOnly'] as const) {
    fixture.freeWallet![alias] = { actor: { userId: alias, email: `${alias}@example.test`, controlKey: `control-${alias}` },
      space: { workspaceId: `personal-${alias}`, workspaceName: `Actual ${alias} personal`, ownerMemberId: `${alias}-owner`, actorMemberId: `${alias}-owner`,
        runtimeKey: `scoped-${alias}`, actorRole: 'owner', workspaceKind: 'personal' },
      beforeBalanceUsd: alias === 'retained' ? '40.30' : '0.30', afterBalanceUsd: alias === 'retained' ? '40.00' : '0.00',
      consoleCookiesPath: `/private/${alias}.json`, consoleCookiesSha256: 'a'.repeat(64) };
    proof.wallets[alias] = { workspaceId: `personal-${alias}`, ownerUserId: alias, ownerMemberId: `${alias}-owner`,
      workspaceKind: 'personal', giftId: `original-${alias}`, giftAmountCredits: '5000', giftRemainingCredits: '3000',
      giftExpiresAt: new Date(Date.now() + 3_600_000).toISOString(), retainedCredits: alias === 'retained' ? '400000' : '0',
      availableBalanceUsd: alias === 'retained' ? '40.30' : '0.30' };
  }
  return { fixture, proof };
}

describe('actual VIEW-021 personal Free wallet Given', () => {
  it('keeps personal headers and original remaining gift distinct from historical total', () => {
    const { fixture, proof } = given();
    expect(() => assertFreeWalletProof(fixture, proof)).not.toThrow();
    expect(fundingHeaders(fixture.freeWallet!.retained.space)['x-od-workspace-type']).toBe('personal');
  });
  it('keeps expired original proof readable only for explicit after evidence', () => {
    const { fixture, proof } = given();
    proof.wallets.retained.giftExpiresAt = new Date(Date.now() - 1000).toISOString();
    expect(() => assertFreeWalletProof(fixture, proof)).toThrow();
    expect(() => assertFreeWalletProof(fixture, proof, 'after')).not.toThrow();
  });
  it('retains the existing team header for legacy Go fixtures', () => {
    expect(fundingHeaders({ workspaceId: 'legacy', ownerMemberId: 'owner', runtimeKey: 'scoped' })['x-od-workspace-type']).toBe('team');
  });
  it.each(['source', 'owner', 'space', 'member', 'kind', 'originalTotal', 'remaining', 'retained', 'expired', 'duplicateGift'] as const)('rejects wrong %s evidence', key => {
    const { fixture, proof } = given();
    if (key === 'source') proof.amrSha = 'b'.repeat(40);
    if (key === 'owner') proof.wallets.retained.ownerUserId = 'other';
    if (key === 'space') proof.wallets.retained.workspaceId = 'other';
    if (key === 'member') fixture.freeWallet!.retained.space.actorMemberId = 'other';
    if (key === 'kind') Object.assign(fixture.freeWallet!.retained.space, { workspaceKind: 'team' });
    if (key === 'originalTotal') proof.wallets.retained.giftAmountCredits = '3000';
    if (key === 'remaining') proof.wallets.retained.giftRemainingCredits = '5000';
    if (key === 'retained') proof.wallets.retained.retainedCredits = '403000';
    if (key === 'expired') proof.wallets.retained.giftExpiresAt = new Date(Date.now() - 1000).toISOString();
    if (key === 'duplicateGift') proof.wallets.giftOnly.giftId = proof.wallets.retained.giftId;
    expect(() => assertFreeWalletProof(fixture, proof)).toThrow();
  });
});
