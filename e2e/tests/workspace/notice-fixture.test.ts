import { describe, it, expect } from 'vitest';
import { assertNoticeOwnerProfile } from '@/playwright/workspace-notice-fixture';
import type { FundingFixture } from '@/playwright/workspace-funding-fixture';

function given() {
  const fixture = { upstream: { amrSha: 'a'.repeat(40) }, actor: { userId: 'admin-user' },
    spaces: { empty: { workspaceId: 'only-space', actorMemberId: 'actual-admin-member', actorRole: 'admin' } },
    noticeLayout: { ownerUserId: 'actual-owner', ownerDisplayName: 'Long actual Owner '.repeat(4) },
  } as FundingFixture;
  const proof = { amrSha: 'a'.repeat(40), workspaceId: 'only-space', ownerUserId: 'actual-owner',
    ownerDisplayName: fixture.noticeLayout!.ownerDisplayName,
    actors: [{ userId: 'admin-user', memberId: 'actual-admin-member', role: 'admin' }] };
  return { fixture, proof };
}

describe('VIEW020 actual long Owner and non-Owner role evidence', () => {
  it('accepts the exact current source, space, Owner profile and actual actor membership', () => {
    const { fixture, proof } = given();
    expect(() => assertNoticeOwnerProfile(fixture, proof)).not.toThrow();
  });
  it.each(['source', 'space', 'owner', 'name', 'user', 'member', 'role', 'short-name'] as const)('rejects a mismatched %s Given', field => {
    const { fixture, proof } = given();
    if (field === 'source') proof.amrSha = 'b'.repeat(40);
    if (field === 'space') proof.workspaceId = 'other-space';
    if (field === 'owner') proof.ownerUserId = 'other-owner';
    if (field === 'name') proof.ownerDisplayName = 'Other long Owner '.repeat(4);
    if (field === 'user') proof.actors[0]!.userId = 'other-user';
    if (field === 'member') proof.actors[0]!.memberId = 'other-member';
    if (field === 'role') proof.actors[0]!.role = 'owner';
    if (field === 'short-name') fixture.noticeLayout!.ownerDisplayName = 'Short';
    expect(() => assertNoticeOwnerProfile(fixture, proof)).toThrow();
  });
});
