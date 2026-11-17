import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { FundingFixture } from './workspace-funding-fixture.ts';

type OwnerProfileProof = { amrSha: string; workspaceId: string; ownerUserId: string; ownerDisplayName: string;
  actors: Array<{ userId: string; memberId: string; role: string }> };

export function assertNoticeOwnerProfile(fixture: FundingFixture, proof: OwnerProfileProof) {
  const n = fixture.noticeLayout;
  const space = fixture.spaces.empty;
  if (!n || !n.ownerUserId || typeof n.ownerDisplayName !== 'string' || n.ownerDisplayName.length < 40
    || !['admin', 'member'].includes(space.actorRole ?? '') || !space.actorMemberId) {
    throw new Error('VIEW-020 requires an actual non-Owner actor and an explicitly long Owner profile');
  }
  if (proof.amrSha !== fixture.upstream.amrSha || proof.workspaceId !== space.workspaceId
    || proof.ownerUserId !== n.ownerUserId || proof.ownerDisplayName !== n.ownerDisplayName
    || !proof.actors?.some(a => a.userId === fixture.actor.userId && a.memberId === space.actorMemberId && a.role === space.actorRole)) {
    throw new Error('VIEW-020 actual Owner profile or role evidence differs from this fixture');
  }
}

export async function readNoticeOwnerProfile(fixture: FundingFixture) {
  const n = fixture.noticeLayout;
  if (!n || !isAbsolute(n.ownerProfileProofPath) || !/^[a-f0-9]{64}$/.test(n.ownerProfileProofSha256)) {
    throw new Error('VIEW-020 requires an explicit hashed server-owned profile proof');
  }
  const info = await stat(n.ownerProfileProofPath);
  if (!info.isFile() || (info.mode & 0o077) !== 0) throw new Error('Owner profile evidence must be private');
  const bytes = await readFile(n.ownerProfileProofPath);
  if (createHash('sha256').update(bytes).digest('hex') !== n.ownerProfileProofSha256) throw new Error('Owner profile evidence digest mismatch');
  const proof = JSON.parse(bytes.toString('utf8')) as OwnerProfileProof;
  assertNoticeOwnerProfile(fixture, proof);
  return proof;
}
