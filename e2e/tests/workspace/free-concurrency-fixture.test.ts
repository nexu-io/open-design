import { describe, expect, it } from 'vitest';
import { validateFreeConcurrencyFixture, type FreeConcurrencyFixture } from '@/playwright/workspace-free-concurrency-fixture';
import type { FundingFixture } from '@/playwright/workspace-funding-fixture';
function capability() {
  return { concurrency: {
    space: { workspaceId: 'only-this-disposable-workspace', ownerMemberId: 'owner', actorRole: 'owner', actorMemberId: 'owner', runtimeKey: 'unit-owner-key' },
    member: { memberId: 'member', runtimeKey: 'unit-member-key' },
    holdModelId: 'unit-model', coordinator: { helperPath: '/private/coordinator.py', helperSha256: 'a'.repeat(64), helperSourceSha: 'b'.repeat(40), helperRepoPath: 'e2e/helper/link_concurrency.py' },
    serverControl: { providerBaseUrl: 'http://127.0.0.1:12345', providerStatePath: '/private/provider.json',
      providerSourcePath: '/private/provider.py', providerSourceSha256: 'c'.repeat(64),
      controlTokenPath: '/private/control-token', redisContainer: 'owned-test-redis', redisKeyPrefix: 'owned-test:' },
  } } as FundingFixture;
}
function fixture(): FreeConcurrencyFixture {
  const c = capability().concurrency!;
  const owner = { ...c.space, workspaceId: 'w1', runtimeKey: 'owner-device' };
  return { concurrency: { ...c, space: owner }, freeConcurrency: {
    caseKey: 'client:RUN-013-CLIENT', limit: 3, attemptId: '01234567-1234-1234-1234-0123456789ab',
    spaces: { w1: owner, w2: { ...owner, workspaceId: 'w2' } },
    ownerRuntimeKey: owner.runtimeKey, givenDirectory: '/private/given',
    observer: { actor: { userId: 'observer' }, space: { ...owner, actorRole: 'member', actorMemberId: 'member' }, runtimeKey: 'observer-device' },
    authoritativePolicy: { path: '/private/policy', sha256: 'c115ac299e9e63aa4dc2f528997ec87bac8fd9fbd6fb0454d3b9e50d61741b56' },
    identityProofs: [{ path: '/private/actual-device', sha256: 'a'.repeat(64) }],
  }, actor: { userId: 'owner' } } as FreeConcurrencyFixture;
}
describe('RUN013 actual identity, independent spaces and policy provenance', () => {
  it('accepts one DeviceAuth Owner across two independent spaces and real member observer', () => {
    expect(() => validateFreeConcurrencyFixture(fixture())).not.toThrow();
  });
  it('keeps RUN002 an explicit mapping instead of renaming RUN013 evidence', () => {
    const f = fixture();
    f.freeConcurrency.manualRetry = { caseKey: 'server:RUN-002', coordinator: f.concurrency!.coordinator };
    expect(() => validateFreeConcurrencyFixture(f)).not.toThrow();
    Object.assign(f.freeConcurrency.manualRetry, { caseKey: 'client:RUN-013-CLIENT' });
    expect(() => validateFreeConcurrencyFixture(f)).toThrow('Explicit RUN002');
  });
  it.each(['same-space', 'key-swap', 'same-observer', 'owner-as-observer', 'invented-limit', 'wrong-policy'] as const)('rejects %s before browser startup', field => {
    const f = fixture(); const c = f.freeConcurrency;
    if (field === 'same-space') c.spaces.w2.workspaceId = c.spaces.w1.workspaceId;
    if (field === 'key-swap') c.spaces.w2.runtimeKey = 'different-key';
    if (field === 'same-observer') c.observer.actor.userId = f.actor.userId;
    if (field === 'owner-as-observer') c.observer.space.actorMemberId = c.spaces.w1.ownerMemberId;
    if (field === 'invented-limit') Object.assign(c, { limit: 4 });
    if (field === 'wrong-policy') c.authoritativePolicy.sha256 = 'b'.repeat(64);
    expect(() => validateFreeConcurrencyFixture(f)).toThrow();
  });
});
